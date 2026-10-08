import type { Metadata } from "next";
import { HomePage } from "@/components/marketing/home/HomePage";
import "@/components/marketing/home/home.css";

const TITLE = "BuboMap | Ask your IT estate anything";
const DESCRIPTION =
  "Map your apps, vendors and AI from the tools you already use. Then ask anything about your IT estate and get answers with sources. A lighter alternative to LeanIX and Ardoq for SMB IT teams.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "ask your IT estate",
    "IT estate visibility",
    "AI answers with sources",
    "application portfolio management",
    "SaaS renewals tracking",
    "IT spend by vendor",
    "system ownership tracking",
    "dependency mapping",
    "AI landscape",
    "LeanIX alternative",
    "Ardoq alternative",
    "SMB enterprise architecture",
    "TOGAF alternative",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    siteName: "BuboMap",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Map your apps, vendors and AI from the tools you already use, then ask anything and get answers with sources you can check.",
  },
};

export default function LandingPage() {
  return <HomePage />;
}
