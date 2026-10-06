import { Schema, model, models, Types, type Model } from "mongoose";

export interface ISale {
  productId: Types.ObjectId;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  soldBy?: string;
  userId: Types.ObjectId; // <- added for private data
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
    // --- SECURITY FIX ---
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

// --- INDEXES FOR SEARCH & PAGINATION + MULTI-USER ---
SaleSchema.index({ productName: "text" });
SaleSchema.index({ createdAt: -1 });
SaleSchema.index({ productId: 1, createdAt: -1 });
SaleSchema.index({ userId: 1, createdAt: -1 }); // fast per-user Today/Monthly
SaleSchema.index({ userId: 1, productName: 1 }); // fast per-user search

const Sale = (models.Sale as Model<ISale>) || model<ISale>("Sale", SaleSchema);
export default Sale;