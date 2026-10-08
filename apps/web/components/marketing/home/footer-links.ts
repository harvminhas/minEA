/**
 * Footer links. Privacy and Terms only appear once their pages exist: set
 * NEXT_PUBLIC_PRIVACY_URL / NEXT_PUBLIC_TERMS_URL (e.g. "/privacy" or a hosted policy URL).
 * The app has no privacy or terms page yet, so linking them unconditionally would 404.
 */

export interface FooterLink {
  label: string;
  href: string;
}

export interface LegalEnv {
  privacy?: string | undefined;
  terms?: string | undefined;
}

// Next.js inlines NEXT_PUBLIC_* only when written out literally like this.
function readEnv(): LegalEnv {
  return { privacy: process.env.NEXT_PUBLIC_PRIVACY_URL, terms: process.env.NEXT_PUBLIC_TERMS_URL };
}

export function footerLinks(env: LegalEnv = readEnv()): FooterLink[] {
  const links: FooterLink[] = [{ label: "Contact", href: "/contact" }];
  const privacy = env.privacy?.trim();
  const terms = env.terms?.trim();
  if (privacy) links.push({ label: "Privacy", href: privacy });
  if (terms) links.push({ label: "Terms", href: terms });
  return links;
}
