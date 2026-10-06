import { Schema, model, models, type Model, Types } from "mongoose";

export interface IProduct {
  name: string;
  price: number;
  unit: string;
  stock: number;
  userId: Types.ObjectId; // <- added
  createdAt?: Date;
  updatedAt?: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, default: "bag", trim: true },
    stock: { type: Number, required: true, default: 100, min: 0, index: true },
    // --- SECURITY FIX ---
    userId: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true, 
      index: true 
    },
  },
  { timestamps: true }
);

// --- COMPOUND INDEXES FOR SEARCH & PAGINATION + MULTI-TENANCY ---
ProductSchema.index({ name: "text" });
ProductSchema.index({ createdAt: -1 });
ProductSchema.index({ userId: 1, name: 1 }); // fast per-user search
ProductSchema.index({ userId: 1, createdAt: -1 }); // fast per-user pagination

// Avoid OverwriteModelError in Next.js hot reload / Vercel lambda
const Product = (models.Product as Model<IProduct>) || model<IProduct>("Product", ProductSchema);

export default Product;