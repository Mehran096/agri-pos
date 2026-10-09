import Dexie, { Table } from 'dexie';

export interface OfflineProduct {
  _id?: string;
  localId: string;
  name: string;
  price: number;
  buyPrice: number;
  sellPrice: number;
  unit: string; // bag, bottle, liter, kg, ml, pack
  stock: number; // decimal: 9.8 bags, 0.9 bottle

  // NEW: Flexible size
  qtyPerUnit?: number; // 20,40,50, 500,1000,1500
  subUnit?: string; // kg, ml, liter, g
  baseQtyInSub?: number; // e.g. 1500 for 1.5L
  pricePerSub?: number; // Rs per kg/ml
  totalStockInSub?: number; // e.g. 500kg

  userId: string;
  synced: number;
  createdAt?: string;
  lastSyncedAt?: string;
}

export interface OfflineSale {
  localId: string;
  productId: string;
  productName: string;

  quantity: number; // in MAIN unit - can be 0.05 bag, 0.1 bottle
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

  // NEW: For partial sales
  unit?: string;
  subUnit?: string;
  qtyPerUnit?: number;
  quantityInSub?: number; // e.g. 2 kg, 100 ml
  isPartialSale?: boolean;
  pricePerSub?: number;
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
    super('SonaShopOfflineV7'); // ✅ bumped V6 -> V7 for migration
    this.version(1).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt',
      syncQueue: '++id, type, localId, createdAt',
    });
    // V2 keeps same indexes - just schema expanded to allow decimal stock
    this.version(2).stores({
      products: 'localId, _id, userId, synced, name',
      sales: 'localId, productId, userId, synced, createdAt',
      syncQueue: '++id, type, localId, createdAt',
    }).upgrade(tx => {
      // migrate old integer stock to decimal compatible
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
  }
}

export const offlineDB = new OfflineDB();
export const db = offlineDB;