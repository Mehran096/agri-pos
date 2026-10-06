import dbConnect from "@/lib/mongodb";
import Sale from "@/models/Sale";
import { NextResponse } from "next/server";

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
    await dbConnect();

    const now = new Date();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startMonth.setHours(0, 0, 0, 0);

    const startYear = new Date(now.getFullYear(), 0, 1);
    startYear.setHours(0, 0, 0, 0);

    const [todayAgg, monthAgg, yearAgg, allAgg] = await Promise.all([
      Sale.aggregate<AggResult>([
        { $match: { createdAt: { $gte: startToday } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } },
      ]),
      Sale.aggregate<AggResult>([
        { $match: { createdAt: { $gte: startMonth } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } },
      ]),
      Sale.aggregate<AggResult>([
        { $match: { createdAt: { $gte: startYear } } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" } } },
      ]),
      Sale.aggregate<AggResult>([
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