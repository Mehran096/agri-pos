import { Schema, model, models, Types, type Model } from "mongoose";

export interface ISale {
  productId: Types.ObjectId;
  productName: string;
  quantity: number; // in MAIN unit - can be 0.05 bag, 0.1 bottle
  price: number;
  buyPrice: number;
  sellPrice: number;
  originalPrice: number;
  discount: number;
  profit: number;
  total: number;
  soldBy?: string;
  userId: Types.ObjectId;
  localId?: string;
  customerName?: string;
  paymentType?: string;
  synced?: boolean;
  offlineCreatedAt?: Date;

  // NEW: For flexible bag/kg and bottle/ml
  unit?: string; // bag, bottle, liter, kg, ml
  subUnit?: string; // kg, ml, liter, g
  qtyPerUnit?: number; // e.g. 50kg per bag, 1000ml per bottle
  quantityInSub?: number; // e.g. 2 kg, 100 ml, 200 ml
  isPartialSale?: boolean; // true if sold in kg/ml instead of full bag/bottle
  pricePerSub?: number; // e.g. 100 Rs/kg, 0.8 Rs/ml

  createdAt?: Date;
  updatedAt?: Date;
}

const SaleSchema = new Schema<ISale>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productName: { type: String, required: true, trim: true },

    // ✅ Allow decimal for partial sales: 0.05 bag = 2kg, 0.1 bottle = 100ml
    quantity: { type: Number, required: true, min: 0.001 },

    // Pricing
    price: { type: Number, required: true },
    buyPrice: { type: Number, required: true, default: 0 },
    sellPrice: { type: Number, required: true, default: 0 },
    originalPrice: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    profit: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true },

    soldBy: { type: String, default: "shop" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // NEW FIELDS
    unit: { type: String, default: "bag" },
    subUnit: { type: String, default: "" },
    qtyPerUnit: { type: Number, default: 1 },
    quantityInSub: { type: Number, default: 0 }, // e.g. 2 for 2kg, 100 for 100ml
    isPartialSale: { type: Boolean, default: false },
    pricePerSub: { type: Number, default: 0 },

    // OFFLINE
    localId: { type: String, unique: true, sparse: true, index: true },
    customerName: { type: String, default: "Walk-in" },
    paymentType: { type: String, default: "cash", enum: ["cash", "udhar", "jazzcash", "easypaisa", "card"] },
    synced: { type: Boolean, default: true },
    offlineCreatedAt: { type: Date },
  },
  { timestamps: true }
);

SaleSchema.index({ userId: 1, createdAt: -1 });
SaleSchema.index({ userId: 1, productName: 1 });
SaleSchema.index({ userId: 1, localId: 1 });
SaleSchema.index({ productId: 1, createdAt: -1 });
SaleSchema.index({ productName: "text" });

const Sale = (models.Sale as Model<ISale>) || model<ISale>("Sale", SaleSchema);
export default Sale;