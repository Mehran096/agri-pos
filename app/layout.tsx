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
  title: "Al-Farooq Zarghi Shop - الفاروق زرعی سٹور | Sales & Stock",
  description: "Al-Farooq Zarghi Adwiyat & Beej Store - Seeds, Pesticides, Fertilizers. Fast billing, Stock alerts, Buy/Sell/Profit reports. 0333-9426374, 0321-9801598, 0345-9495414. Offline-ready PWA.",
  applicationName: "Al-Farooq Zarghi Shop",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Al-Farooq",
  },
  icons: {
    icon: [
      { url: "/logo.png", sizes: "180x180", type: "image/png" },
      { url: "/logo.png", sizes: "192x192", type: "image/png" },
      { url: "/logo.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/logo.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Al-Farooq Zarghi Shop - الفاروق زرعی سٹور",
    description: "Agricultural Seeds & Pesticides - Ismaila Swabi",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#166534",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <SWRegister />
        {children}
      </body>
    </html>
  );
}