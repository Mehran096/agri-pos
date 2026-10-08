import dbConnect from "@/lib/mongodb";
import Sale from "@/models/Sale";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AggResult = { count: number; total: number; profit: number };

function empty() {
  return { count: 0, total: 0, profit: 0 };
}

function fmt(arr: AggResult[]) {
  if (!arr || arr.length === 0) return empty();
  return {
    count: arr[0].count || 0,
    total: arr[0].total || 0,
    profit: arr[0].profit || 0,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // NEVER return 401 - return empty 200 so dashboard doesn't crash
      return NextResponse.json({
        today: empty(),
        month: empty(),
        year: empty(),
        all: empty(),
      });
    }

    await dbConnect();
    const userId = new Types.ObjectId(session.user.id);

    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startYear = new Date(now.getFullYear(), 0, 1);

    const agg = (match: object) =>
      Sale.aggregate<AggResult>([
        { $match: match },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$total" }, profit: { $sum: { $ifNull: ["$profit", 0] } } } },
      ]);

    const [todayAgg, monthAgg, yearAgg, allAgg] = await Promise.all([
      agg({ userId, createdAt: { $gte: startToday } }),
      agg({ userId, createdAt: { $gte: startMonth } }),
      agg({ userId, createdAt: { $gte: startYear } }),
      agg({ userId }),
    ]);

    return NextResponse.json({
      today: fmt(todayAgg),
      month: fmt(monthAgg),
      year: fmt(yearAgg),
      all: fmt(allAgg),
    });
  } catch (e) {
    console.error("GET /api/reports error:", e);
    // NEVER return 500 - return empty 200
    return NextResponse.json({
      today: empty(),
      month: empty(),
      year: empty(),
      all: empty(),
    });
  }
}