import { Schema, model, models, type Model } from "mongoose";

export interface IProduct {
  name: string;
  price: number;
  unit: string;
  stock: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "bag", trim: true },
    stock: { type: Number, required: true, default: 100, min: 0, index: true },
  },
  { timestamps: true }
);

// --- COMPOUND INDEXES FOR SEARCH & PAGINATION ---
// Keep only 3 - Vercel free Atlas M0 allows max 3 text indexes per collection
ProductSchema.index({ name: "text" }); // fast search ?search=Urea
ProductSchema.index({ createdAt: -1 }); // newest first for pagination
ProductSchema.index({ name: 1, createdAt: -1 }); // sort A-Z + newest

// Avoid OverwriteModelError in Next.js hot reload / Vercel lambda
const Product = (models.Product as Model<IProduct>) || model<IProduct>("Product", ProductSchema);

export default Product;