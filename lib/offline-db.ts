import Dexie, { Table } from 'dexie';

export interface WusoolHistoryEntry {
  amount: number;
  date: string;
  note?: string;
}

export interface OfflineProduct {
  _id?: string;
  localId: string;
  name: string;
  price: number;
  buyPrice: number;
  sellPrice: number;
  unit: string;
  stock: number;
  qtyPerUnit?: number;
  subUnit?: string;
  baseQtyInSub?: number;
  pricePerSub?: number;
  totalStockInSub?: number;
  userId: string;
  synced: number;
  createdAt?: string;
  lastSyncedAt?: string;
}

export interface OfflineSale {
  localId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  buyPrice?: number;
  sellPrice?: number;
  profit?: number;
  total: number;
  soldBy?: string;
  customerName?: string;
  normalizedCustomerName?: string;
  paymentType?: string;
  userId: string;
  createdAt: string;
  synced: number;
  offlineCreatedAt?: string;
  unit?: string;
  subUnit?: string;
  qtyPerUnit?: number;
  quantityInSub?: number;
  isPartialSale?: boolean;
  pricePerSub?: number;
  customerId?: string;
  saleId?: string; // <-- FIX for your sales/page.tsx line 253 error
  paidAmount?: number;
  pendingAmount?: number;
  status?: "paid" | "pending" | "partial";
  isCredit?: boolean;
  wusoolDate?: string;
}

export interface OfflineCustomer {
  localId: string;
  _id?: string;
  saleIds: string[];
  saleId?: string; // <-- FIX - old data has singular, new has array
  name: string;
  normalizedName: string;
  phone?: string;
  village?: string;
  totalUdhar: number;
  totalBusiness: number;
  lastUdharDate?: string;
  synced: number;
  createdAt?: string;
  billsCount: number;
  isPaid?: boolean;
  paidAmount?: number;
  paidAt?: string;
  lastWusoolDate?: string;
  wusoolHistory?: WusoolHistoryEntry[];
}

export type WusoolSyncPayload = {
  amount: number;
  note?: string;
  date: string;
};

export interface SyncQueueItem {
  id?: number;
  type: 'sale' | 'product' | 'customer' | 'wusool';
  localId: string;
  payload: OfflineSale | OfflineProduct | OfflineCustomer | WusoolSyncPayload;
  createdAt: Date;
  attempts: number;
}

type LegacyCustomerV4 = OfflineCustomer & { saleId?: string };
type LegacySaleV5 = OfflineSale;

export class OfflineDB extends Dexie {
  products!: Table<OfflineProduct, string>;
  sales!: Table<OfflineSale, string>;
  customers!: Table<OfflineCustomer, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('AlFarooqZarghiOfflineV8');
    this.version(1).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt',
      syncQueue: '++id, type, localId, createdAt',
    });
    this.version(2).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt',
      syncQueue: '++id, type, localId, createdAt',
    }).upgrade(tx => {
      return tx.table("products").toCollection().modify((p: OfflineProduct) => {
        if (!p.qtyPerUnit) {
          if (p.unit === "bag") p.qtyPerUnit = 50;
          else if (p.unit === "bottle" || p.unit === "liter") p.qtyPerUnit = 1000;
          else p.qtyPerUnit = 1;
        }
        if (!p.subUnit) {
          if (p.unit === "bag") p.subUnit = "kg";
          else if (p.unit === "bottle" || p.unit === "liter") p.subUnit = "ml";
          else p.subUnit = "";
        }
      });
    });
    this.version(3).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt, customerName, status, isCredit',
      customers: 'localId, _id, name, totalUdhar, synced',
      syncQueue: '++id, type, localId, createdAt',
    });
    this.version(4).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt, customerName, status, isCredit',
      customers: 'localId, _id, saleId, name, totalUdhar, synced',
      syncQueue: '++id, type, localId, createdAt',
    }).upgrade(tx => {
      return tx.table("customers").toCollection().modify((c: LegacyCustomerV4) => {
        if (!c.saleId) {
          c.saleId = c.localId;
        }
      });
    });
    this.version(5).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt, customerName, status, isCredit',
      customers: 'localId, _id, saleId, name, totalUdhar, synced, isPaid',
      syncQueue: '++id, type, localId, createdAt',
    }).upgrade(tx => {
      return tx.table("customers").toCollection().modify((c: OfflineCustomer) => {
        if (c.isPaid === undefined) c.isPaid = false;
        if (c.paidAmount === undefined) c.paidAmount = 0;
      });
    });
    this.version(6).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt, customerName, normalizedCustomerName, status, isCredit',
      customers: 'localId, _id, name, normalizedName, totalUdhar, synced, isPaid',
      syncQueue: '++id, type, localId, createdAt',
    }).upgrade(async tx => {
      await tx.table("customers").toCollection().modify((c: LegacyCustomerV4) => {
        if (c.saleId && c.saleIds === undefined) c.saleIds = [c.saleId];
        if (!c.saleIds) c.saleIds = [];
        if (!c.normalizedName) c.normalizedName = (c.name || "").trim().toLowerCase();
        if (!c.billsCount) c.billsCount = c.saleIds.length || 1;
      });
      await tx.table("sales").toCollection().modify((s: LegacySaleV5) => {
        if (s.customerName &&!s.normalizedCustomerName) s.normalizedCustomerName = s.customerName.trim().toLowerCase();
      });
      const all = await tx.table("customers").toArray() as OfflineCustomer[];
      const map = new Map<string, OfflineCustomer[]>();
      for (const cust of all) {
        if (cust.isPaid) continue;
        const key = cust.normalizedName;
        const existingList = map.get(key)?? [];
        existingList.push(cust);
        map.set(key, existingList);
      }
      for (const docs of map.values()) {
        if (docs.length > 1) {
          const first = docs[0];
          const totalU = docs.reduce((s: number, d: OfflineCustomer) => s + (d.totalUdhar || 0), 0);
          const totalB = docs.reduce((s: number, d: OfflineCustomer) => s + (d.totalBusiness || 0), 0);
          const allSaleIds = docs.flatMap((d: OfflineCustomer) => d.saleIds || []);
          const count = docs.reduce((s: number, d: OfflineCustomer) => s + (d.billsCount || 1), 0);
          await tx.table("customers").update(first.localId, {
            totalUdhar: totalU,
            totalBusiness: totalB,
            saleIds: allSaleIds,
            billsCount: count,
          });
          for (let i = 1; i < docs.length; i++) {
            await tx.table("customers").delete(docs[i].localId);
          }
        }
      }
    });
    this.version(7).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt, customerName, normalizedCustomerName, status, isCredit',
      customers: 'localId, _id, name, normalizedName, totalUdhar, synced, isPaid',
      syncQueue: '++id, type, localId, createdAt',
    }).upgrade(async tx => {
      await tx.table("customers").toCollection().modify((c: OfflineCustomer) => {
        if (!c.wusoolHistory) c.wusoolHistory = [];
        if (!c.paidAmount) c.paidAmount = (c.totalBusiness || 0) - (c.totalUdhar || 0);
        if (c.paidAmount! > 0 && c.wusoolHistory!.length === 0) {
          c.wusoolHistory!.push({
            amount: c.paidAmount!,
            date: c.paidAt || c.lastWusoolDate || new Date().toISOString(),
            note: "Migrated old wusool"
          });
        }
      });
    });
    // NEW V8 - FIX saleId field for your sales/page.tsx error
    this.version(8).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt, customerName, normalizedCustomerName, status, isCredit, saleId',
      customers: 'localId, _id, name, normalizedName, totalUdhar, synced, isPaid, saleId',
      syncQueue: '++id, type, localId, createdAt',
    }).upgrade(async tx => {
      await tx.table("sales").toCollection().modify((s: OfflineSale) => {
        if (!s.saleId) s.saleId = s.localId;
      });
      await tx.table("customers").toCollection().modify((c: OfflineCustomer) => {
        if (!c.saleId && c.saleIds && c.saleIds.length > 0) c.saleId = c.saleIds[0];
        if (!c.saleIds && c.saleId) c.saleIds = [c.saleId];
        if (!c.saleIds) c.saleIds = [];
      });
    });
  }
}

export const offlineDB = new OfflineDB();
export const db = offlineDB;

export async function upsertOfflineCustomer(sale: OfflineSale, village = "", phone = ""): Promise<string | null> {
  const name = (sale.customerName || "").trim();
  if (!name || name.toLowerCase() === "walk-in") return null;
  const normalized = name.toLowerCase();

  const candidates = await offlineDB.customers.where("normalizedName").equals(normalized).toArray();
  const unpaidList = candidates.filter((c: OfflineCustomer) => c.isPaid === false);
  const existing = unpaidList.length > 0? unpaidList[0] : null;

  if (existing) {
    await offlineDB.customers.update(existing.localId, {
      totalUdhar: Math.round((existing.totalUdhar || 0) + sale.total),
      totalBusiness: Math.round((existing.totalBusiness || 0) + sale.total),
      saleIds: [...(existing.saleIds || []), sale.localId],
      saleId: sale.localId,
      billsCount: (existing.billsCount || 1) + 1,
      lastUdharDate: new Date().toISOString(),
    });
    return existing.localId;
  } else {
    const localId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cust: OfflineCustomer = {
      localId,
      saleIds: [sale.localId],
      saleId: sale.localId,
      name,
      normalizedName: normalized,
      phone,
      village,
      totalUdhar: Math.round(sale.total),
      totalBusiness: Math.round(sale.total),
      lastUdharDate: new Date().toISOString(),
      synced: 0,
      createdAt: new Date().toISOString(),
      billsCount: 1,
      isPaid: false,
      paidAmount: 0,
      wusoolHistory: [],
    };
    await offlineDB.customers.add(cust);
    return localId;
  }
}

export async function addOfflineWusool(customerLocalId: string, amount: number, note = "") {
  const customer = await offlineDB.customers.get(customerLocalId);
  if (!customer) return null;

  const paid = Math.round(amount);
  const newUdhar = Math.round((customer.totalUdhar || 0) - paid);
  const entry: WusoolHistoryEntry = {
    amount: paid,
    date: new Date().toISOString(),
    note,
  };

  if (newUdhar <= 0) {
    await offlineDB.customers.update(customerLocalId, {
      totalUdhar: 0,
      isPaid: true,
      paidAmount: customer.totalBusiness,
      paidAt: new Date().toISOString(),
      lastWusoolDate: new Date().toISOString(),
      wusoolHistory: [...(customer.wusoolHistory || []), entry],
      synced: 0,
    });
  } else {
    await offlineDB.customers.update(customerLocalId, {
      totalUdhar: newUdhar,
      paidAmount: (customer.paidAmount || 0) + paid,
      lastWusoolDate: new Date().toISOString(),
      wusoolHistory: [...(customer.wusoolHistory || []), entry],
      synced: 0,
    });
  }

  await offlineDB.syncQueue.add({
    type: 'wusool',
    localId: customerLocalId,
    payload: { amount: paid, note, date: entry.date },
    createdAt: new Date(),
    attempts: 0,
  });

  return entry;
}