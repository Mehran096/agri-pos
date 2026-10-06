import { Schema, model, models, Types } from "mongoose";

export interface ISale {
  productId: Types.ObjectId;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  soldBy?: string;
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
  },
  { timestamps: true }
);

// --- INDEXES FOR SEARCH & PAGINATION ---
SaleSchema.index({ productName: "text" }); // fast text search for "Urea", "Weedicide"
SaleSchema.index({ createdAt: -1 }); // for Today/Monthly/Yearly sorting
SaleSchema.index({ productId: 1, createdAt: -1 }); // for product-wise history

export default models.Sale || model<ISale>("Sale", SaleSchema);