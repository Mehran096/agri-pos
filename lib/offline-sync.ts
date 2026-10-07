import { offlineDB, OfflineSale } from './offline-db';

export interface OfflineSaleData {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  userId: string;
  soldBy?: string;
  customerName?: string;
  paymentType?: string;
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
  
  const newSale: OfflineSale = {
    localId,
    productId: saleData.productId,
    productName: saleData.productName,
    quantity: saleData.quantity,
    price: saleData.price,
    total: saleData.total,
    soldBy: saleData.soldBy || 'shop',
    customerName: saleData.customerName || 'Walk-in',
    paymentType: saleData.paymentType || 'cash',
    userId: saleData.userId,
    createdAt: now,
    offlineCreatedAt: now,
    synced: 0,
  };

  await offlineDB.sales.put(newSale);
  
  try {
    const prod = await offlineDB.products.get(saleData.productId);
    if (prod) {
      await offlineDB.products.update(saleData.productId, { stock: prod.stock - saleData.quantity });
    } else {
      await offlineDB.products.where('_id').equals(saleData.productId).modify((p) => {
        p.stock -= saleData.quantity;
      });
    }
  } catch {
    // product not in cache, ignore
  }

  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (isSyncRegistration(reg)) {
        await reg.sync.register('sync-sales');
      }
    } catch {
      // background sync not supported
    }
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
          quantity: sale.quantity,
          price: sale.price,
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