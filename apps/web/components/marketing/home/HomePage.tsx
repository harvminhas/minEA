import Link from "next/link";
import { BuboMapMark } from "@/components/brand/BuboMapLogo";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { LegacyPricing } from "@/components/marketing/LegacyPricing";
import { billingUiEnabled } from "@/lib/billing/flags";
import { AskTrigger } from "./AskTrigger";
import { footerLinks } from "./footer-links";
import { HeroAsk } from "./HeroAsk";
import { HomeNav } from "./HomeNav";
import { Icon } from "./icons";
import { SetupSteps } from "./SetupSteps";
import { BandPrimaryCta, HeroCtas } from "./visitor";
import type { AnswerKey } from "./ask-demo-data";

/*
 * Without JavaScript (or before hydration with reduced motion) the hero answer is
 * shown straight away instead of waiting for its animation.
 */
const STATIC_ANSWER_CSS =
  ".bm-home .anim .rv,.bm-home .anim .rvr{opacity:1;transform:none;visibility:visible}.bm-home .ans-body[data-phase=intro] .think{display:none}";

const AUDIENCES: Array<{
  label: string;
  color: string;
  accent: string;
  title: string;
  body: React.ReactNode;
  question: AnswerKey;
  tryLabel: string;
}> = [
  {
    label: "For IT leaders",
    color: "#fb923c",
    accent: "#f97316",
    title: "Answer the CFO in a sentence",
    body: (
      <>
        Renewals, spend and risk, <strong>answered with sources</strong> and saved as a report. Not a spreadsheet
        rebuilt every quarter.
      </>
    ),
    question: "spend",
    tryLabel: "Try “Where is our money going?” →",
  },
  {
    label: "For architects",
    color: "#a78bfa",
    accent: "#8b5cf6",
    title: "A model that stays current",
    body: (
      <>
        Apps, platforms, servers and AI agents as <strong>connected records</strong>, not shapes on a slide. Every
        answer shows the gaps, so the model fills in as people use it.
      </>
    ),
    question: "owners",
    tryLabel: "Try “What has no owner?” →",
  },
  {
    label: "For IT professionals",
    color: "#34d399",
    accent: "#10b981",
    title: "Know what you're touching first",
    body: (
      <>
        Who owns it, what depends on it, what breaks if it goes down. <strong>Ask before the change window</strong>,
        not after the outage.
      </>
    ),
    question: "salesforce",
    tryLabel: "Try “What breaks if Salesforce goes down?” →",
  },
];

function HeroCopy({ billingUi }: { billingUi: boolean }) {
  return (
    <>
      <ul className="zeros" aria-label="What you don't need">
        {["Zero TOGAF", "Zero consultants", "Zero Visio"].map((z) => (
          <li key={z}>
            <Icon name="check" />
            {z}
          </li>
        ))}
      </ul>
      <h1 className="bm-h1">
        Ask your IT estate <span className="grad">anything.</span>
      </h1>
      <p className="lede">
        Map your apps, vendors and AI from the tools you already use. Then ask anything and get{" "}
        <strong>answers with sources you can check.</strong>
      </p>
      <HeroCtas />
      <p className="fine">
        {billingUi ? "Start free — no credit card required." : "Free for individuals — no credit card required."}
      </p>
    </>
  );
}

function ReportsSection() {
  return (
    <section className="s" id="reports">
      <div className="wrap">
        <div className="center">
          <p className="eyebrow">Reports &amp; AI landscape</p>
          <h2 className="bm-h2">
            The answers you need every month, <span className="grad">already built.</span>
          </h2>
          <p className="sub">
            Reports come from the same records Ask uses, so they stay current as your team fills gaps.
          </p>
        </div>
        <div className="duo">
          <article className="big">
            <p className="eyebrow">Reports</p>
            <h3>Renewals, spend, owners and aging servers on one screen.</h3>
            <p className="d">
              Know what renews before the notice date, where the money goes, and what nobody owns. Save any Ask
              answer as a report of its own.
            </p>
            <div className="mini" role="group" aria-label="Popular reports, sample workspace">
              <div className="rh">
                <b>Popular reports</b>
                <a href="#reports">All reports →</a>
              </div>
              <div className="rtiles">
                <AskTrigger as="a" href="#try" question="renewals" className="rtile">
                  <div className="k">Renewals next 90 days</div>
                  <div className="v">$193,800</div>
                  <div className="dd">4 contracts · first notice Oct 19</div>
                </AskTrigger>
                <AskTrigger as="a" href="#try" question="spend" className="rtile">
                  <div className="k">Spend by vendor &amp; category</div>
                  <div className="v">$612K / yr</div>
                  <div className="dd">18 vendors</div>
                </AskTrigger>
                <AskTrigger as="a" href="#try" question="owners" className="rtile">
                  <div className="k">Ownership gaps</div>
                  <div className="v">6</div>
                  <div className="dd">2 critical</div>
                </AskTrigger>
                <a className="rtile" href="#reports">
                  <div className="k">Aging infrastructure</div>
                  <div className="v alert">3</div>
                  <div className="dd">out of support</div>
                </a>
              </div>
              <div className="health">
                <div className="grow">
                  <b>Model health: 82% complete, 14 fields missing</b>
                  <small>Answers get better as you fill gaps.</small>
                  <div className="hbar">
                    <i />
                  </div>
                </div>
                <span className="fillbtn">Fill missing →</span>
              </div>
            </div>
          </article>
          <article className="big">
            <p className="eyebrow">AI landscape</p>
            <h3>Know where AI is touching your business.</h3>
            <p className="d">
              Copilot, Agentforce and the agents your team built. See what each one can see, what it can change, and
              who owns it.
            </p>
            <div className="mini" role="group" aria-label="AI landscape, sample workspace">
              <div className="aicard">
                <span className="l">
                  <Icon name="spark" />
                  AI in 5 places · 2 agents running <span className="pill sev-high">4 high flags</span>
                </span>
                <Icon name="chev" className="chev" />
              </div>
              <ul className="ailist">
                <li>
                  <span className="aiico agent">
                    <Icon name="bot" />
                  </span>
                  <div>
                    <div className="t1">
                      <b>Sales Assistant</b>
                      <small>Agent · Copilot Studio · Live</small>
                    </div>
                    <div className="flags">
                      <span className="pill sev-high">Agent has no owner</span>
                      <span className="pill sev-high">Can see customer data</span>
                    </div>
                  </div>
                </li>
                <li>
                  <span className="aiico">
                    <Icon name="spark" />
                  </span>
                  <div>
                    <div className="t1">
                      <b>Microsoft 365 Copilot</b>
                      <small>in Microsoft 365 · 150 seats</small>
                    </div>
                    <div className="flags">
                      <span className="pill sev-high">Can see customer data</span>
                    </div>
                  </div>
                </li>
                <li>
                  <span className="aiico agent">
                    <Icon name="bot" />
                  </span>
                  <div>
                    <div className="t1">
                      <b>Invoice Reader</b>
                      <small>Agent · Power Automate · Live</small>
                    </div>
                    <div className="flags">
                      <span className="pill sev-check">Uses a person&apos;s account</span>
                      <span className="pill sev-check">Can change data</span>
                    </div>
                  </div>
                </li>
                <li>
                  <span className="aiico">
                    <Icon name="spark" />
                  </span>
                  <div>
                    <div className="t1">
                      <b>Zendesk AI agents</b>
                      <small>in Zendesk · Piloting</small>
                    </div>
                    <div className="flags">
                      <span className="pill sev-check">Vendor may train on your data</span>
                    </div>
                  </div>
                </li>
              </ul>
              <AskTrigger as="a" href="#try" question="ai" className="mlink">
                Ask: Which AI can see customer data? →
              </AskTrigger>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

/** The public marketing home page (bubomap.com). Static apart from the client-side demos. */
export function HomePage() {
  const billingUi = billingUiEnabled();
  const year = new Date().getFullYear();
  return (
    <div className="bm-home">
      <noscript dangerouslySetInnerHTML={{ __html: `<style>${STATIC_ANSWER_CSS}</style>` }} />
      <HomeNav />

      <main id="top">
        <section className="hero">
          <HeroAsk copy={<HeroCopy billingUi={billingUi} />} />
          <div className="wrap">
            <ul className="proof">
              {[
                "Every answer cites its records. Click one to check it.",
                "Missing data shows as a gap, not a guess.",
                "Save any answer as a report.",
              ].map((p) => (
                <li key={p}>
                  <span className="dot">
                    <Icon name="check" />
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="s" id="setup">
          <div className="wrap">
            <div className="center">
              <p className="eyebrow">First run</p>
              <h2 className="bm-h2">
                Your map, <span className="grad">without a <span className="nowrap">six-month</span> project.</span>
              </h2>
              <p className="sub">
                Type the tools you already use. BuboMap fills in vendors, categories and typical costs, then shows you
                what depends on what.
              </p>
              <ul className="zeros2">
                {["No consultants", "No TOGAF", "No blank canvas"].map((x) => (
                  <li key={x}>
                    <Icon name="x" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <SetupSteps />
          </div>
        </section>

        <ReportsSection />

        <section className="s" id="who">
          <div className="wrap">
            <div className="center">
              <p className="eyebrow">Who it&apos;s for</p>
              <h2 className="bm-h2">One map. Three kinds of question.</h2>
            </div>
            <div className="aud">
              {AUDIENCES.map((c) => (
                <article key={c.label} className="acard">
                  <p className="al" style={{ color: c.color }}>
                    {c.label}
                  </p>
                  <div className="ac" style={{ background: c.accent }} />
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                  <AskTrigger question={c.question} className="tryq">
                    {c.tryLabel}
                  </AskTrigger>
                </article>
              ))}
            </div>

            <div className="band">
              <div className="band-in">
                <div>
                  <h2 className="bm-h2">Priced for teams without EA departments.</h2>
                  <p>
                    LeanIX and Ardoq price out most SMB teams before they start. BuboMap gives you the same source of
                    truth without the six-figure contract or the months of rollout.
                  </p>
                </div>
                <div className="ctas">
                  <BandPrimaryCta />
                  <a className="btn btn-ghost btn-sm" href="#pricing">
                    See pricing
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing: unchanged behaviour. Flag on shows the plan cards, flag off today's live copy. */}
        <div className="pricing-slot flex flex-col items-center px-4 text-center sm:px-8">
          {billingUi ? <PricingPlans /> : <LegacyPricing />}
        </div>
      </main>

      <footer>
        <div className="wrap">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <BuboMapMark size={22} />
            </span>
            BuboMap<span className="say">BOO-bo MAP</span>
          </span>
          <nav aria-label="Footer">
            {footerLinks().map((l) => (
              <Link key={l.label} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
          <span>© {year} BuboMap</span>
        </div>
      </footer>
    </div>
  );
}
