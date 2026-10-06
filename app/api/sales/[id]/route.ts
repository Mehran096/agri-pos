import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  await dbConnect();
  const { id } = await params;
  const sale = await Sale.findById(id);
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  return NextResponse.json(sale);
}

export async function PUT(req: NextRequest, { params }: Params) {
  await dbConnect();
  const { id } = await params;
  const body = (await req.json()) as { quantity: number };

  const existingSale = await Sale.findById(id);
  if (!existingSale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  const diff = body.quantity - existingSale.quantity;
  const product = await Product.findById(existingSale.productId);

  if (product && product.stock < diff) {
    return NextResponse.json({ error: `Only ${product.stock} stock left` }, { status: 400 });
  }

  if (product) {
    await Product.findByIdAndUpdate(existingSale.productId, {
      $inc: { stock: -diff },
    });
  }

  existingSale.quantity = body.quantity;
  existingSale.total = body.quantity * existingSale.price;
  await existingSale.save();

  return NextResponse.json(existingSale);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await dbConnect();
  const { id } = await params;
  const sale = await Sale.findById(id);
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });

  await Product.findByIdAndUpdate(sale.productId, {
    $inc: { stock: sale.quantity },
  });

  await Sale.findByIdAndDelete(id);
  return NextResponse.json({ message: "Sale deleted and stock restored" });
}