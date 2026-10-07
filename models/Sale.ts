import { Schema, model, models, Types, type Model } from "mongoose";

export interface ISale {
  productId: Types.ObjectId;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  soldBy?: string;
  userId: Types.ObjectId;
  // OFFLINE
  localId?: string;
  customerName?: string;
  paymentType?: string;
  synced?: boolean;
  offlineCreatedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const SaleSchema = new Schema<ISale>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true },
    total: { type: Number, required: true },
    soldBy: { type: String, default: "shop" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // OFFLINE - optional for backward compat, but unique when present
    localId: { 
      type: String, 
      unique: true, 
      sparse: true, // allows multiple null, but unique when value exists
      index: true 
    },
    customerName: { type: String, default: "Walk-in" },
    paymentType: { type: String, default: "cash", enum: ["cash", "udhar", "jazzcash", "easypaisa", "card"] },
    synced: { type: Boolean, default: true },
    offlineCreatedAt: { type: Date },
  },
  { timestamps: true }
);

// Compound indexes only
SaleSchema.index({ userId: 1, createdAt: -1 });
SaleSchema.index({ userId: 1, productName: 1 });
SaleSchema.index({ userId: 1, localId: 1 });
SaleSchema.index({ productId: 1, createdAt: -1 });
SaleSchema.index({ productName: "text" });

const Sale = (models.Sale as Model<ISale>) || model<ISale>("Sale", SaleSchema);
export default Sale;