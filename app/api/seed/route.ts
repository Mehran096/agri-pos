import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";

export async function POST() {
  await dbConnect();
  await Product.deleteMany({}); // clear old
  const products = await Product.insertMany([
    { name: "Wheat Seed", price: 4500, unit: "bag", stock: 100 },
    { name: "DAP Fertilizer", price: 12000, unit: "bag", stock: 50 },
    { name: "Urea Fertilizer", price: 3800, unit: "bag", stock: 80 },
    { name: "Potash", price: 8500, unit: "bag", stock: 40 },
    { name: "Pesticide Spray", price: 1500, unit: "liter", stock: 100 },
    { name: "Corn Seed Hybrid", price: 5200, unit: "bag", stock: 60 },
    { name: "Rice Seed", price: 4800, unit: "bag", stock: 70 },
    { name: "Cotton Seed", price: 6000, unit: "bag", stock: 30 },
    { name: "Weedicide", price: 1800, unit: "liter", stock: 90 },
    { name: "Sona Urea", price: 3900, unit: "bag", stock: 110 },
  ]);
  return NextResponse.json({ message: "10 products seeded", products });
}