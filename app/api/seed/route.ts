import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import User from "@/models/User";
import mongoose from "mongoose";

const PRODUCTS_100 = [
  // 25 BAG
  { name: "Sona DAP 50kg", price: 12500, unit: "bag", stock: 100 },
  { name: "Engro Urea 50kg", price: 3800, unit: "bag", stock: 150 },
  { name: "Sona Urea 50kg", price: 3750, unit: "bag", stock: 120 },
  { name: "Engro Zarkhez Plus", price: 6800, unit: "bag", stock: 80 },
  { name: "SOP Potash 50kg", price: 13500, unit: "bag", stock: 60 },
  { name: "MOP Potash 50kg", price: 8500, unit: "bag", stock: 70 },
  { name: "SSP 50kg", price: 3200, unit: "bag", stock: 100 },
  { name: "CAN Gawara 50kg", price: 4200, unit: "bag", stock: 110 },
  { name: "Nitrophos NP 50kg", price: 6200, unit: "bag", stock: 90 },
  { name: "DAP Tara 50kg", price: 12400, unit: "bag", stock: 75 },
  { name: "Wheat Seed Akbar 19 50kg", price: 5500, unit: "bag", stock: 100 },
  { name: "Wheat Seed Dilkash 50kg", price: 5400, unit: "bag", stock: 90 },
  { name: "Maize Hybrid 30T60 10kg", price: 7200, unit: "bag", stock: 70 },
  { name: "Cotton Seed BS-15 10kg", price: 4800, unit: "bag", stock: 80 },
  { name: "Rice Super Basmati 40kg", price: 6200, unit: "bag", stock: 65 },
  { name: "Potato Seed Diamant 50kg", price: 4500, unit: "bag", stock: 80 },
  { name: "Vermicompost 40kg", price: 2200, unit: "bag", stock: 90 },
  { name: "Gypsum 50kg", price: 800, unit: "bag", stock: 120 },
  { name: "MAP Fertilizer 25kg", price: 11500, unit: "bag", stock: 35 },
  { name: "Calcium Nitrate 25kg", price: 5200, unit: "bag", stock: 50 },
  { name: "Berseem Seed 10kg", price: 2500, unit: "bag", stock: 90 },
  { name: "Moong Seed 20kg", price: 4200, unit: "bag", stock: 70 },
  { name: "Mulching Sheet Roll", price: 4200, unit: "bag", stock: 40 },
  { name: "Spray Machine 20L Manual", price: 3500, unit: "bag", stock: 50 },
  { name: "Cow Dung Compost 50kg", price: 1200, unit: "bag", stock: 100 },
  // 25 LITER
  { name: "Roundup Glyphosate 1L", price: 950, unit: "liter", stock: 100 },
  { name: "Lambda Cyhalothrin 1L", price: 1250, unit: "liter", stock: 100 },
  { name: "Bifenthrin 10EC 1L", price: 1100, unit: "liter", stock: 90 },
  { name: "Atrazine Herbicide 1L", price: 1350, unit: "liter", stock: 70 },
  { name: "Pendimethalin 1L", price: 1150, unit: "liter", stock: 85 },
  { name: "Propiconazole 1L", price: 1800, unit: "liter", stock: 60 },
  { name: "Amino Acid Foliar 1L", price: 1200, unit: "liter", stock: 100 },
  { name: "Potash Foliar 1L", price: 950, unit: "liter", stock: 120 },
  { name: "Seaweed Extract 1L", price: 1850, unit: "liter", stock: 70 },
  { name: "Boron Foliar 1L", price: 850, unit: "liter", stock: 80 },
  { name: "Zinc Foliar 1L", price: 750, unit: "liter", stock: 100 },
  { name: "Humic Acid Liquid 1L", price: 1100, unit: "liter", stock: 100 },
  { name: "Imidacloprid 1L", price: 1450, unit: "liter", stock: 80 },
  { name: "Clodinofop 1L", price: 1850, unit: "liter", stock: 65 },
  { name: "Bromoxynil + MCPA 1L", price: 1650, unit: "liter", stock: 75 },
  { name: "Chlorpyrifos 1L", price: 1250, unit: "liter", stock: 90 },
  { name: "Fipronil 5SC 1L", price: 1950, unit: "liter", stock: 60 },
  { name: "Thiamethoxam 1L", price: 1650, unit: "liter", stock: 70 },
  { name: "Super Gro Foliar 1L", price: 1250, unit: "liter", stock: 110 },
  { name: "Liquid NPK 1L", price: 1350, unit: "liter", stock: 90 },
  { name: "DAP Liquid 1L", price: 950, unit: "liter", stock: 100 },
  { name: "Urea Liquid 1L", price: 850, unit: "liter", stock: 110 },
  { name: "Neem Oil 1L", price: 1250, unit: "liter", stock: 80 },
  { name: "Bio Pesticide 1L", price: 1450, unit: "liter", stock: 60 },
  { name: "Weedicide Dual Gold 1L", price: 2100, unit: "liter", stock: 55 },
  // 25 KG
  { name: "Zinc Sulphate 33% 1kg", price: 350, unit: "kg", stock: 200 },
  { name: "Mancozeb 75WP 1kg", price: 950, unit: "kg", stock: 110 },
  { name: "Sulfur 80WP 1kg", price: 750, unit: "kg", stock: 100 },
  { name: "NPK 20-20-20 1kg", price: 1350, unit: "kg", stock: 90 },
  { name: "Humic Acid Powder 1kg", price: 1100, unit: "kg", stock: 100 },
  { name: "Borax 1kg", price: 450, unit: "kg", stock: 150 },
  { name: "Acetamiprid 20SP 1kg", price: 1200, unit: "kg", stock: 100 },
  { name: "Nitenpyram 1kg", price: 2200, unit: "kg", stock: 50 },
  { name: "Cartap Hydrochloride 1kg", price: 1650, unit: "kg", stock: 60 },
  { name: "Ferrous Sulphate 1kg", price: 280, unit: "kg", stock: 120 },
  { name: "Manganese Sulphate 1kg", price: 320, unit: "kg", stock: 100 },
  { name: "Copper Sulphate 1kg", price: 550, unit: "kg", stock: 90 },
  { name: "Tomato Rio Grande 1kg", price: 4500, unit: "kg", stock: 80 },
  { name: "Chilli Gola 1kg", price: 5200, unit: "kg", stock: 70 },
  { name: "Onion Phulkara 1kg", price: 2200, unit: "kg", stock: 100 },
  { name: "Okra Bhindi 1kg", price: 950, unit: "kg", stock: 120 },
  { name: "Trichoderma 1kg", price: 950, unit: "kg", stock: 80 },
  { name: "Mustard Raya 1kg", price: 450, unit: "kg", stock: 100 },
  { name: "Sunflower Hysun 1kg", price: 1600, unit: "kg", stock: 60 },
  { name: "Cucumber Seed 1kg", price: 3200, unit: "kg", stock: 50 },
  { name: "Carrot Seed 1kg", price: 1800, unit: "kg", stock: 90 },
  { name: "Spinach Seed 1kg", price: 850, unit: "kg", stock: 110 },
  { name: "Coriander Seed 1kg", price: 650, unit: "kg", stock: 100 },
  { name: "Fenugreek Seed 1kg", price: 750, unit: "kg", stock: 100 },
  { name: "Pea Seed 1kg", price: 850, unit: "kg", stock: 80 },
  // 25 ML
  { name: "Emamectin Benzoate 400ml", price: 1450, unit: "ml", stock: 80 },
  { name: "Imidacloprid 250ml", price: 650, unit: "ml", stock: 120 },
  { name: "Abamectin 250ml", price: 750, unit: "ml", stock: 90 },
  { name: "Thiamethoxam 100ml", price: 450, unit: "ml", stock: 150 },
  { name: "Bifenthrin 250ml", price: 550, unit: "ml", stock: 100 },
  { name: "Lambda 250ml", price: 580, unit: "ml", stock: 110 },
  { name: "Acetamiprid 250ml", price: 480, unit: "ml", stock: 100 },
  { name: "Chlorfenapyr 100ml", price: 850, unit: "ml", stock: 60 },
  { name: "Lufenuron 250ml", price: 1250, unit: "ml", stock: 70 },
  { name: "Pyriproxyfen 250ml", price: 950, unit: "ml", stock: 80 },
  { name: "Clodinofop 320ml", price: 1250, unit: "ml", stock: 65 },
  { name: "Bromoxynil 500ml", price: 980, unit: "ml", stock: 75 },
  { name: "Amino Acid 500ml", price: 650, unit: "ml", stock: 110 },
  { name: "Super Gro 500ml", price: 650, unit: "ml", stock: 110 },
  { name: "Boron Foliar 500ml", price: 450, unit: "ml", stock: 100 },
  { name: "Zinc Foliar 250ml", price: 350, unit: "ml", stock: 120 },
  { name: "Potash Foliar 500ml", price: 550, unit: "ml", stock: 90 },
  { name: "Seaweed 250ml", price: 850, unit: "ml", stock: 80 },
  { name: "Gibberellic Acid 50ml", price: 1250, unit: "ml", stock: 60 },
  { name: "Humic Acid 250ml", price: 450, unit: "ml", stock: 100 },
  { name: "Neem Oil 250ml", price: 450, unit: "ml", stock: 100 },
  { name: "Trichoderma Liquid 250ml", price: 350, unit: "ml", stock: 90 },
  { name: "Root Hormone 100ml", price: 650, unit: "ml", stock: 80 },
  { name: "Flower Booster 250ml", price: 550, unit: "ml", stock: 100 },
  { name: "Fruit Fly Lure 100ml", price: 350, unit: "ml", stock: 150 },
];

export async function POST() {
  try {
    await dbConnect();
    const user = await User.findOne();
    const userId = user?._id?? new mongoose.Types.ObjectId();

    await Product.deleteMany({});

    const productsWithUser = PRODUCTS_100.map((p) => ({
     ...p,
      userId,
    }));

    const inserted = await Product.insertMany(productsWithUser);
    return NextResponse.json({ success: true, count: inserted.length });
  } catch (error) {
    const message = error instanceof Error? error.message : "Unknown error";
    console.error("SEED ERROR:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}