import { offlineDB, OfflineSale, OfflineProduct, OfflineCustomer } from './offline-db';

export interface OfflineSaleData {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  buyPrice?: number;
  sellPrice?: number;
  profit?: number;
  total: number;
  userId: string;
  soldBy?: string;
  customerName?: string;
  customerPhone?: string;
  customerVillage?: string;
  paymentType?: string;
  unit?: string;
  subUnit?: string;
  qtyPerUnit?: number;
  quantityInSub?: number;
  isPartialSale?: boolean;
  pricePerSub?: number;
  customerId?: string;
  paidAmount?: number;
  pendingAmount?: number;
  status?: "paid" | "pending" | "partial";
  isCredit?: boolean;
}

type SyncManager = { register: (tag: string) => Promise<void> };
type SyncRegistration = ServiceWorkerRegistration & { sync: SyncManager };

function isSyncRegistration(reg: ServiceWorkerRegistration): reg is SyncRegistration {
  return 'sync' in reg && typeof (reg as { sync?: unknown }).sync === 'object';
}

function genLocalId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveSaleOffline(saleData: OfflineSaleData): Promise<string> {
  const localId = genLocalId();
  const now = new Date().toISOString();
  
  const buy = saleData.buyPrice ?? 0;
  const sell = saleData.sellPrice ?? saleData.price;
  const profitPerUnit = sell - buy;
  const qtyMain = saleData.quantity;
  const qtySub = saleData.quantityInSub ?? 0;
  const totalRounded = Math.round(saleData.total);

  const isCredit = saleData.paymentType === "credit" || saleData.paymentType === "udhar" || saleData.isCredit === true;
  const status = isCredit ? "pending" : "paid";

  const newSale: OfflineSale = {
    localId,
    productId: saleData.productId,
    productName: saleData.productName,
    quantity: qtyMain,
    price: sell,
    buyPrice: buy,
    sellPrice: sell,
    profit: saleData.profit ?? Math.round(profitPerUnit * qtyMain),
    total: totalRounded,
    soldBy: saleData.soldBy || 'Al-Farooq',
    customerName: saleData.customerName || 'Walk-in',
    paymentType: isCredit ? "credit" : (saleData.paymentType || 'cash'),
    userId: saleData.userId,
    createdAt: now,
    offlineCreatedAt: now,
    synced: 0,
    unit: saleData.unit || "bag",
    subUnit: saleData.subUnit || "",
    qtyPerUnit: saleData.qtyPerUnit || 1,
    quantityInSub: qtySub,
    isPartialSale: saleData.isPartialSale || qtySub > 0,
    pricePerSub: saleData.pricePerSub || 0,
    customerId: saleData.customerId,
    paidAmount: isCredit ? 0 : totalRounded,
    pendingAmount: isCredit ? totalRounded : 0,
    status: status,
    isCredit: isCredit,
  };

  await offlineDB.sales.put(newSale);

  // Separate row per udhar - no merging by name
  if (isCredit && saleData.customerName && saleData.customerName.trim() !== "Walk-in") {
    try {
      const trimmedName = saleData.customerName.trim();
      const cust: OfflineCustomer = {
        localId: genLocalId(),
        saleId: localId,
        name: trimmedName,
        phone: saleData.customerPhone || "",
        village: saleData.customerVillage || "",
        totalUdhar: totalRounded,
        totalBusiness: totalRounded,
        lastUdharDate: now,
        synced: 0,
        createdAt: now,
        isPaid: false,
        paidAmount: 0,
      };
      await offlineDB.customers.put(cust);
    } catch {
      // ignore
    }
  }
  
  try {
    const prod = await offlineDB.products.get(saleData.productId);
    if (prod) {
      await offlineDB.products.update(saleData.productId, { 
        stock: prod.stock - qtyMain,
        synced: 0,
      });
    } else {
      await offlineDB.products
        .where('_id').equals(saleData.productId)
        .or("localId").equals(saleData.productId)
        .modify((p: OfflineProduct) => {
          p.stock = (p.stock || 0) - qtyMain;
          p.synced = 0;
        });
    }
  } catch {
    // product not in cache
  }

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (isSyncRegistration(reg)) {
        await reg.sync.register('sync-sales');
      }
    } catch {}
  }

  return localId;
}

// NEW: Offline wusool - mark as paid, don't delete
export async function wusoolOffline(customerLocalId: string, amount: number): Promise<boolean> {
  const customer = await offlineDB.customers.get(customerLocalId);
  if (!customer) return false;
  
  const paid = Math.round(amount);
  const newUdhar = Math.round(customer.totalUdhar - paid);
  const now = new Date().toISOString();

  if (newUdhar <= 0) {
    await offlineDB.customers.update(customerLocalId, {
      totalUdhar: 0,
      isPaid: true,
      paidAmount: customer.totalBusiness,
      paidAt: now,
      synced: 0,
    });
  } else {
    await offlineDB.customers.update(customerLocalId, {
      totalUdhar: newUdhar,
      synced: 0,
    });
  }
  return true;
}

export async function syncOfflineSales(): Promise<{ synced: number; failed: number }> {
  if (typeof window === 'undefined' || !navigator.onLine) return { synced: 0, failed: 0 };
  
  const unsynced = await offlineDB.sales.where('synced').equals(0).toArray();
  let synced = 0;
  let failed = 0;
  
  for (const sale of unsynced) {
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: sale.productId,
          productName: sale.productName,
          quantity: sale.quantity,
          quantityInSub: sale.quantityInSub,
          unit: sale.unit,
          subUnit: sale.subUnit,
          qtyPerUnit: sale.qtyPerUnit,
          isPartialSale: sale.isPartialSale,
          pricePerSub: sale.pricePerSub,
          price: sale.sellPrice || sale.price,
          buyPrice: sale.buyPrice,
          sellPrice: sale.sellPrice || sale.price,
          profit: sale.profit,
          total: sale.total,
          localId: sale.localId,
          customerName: sale.customerName,
          paymentType: sale.paymentType,
          customerId: sale.customerId,
          paidAmount: sale.paidAmount,
          pendingAmount: sale.pendingAmount,
          status: sale.status,
          isCredit: sale.isCredit,
          offlineCreatedAt: sale.createdAt,
          soldBy: sale.soldBy,
        }),
      });
      
      if (res.ok) {
        await offlineDB.sales.update(sale.localId, { synced: 1 });
        await offlineDB.customers.where('saleId').equals(sale.localId).modify({ synced: 1 });
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  
  // Sync wusool done offline customers
  try {
    const unsyncedCustomers = await offlineDB.customers.where('synced').equals(0).toArray();
    for (const c of unsyncedCustomers) {
      if (c.isPaid) {
        // Try to sync paid status via wusool API
        try {
          await fetch('/api/khata/wusool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerName: c.name, amount: c.totalBusiness }),
          });
          await offlineDB.customers.update(c.localId, { synced: 1 });
        } catch {}
      }
    }
  } catch {}
  
  return { synced, failed };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void syncOfflineSales();
  });
}