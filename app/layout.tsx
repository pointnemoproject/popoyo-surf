import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ryan's Surf Report",
  description: "16-day surf forecast for Ryan's Popoyo setup."
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
