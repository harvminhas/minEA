import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";
import { footerLinks } from "@/components/marketing/home/footer-links";

export const LEGAL_LAST_UPDATED = "October 10, 2026";
export const LEGAL_CONTACT_EMAIL = "architect@bubomap.com";

/** Shared shell for /privacy and /terms, styled like the other marketing pages (e.g. /contact). */
export function LegalPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <Link href="/" className="hover:opacity-90 transition-opacity">
          <BuboMapWordmark size="md" beta theme="dark" />
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/#pricing" className="text-sm text-white/70 hover:text-white transition-colors">
            Pricing
          </Link>
          <Link href="/auth/sign-in" className="text-sm text-white/70 hover:text-white transition-colors">
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 px-8 py-12">
        <article className="legal max-w-3xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors mb-8"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{title}</h1>
          <p className="text-sm text-white/45 mb-8" data-testid="legal-last-updated">
            Last updated: {LEGAL_LAST_UPDATED}
          </p>
          {intro && <div className="mb-8 text-white/70 leading-relaxed">{intro}</div>}
          <div className="space-y-8 text-[15px] leading-relaxed text-white/70 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-white/90 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_a]:text-indigo-300 [&_a:hover]:underline [&_strong]:text-white/90">
            {children}
          </div>
        </article>
      </main>

      <footer className="border-t border-white/10 px-8 py-6 text-sm text-white/45">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>© {new Date().getFullYear()} BuboMap</span>
          <nav aria-label="Footer" className="flex gap-5">
            {footerLinks().map((l) => (
              <Link key={l.label} href={l.href} className="hover:text-white">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function Mail() {
  return <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;
}
