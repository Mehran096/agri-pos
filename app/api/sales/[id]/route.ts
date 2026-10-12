import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import Customer from "@/models/Customer";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
type SaleStatus = "paid" | "pending" | "partial";

type SaleUpdateBody = {
  quantity?: number;
  sellPrice?: number;
  price?: number;
  customerName?: string;
  paymentType?: string;
  quantityInSub?: number;
  unit?: string;
  subUnit?: string;
  qtyPerUnit?: number;
  isPartialSale?: boolean;
  pricePerSub?: number;
  status?: SaleStatus;
  isCredit?: boolean;
};

function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}
function normalizeName(name: string | undefined): string {
  return (name || "Walk-in").trim() || "Walk-in";
}

async function upsertKhataGrouped(userId: Types.ObjectId, name: string, amount: number, saleId: Types.ObjectId) {
  const safeName = normalizeName(name);
  const normalized = safeName.toLowerCase();
  return Customer.findOneAndUpdate(
    { userId, normalizedName: normalized, isPaid: false },
    {
      $setOnInsert: {
        name: safeName,
        normalizedName: normalized,
        userId,
        isPaid: false,
        paidAmount: 0,
      },
      $inc: {
        totalUdhar: Math.round(amount),
        totalBusiness: Math.round(amount),
        billsCount: 1,
      },
      $set: { lastUdharDate: new Date() },
      $addToSet: { saleIds: saleId },
    },
    { upsert: true, new: true }
  );
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const sale = await Sale.findOne({ _id: id, userId: new Types.ObjectId(session.user.id) }).lean();
    if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    return NextResponse.json(sale);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const body = (await req.json()) as SaleUpdateBody;
    const userObjectId = new Types.ObjectId(session.user.id);
    const existingSale = await Sale.findOne({ _id: id, userId: userObjectId });
    if (!existingSale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

    const newQuantity = body.quantity ?? existingSale.quantity;
    const newSellPrice = body.sellPrice ?? body.price ?? existingSale.sellPrice;
    const newTotal = Math.round(newQuantity * Number(newSellPrice));
    const oldTotal = Math.round(existingSale.total);
    if (newQuantity < 0.001) return NextResponse.json({ error: "Valid quantity required" }, { status: 400 });

    const diff = newQuantity - existingSale.quantity;
    if (diff > 0.0001) {
      const product = await Product.findOne({ _id: existingSale.productId, userId: userObjectId });
      if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
      if (product.stock < diff - 0.0001) {
        return NextResponse.json({ error: `Only ${product.stock.toFixed(2)} stock left` }, { status: 400 });
      }
    }
    if (Math.abs(diff) > 0.0001) {
      await Product.findOneAndUpdate(
        { _id: existingSale.productId, userId: userObjectId },
        { $inc: { stock: -diff }, $set: { lastSyncedAt: new Date() } }
      );
    }

    const buyPrice = existingSale.buyPrice || 0;
    const originalPrice = existingSale.originalPrice || newSellPrice;
    const oldCustomerName = normalizeName(existingSale.customerName);
    const oldNormalized = oldCustomerName.toLowerCase();
    const oldIsCredit = existingSale.isCredit || existingSale.status === "pending";

    existingSale.quantity = newQuantity;
    existingSale.sellPrice = Number(newSellPrice);
    existingSale.price = Number(newSellPrice);
    existingSale.total = newTotal;
    existingSale.profit = Math.round((Number(newSellPrice) - buyPrice) * newQuantity);
    existingSale.discount = Math.round((originalPrice - Number(newSellPrice)) * newQuantity);
    existingSale.originalPrice = Number(originalPrice);

    if (body.customerName) existingSale.customerName = body.customerName.trim();
    if (body.paymentType) {
      const rawType = body.paymentType.toLowerCase();
      const isCreditNow = rawType === "credit" || rawType === "udhar" || body.isCredit === true;
      existingSale.paymentType = isCreditNow ? "credit" : rawType;
      existingSale.isCredit = isCreditNow;
      existingSale.status = isCreditNow ? "pending" : "paid";
      existingSale.paidAmount = isCreditNow ? 0 : newTotal;
      existingSale.pendingAmount = isCreditNow ? newTotal : 0;
    } else if (body.status) {
      existingSale.status = body.status;
      existingSale.isCredit = body.status === "pending";
      existingSale.paidAmount = body.status === "pending" ? 0 : newTotal;
      existingSale.pendingAmount = body.status === "pending" ? newTotal : 0;
    }
    if (body.unit) existingSale.unit = body.unit;
    if (body.subUnit) existingSale.subUnit = body.subUnit;
    if (body.qtyPerUnit !== undefined) existingSale.qtyPerUnit = Number(body.qtyPerUnit);
    if (body.quantityInSub !== undefined) existingSale.quantityInSub = Number(body.quantityInSub);
    if (body.isPartialSale !== undefined) existingSale.isPartialSale = Boolean(body.isPartialSale);
    if (body.pricePerSub !== undefined) existingSale.pricePerSub = Number(body.pricePerSub);
    await existingSale.save();

    try {
      const newIsCredit = existingSale.isCredit || existingSale.status === "pending";
      const newCustomerName = normalizeName(existingSale.customerName);
      const newNormalized = newCustomerName.toLowerCase();
      const amountDiff = newTotal - oldTotal;

      if (oldIsCredit && !newIsCredit) {
        await Customer.findOneAndUpdate(
          { userId: userObjectId, saleIds: existingSale._id, isPaid: false },
          { $inc: { totalUdhar: -oldTotal, totalBusiness: -oldTotal, billsCount: -1 }, $pull: { saleIds: existingSale._id } }
        );
        await Customer.deleteOne({ userId: userObjectId, isPaid: false, billsCount: { $lte: 0 } });
      } else if (!oldIsCredit && newIsCredit) {
        await upsertKhataGrouped(userObjectId, newCustomerName, newTotal, existingSale._id as Types.ObjectId);
      } else if (oldIsCredit && newIsCredit) {
        if (oldNormalized !== newNormalized) {
          await Customer.findOneAndUpdate(
            { userId: userObjectId, normalizedName: oldNormalized, isPaid: false },
            { $inc: { totalUdhar: -oldTotal, totalBusiness: -oldTotal, billsCount: -1 }, $pull: { saleIds: existingSale._id } }
          );
          await Customer.deleteOne({ userId: userObjectId, normalizedName: oldNormalized, isPaid: false, billsCount: { $lte: 0 } });
          await upsertKhataGrouped(userObjectId, newCustomerName, newTotal, existingSale._id as Types.ObjectId);
        } else if (amountDiff !== 0) {
          await Customer.findOneAndUpdate(
            { userId: userObjectId, normalizedName: newNormalized, isPaid: false },
            { $inc: { totalUdhar: amountDiff, totalBusiness: amountDiff }, $set: { lastUdharDate: new Date() } }
          );
        }
      }
    } catch (e) {
      console.error("Khata PUT error", e);
    }

    return NextResponse.json(existingSale);
  } catch {
    return NextResponse.json({ error: "Failed to update sale" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const userObjectId = new Types.ObjectId(session.user.id);

    let saleDoc = null;
    if (isValidObjectId(id)) saleDoc = await Sale.findOne({ _id: id, userId: userObjectId });
    if (!saleDoc) saleDoc = await Sale.findOne({ localId: id, userId: userObjectId });
    if (!saleDoc) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

    await Product.findOneAndUpdate(
      { _id: saleDoc.productId, userId: userObjectId },
      { $inc: { stock: saleDoc.quantity }, $set: { lastSyncedAt: new Date() } }
    );

    if (saleDoc.isCredit || saleDoc.status === "pending" || saleDoc.paymentType === "credit") {
      try {
        const custName = normalizeName(saleDoc.customerName);
        const normalizedDel = custName.toLowerCase();
        const saleAmount = Math.round(saleDoc.total);

        const updated = await Customer.findOneAndUpdate(
          { userId: userObjectId, saleIds: saleDoc._id, isPaid: false },
          {
            $inc: { totalUdhar: -saleAmount, totalBusiness: -saleAmount, billsCount: -1 },
            $pull: { saleIds: saleDoc._id },
          },
          { new: true }
        );

        if (updated) {
          if ((updated.totalUdhar ?? 0) <= 0.5 || (updated.billsCount ?? 0) <= 0) {
            await Customer.deleteOne({ _id: updated._id });
          } else if ((updated.totalUdhar ?? 0) < 0) {
            await Customer.updateOne({ _id: updated._id }, { $set: { totalUdhar: 0 } });
          }
        } else {
          await Customer.updateOne(
            { userId: userObjectId, normalizedName: normalizedDel, isPaid: false },
            { $inc: { totalUdhar: -saleAmount, totalBusiness: -saleAmount, billsCount: -1 } }
          );
          await Customer.deleteOne({
            userId: userObjectId,
            normalizedName: normalizedDel,
            isPaid: false,
            $or: [{ billsCount: { $lte: 0 } }, { totalUdhar: { $lte: 0.5 } }],
          });
        }
      } catch (e) {
        console.error("Khata DELETE error", e);
      }
    }

    await Sale.deleteOne({ _id: saleDoc._id, userId: userObjectId });
    return NextResponse.json({ message: "Sale deleted, Khata updated" });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete sale" }, { status: 500 });
  }
}