import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };
type ProductBody = { name?: string; price?: number; unit?: string; stock?: number };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await dbConnect();
    const product = await Product.findById(id);
    if (!product) return NextResponse.json({ message: "Product not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ message: "Invalid ID format" }, { status: 400 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await dbConnect();
    const body: ProductBody = await req.json();
    const updated = await Product.findByIdAndUpdate(id, body, { new: true, runValidators: true });
    if (!updated) return NextResponse.json({ message: "Product not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ message: "Failed to update" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await dbConnect();
    const deleted = await Product.findByIdAndDelete(id);
    if (!deleted) return NextResponse.json({ message: "Product not found" }, { status: 404 });
    return NextResponse.json({ message: "Product deleted successfully" });
  } catch {
    return NextResponse.json({ message: "Failed to delete" }, { status: 400 });
  }
}