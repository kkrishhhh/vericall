import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "VeriCall — AI Video Loan Origination | Poonawalla Fincorp",
  description:
    "Apply for a loan in under 5 minutes through a live AI-powered video call. Real-time KYC, age verification, and instant pre-approval — powered by Poonawalla Fincorp.",
  keywords: "loan, AI, video call, KYC, Poonawalla Fincorp, VeriCall, digital lending",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
