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
  title: "🌾 Sona Fertilizer Shop - Sales & Stock",
  description: "Fertilizer shop management - Sales Point, Products, Stock alerts, Reports. Fast mobile billing for agri shop. Offline-ready PWA.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sona Shop",
  },
  icons: {
    icon: [
      { url: "/icon-circle-180.png", sizes: "180x180", type: "image/png" },
      { url: "/icon-circle-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-circle-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#16a34a",
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