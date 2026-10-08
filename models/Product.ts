import { Schema, model, models, type Model, Types } from "mongoose";

export interface IProduct {
  name: string;
  price: number; // kept for backward compat - will sync with sellPrice
  buyPrice: number;
  sellPrice: number;
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
    
    // NEW: Shopkeeper fields
    buyPrice: { type: Number, required: true, default: 0, min: 0 }, // Kharid
    sellPrice: { type: Number, required: true, default: 0, min: 0 }, // Frokht

    // OLD: Keep for backward compatibility
    price: { 
      type: Number, 
      required: true, 
      min: 0,
      default: 0 
    },

    unit: { 
      type: String, 
      enum: ["bag", "liter", "kg", "ml"], // ✅ your 4 units
      default: "bag", 
      trim: true 
    },
    
    stock: { type: Number, required: true, default: 100, min: 0 },
    
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // OFFLINE SYNC
    localId: { type: String, sparse: true, index: true },
    synced: { type: Boolean, default: true },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true }, // to include profit
    toObject: { virtuals: true }
  }
);

// Virtual: Profit = Sell - Buy
ProductSchema.virtual("profit").get(function () {
  const sell = this.sellPrice || this.price || 0;
  const buy = this.buyPrice || 0;
  return sell - buy;
});

// Virtual: Profit %
ProductSchema.virtual("profitPercent").get(function () {
  const buy = this.buyPrice || 0;
  if (buy === 0) return 0;
  const sell = this.sellPrice || this.price || 0;
  return Math.round(((sell - buy) / buy) * 100);
});

// Auto-sync price = sellPrice before save (so old code still works)
ProductSchema.pre("save", function () {
  if (this.sellPrice) {
    this.price = this.sellPrice;
  } else if (this.price) {
    this.sellPrice = this.price;
  }
  
});

// Optimized compound indexes
ProductSchema.index({ userId: 1, name: 1 });
ProductSchema.index({ userId: 1, createdAt: -1 });
ProductSchema.index({ userId: 1, localId: 1 });
ProductSchema.index({ name: "text" });

const Product = (models.Product as Model<IProduct>) || model<IProduct>("Product", ProductSchema);
export default Product;