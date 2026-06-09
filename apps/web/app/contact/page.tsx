import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";
import { ContactForm } from "@/components/marketing/ContactForm";

interface Props {
  searchParams: Promise<{ interest?: string }>;
}

export default async function ContactPage({ searchParams }: Props) {
  const params = await searchParams;
  const defaultInterest = params.interest ?? "business";

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col">
      <header className="flex items-center justify-between px-8 py-5">
        <Link href="/" className="hover:opacity-90 transition-opacity">
          <BuboMapWordmark size="md" beta theme="dark" />
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/#pricing"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/auth/sign-in"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Get started free
          </Link>
        </div>
      </header>

      <main className="flex-1 px-8 py-12">
        <div className="max-w-xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white/80 transition-colors mb-8"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>

          <h1 className="text-3xl font-bold tracking-tight mb-3">Contact us</h1>
          <p className="text-white/55 mb-8 leading-relaxed">
            Interested in Business, guided onboarding, or a walkthrough? Tell us about your team
            and we&apos;ll get back to you shortly.
          </p>

          <div className="rounded-2xl border border-white/8 bg-white/5 p-6 sm:p-8">
            <ContactForm defaultInterest={defaultInterest} />
          </div>

          <div className="mt-8 flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-5 py-4">
            <Mail size={18} className="text-indigo-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-white/80">We typically respond within one business day.</p>
              <p className="text-sm text-white/45 mt-0.5">
                Your message is saved securely — no email app required.
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="px-8 py-6 text-center text-xs text-white/25">
        BuboMap · BOO-bo MAP · bubomap.com
      </footer>
    </div>
  );
}
