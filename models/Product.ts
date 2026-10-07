import { Schema, model, models, type Model, Types } from "mongoose";

export interface IProduct {
  name: string;
  price: number;
  unit: string;
  stock: number;
  userId: Types.ObjectId;
  localId?: string;
  synced?: boolean;
  lastSyncedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "bag", trim: true },
    stock: { type: Number, required: true, default: 100, min: 0 },
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      index: true 
    },
    // OFFLINE SYNC
    localId: { type: String, sparse: true, index: true },
    synced: { type: Boolean, default: true },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Optimized compound indexes (remove duplicate single indexes)
ProductSchema.index({ userId: 1, name: 1 });
ProductSchema.index({ userId: 1, createdAt: -1 });
ProductSchema.index({ userId: 1, localId: 1 });
ProductSchema.index({ name: "text" });

const Product = (models.Product as Model<IProduct>) || model<IProduct>("Product", ProductSchema);
export default Product;