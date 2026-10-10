/*
 * Terms of Service. NOTE: drafted without legal review (October 10, 2026). Have a qualified
 * Ontario lawyer review this text before relying on it.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/marketing/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service · BuboMap",
  description: "The terms that govern your use of BuboMap.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These Terms of Service (the &quot;Terms&quot;) are an agreement between you, and the
          organisation you represent (together, &quot;Customer&quot; or &quot;you&quot;), and
          Harvinder Minhas operating as BuboMap, a business registered in Ontario, Canada
          (&quot;BuboMap&quot;, &quot;we&quot;, &quot;us&quot;). They govern your use of the BuboMap
          website and enterprise architecture service (the &quot;Service&quot;). By creating an
          account, signing in or using the Service, you agree to these Terms. If you do not agree,
          do not use the Service. If you accept on behalf of an organisation, you confirm you have
          authority to bind it.
        </p>
      }
    >
      <section>
        <h2>1. Accounts</h2>
        <p>
          You sign in with a Google or Microsoft account. You are responsible for all activity under
          your account and your organisation&apos;s accounts, for keeping your sign-in credentials
          secure, and for the people you invite. Tell us promptly at <Mail /> about any
          unauthorised use. You must be at least the age of majority where you live.
        </p>
      </section>

      <section>
        <h2>2. Plans, fees and billing</h2>
        <ul>
          <li><strong>Free</strong>: no charge, with the limits shown in the app.</li>
          <li><strong>Starter</strong>: US$149 per month, billed monthly in advance by card through Stripe.</li>
          <li>
            <strong>Business</strong>: priced by quote, starting from 5 licences, billed by invoice
            or card, monthly or annually, and including 4 hours of onboarding consulting. Unused
            onboarding hours expire at the end of the first subscription term and have no cash value.
          </li>
        </ul>
        <p>
          All prices are in US dollars and exclude taxes, which you are responsible for. Invoices are
          due within 30 days unless the invoice says otherwise. We may suspend the Service for
          overdue amounts. We may change prices on at least 30 days&apos; notice; changes take
          effect at your next renewal.
        </p>
      </section>

      <section>
        <h2>3. Auto-renewal and cancellation</h2>
        <p>
          <strong>Paid subscriptions renew automatically</strong> for successive periods equal to the
          current term (monthly or annual) and are charged at the then-current price unless
          cancelled before the renewal date. You can cancel at any time in Settings → Plan &amp;
          billing or by emailing <Mail />. Cancellation takes effect at the end of the current
          billing period, and you keep access until then.{" "}
          <strong>
            Fees are non-refundable, and we do not give refunds or credits for partial periods,
            unused licences, downgrades or unused onboarding hours
          </strong>
          , except where required by law.
        </p>
      </section>

      <section>
        <h2>4. Your data</h2>
        <p>
          <strong>You own the data you put into BuboMap (&quot;Customer Data&quot;).</strong> You grant
          us a limited licence to host, copy, process and display Customer Data only as needed to
          provide, secure and support the Service, including sending it to our subprocessors listed
          in our <Link href="/privacy">Privacy Policy</Link>. You are solely responsible for the
          accuracy, quality and legality of Customer Data, for having all rights and consents needed
          to use it with the Service, and for{" "}
          <strong>keeping your own backups and exports of Customer Data</strong>. We do not guarantee
          that Customer Data will not be lost or corrupted. After your account ends we may delete
          Customer Data as described in the Privacy Policy.
        </p>
      </section>

      <section>
        <h2>5. AI features</h2>
        <p>
          The Ask feature and other AI features use third-party models (currently Google Gemini) and
          send relevant workspace data to them. <strong>AI output may be inaccurate, incomplete or
          out of date, and is not guaranteed.</strong> It is not professional advice of any kind,
          including legal, financial, security, compliance, procurement or technical advice. You are
          responsible for reviewing AI output and for any decisions you make based on it.
        </p>
      </section>

      <section>
        <h2>6. Acceptable use</h2>
        <p>You will not, and will not let anyone else:</p>
        <ul>
          <li>break any law or infringe anyone&apos;s rights, including privacy and intellectual property rights;</li>
          <li>upload malware or content that is unlawful, harmful, harassing or deceptive;</li>
          <li>upload payment card data, government identifiers, health information or other sensitive personal information;</li>
          <li>probe, scan, attack or disrupt the Service, or bypass its security, limits or plan restrictions;</li>
          <li>reverse engineer, copy, resell or sublicense the Service, or use it to build a competing product;</li>
          <li>scrape the Service or access it by automated means other than features we provide;</li>
          <li>share accounts, or let more people edit than your plan&apos;s licences allow.</li>
        </ul>
      </section>

      <section>
        <h2>7. Our intellectual property</h2>
        <p>
          BuboMap and its software, design, templates and content (other than Customer Data) belong
          to us and our licensors. We grant you a limited, non-exclusive, non-transferable,
          revocable right to use the Service during your subscription under these Terms. If you send
          us feedback, we may use it freely without obligation to you.
        </p>
      </section>

      <section>
        <h2>8. Suspension and termination</h2>
        <p>
          We may suspend or terminate your access, with or without notice, if you breach these
          Terms, fail to pay, create a security or legal risk, or if required by law. We may also
          discontinue the Service or any feature, and will give reasonable notice where practical.
          You may stop using the Service at any time. On termination your right to use the Service
          ends immediately (or at the end of the paid period on cancellation), and fees already paid
          are not refunded. Sections 3, 4, 5, 7 and 9 to 14 survive termination.
        </p>
      </section>

      <section>
        <h2>9. Disclaimer of warranties</h2>
        <p className="uppercase text-white/75">
          The Service, including all AI output, is provided &quot;as is&quot; and &quot;as
          available&quot;, with all faults and without warranties of any kind. To the maximum extent
          permitted by law, BuboMap disclaims all warranties, conditions and representations,
          express, implied or statutory, including any implied warranties or conditions of
          merchantability, merchantable quality, fitness for a particular purpose, title,
          non-infringement, accuracy and those arising from course of dealing or usage of trade. We
          do not warrant that the Service will be uninterrupted, timely, secure or error-free, that
          defects will be corrected, or that any data will be preserved or not lost.
        </p>
      </section>

      <section>
        <h2>10. Limitation of liability</h2>
        <p className="uppercase text-white/75">
          To the maximum extent permitted by law, in no event will BuboMap, its owner, employees,
          contractors or suppliers be liable for any indirect, incidental, special, consequential,
          exemplary or punitive damages, or for any loss of profits, revenue, business, goodwill or
          anticipated savings, or any loss, corruption or unavailability of data, or the cost of
          substitute services, however caused and under any theory of liability (contract, tort
          including negligence, strict liability or otherwise), even if advised of the possibility
          of such damages.
        </p>
        <p className="uppercase text-white/75">
          To the maximum extent permitted by law, BuboMap&apos;s total aggregate liability arising out
          of or relating to these Terms or the Service will not exceed the fees you actually paid to
          BuboMap for the Service in the twelve (12) months before the event giving rise to the
          claim, or one hundred US dollars (US$100) if you paid nothing.
        </p>
        <p>
          These limits apply even if a remedy fails of its essential purpose. Some jurisdictions do
          not allow certain exclusions, so some of them may not apply to you.
        </p>
      </section>

      <section>
        <h2>11. Indemnity</h2>
        <p>
          You will defend, indemnify and hold harmless BuboMap, its owner, employees and contractors
          from and against any claims, losses, damages, liabilities, fines, costs and expenses
          (including reasonable legal fees) arising out of or relating to Customer Data, your or
          your users&apos; use of the Service, your breach of these Terms, or your violation of any
          law or third-party right.
        </p>
      </section>

      <section>
        <h2>12. Changes to these Terms</h2>
        <p>
          We may change these Terms from time to time. We will post the updated Terms here with a new
          &quot;Last updated&quot; date and, for material changes, notify account owners by email or
          in the app at least 15 days before they take effect. Continuing to use the Service after
          changes take effect means you accept them. If you do not agree, cancel before they take
          effect.
        </p>
      </section>

      <section>
        <h2>13. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of the Province of Ontario and the federal laws of
          Canada applicable therein, without regard to conflict-of-law rules. The United Nations
          Convention on Contracts for the International Sale of Goods does not apply. The courts
          located in Ontario have exclusive jurisdiction over any dispute, and you consent to their
          jurisdiction.
        </p>
      </section>

      <section>
        <h2>14. General</h2>
        <p>
          These Terms, together with the Privacy Policy and any order form or quote we agree in
          writing, are the entire agreement between us about the Service. If a provision is
          unenforceable, it will be enforced to the maximum extent permitted and the rest stays in
          effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms
          without our consent; we may assign them in connection with a sale or reorganisation of our
          business. Neither party is liable for delays caused by events beyond its reasonable
          control. Notices to us must be sent to <Mail />.
        </p>
      </section>
    </LegalPage>
  );
}
