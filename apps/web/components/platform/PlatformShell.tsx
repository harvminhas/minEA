"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Users } from "lucide-react";
import { toolCatalogApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export const PLATFORM_TABS = [
  { href: "/platform/users", label: "Users", icon: Users },
  { href: "/platform/catalog", label: "Catalog", icon: BookOpen },
] as const;

/** /platform: superuser area. The API checks the superuser on every call; this only hides the UI. */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { getToken, user } = useAuth();
  const me = useQuery({
    queryKey: ["platform-me", user?.email ?? ""],
    retry: false,
    queryFn: async () => {
      const token = await getToken();
      return token ? toolCatalogApi.me(token) : { platformAdmin: false };
    },
  });
  if (me.isLoading) return <main className="p-8 text-[14px] text-[#6b7289]">Loading…</main>;
  if (!me.data?.platformAdmin) {
    return (
      <main className="mx-auto max-w-3xl p-8" data-testid="platform-forbidden">
        <h1 className="text-[22px] font-semibold text-[#1c2230]">Platform admin</h1>
        <p className="mt-2 text-[14px] text-[#6b7289]">Only BuboMap platform admins can open this area.</p>
        <Link href="/home" className="mt-4 inline-block text-[14px] font-medium text-[#5b4ce6]">Back to BuboMap</Link>
      </main>
    );
  }
  return (
    <div className="flex min-h-screen bg-white" data-testid="platform-shell">
      <aside className="w-[200px] flex-shrink-0 border-r border-[#eef0f4] bg-[#fafafb] p-3">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b90a0]">Platform admin</p>
        <nav className="space-y-0.5">
          {PLATFORM_TABS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]",
                pathname.startsWith(href) ? "bg-[#ece9ff] font-semibold text-[#5b4ce6]" : "text-[#4b5163] hover:bg-[#f3f4f8]",
              )}
            >
              <Icon size={14} /> {label}
            </Link>
          ))}
        </nav>
        <Link href="/home" className="mt-6 block px-2 text-[12px] text-[#8b90a0] hover:text-[#5b4ce6]">← Back to BuboMap</Link>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
