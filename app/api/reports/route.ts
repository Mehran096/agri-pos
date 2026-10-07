import dbConnect from "@/lib/mongodb";
import Sale from "@/models/Sale";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AggResult = { count: number; total: number };
type Summary = { count: number; total: number };

function formatAgg(agg: AggResult[]): Summary {
  if (agg.length === 0) return { count: 0, total: 0 };
  return { count: agg[0].count, total: agg[0].total };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const userId = new Types.ObjectId(session.user.id);

    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);

    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startMonth.setHours(0, 0, 0, 0);

    const startYear = new Date(now.getFullYear(), 0, 1);
    startYear.setHours(0, 0, 0, 0);

    const [todayAgg, monthAgg, yearAgg, allAgg] = await Promise.all([
      Sale.aggregate<AggResult>([
        { $match: { userId, createdAt: { $gte: startToday } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } },
      ]),
      Sale.aggregate<AggResult>([
        { $match: { userId, createdAt: { $gte: startMonth } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } },
      ]),
      Sale.aggregate<AggResult>([
        { $match: { userId, createdAt: { $gte: startYear } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } },
      ]),
      Sale.aggregate<AggResult>([
        { $match: { userId } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } },
      ]),
    ]);

    return NextResponse.json({
      today: formatAgg(todayAgg),
      month: formatAgg(monthAgg),
      year: formatAgg(yearAgg),
      all: formatAgg(allAgg),
    });
  } catch (error) {
    console.error("GET /api/sales/summary error:", error);
    return NextResponse.json(
      {
        today: { count: 0, total: 0 },
        month: { count: 0, total: 0 },
        year: { count: 0, total: 0 },
        all: { count: 0, total: 0 },
        error: "Failed to fetch summary",
      },
      { status: 500 }
    );
  }
}