import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ToastViewport } from "@/components/ui/Toast";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "UPnRise",
  description:
    "AI-powered corporate learning & sales-enablement platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning on <html> and <body> is recommended by Next.js
    // for cases where browser extensions (password managers, Grammarly, etc.)
    // inject attributes between SSR and hydration. It does NOT mask real React
    // bugs — only attribute mismatches on these two specific elements.
    <html
      lang="en"
      className={`${dmSans.variable} ${dmSerif.variable} ${jetbrains.variable} h-full`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-bg text-ink"
        suppressHydrationWarning
      >
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
