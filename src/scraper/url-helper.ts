/**
 * Extracts and normalizes the LinkedIn profile vanity identifier from various URL formats.
 * Examples supported:
 * - https://www.linkedin.com/in/williamhgates/
 * - http://linkedin.com/in/williamhgates?miniProfileUrn=...
 * - https://in.linkedin.com/in/williamhgates
 * - in/williamhgates
 * - williamhgates (alphanumeric/dash username)
 */
export function extractVanityName(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('INVALID_URL: Profile URL or identifier must be a non-empty string.');
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw new Error('INVALID_URL: Profile URL or identifier must be a non-empty string.');
  }

  // Check if it starts with http://, https://, or has a domain
  const isExplicitUrl = /^https?:\/\//i.test(trimmed) || /^(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(trimmed);

  if (isExplicitUrl) {
    try {
      const urlString = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      const parsed = new URL(urlString);

      // Must be a linkedin.com domain (e.g. www.linkedin.com, in.linkedin.com, linkedin.com)
      if (!parsed.hostname.toLowerCase().endsWith('linkedin.com')) {
        throw new Error(`INVALID_URL: "${input}" is not a valid linkedin.com URL.`);
      }

      // Match /in/{vanityName} pattern
      const match = parsed.pathname.match(/\/in\/([^/?#]+)/i);
      if (match && match[1]) {
        return decodeURIComponent(match[1].replace(/\/+$/, '')).toLowerCase();
      }

      // Match /pub/{vanityName}
      const pubMatch = parsed.pathname.match(/\/pub\/([^/?#]+)/i);
      if (pubMatch && pubMatch[1]) {
        return decodeURIComponent(pubMatch[1].replace(/\/+$/, '')).toLowerCase();
      }

      throw new Error(`INVALID_URL: Could not find /in/ path segment in "${input}".`);
    } catch (err: any) {
      if (err.message && err.message.startsWith('INVALID_URL')) {
        throw err;
      }
      throw new Error(`INVALID_URL: Malformed LinkedIn profile URL: "${input}".`);
    }
  }

  // Handle in/{vanityName} shorthand
  if (/^in\/[^/?#]+/i.test(trimmed)) {
    const slug = trimmed.replace(/^in\//i, '').replace(/\/+$/, '');
    if (slug) {
      return decodeURIComponent(slug).toLowerCase();
    }
  }

  // Handle bare vanity username (e.g. "williamhgates", "satya-nadella", "john_doe")
  if (/^[a-zA-Z0-9_\u00C0-\u017F%.-]+$/.test(trimmed) && !trimmed.includes('/') && !trimmed.includes(' ')) {
    return decodeURIComponent(trimmed).toLowerCase();
  }

  throw new Error(`INVALID_URL: Could not parse a valid LinkedIn profile identifier from "${input}". Expected format: https://www.linkedin.com/in/username`);
}
