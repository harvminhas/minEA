/**
 * Business plan "Get started" form: validation, request body and links.
 * Pure helpers (unit-tested); BusinessGetStartedForm wires them up.
 * POST /api/v1/contact/business stores the request (public: signed-out visitors too).
 */
import { BUSINESS_MIN_LICENCES } from "./plans";

export const BUSINESS_GET_STARTED_PATH = "/business/get-started";
export const BUSINESS_REQUEST_ENDPOINT = "/contact/business";

export type BusinessBillingPeriod = "monthly" | "annual";
export type BusinessPaymentMethod = "card" | "invoice";

export interface BusinessRequestInput {
  name: string;
  email: string;
  company: string;
  licences: string | number;
  billingPeriod: BusinessBillingPeriod;
  paymentMethod: BusinessPaymentMethod;
  message?: string;
  orgSlug?: string | null;
  source?: string | null;
}

export interface BusinessRequestBody {
  name: string;
  email: string;
  company: string;
  licences: number;
  billing_period: BusinessBillingPeriod;
  payment_method: BusinessPaymentMethod;
  message: string | null;
  org_slug: string | null;
  source: string | null;
}

export type BusinessRequestErrors = Partial<Record<"name" | "email" | "company" | "licences", string>>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function parseLicences(raw: string | number): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isInteger(n) ? n : null;
}

export function validateBusinessRequest(input: BusinessRequestInput): BusinessRequestErrors {
  const errors: BusinessRequestErrors = {};
  if (!input.name.trim()) errors.name = "Enter your name.";
  if (!EMAIL_RE.test(input.email.trim())) errors.email = "Enter a valid work email.";
  if (!input.company.trim()) errors.company = "Enter your company.";
  const n = parseLicences(input.licences);
  if (n == null || n < BUSINESS_MIN_LICENCES) {
    errors.licences = `Business starts from ${BUSINESS_MIN_LICENCES} licences.`;
  }
  return errors;
}

export function businessRequestBody(input: BusinessRequestInput): BusinessRequestBody {
  const clean = (v: string | null | undefined) => (v ?? "").trim() || null;
  return {
    name: input.name.trim(),
    email: input.email.trim(),
    company: input.company.trim(),
    licences: parseLicences(input.licences) ?? BUSINESS_MIN_LICENCES,
    billing_period: input.billingPeriod,
    payment_method: input.paymentMethod,
    message: clean(input.message),
    org_slug: clean(input.orgSlug),
    source: clean(input.source),
  };
}

/** Link to the standalone form page, e.g. from in-app upgrade prompts. */
export function businessGetStartedHref(opts: { org?: string | null; from?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (opts.org) params.set("org", opts.org);
  if (opts.from) params.set("from", opts.from);
  const q = params.toString();
  return q ? `${BUSINESS_GET_STARTED_PATH}?${q}` : BUSINESS_GET_STARTED_PATH;
}

export const BUSINESS_REQUEST_THANKS =
  "Thanks, we've got your request. We'll email you the next steps for your Business plan.";
