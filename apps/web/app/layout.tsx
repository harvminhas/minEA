import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "BuboMap | The IT estate your whole team can finally see",
    template: "%s | BuboMap",
  },
  description:
    "BuboMap provides a single connected source of truth for IT leaders, architects, and engineers. Gain visibility into portfolio health, manage dependencies, and surface tech debt without the baggage of heavyweight EA tooling.",
  keywords: [
    "IT estate visibility",
    "enterprise architecture software",
    "IT portfolio management",
    "dependency mapping",
    "capability gaps",
    "LeanIX alternative",
    "Ardoq alternative",
    "tech debt management",
    "SMB enterprise architecture",
  ],
  openGraph: {
    siteName: "BuboMap",
    type: "website",
    title: "BuboMap | The IT estate your whole team can finally see",
    description:
      "Leaders need visibility. Architects need a model they can maintain. Engineers need context on what they're touching. BuboMap gives all three a single connected source of truth.",
  },
  twitter: {
    card: "summary_large_image",
    title: "BuboMap | The IT estate your whole team can finally see",
    description:
      "A single connected source of truth for IT leaders, architects, and engineers — without heavyweight EA tooling or framework baggage.",
  },
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
