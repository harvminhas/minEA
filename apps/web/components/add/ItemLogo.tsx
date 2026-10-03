"use client";

import { hash32 } from "@/lib/hash";

const BRAND_COLORS = [
  "#5b4ce6", // purple (accent)
  "#2563eb", // blue
  "#059669", // green
  "#dc2626", // red
  "#ea580c", // orange
  "#ca8a04", // yellow
];

export function ItemLogo({
  name,
  catalogLogo,
  brandColor,
  size = 40,
}: {
  name: string;
  catalogLogo?: string | null;
  brandColor?: string | null;
  size?: 24 | 40 | 48;
}) {
  if (catalogLogo) {
    return (
      <img
        src={catalogLogo}
        alt={name}
        className="rounded-lg object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const color = brandColor || BRAND_COLORS[Math.abs(hash32(name)) % BRAND_COLORS.length];

  return (
    <div
      className="flex items-center justify-center rounded-lg font-semibold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size === 24 ? "11px" : size === 40 ? "16px" : "20px",
      }}
    >
      {initials}
    </div>
  );
}
