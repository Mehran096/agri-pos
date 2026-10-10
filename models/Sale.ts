import { Schema, model, models, Types, type Model } from "mongoose";

export interface ISale {
  productId: Types.ObjectId;
  productName: string;
  quantity: number;
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
  unit?: string;
  subUnit?: string;
  qtyPerUnit?: number;
  quantityInSub?: number;
  isPartialSale?: boolean;
  pricePerSub?: number;
  customerId?: Types.ObjectId;
  paidAmount?: number;
  pendingAmount?: number;
  status?: "paid" | "pending" | "partial";
  isCredit?: boolean;
  wusoolDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const SaleSchema = new Schema<ISale>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0.001 },
    price: { type: Number, required: true },
    buyPrice: { type: Number, required: true, default: 0 },
    sellPrice: { type: Number, required: true, default: 0 },
    originalPrice: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    profit: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true },
    soldBy: { type: String, default: "shop" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    unit: { type: String, default: "bag" },
    subUnit: { type: String, default: "" },
    qtyPerUnit: { type: Number, default: 1 },
    quantityInSub: { type: Number, default: 0 },
    isPartialSale: { type: Boolean, default: false },
    pricePerSub: { type: Number, default: 0 },
    localId: { type: String, unique: true, sparse: true },
    customerName: { type: String, default: "Walk-in" },
    paymentType: { 
      type: String, 
      default: "cash", 
      enum: ["cash", "credit", "udhar", "jazzcash", "easypaisa", "card"],
    },
    synced: { type: Boolean, default: true },
    offlineCreatedAt: { type: Date },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    paidAmount: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    status: { type: String, enum: ["paid", "pending", "partial"], default: "paid" },
    isCredit: { type: Boolean, default: false },
    wusoolDate: { type: Date },
  },
  { timestamps: true }
);

// All indexes defined here only (no duplicates)
SaleSchema.index({ userId: 1, createdAt: -1 });
SaleSchema.index({ userId: 1, productName: 1 });
SaleSchema.index({ userId: 1, localId: 1 });
SaleSchema.index({ productId: 1, createdAt: -1 });
SaleSchema.index({ productName: "text" });
SaleSchema.index({ status: 1, customerName: 1 });
SaleSchema.index({ customerId: 1, status: 1 });
SaleSchema.index({ isCredit: 1, createdAt: -1 });

const Sale = (models.Sale as Model<ISale>) || model<ISale>("Sale", SaleSchema);
export default Sale;