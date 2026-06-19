export function verificationPagePath(redirectUrl: string = "/home"): string {
  return `/auth/verify-email?redirect_url=${encodeURIComponent(redirectUrl)}`;
}

export function postAuthDestination(
  redirectUrl: string,
  canProceed: boolean
): string {
  return canProceed ? redirectUrl : verificationPagePath(redirectUrl);
}
