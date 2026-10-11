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
    const body = (await req.json()) as { 
      customerId?: string; 
      customerName?: string; 
      amount: number;
      note?: string;
    };
    const { customerId, customerName, amount, note } = body;

    if (!amount || (!customerId && !customerName)) {
      return NextResponse.json({ error: "customerId and amount required" }, { status: 400 });
    }

    const userId = new Types.ObjectId(session.user.id);
    const paid = Math.round(Number(amount));
    if (paid <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // WUSOOL BY KHATA ID - GROUPED FIX
    if (customerId && Types.ObjectId.isValid(customerId)) {
      const customer = await Customer.findOne({ _id: customerId, userId });
      if (!customer) {
        return NextResponse.json({ error: "Khata entry not found" }, { status: 404 });
      }

      const newUdhar = Math.round(customer.totalUdhar - paid);

      // Push history entry with exact date/time
      const historyEntry = {
        amount: paid,
        date: new Date(),
        note: note || "",
      };

      if (newUdhar <= 0) {
        // Fully paid - MARK AS PAID
        customer.totalUdhar = 0;
        customer.isPaid = true;
        customer.paidAmount = (customer.paidAmount || 0) + paid + Math.abs(newUdhar > 0 ? 0 : Math.abs(newUdhar));
        // correct paidAmount = totalBusiness
        customer.paidAmount = customer.totalBusiness;
        customer.paidAt = new Date();
        customer.lastWusoolDate = new Date();
        customer.wusoolHistory.push(historyEntry);
        await customer.save();
        
        // Mark all grouped sales as paid
        if (customer.saleIds?.length) {
          await Sale.updateMany(
            { _id: { $in: customer.saleIds }, userId },
            { $set: { paidAmount: 0, pendingAmount: 0, status: "paid", isCredit: false } }
          );
          // set paidAmount per sale to its total
          for (const sId of customer.saleIds) {
            const s = await Sale.findById(sId);
            if (s) {
              await Sale.updateOne({ _id: sId }, { $set: { paidAmount: s.total, pendingAmount: 0 } });
            }
          }
        }
        
        return NextResponse.json({ 
          success: true, 
          paid: true, 
          customer, 
          extraCash: Math.abs(newUdhar),
          wusool: historyEntry
        });
      } else {
        // Partial wusool - your case: 2400 -> 2000
        customer.totalUdhar = newUdhar;
        customer.paidAmount = (customer.paidAmount || 0) + paid;
        customer.lastWusoolDate = new Date();
        customer.wusoolHistory.push(historyEntry);
        await customer.save();

        // Optional: update sales pending proportionally - keep as partial
        if (customer.saleIds?.length) {
          await Sale.updateMany(
            { _id: { $in: customer.saleIds }, userId },
            { $set: { status: "partial" } }
          );
        }

        return NextResponse.json({ 
          success: true, 
          customer,
          wusool: historyEntry,
          message: `Wusool Rs ${paid} on ${historyEntry.date.toLocaleString()}`
        });
      }
    }

    // FALLBACK for legacy data by name
    const normalized = (customerName || "").trim().toLowerCase();
    const legacyCustomer = await Customer.findOne({ normalizedName: normalized, userId, isPaid: false });
    if (!legacyCustomer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const historyEntry = { amount: paid, date: new Date(), note: note || "" };
    const newTotal = Math.round(legacyCustomer.totalUdhar - paid);
    
    if (newTotal <= 0) {
      legacyCustomer.totalUdhar = 0;
      legacyCustomer.isPaid = true;
      legacyCustomer.paidAmount = legacyCustomer.totalBusiness;
      legacyCustomer.paidAt = new Date();
      legacyCustomer.lastWusoolDate = new Date();
      legacyCustomer.wusoolHistory.push(historyEntry);
      await legacyCustomer.save();
      return NextResponse.json({ success: true, paid: true, customer: legacyCustomer, wusool: historyEntry });
    }
    
    legacyCustomer.totalUdhar = newTotal;
    legacyCustomer.paidAmount = (legacyCustomer.paidAmount || 0) + paid;
    legacyCustomer.lastWusoolDate = new Date();
    legacyCustomer.wusoolHistory.push(historyEntry);
    await legacyCustomer.save();
    return NextResponse.json({ success: true, customer: legacyCustomer, wusool: historyEntry });
    
  } catch (e) {
    console.error("POST /api/khata/wusool error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}