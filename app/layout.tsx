import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quiet Queue",
  description: "Turn messy tabs into a calm, prioritized reading queue."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
