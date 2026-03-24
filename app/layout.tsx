import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TSE Connect — The TSE Alumni Network",
  description:
    "230+ TSE alumni across engineering, product, design, and quant. 80% have worked at top-tier companies. One network.",
  openGraph: {
    title: "TSE Connect — The TSE Alumni Network",
    description:
      "230+ TSE alumni across engineering, product, design, and quant. 80% have worked at top-tier companies. One network.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-body">
        {children}
      </body>
    </html>
  );
}
