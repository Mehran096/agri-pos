import dbConnect from "@/lib/mongodb";
import Customer from "@/models/Customer";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    await dbConnect();
    
    const { id } = await params; // <-- FIX for Next 15

    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const userIdStr = session.user.id;
    const userIdObj = new Types.ObjectId(userIdStr);

    const result = await Customer.deleteOne({
      _id: id,
      $or: [{ userId: userIdObj }, { userId: userIdStr }],
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("DELETE error:", e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}