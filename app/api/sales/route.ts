import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SaleBody = {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  soldBy?: string;
};

type DateRange = { $gte?: Date; $lte?: Date };
type SaleQuery = {
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
    await dbConnect();
    const searchParams = req.nextUrl.searchParams;

    const filter = searchParams.get("filter") || "all";
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;

    const { start, end } = getDateRange(filter);
    const query: SaleQuery = {};

    if (filter !== "all") {
      if (filter === "yesterday") {
        query.createdAt = { $gte: start, $lte: end };
      } else {
        query.createdAt = { $gte: start };
      }
    }

    if (search) {
      query.productName = { $regex: search, $options: "i" };
    }

    const [sales, totalCount, totalAgg] = await Promise.all([
      Sale.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Sale.countDocuments(query),
      Sale.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
    ]);

    const totalResult = totalAgg[0] as { total: number } | undefined;
    const total = totalResult?.total ?? 0;

    return NextResponse.json({
      sales,
      total,
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
    await dbConnect();
    const body: SaleBody = await req.json();

    if (!body.productId || !body.quantity || !body.price) {
      return NextResponse.json({ error: "productId, quantity, price required" }, { status: 400 });
    }

    if (body.quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be > 0" }, { status: 400 });
    }

    const product = await Product.findById(body.productId);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (product.stock < body.quantity) {
      return NextResponse.json({ error: `Only ${product.stock} left in stock` }, { status: 400 });
    }

    const sale = await Sale.create({
      productId: body.productId,
      productName: body.productName || product.name,
      quantity: Number(body.quantity),
      price: Number(body.price),
      total: Number(body.quantity) * Number(body.price),
      soldBy: body.soldBy?.trim() || "shop",
    });

    await Product.findByIdAndUpdate(body.productId, {
      $inc: { stock: -body.quantity },
    });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales error:", error);
    return NextResponse.json({ error: "Failed to create sale" }, { status: 500 });
  }
}