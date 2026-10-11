import mongoose, { Schema, Document, Types } from "mongoose";

export interface IWusoolEntry {
  amount: number;
  date: Date;
  note?: string;
}

export interface ICustomer extends Document {
  name: string;
  normalizedName: string;
  phone: string;
  village: string;
  totalUdhar: number; // remaining
  totalBusiness: number; // total bills ever
  lastUdharDate: Date;
  saleIds: Types.ObjectId[];
  userId: Types.ObjectId;
  billsCount: number;
  idsGrouped?: Types.ObjectId[];
  isPaid: boolean;
  paidAmount: number; // total wusool
  paidAt?: Date;
  lastWusoolDate?: Date;
  wusoolHistory: IWusoolEntry[];
}

const WusoolHistorySchema = new Schema<IWusoolEntry>(
  {
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    village: { type: String, default: "" },
    totalUdhar: { type: Number, default: 0 },
    totalBusiness: { type: Number, default: 0 },
    lastUdharDate: { type: Date, default: Date.now },
    saleIds: [{ type: Schema.Types.ObjectId, ref: "Sale", default: [] }],
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    billsCount: { type: Number, default: 1 },
    idsGrouped: [{ type: Schema.Types.ObjectId, default: [] }],
    isPaid: { type: Boolean, default: false },
    paidAmount: { type: Number, default: 0 },
    paidAt: { type: Date },
    lastWusoolDate: { type: Date },
    wusoolHistory: { type: [WusoolHistorySchema], default: [] },
  },
  { timestamps: true }
);

CustomerSchema.pre("validate", function () {
  if (this.name) {
    this.normalizedName = this.name.trim().toLowerCase();
  }
});

// 100% correct indexes - as per your screenshot
CustomerSchema.index(
  { userId: 1, normalizedName: 1 },
  {
    unique: true,
    partialFilterExpression: { isPaid: false },
  }
);
CustomerSchema.index({ userId: 1, createdAt: -1 });
CustomerSchema.index({ userId: 1, isPaid: 1 });
CustomerSchema.index({ userId: 1 }); // for your existing query

export default mongoose.models.Customer || mongoose.model<ICustomer>("Customer", CustomerSchema);