/**
 * Footer links. Privacy (/privacy) and Terms (/terms) are pages in this app.
 * NEXT_PUBLIC_PRIVACY_URL / NEXT_PUBLIC_TERMS_URL can still point them at a hosted policy instead.
 */

export interface FooterLink {
  label: string;
  href: string;
}

export interface LegalEnv {
  privacy?: string | undefined;
  terms?: string | undefined;
}

export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";

// Next.js inlines NEXT_PUBLIC_* only when written out literally like this.
function readEnv(): LegalEnv {
  return { privacy: process.env.NEXT_PUBLIC_PRIVACY_URL, terms: process.env.NEXT_PUBLIC_TERMS_URL };
}

export function legalHrefs(env: LegalEnv = readEnv()): { privacy: string; terms: string } {
  return { privacy: env.privacy?.trim() || PRIVACY_PATH, terms: env.terms?.trim() || TERMS_PATH };
}

export function footerLinks(env: LegalEnv = readEnv()): FooterLink[] {
  const { privacy, terms } = legalHrefs(env);
  return [
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: privacy },
    { label: "Terms", href: terms },
  ];
}
