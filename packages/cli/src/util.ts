/**
 * Pure helpers shared by the CLI entry point.
 * Kept in their own module so they can be unit-tested without triggering `main()`.
 */

/** True when `str` parses as a URL. */
export function isUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/** Normalise an arbitrary name into a lowercase snake_case identifier (max 50 chars). */
export function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}
