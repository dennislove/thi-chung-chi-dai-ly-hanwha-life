import type { Metadata, Viewport } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luyện Thi Chứng Chỉ Bảo Hiểm Nhân Thọ Cơ Bản | Hanwha Life Việt Nam",
  description: "Hệ thống ôn luyện thi thử trực tuyến chứng chỉ bảo hiểm nhân thọ cơ bản dành riêng cho đại lý Hanwha Life Việt Nam. Hỗ trợ chạy offline.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ff6600",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${inter.variable} ${outfit.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/logo.svg" />
      </head>
      <body>
        <div className="app-bg-decor" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
