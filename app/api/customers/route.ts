import dbConnect from "@/lib/mongodb";
import Customer, { ICustomer } from "@/models/Customer";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";

type CustomerBody = {
  name?: string;
  phone?: string;
  village?: string;
  totalUdhar?: number;
  totalBusiness?: number;
  saleId?: string;
};

type CustomerQuery = {
  userId: Types.ObjectId;
  name?: { $regex: string; $options: string };
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const search = req.nextUrl.searchParams.get("search")?.trim() || "";
    const userId = new Types.ObjectId(session.user.id);
    
    const query: CustomerQuery = { userId };
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    
    const customers = await Customer.find(query)
      .sort({ isPaid: 1, lastUdharDate: -1, createdAt: -1 })
      .lean<ICustomer[]>();

    const rounded = customers.map(c => ({
      ...c,
      totalUdhar: Math.round(c.totalUdhar || 0),
      totalBusiness: Math.round(c.totalBusiness || 0),
      paidAmount: Math.round(c.paidAmount || 0),
    }));

    return NextResponse.json({ customers: rounded });
  } catch (error) {
    console.error("GET /api/customers error:", error);
    return NextResponse.json({ error: "Failed to fetch customers" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const body = (await req.json()) as CustomerBody;
    
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    const userId = new Types.ObjectId(session.user.id);
    
    const doc: Partial<ICustomer> = {
      name: body.name.trim(),
      phone: body.phone || "",
      village: body.village || "",
      totalUdhar: Math.round(body.totalUdhar || 0),
      totalBusiness: Math.round(body.totalBusiness || body.totalUdhar || 0),
      lastUdharDate: new Date(),
      userId,
      isPaid: false,
      paidAmount: 0,
    };
    if (body.saleId && Types.ObjectId.isValid(body.saleId)) {
      doc.saleId = new Types.ObjectId(body.saleId);
    }
    
    const cust = await Customer.create(doc);
    return NextResponse.json(cust, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers error:", error);
    const mongoErr = error as { code?: number };
    if (mongoErr.code === 11000) {
      return NextResponse.json({ error: "Khata entry already exists for this sale" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}