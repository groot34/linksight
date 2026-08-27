/**
 * Extracts and normalizes the LinkedIn profile vanity identifier from various URL formats.
 * Examples supported:
 * - https://www.linkedin.com/in/williamhgates/
 * - http://linkedin.com/in/williamhgates?miniProfileUrn=...
 * - https://in.linkedin.com/in/williamhgates
 * - in/williamhgates
 * - williamhgates
 */
export function extractVanityName(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('INVALID_URL: Profile URL or identifier must be a non-empty string.');
  }

  const trimmed = input.trim();

  // If it's already a plain alphanumeric/hyphen slug without slashes or query params
  if (/^[a-zA-Z0-9_\u00C0-\u017F%.-]+$/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes('.')) {
    return decodeURIComponent(trimmed).toLowerCase();
  }

  try {
    // Ensure URL has protocol for URL parser
    const urlString = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed.replace(/^\/+/, '')}`;

    const parsed = new URL(urlString);
    const pathname = parsed.pathname;

    // Match /in/{vanityName} pattern
    const match = pathname.match(/\/in\/([^/?#]+)/i);
    if (match && match[1]) {
      return decodeURIComponent(match[1].replace(/\/+$/, '')).toLowerCase();
    }

    // Match /pub/{vanityName} or directly pathname slug if passed as linkedin.com/vanity
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length >= 1) {
      const last = segments[segments.length - 1];
      if (last && last !== 'in' && last !== 'pub') {
        return decodeURIComponent(last).toLowerCase();
      }
    }
  } catch {
    // If URL parsing fails, check regex fallback
    const match = trimmed.match(/(?:linkedin\.com\/in\/|in\/|^)([\w\u00C0-\u017F%.-]+)/i);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).toLowerCase();
    }
  }

  throw new Error(`INVALID_URL: Could not parse a valid LinkedIn profile identifier from "${input}". Expected format: https://www.linkedin.com/in/username`);
}
