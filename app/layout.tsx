import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mekiki — crypto signal digest",
  description:
    "The most interesting crypto tokens in the last 24h — abnormal volume, price moves, and news, ranked in one glance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
