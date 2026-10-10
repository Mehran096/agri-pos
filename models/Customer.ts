import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICustomer extends Document {
  name: string;
  phone: string;
  village: string;
  totalUdhar: number;
  totalBusiness: number;
  lastUdharDate: Date;
  saleId?: Types.ObjectId;
  userId: Types.ObjectId;
  // NEW - for Wusool Done history
  isPaid: boolean;
  paidAmount: number;
  paidAt?: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    village: { type: String, default: "" },
    totalUdhar: { type: Number, default: 0 },
    totalBusiness: { type: Number, default: 0 },
    lastUdharDate: { type: Date, default: Date.now },
    saleId: { type: Schema.Types.ObjectId, ref: "Sale" },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // NEW FIELDS - don't delete, show as Wusool Done
    isPaid: { type: Boolean, default: false },
    paidAmount: { type: Number, default: 0 },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

// Allows same name - Faisal can have 100 rows
CustomerSchema.index({ userId: 1, name: 1 });
CustomerSchema.index({ saleId: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Customer || mongoose.model<ICustomer>("Customer", CustomerSchema);