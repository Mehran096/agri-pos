import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SaleBody = {
  productId: string;
  productName?: string;
  quantity: number;
  price: number;
  soldBy?: string;
  localId?: string;
  customerName?: string;
  paymentType?: string;
  offlineCreatedAt?: string;
};

type DateRange = { $gte?: Date; $lte?: Date };
type SaleQuery = {
  userId: Types.ObjectId;
  createdAt?: DateRange;
  productName?: { $regex: string; $options: string };
};

function getDateRange(filter: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (filter === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (filter === "yesterday") {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (filter === "weekly") {
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (filter === "monthly") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (filter === "yearly") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const searchParams = req.nextUrl.searchParams;
    const filter = searchParams.get("filter") || "all";
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const userObjectId = new Types.ObjectId(session.user.id);
    const { start, end } = getDateRange(filter);
    const query: SaleQuery = { userId: userObjectId };

    if (filter !== "all") {
      query.createdAt = filter === "yesterday" ? { $gte: start, $lte: end } : { $gte: start };
    }
    if (search) {
      query.productName = { $regex: search, $options: "i" };
    }

    const matchStage: Record<string, unknown> = { userId: userObjectId };
    if (query.createdAt) matchStage.createdAt = query.createdAt;
    if (query.productName) matchStage.productName = query.productName;

    const [sales, totalCount, totalAgg] = await Promise.all([
      Sale.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Sale.countDocuments(query),
      Sale.aggregate([{ $match: matchStage }, { $group: { _id: null, total: { $sum: "$total" } } }]),
    ]);

    const totalResult = totalAgg[0] as { total: number } | undefined;

    return NextResponse.json({
      sales,
      total: totalResult?.total ?? 0,
      filter,
      count: totalCount,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + sales.length < totalCount,
      },
    });
  } catch (error) {
    console.error("GET /api/sales error:", error);
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const body: SaleBody = await req.json();

    if (!body.productId || !body.quantity || !body.price) {
      return NextResponse.json({ error: "productId, quantity, price required" }, { status: 400 });
    }
    if (body.quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be > 0" }, { status: 400 });
    }

    const userObjectId = new Types.ObjectId(session.user.id);

    // OFFLINE IDEMPOTENCY - prevent double sale
    if (body.localId) {
      const existing = await Sale.findOne({ localId: body.localId, userId: userObjectId }).lean();
      if (existing) {
        return NextResponse.json(existing, { status: 200 });
      }
    }

    if (!Types.ObjectId.isValid(body.productId)) {
      return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
    }

    const product = await Product.findOne({ _id: body.productId, userId: userObjectId });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // For offline sales, stock check is soft (stock may be outdated)
    if (!body.localId && product.stock < body.quantity) {
      return NextResponse.json({ error: `Only ${product.stock} left in stock` }, { status: 400 });
    }

    const sale = await Sale.create({
      productId: new Types.ObjectId(body.productId),
      productName: body.productName?.trim() || product.name,
      quantity: Number(body.quantity),
      price: Number(body.price),
      total: Number(body.quantity) * Number(body.price),
      soldBy: body.soldBy?.trim() || "shop",
      userId: userObjectId,
      localId: body.localId || `online_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      customerName: body.customerName || "Walk-in",
      paymentType: body.paymentType || "cash",
      synced: true,
      offlineCreatedAt: body.offlineCreatedAt ? new Date(body.offlineCreatedAt) : new Date(),
    });

    // Deduct stock (allow negative for offline case, will reconcile later)
    await Product.findOneAndUpdate(
      { _id: body.productId, userId: userObjectId },
      { $inc: { stock: -body.quantity }, $set: { lastSyncedAt: new Date() } }
    );

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales error:", error);
    return NextResponse.json({ error: "Failed to create sale" }, { status: 500 });
  }
}