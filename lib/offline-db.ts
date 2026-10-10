import Dexie, { Table } from 'dexie';

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
  paidAmount?: number;
  pendingAmount?: number;
  status?: "paid" | "pending" | "partial";
  isCredit?: boolean;
  wusoolDate?: string;
}

export interface OfflineCustomer {
  localId: string;
  _id?: string;
  saleId: string;
  name: string;
  phone?: string;
  village?: string;
  totalUdhar: number;
  totalBusiness: number;
  lastUdharDate?: string;
  synced: number;
  createdAt?: string;
  // NEW - Wusool Done feature
  isPaid?: boolean;
  paidAmount?: number;
  paidAt?: string;
}

export interface SyncQueueItem {
  id?: number;
  type: 'sale' | 'product' | 'customer';
  localId: string;
  payload: OfflineSale | OfflineProduct | OfflineCustomer;
  createdAt: Date;
  attempts: number;
}

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
      return tx.table("products").toCollection().modify(p => {
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
      return tx.table("customers").toCollection().modify(c => {
        const cust = c as OfflineCustomer;
        if (!cust.saleId) {
          cust.saleId = cust.localId;
        }
      });
    });
    // V5 - WUSOOL DONE: keep paid customers, don't delete
    this.version(5).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt, customerName, status, isCredit',
      customers: 'localId, _id, saleId, name, totalUdhar, synced, isPaid',
      syncQueue: '++id, type, localId, createdAt',
    }).upgrade(tx => {
      return tx.table("customers").toCollection().modify(c => {
        const cust = c as OfflineCustomer;
        if (cust.isPaid === undefined) {
          cust.isPaid = false;
        }
        if (cust.paidAmount === undefined) {
          cust.paidAmount = 0;
        }
      });
    });
  }
}

export const offlineDB = new OfflineDB();
export const db = offlineDB;