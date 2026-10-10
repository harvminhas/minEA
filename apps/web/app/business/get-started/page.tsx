import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";
import { BusinessGetStartedForm } from "@/components/billing/BusinessGetStartedForm";
import { BUSINESS_DETAILS } from "@/lib/billing/plans";

interface Props {
  searchParams: Promise<{ org?: string; from?: string }>;
}

/** Business plan "Get started". Public: works signed out; in-app upgrade prompts link here. */
export default async function BusinessGetStartedPage({ searchParams }: Props) {
  const params = await searchParams;
  const org = params.org?.trim() || null;
  const from = params.from?.trim() || null;

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <Link href="/" className="hover:opacity-90 transition-opacity">
          <BuboMapWordmark size="md" beta theme="dark" />
        </Link>
        <Link href="/#pricing" className="text-sm text-white/70 hover:text-white transition-colors">
          Pricing
        </Link>
      </header>
      <main className="flex-1 px-8 py-12">
        <div className="max-w-xl mx-auto">
          <Link
            href={org ? `/orgs/${encodeURIComponent(org)}/settings` : "/"}
            className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors mb-8"
          >
            <ArrowLeft size={14} />
            Back
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mb-3">Get started with Business</h1>
          <ul className="mb-8 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {BUSINESS_DETAILS.map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-white/60">
                <Check size={15} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                {line}
              </li>
            ))}
          </ul>
          <div className="rounded-2xl border border-white/8 bg-white/5 p-6 sm:p-8">
            <BusinessGetStartedForm theme="dark" orgSlug={org} source={from ?? "page"} />
          </div>
        </div>
      </main>
    </div>
  );
}
