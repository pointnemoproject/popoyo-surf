import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Popoyo Surf",
  description: "16-day surf forecast for Popoyo, Nicaragua."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
