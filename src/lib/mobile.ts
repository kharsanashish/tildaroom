/**
 * We use a synthetic email scheme to let users authenticate with mobile + password
 * without requiring SMS OTP. The mobile number is normalised to digits and combined
 * with a fixed local domain.
 */
export const MOBILE_AUTH_DOMAIN = "flatrent.local";

export function normalizeMobile(input: string): string {
  return input.replace(/\D/g, "");
}

export function mobileToEmail(mobile: string): string {
  return `${normalizeMobile(mobile)}@${MOBILE_AUTH_DOMAIN}`;
}

export function emailToMobile(email: string): string {
  return email.split("@")[0] ?? "";
}

export function isValidMobile(mobile: string): boolean {
  const m = normalizeMobile(mobile);
  return m.length >= 10 && m.length <= 15;
}
