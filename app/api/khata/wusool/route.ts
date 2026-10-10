import dbConnect from "@/lib/mongodb";
import Customer from "@/models/Customer";
import Sale from "@/models/Sale";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const body = (await req.json()) as { customerId?: string; customerName?: string; amount: number };
    const { customerId, customerName, amount } = body;

    if (!amount || (!customerId && !customerName)) {
      return NextResponse.json({ error: "customerId and amount required" }, { status: 400 });
    }

    const userId = new Types.ObjectId(session.user.id);
    const paid = Math.round(Number(amount));
    if (paid <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // Wusool by exact Khata row ID - Faisal fix + Wusool Done feature
    if (customerId && Types.ObjectId.isValid(customerId)) {
      const customer = await Customer.findOne({ _id: customerId, userId });
      if (!customer) {
        return NextResponse.json({ error: "Khata entry not found" }, { status: 404 });
      }

      const newUdhar = Math.round(customer.totalUdhar - paid);

      if (newUdhar <= 0) {
        // Fully paid - MARK AS PAID, don't delete
        customer.totalUdhar = 0;
        customer.isPaid = true;
        customer.paidAmount = customer.totalBusiness;
        customer.paidAt = new Date();
        await customer.save();
        
        if (customer.saleId) {
          await Sale.findOneAndUpdate(
            { _id: customer.saleId, userId },
            { $set: { paidAmount: customer.totalBusiness, pendingAmount: 0, status: "paid", paymentType: "cash", isCredit: false } }
          );
        }
        
        return NextResponse.json({ success: true, paid: true, customer, extraCash: Math.abs(newUdhar) });
      } else {
        // Partial wusool
        customer.totalUdhar = newUdhar;
        await customer.save();

        if (customer.saleId) {
          await Sale.findOneAndUpdate(
            { _id: customer.saleId, userId },
            { $inc: { paidAmount: paid, pendingAmount: -paid }, $set: { status: "partial" } }
          );
        }

        return NextResponse.json({ success: true, customer });
      }
    }

    // FALLBACK for legacy data
    const legacyCustomer = await Customer.findOne({ name: customerName, userId, isPaid: false });
    if (!legacyCustomer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const newTotal = Math.round(legacyCustomer.totalUdhar - paid);
    if (newTotal <= 0) {
      legacyCustomer.totalUdhar = 0;
      legacyCustomer.isPaid = true;
      legacyCustomer.paidAmount = legacyCustomer.totalBusiness;
      legacyCustomer.paidAt = new Date();
      await legacyCustomer.save();
      return NextResponse.json({ success: true, paid: true, customer: legacyCustomer });
    }
    
    legacyCustomer.totalUdhar = newTotal;
    await legacyCustomer.save();
    return NextResponse.json({ success: true, customer: legacyCustomer });
  } catch (e) {
    console.error("POST /api/khata/wusool error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}