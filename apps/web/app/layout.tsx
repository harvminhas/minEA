import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BuboMap — See your IT landscape clearly",
  description:
    "BuboMap (BOO-bo MAP) maps your organisation's capabilities, systems, data, and investments into one living model.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} app-boot-pending`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
