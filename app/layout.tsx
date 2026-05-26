import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resource Hubz Forum",
  description: "An anonymous community forum for sharing resources and support.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
