import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trading Monitor",
  description: "Multi-market trading monitoring & execution dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}