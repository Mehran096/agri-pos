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
    const body = (await req.json()) as { quantity: number };
    
    if (!body.quantity || body.quantity <= 0) {
      return NextResponse.json({ error: "Valid quantity required" }, { status: 400 });
    }

    const userObjectId = new Types.ObjectId(session.user.id);
    const existingSale = await Sale.findOne({ _id: id, userId: userObjectId });
    if (!existingSale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

    const diff = body.quantity - existingSale.quantity;

    if (diff > 0) {
      const product = await Product.findOne({ _id: existingSale.productId, userId: userObjectId });
      if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
      if (product.stock < diff) {
        return NextResponse.json({ error: `Only ${product.stock} stock left` }, { status: 400 });
      }
    }

    await Product.findOneAndUpdate(
      { _id: existingSale.productId, userId: userObjectId },
      { $inc: { stock: -diff }, $set: { lastSyncedAt: new Date() } }
    );

    existingSale.quantity = body.quantity;
    existingSale.total = body.quantity * existingSale.price;
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