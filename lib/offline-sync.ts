import { offlineDB, OfflineSale } from './offline-db';

export interface OfflineSaleData {
  productId: string;
  productName: string;
  quantity: number; // in main unit - can be 0.05 bag, 0.1 bottle
  price: number;
  buyPrice?: number;
  sellPrice?: number;
  profit?: number;
  total: number;
  userId: string;
  soldBy?: string;
  customerName?: string;
  paymentType?: string;

  // NEW: flexible
  unit?: string; // bag, bottle, kg, ml
  subUnit?: string; // kg, ml, liter
  qtyPerUnit?: number; // 20,40,50,500,1000,1500
  quantityInSub?: number; // 2kg, 100ml
  isPartialSale?: boolean;
  pricePerSub?: number;
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

  // quantity is already in main unit (0.05 bag for 2kg)
  const qtyMain = saleData.quantity;
  const qtySub = saleData.quantityInSub || 0;

  const newSale: OfflineSale = {
    localId,
    productId: saleData.productId,
    productName: saleData.productName,
    quantity: qtyMain,
    price: sell,
    buyPrice: buy,
    sellPrice: sell,
    profit: saleData.profit ?? profitPerUnit * qtyMain,
    total: saleData.total,
    soldBy: saleData.soldBy || 'shop',
    customerName: saleData.customerName || 'Walk-in',
    paymentType: saleData.paymentType || 'cash',
    userId: saleData.userId,
    createdAt: now,
    offlineCreatedAt: now,
    synced: 0,

    // NEW fields saved offline
    unit: saleData.unit || "bag",
    subUnit: saleData.subUnit || "",
    qtyPerUnit: saleData.qtyPerUnit || 1,
    quantityInSub: qtySub,
    isPartialSale: saleData.isPartialSale || qtySub>0,
    pricePerSub: saleData.pricePerSub || 0,
  };

  await offlineDB.sales.put(newSale);
  
  try {
    // deduct decimal stock: 0.05 bag, 0.1 bottle
    const prod = await offlineDB.products.get(saleData.productId);
    if (prod) {
      await offlineDB.products.update(saleData.productId, { stock: prod.stock - qtyMain });
    } else {
      await offlineDB.products.where('_id').equals(saleData.productId).or("localId").equals(saleData.productId).modify((p) => {
        p.stock = (p.stock || 0) - qtyMain;
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
          quantity: sale.quantity, // 0.05 bag
          quantityInSub: sale.quantityInSub, // 2 kg
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
          offlineCreatedAt: sale.createdAt,
          soldBy: sale.soldBy,
        }),
      });
      
      if (res.ok) {
        await offlineDB.sales.update(sale.localId, { synced: 1 });
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }
  
  return { synced, failed };
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void syncOfflineSales();
  });
}