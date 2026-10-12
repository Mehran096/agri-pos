import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SWRegister from "./sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // FIX: Use object with absolute to stop "Sona - Al-Farooq" merging
  title: {
    default: "Al-Farooq Zarghi Shop - الفاروق زرعی سٹور | Sales & Stock",
    template: "%s | Al-Farooq Zarghi Shop",
  },
  description:
    "Al-Farooq Zarghi Adwiyat & Beej Store - Seeds, Pesticides, Fertilizers. Fast billing, Stock alerts, Buy/Sell/Profit reports. 0321-9801598, 0345-9495414. Offline-ready PWA.",
  applicationName: "Al-Farooq Zarghi Shop",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Al-Farooq",
  },
  // FIX: Added 32x32 + 16x16 for browser tab - this removes S logo
  icons: {
    icon: [
      { url: "/logo.png", sizes: "32x32", type: "image/png" },
      { url: "/logo.png", sizes: "16x16", type: "image/png" },
      { url: "/logo.png", sizes: "192x192", type: "image/png" },
      { url: "/logo.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/logo.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/logo.png"],
  },
  openGraph: {
    title: "Al-Farooq Zarghi Shop - الفاروق زرعی سٹور",
    description: "Agricultural Seeds & Pesticides - Shewa Swabi",
    type: "website",
    images: ["/logo.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#166534",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <SWRegister />
        {children}
      </body>
    </html>
  );
}