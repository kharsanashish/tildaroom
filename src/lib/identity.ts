/**
 * Identity helpers.
 *
 * - Owner logs in with a real email + password (standard Supabase Auth).
 * - Tenants log in with a username + password. We synthesise an email
 *   `${username}@flatrent.local` so Supabase Auth can manage their session
 *   uniformly (and RLS policies that key off auth.uid() keep working).
 */
export const TENANT_AUTH_DOMAIN = "flatrent.local";

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${TENANT_AUTH_DOMAIN}`;
}

export function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

/** Resolve a login identifier (email or username) to an email for Supabase Auth. */
export function identifierToEmail(input: string): string {
  const v = input.trim();
  if (isEmail(v)) return v.toLowerCase();
  return usernameToEmail(v);
}

export function isValidUsername(username: string): boolean {
  const u = normalizeUsername(username);
  return u.length >= 3 && u.length <= 32;
}
