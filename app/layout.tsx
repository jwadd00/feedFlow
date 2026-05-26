import type { Metadata } from "next";
import "./globals.css";
import { AppNav } from "@/components/ui";

export const metadata: Metadata = {
  title: "FeedFlow Operations Hub",
  description: "Feed inventory, forecasting, load planning, and data quality operations."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
