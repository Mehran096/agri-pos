import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
type SaleUpdateBody = {
  quantity?: number;
  sellPrice?: number;
  price?: number;
  customerName?: string;
  paymentType?: string;
  // NEW partial edit
  quantityInSub?: number;
  unit?: string;
  subUnit?: string;
  qtyPerUnit?: number;
  isPartialSale?: boolean;
  pricePerSub?: number;
};

function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const sale = await Sale.findOne({ 
      _id: id, 
      userId: new Types.ObjectId(session.user.id) 
    }).lean();
    
    if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    return NextResponse.json(sale);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const body = await req.json() as SaleUpdateBody;
    
    const userObjectId = new Types.ObjectId(session.user.id);
    const existingSale = await Sale.findOne({ _id: id, userId: userObjectId });
    if (!existingSale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

    const newQuantity = body.quantity ?? existingSale.quantity;
    const newSellPrice = body.sellPrice ?? body.price ?? existingSale.sellPrice;

    if (newQuantity < 0.001) {
      return NextResponse.json({ error: "Valid quantity required" }, { status: 400 });
    }

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

    existingSale.quantity = newQuantity;
    existingSale.sellPrice = Number(newSellPrice);
    existingSale.price = Number(newSellPrice);
    existingSale.total = newQuantity * Number(newSellPrice);
    existingSale.profit = (Number(newSellPrice) - buyPrice) * newQuantity;
    existingSale.discount = (originalPrice - Number(newSellPrice)) * newQuantity;
    existingSale.originalPrice = Number(originalPrice);

    if (body.customerName) existingSale.customerName = body.customerName;
    if (body.paymentType) existingSale.paymentType = body.paymentType;

    // NEW: update partial fields if sent
    if (body.unit) existingSale.unit = body.unit;
    if (body.subUnit) existingSale.subUnit = body.subUnit;
    if (body.qtyPerUnit !== undefined) existingSale.qtyPerUnit = Number(body.qtyPerUnit);
    if (body.quantityInSub !== undefined) existingSale.quantityInSub = Number(body.quantityInSub);
    if (body.isPartialSale !== undefined) existingSale.isPartialSale = Boolean(body.isPartialSale);
    if (body.pricePerSub !== undefined) existingSale.pricePerSub = Number(body.pricePerSub);

    // auto recalc quantityInSub if qty changed and it's partial
    if (body.quantity !== undefined && existingSale.isPartialSale && existingSale.qtyPerUnit) {
      if (body.quantityInSub === undefined) {
        existingSale.quantityInSub = newQuantity * existingSale.qtyPerUnit;
      }
    }

    await existingSale.save();

    return NextResponse.json(existingSale);
  } catch {
    return NextResponse.json({ error: "Failed to update sale" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const userObjectId = new Types.ObjectId(session.user.id);
    
    const sale = await Sale.findOne({ _id: id, userId: userObjectId });
    if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

    await Product.findOneAndUpdate(
      { _id: sale.productId, userId: userObjectId },
      { $inc: { stock: sale.quantity }, $set: { lastSyncedAt: new Date() } }
    );

    await Sale.deleteOne({ _id: id, userId: userObjectId });
    return NextResponse.json({ message: "Sale deleted and stock restored" });
  } catch {
    return NextResponse.json({ error: "Failed to delete sale" }, { status: 500 });
  }
}