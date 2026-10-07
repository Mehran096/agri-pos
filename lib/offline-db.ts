import Dexie, { Table } from 'dexie';

export interface OfflineProduct {
  _id?: string; // server id after sync
  localId: string; // offline unique id - primary key
  name: string;
  price: number;
  unit: string;
  stock: number;
  userId: string;
  synced: number; // 0 = pending, 1 = synced (use number for dexie index)
  createdAt?: string;
  lastSyncedAt?: string;
}

export interface OfflineSale {
  localId: string; // primary key - matches server localId unique field
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  soldBy?: string;
  customerName?: string;
  paymentType?: string;
  userId: string;
  createdAt: string; // ISO string
  synced: number; // 0 = pending, 1 = synced
  offlineCreatedAt?: string;
}

export interface SyncQueueItem {
  id?: number;
  type: 'sale' | 'product';
  localId: string; // ref to product/sale localId
  payload: OfflineSale | OfflineProduct;
  createdAt: Date;
  attempts: number;
}

export class OfflineDB extends Dexie {
  products!: Table<OfflineProduct, string>;
  sales!: Table<OfflineSale, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('SonaShopOfflineV5');
    this.version(1).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt',
      syncQueue: '++id, type, localId, createdAt',
    });
  }
}

export const offlineDB = new OfflineDB();
// Alias for compatibility with old code
export const db = offlineDB;