import { describe, it, expect } from 'vitest';
import { extractVanityName } from './url-helper.js';

describe('URL Helper (extractVanityName)', () => {
  it('extracts vanity name from standard full HTTPS URLs', () => {
    expect(extractVanityName('https://www.linkedin.com/in/williamhgates/')).toBe('williamhgates');
    expect(extractVanityName('https://linkedin.com/in/satyanadella')).toBe('satyanadella');
    expect(extractVanityName('http://in.linkedin.com/in/sundarpichai/')).toBe('sundarpichai');
  });

  it('handles query parameters and trailing slashes cleanly', () => {
    expect(extractVanityName('https://www.linkedin.com/in/williamhgates?miniProfileUrn=urn%3Ali%3Afsd_profile%3A123')).toBe('williamhgates');
    expect(extractVanityName('https://www.linkedin.com/in/williamhgates/#experience')).toBe('williamhgates');
  });

  it('handles partial slugs and bare usernames', () => {
    expect(extractVanityName('in/williamhgates')).toBe('williamhgates');
    expect(extractVanityName('williamhgates')).toBe('williamhgates');
    expect(extractVanityName('john-doe-12345')).toBe('john-doe-12345');
  });

  it('throws descriptive error on non-LinkedIn domain URLs or invalid inputs', () => {
    expect(() => extractVanityName('')).toThrow('INVALID_URL');
    expect(() => extractVanityName('   ')).toThrow('INVALID_URL');
    expect(() => extractVanityName('https://google.com/search')).toThrow('INVALID_URL');
    expect(() => extractVanityName('https://facebook.com/username')).toThrow('INVALID_URL');
    expect(() => extractVanityName('https://www.linkedin.com/company/microsoft')).toThrow('INVALID_URL');
  });
});
