import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import Customer from "@/models/Customer";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SaleStatus = "paid" | "pending" | "partial";

type SaleBody = {
  productId: string;
  productName?: string;
  quantity: number;
  price?: number;
  buyPrice?: number;
  sellPrice?: number;
  originalPrice?: number;
  discount?: number;
  profit?: number;
  total?: number;
  soldBy?: string;
  localId?: string;
  customerName?: string;
  customerPhone?: string;
  customerVillage?: string;
  paymentType?: string;
  offlineCreatedAt?: string;
  unit?: string;
  subUnit?: string;
  qtyPerUnit?: number;
  quantityInSub?: number;
  isPartialSale?: boolean;
  pricePerSub?: number;
  paidAmount?: number;
  pendingAmount?: number;
  status?: SaleStatus;
  isCredit?: boolean;
};

type SaleQuery = {
  userId: Types.ObjectId;
  createdAt?: { $gte?: Date; $lte?: Date };
  productName?: { $regex: string; $options: "i" };
  status?: SaleStatus;
};

function getDateRange(filter: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (filter === "today") start.setHours(0, 0, 0, 0);
  else if (filter === "yesterday") {
    start.setDate(now.getDate() - 1); start.setHours(0, 0, 0, 0);
    end.setDate(now.getDate() - 1); end.setHours(23, 59, 59, 999);
  } else if (filter === "weekly") { start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0); }
  else if (filter === "monthly") { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else if (filter === "yearly") { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const searchParams = req.nextUrl.searchParams;
    const filter = searchParams.get("filter") || "all";
    const search = searchParams.get("search")?.trim() || "";
    const statusParam = searchParams.get("status")?.trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;
    const userObjectId = new Types.ObjectId(session.user.id);
    const { start, end } = getDateRange(filter);
    const query: SaleQuery = { userId: userObjectId };
    if (filter!== "all") query.createdAt = filter === "yesterday"? { $gte: start, $lte: end } : { $gte: start };
    if (search) query.productName = { $regex: search, $options: "i" };
    if (statusParam && ["paid", "pending", "partial"].includes(statusParam)) query.status = statusParam as SaleStatus;
    const matchStage: SaleQuery = { userId: userObjectId };
    if (query.createdAt) matchStage.createdAt = query.createdAt;
    if (query.productName) matchStage.productName = query.productName;
    if (query.status) matchStage.status = query.status;
    const [sales, totalCount, totalAgg] = await Promise.all([
      Sale.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Sale.countDocuments(query),
      Sale.aggregate([{ $match: matchStage }, { $group: { _id: null, total: { $sum: "$total" }, profit: { $sum: "$profit" }, pending: { $sum: "$pendingAmount" } } }]),
    ]);
    const totalResult = totalAgg[0] as { total: number; profit: number; pending: number } | undefined;
    return NextResponse.json({
      sales, total: totalResult?.total??0, profit: totalResult?.profit??0, pendingTotal: totalResult?.pending??0,
      filter, count: totalCount,
      pagination: { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit), hasMore: skip + sales.length < totalCount },
    });
  } catch (error) {
    console.error("GET /api/sales error:", error);
    return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const body = (await req.json()) as SaleBody;
    if (!body.productId || body.quantity === undefined) return NextResponse.json({ error: "productId, quantity required" }, { status: 400 });
    if (body.quantity < 0.001) return NextResponse.json({ error: "Quantity must be > 0" }, { status: 400 });
    const userObjectId = new Types.ObjectId(session.user.id);

    if (body.localId) {
      const existing = await Sale.findOne({ localId: body.localId, userId: userObjectId }).lean();
      if (existing) {
        // FIX: ensure Khata exists even for offline resync
        if (existing.isCredit) {
          const hasKhata = await Customer.findOne({ saleId: existing._id, userId: userObjectId });
          if (!hasKhata) {
            try {
              await Customer.create({
                userId: userObjectId,
                name: existing.customerName,
                totalUdhar: Math.round(existing.total),
                totalBusiness: Math.round(existing.total),
                saleId: existing._id,
                lastUdharDate: new Date(),
                isPaid: false,
                paidAmount: 0,
              });
            } catch (e) {
              console.error("Khata create on resync failed", e);
            }
          }
        }
        return NextResponse.json(existing, { status: 200 });
      }
    }

    if (!Types.ObjectId.isValid(body.productId)) return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
    const product = await Product.findOne({ _id: body.productId, userId: userObjectId });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    const quantity = Number(body.quantity);
    if (!body.localId && product.stock < quantity - 0.0001) return NextResponse.json({ error: `Only ${product.stock.toFixed(2)} left in stock` }, { status: 400 });

    const buyPrice = body.buyPrice?? product.buyPrice?? 0;
    const originalPrice = body.originalPrice?? product.sellPrice?? product.price?? 0;
    const sellPrice = body.sellPrice?? body.price?? originalPrice;
    const total = Math.round(body.total?? sellPrice * quantity);
    const discount = Math.round(body.discount?? (originalPrice - sellPrice) * quantity);
    const profit = Math.round(body.profit?? (sellPrice - buyPrice) * quantity);

    const unit = body.unit?? product.unit?? "bag";
    const subUnit = body.subUnit?? product.subUnit?? "";
    const qtyPerUnit = body.qtyPerUnit?? product.qtyPerUnit?? 1;
    const quantityInSub = body.quantityInSub?? (body.isPartialSale? quantity * qtyPerUnit : 0);
    const isPartialSale = body.isPartialSale?? (quantityInSub > 0 && quantityInSub!== quantity);
    const pricePerSub = body.pricePerSub?? (qtyPerUnit > 0? sellPrice / qtyPerUnit : 0);

    const rawType = (body.paymentType || "cash").toLowerCase();
    const isCredit = rawType === "credit" || rawType === "udhar" || body.isCredit === true;
    const paymentType = isCredit? "credit" : rawType;
    const customerName = body.customerName?.trim() || "Walk-in";
    const status: SaleStatus = isCredit? "pending" : "paid";

    if (isCredit && (!customerName || customerName.toLowerCase() === "walk-in")) {
      return NextResponse.json({ error: "Customer name required for Udhar" }, { status: 400 });
    }

    const sale = await Sale.create({
      productId: new Types.ObjectId(body.productId),
      productName: body.productName?.trim() || product.name,
      quantity, price: Number(sellPrice), buyPrice: Number(buyPrice), sellPrice: Number(sellPrice),
      originalPrice: Number(originalPrice), discount: Number(discount), profit: Number(profit), total: Number(total),
      soldBy: body.soldBy?.trim() || "shop", userId: userObjectId,
      localId: body.localId || `online_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      customerName, paymentType, synced: true,
      offlineCreatedAt: body.offlineCreatedAt? new Date(body.offlineCreatedAt) : new Date(),
      unit, subUnit, qtyPerUnit: Number(qtyPerUnit), quantityInSub: Number(quantityInSub),
      isPartialSale: Boolean(isPartialSale), pricePerSub: Number(pricePerSub),
      paidAmount: isCredit? 0 : Number(total),
      pendingAmount: isCredit? Number(total) : 0,
      status, isCredit,
    });

    if (isCredit) {
      try {
        const customerDoc = await Customer.create({
          userId: userObjectId,
          name: customerName,
          phone: body.customerPhone || "",
          village: body.customerVillage || "",
          totalUdhar: total,
          totalBusiness: total,
          saleId: sale._id,
          lastUdharDate: new Date(),
          isPaid: false,
          paidAmount: 0,
        });
        sale.set({ customerId: customerDoc._id });
        await sale.save();
      } catch (err) {
        const dup = err as { code?: number; message?: string };
        console.error("POST /api/sales Khata error:", dup.code, dup.message);
        // Don't throw - sale already created, this is the Faisal fix
        // If code 11000 = old index userId_1_name_1 still exists in Atlas - drop it!
      }
    }

    await Product.findOneAndUpdate({ _id: body.productId, userId: userObjectId }, { $inc: { stock: -quantity }, $set: { lastSyncedAt: new Date() } });
    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    console.error("POST /api/sales error:", error);
    return NextResponse.json({ error: "Failed to create sale" }, { status: 500 });
  }
}