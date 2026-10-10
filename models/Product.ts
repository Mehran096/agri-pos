import { Schema, model, models, type Model, Types } from "mongoose";

export interface IProduct {
  name: string;
  price: number;
  buyPrice: number;
  sellPrice: number;
  unit: string;
  stock: number;
  userId: Types.ObjectId;
  localId?: string;
  synced?: boolean;
  lastSyncedAt?: Date;
  qtyPerUnit?: number;
  subUnit?: string;
  baseQtyInSub?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    
    buyPrice: { type: Number, required: true, default: 0, min: 0 },
    sellPrice: { type: Number, required: true, default: 0, min: 0 },
    price: { type: Number, required: true, min: 0, default: 0 },

    unit: { 
      type: String, 
      enum: ["bag", "bottle", "liter", "kg", "ml", "pack", "piece", "g", "box", "ton"],
      default: "bag", 
      trim: true 
    },
    
    stock: { type: Number, required: true, default: 100, min: 0 },

    qtyPerUnit: { 
      type: Number, 
      default: function(this: IProduct) {
        if (this.unit === "bag") return 50;
        if (this.unit === "bottle") return 1000;
        if (this.unit === "liter") return 1000;
        if (this.unit === "kg") return 1;
        return 1;
      }
    },
    subUnit: {
      type: String,
      enum: ["kg", "g", "ml", "liter", "piece", ""],
      default: function(this: IProduct) {
        if (this.unit === "bag") return "kg";
        if (this.unit === "bottle") return "ml";
        if (this.unit === "liter") return "ml";
        return "";
      }
    },
    baseQtyInSub: { type: Number, default: 0 },
    
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    localId: { type: String, sparse: true, index: true },
    synced: { type: Boolean, default: true },
    lastSyncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

ProductSchema.virtual("profit").get(function () {
  return (this.sellPrice || this.price || 0) - (this.buyPrice || 0);
});

ProductSchema.virtual("pricePerSub").get(function () {
  const qty = this.qtyPerUnit || 1;
  const normalizedQty = this.subUnit === "liter" ? qty * 1000 : qty;
  if (normalizedQty === 0) return 0;
  return (this.sellPrice || this.price || 0) / normalizedQty;
});

ProductSchema.pre("save", function () {
  if (this.sellPrice) this.price = this.sellPrice;
  else if (this.price) this.sellPrice = this.price;

  if (this.qtyPerUnit) {
    if (this.subUnit === "liter") {
      this.baseQtyInSub = this.qtyPerUnit * 1000;
    } else {
      this.baseQtyInSub = this.qtyPerUnit;
    }
  } else {
    this.baseQtyInSub = 0;
  }
});

ProductSchema.index({ userId: 1, name: 1 });
ProductSchema.index({ userId: 1, createdAt: -1 });

const Product = (models.Product as Model<IProduct>) || model<IProduct>("Product", ProductSchema);
export default Product;