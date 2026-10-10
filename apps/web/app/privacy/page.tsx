/*
 * Privacy Policy. NOTE: drafted without legal review (October 10, 2026). Have a qualified
 * Canadian lawyer review this text before relying on it.
 */
import type { Metadata } from "next";
import { LegalPage, Mail } from "@/components/marketing/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy · BuboMap",
  description: "How BuboMap collects, uses, stores and protects personal information.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This Privacy Policy explains how BuboMap (&quot;BuboMap&quot;, &quot;we&quot;,
          &quot;us&quot;), operated by Harvinder Minhas, a business registered in Ontario, Canada,
          collects, uses, discloses and protects personal information when you visit our website or
          use the BuboMap enterprise architecture service (the &quot;Service&quot;).
        </p>
      }
    >
      <section>
        <h2>1. Who we are and how to reach us</h2>
        <p>
          BuboMap is the organisation responsible for personal information under our control. Our
          privacy contact can be reached at <Mail />. We comply with Canada&apos;s Personal
          Information Protection and Electronic Documents Act (PIPEDA) and, where they apply to you,
          other privacy laws such as the EU/UK General Data Protection Regulation (GDPR) and the
          California Consumer Privacy Act as amended (CCPA).
        </p>
      </section>

      <section>
        <h2>2. Customer data and our role</h2>
        <p>
          Organisations that use BuboMap (&quot;Customers&quot;) put information about their
          applications, systems, vendors, costs, people, teams and processes into their
          workspaces (&quot;Customer Data&quot;). <strong>Customers own their Customer Data.</strong>{" "}
          We process it only to provide the Service on the Customer&apos;s instructions. For Customer
          Data we act as a service provider (a &quot;processor&quot; under GDPR); the Customer is
          responsible for having a lawful basis to put personal information into BuboMap. If your
          information is in a Customer&apos;s workspace, please contact that organisation first.
        </p>
      </section>

      <section>
        <h2>3. Information we collect</h2>
        <h3>Account information</h3>
        <p>
          You sign in with Google or Microsoft through Firebase Authentication. We receive your
          name, email address, profile picture (if any) and a unique account identifier from that
          provider. We never see or store your Google or Microsoft password.
        </p>
        <h3>Organisation and billing information</h3>
        <p>
          Your organisation name, members and roles, plan and subscription status. Payments are
          handled by Stripe: <strong>card details go directly to Stripe and never touch our
          servers</strong>. We may receive limited billing records from Stripe such as customer ID,
          plan, invoice status and the last four digits and brand of a card.
        </p>
        <h3>Information you send us</h3>
        <p>
          Messages through our contact and Business &quot;Get started&quot; forms (name, work email,
          company, licences needed, billing preferences and your message).
        </p>
        <h3>Customer Data and AI questions</h3>
        <p>
          The content of your workspaces and the questions you ask the Ask feature.
        </p>
        <h3>Technical information</h3>
        <p>
          Server and security logs kept by our hosting providers, such as IP address, browser type,
          requested pages, timestamps and error details.
        </p>
      </section>

      <section>
        <h2>4. How we use information</h2>
        <ul>
          <li>To provide, operate, secure and maintain the Service and your account;</li>
          <li>To answer questions with the AI Ask feature;</li>
          <li>To process subscriptions, invoices and payments;</li>
          <li>To send service emails such as email verification, invitations and billing notices;</li>
          <li>To respond to your requests, including Business plan requests and support;</li>
          <li>To detect, prevent and investigate fraud, abuse and security incidents;</li>
          <li>To comply with law and enforce our Terms of Service.</li>
        </ul>
        <p>
          We do not sell personal information, we do not share it for cross-context behavioural
          advertising, and we do not use Customer Data to train our own or third-party AI models.
        </p>
      </section>

      <section>
        <h2>5. The AI Ask feature and Google Gemini</h2>
        <p>
          When you use Ask, relevant parts of your workspace data and your question are sent to
          Google&apos;s Gemini API to generate an answer. Google processes this data as our
          subprocessor under its API terms. AI answers can be wrong; see our Terms of Service.
          Don&apos;t put information into BuboMap that you are not permitted to share with such
          providers.
        </p>
      </section>

      <section>
        <h2>6. Subprocessors</h2>
        <p>We use these service providers to run BuboMap:</p>
        <ul>
          <li><strong>Vercel</strong>: website and application hosting;</li>
          <li><strong>Google Cloud</strong>: hosted PostgreSQL database;</li>
          <li><strong>Google Firebase Authentication</strong>: sign-in with Google or Microsoft;</li>
          <li><strong>Microsoft</strong> and <strong>Google</strong>: identity providers you choose to sign in with;</li>
          <li><strong>Google Gemini API</strong>: AI answers in the Ask feature;</li>
          <li><strong>Stripe</strong>: payments, subscriptions and invoices;</li>
          <li><strong>Resend</strong>: transactional email.</li>
        </ul>
        <p>
          Each is bound by contract to protect personal information and use it only to provide
          services to us. We may update this list as our providers change.
        </p>
      </section>

      <section>
        <h2>7. Where information is stored</h2>
        <p>
          BuboMap is operated from Canada. Our providers may store and process information in the
          United States and other countries, where it may be accessible to courts and authorities
          under local law. Where required, we rely on appropriate safeguards (such as standard
          contractual clauses) for international transfers.
        </p>
      </section>

      <section>
        <h2>8. Cookies and local storage</h2>
        <p>
          BuboMap uses only what is needed to sign you in and run the app. We do not use
          advertising cookies or third-party analytics trackers.
        </p>
        <ul>
          <li>
            <strong>Authentication</strong>: Firebase Authentication keeps your signed-in session in
            your browser&apos;s storage, and Google or Microsoft may set their own cookies during
            sign-in.
          </li>
          <li>
            <strong>Preferences</strong>: the app stores interface preferences (such as panel widths
            and recently saved questions) in your browser&apos;s local storage. These never leave
            your device unless you save them to a workspace.
          </li>
          <li>
            <strong>Payments</strong>: Stripe&apos;s checkout and billing pages, which are hosted by
            Stripe, set their own cookies for fraud prevention.
          </li>
        </ul>
        <p>
          You can clear these in your browser settings; you will then need to sign in again.
        </p>
      </section>

      <section>
        <h2>9. Retention and deletion</h2>
        <p>
          We keep account information and Customer Data for as long as your account or your
          organisation&apos;s subscription is active. If you ask us to delete your account or your
          organisation&apos;s data, we will delete or anonymise it within 30 days, except where we
          must keep records to comply with law (for example tax and billing records, which we
          generally keep for seven years) or to resolve disputes. Deleted data may remain in
          encrypted backups for up to 90 days before being overwritten. Contact form and Business
          request submissions are kept for up to two years. You can request deletion at any time
          by emailing <Mail />.
        </p>
      </section>

      <section>
        <h2>10. Security</h2>
        <p>
          We use reasonable administrative, technical and physical safeguards appropriate to the
          sensitivity of the information, including encryption in transit, access controls and
          providers with recognised security programmes. No system is perfectly secure, and we
          cannot guarantee absolute security. If a breach creates a real risk of significant harm,
          we will notify affected individuals and the Office of the Privacy Commissioner of Canada as
          required by PIPEDA.
        </p>
      </section>

      <section>
        <h2>11. Your rights</h2>
        <h3>Everyone (PIPEDA)</h3>
        <p>
          You may ask to access the personal information we hold about you, correct inaccurate
          information, and withdraw consent (subject to legal or contractual restrictions, which
          may mean we can no longer provide the Service). You may complain to the Office of the
          Privacy Commissioner of Canada.
        </p>
        <h3>EEA, UK and Swiss residents (GDPR)</h3>
        <p>
          You have the right to access, rectify, erase, restrict and object to processing, and to
          data portability. Our legal bases are performance of a contract, our legitimate
          interests in running and securing the Service, legal obligations, and consent where we
          ask for it. You may lodge a complaint with your local supervisory authority.
        </p>
        <h3>California residents (CCPA)</h3>
        <p>
          You have the right to know what personal information we collect, use and disclose; to
          request deletion and correction; and not to be discriminated against for exercising these
          rights. We do not sell or share personal information as those terms are defined in the
          CCPA. You may use an authorised agent.
        </p>
        <p>
          To exercise any right, email <Mail />. We will verify your request and respond within the
          time required by law (generally 30 days). If your information is Customer Data, we may
          refer you to the relevant Customer.
        </p>
      </section>

      <section>
        <h2>12. Children</h2>
        <p>
          BuboMap is a business service and is not directed to anyone under 16. We do not knowingly
          collect personal information from children.
        </p>
      </section>

      <section>
        <h2>13. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. We will post the new version here with a new
          &quot;Last updated&quot; date and, for material changes, notify account owners by email or
          in the app.
        </p>
      </section>

      <section>
        <h2>14. Contact</h2>
        <p>
          BuboMap (Harvinder Minhas), Ontario, Canada. Email: <Mail />.
        </p>
      </section>
    </LegalPage>
  );
}
