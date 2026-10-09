import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
type ProductBody = { 
  name?: string; 
  price?: number; 
  buyPrice?: number;
  sellPrice?: number;
  unit?: string; 
  stock?: number;
  qtyPerUnit?: number;
  subUnit?: string;
  baseQtyInSub?: number;
};

function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid ID format" }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const product = await Product.findOne({ 
      _id: id, 
      userId: new Types.ObjectId(session.user.id) 
    }).lean({ virtuals: true });
    
    if (!product) return NextResponse.json({ message: "Product not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ message: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid ID format" }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const body = await req.json() as ProductBody;
    
    const updateData: Record<string, string | number | Date | boolean> = {
      lastSyncedAt: new Date() as Date,
      synced: true as boolean
    };

    if (body.name) updateData.name = body.name.trim();
    if (body.unit) updateData.unit = body.unit.trim();
    if (body.stock !== undefined) updateData.stock = Number(body.stock);
    
    if (body.buyPrice !== undefined) updateData.buyPrice = Number(body.buyPrice);
    if (body.sellPrice !== undefined) {
      updateData.sellPrice = Number(body.sellPrice);
      updateData.price = Number(body.sellPrice);
    } else if (body.price !== undefined) {
      updateData.sellPrice = Number(body.price);
      updateData.price = Number(body.price);
    }

    // NEW: flexible size - allow edit 20kg -> 50kg, 500ml -> 1.5L
    if (body.qtyPerUnit !== undefined) {
      updateData.qtyPerUnit = Number(body.qtyPerUnit);
    }
    if (body.subUnit !== undefined) {
      updateData.subUnit = body.subUnit;
    }
    // auto recalc baseQtyInSub
    if (body.qtyPerUnit !== undefined || body.subUnit !== undefined) {
      // fetch current to merge
      const current = await Product.findOne({ _id: id, userId: new Types.ObjectId(session.user.id) }).lean();
      const finalQty = body.qtyPerUnit ?? current?.qtyPerUnit ?? 1;
      const finalSub = body.subUnit ?? current?.subUnit ?? "";
      const finalBase = finalSub === "liter" ? finalQty * 1000 : finalQty;
      updateData.baseQtyInSub = finalBase;
      updateData.qtyPerUnit = Number(finalQty);
      updateData.subUnit = finalSub;
    } else if (body.baseQtyInSub !== undefined) {
      updateData.baseQtyInSub = Number(body.baseQtyInSub);
    }

    const updated = await Product.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(session.user.id) },
      updateData,
      { new: true, runValidators: true }
    ).lean({ virtuals: true });

    if (!updated) return NextResponse.json({ message: "Product not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT error:", error);
    return NextResponse.json({ message: "Failed to update" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ message: "Invalid ID format" }, { status: 400 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const deleted = await Product.findOneAndDelete({ 
      _id: id, 
      userId: new Types.ObjectId(session.user.id) 
    });

    if (!deleted) return NextResponse.json({ message: "Product not found" }, { status: 404 });
    return NextResponse.json({ message: "Product deleted successfully" });
  } catch {
    return NextResponse.json({ message: "Failed to delete" }, { status: 400 });
  }
}