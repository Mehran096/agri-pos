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
}

export interface SyncQueueItem {
  id?: number;
  type: 'sale' | 'product';
  localId: string;
  payload: OfflineSale | OfflineProduct;
  createdAt: Date;
  attempts: number;
}

export class OfflineDB extends Dexie {
  products!: Table<OfflineProduct, string>;
  sales!: Table<OfflineSale, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('SonaShopOfflineV6');
    this.version(1).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt',
      syncQueue: '++id, type, localId, createdAt',
    });
  }
}

export const offlineDB = new OfflineDB();
export const db = offlineDB;