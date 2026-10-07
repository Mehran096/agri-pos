import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProductBody = { 
  name: string; 
  price: number; 
  unit: string; 
  stock?: number;
  localId?: string;
};

type ProductQuery = {
  name?: { $regex: string; $options: string };
  userId: Types.ObjectId;
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    const userObjectId = new Types.ObjectId(session.user.id);
    const query: ProductQuery = { userId: userObjectId };
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const [products, totalCount] = await Promise.all([
      Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
    ]);

    if (searchParams.has("page") || searchParams.has("search")) {
      return NextResponse.json({
        products,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasMore: skip + products.length < totalCount,
        },
      });
    }

    return NextResponse.json(products);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const body: ProductBody = await req.json();

    if (!body.name || !body.price || !body.unit) {
      return NextResponse.json({ error: "name, price, unit required" }, { status: 400 });
    }

    const userObjectId = new Types.ObjectId(session.user.id);

    if (body.localId) {
      const existing = await Product.findOne({ 
        localId: body.localId, 
        userId: userObjectId 
      }).lean();
      if (existing) {
        return NextResponse.json(existing, { status: 200 });
      }
    }

    const product = await Product.create({
      name: body.name.trim(),
      price: Number(body.price),
      unit: body.unit.trim(),
      stock: body.stock ?? 100,
      userId: userObjectId,
      localId: body.localId || undefined,
      synced: true,
      lastSyncedAt: new Date(),
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("POST /api/products error:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}