import { describe, it, expect } from 'vitest';
import { parseVoyagerProfile, resolveVectorImage, formatLinkedInDate } from './parser.js';
import { linkedInProfileSchema } from '../types/index.js';

describe('Voyager Parser & Phase 4 Schema', () => {
  it('resolves VectorImage correctly', () => {
    const vectorImage = {
      rootUrl: 'https://media.licdn.com/dms/image/v2/D5603AQ/',
      artifacts: [
        { width: 100, height: 100, fileIdentifyingUrlPathSegment: 'profile-displayphoto-shrink_100_100/1.jpg' },
        { width: 800, height: 800, fileIdentifyingUrlPathSegment: 'profile-displayphoto-shrink_800_800/1.jpg' },
        { width: 400, height: 400, fileIdentifyingUrlPathSegment: 'profile-displayphoto-shrink_400_400/1.jpg' }
      ]
    };

    const resolved = resolveVectorImage(vectorImage);
    expect(resolved).toBe('https://media.licdn.com/dms/image/v2/D5603AQ/profile-displayphoto-shrink_800_800/1.jpg');
  });

  it('formats dates properly', () => {
    expect(formatLinkedInDate({ year: 2023, month: 5, day: 12 })).toBe('2023-05-12');
    expect(formatLinkedInDate({ year: 2020, month: 8 })).toBe('2020-08');
    expect(formatLinkedInDate({ year: 2018 })).toBe('2018');
    expect(formatLinkedInDate(null)).toBeNull();
  });

  it('parses full Voyager payload into exact Phase 4 schema format and validates with Zod', () => {
    const mockPayload = {
      data: {},
      included: [
        {
          $type: 'com.linkedin.voyager.dash.identity.profile.Profile',
          entityUrn: 'urn:li:fsd_profile:ACoAAAB_123',
          firstName: 'Bill',
          lastName: 'Gates',
          headline: 'Co-chair, Bill & Melinda Gates Foundation',
          locationName: 'Seattle, Washington, United States',
          summary: 'Co-chair of the Bill & Melinda Gates Foundation',
          picture: {
            rootUrl: 'https://media.licdn.com/dms/image/test/',
            artifacts: [{ width: 800, fileIdentifyingUrlPathSegment: 'bill_800.jpg' }]
          }
        },
        {
          $type: 'com.linkedin.voyager.dash.identity.profile.Position',
          title: 'Co-chair',
          companyName: 'Bill & Melinda Gates Foundation',
          companyUrn: 'urn:li:fsd_company:12345',
          locationName: 'Seattle, WA',
          timePeriod: {
            startDate: { year: 2000, month: 1 }
          }
        },
        {
          $type: 'com.linkedin.voyager.dash.identity.profile.Education',
          schoolName: 'Harvard University',
          degreeName: 'Doctor of Laws',
          fieldOfStudy: 'Honorary',
          timePeriod: {
            startDate: { year: 1973 },
            endDate: { year: 1975 }
          }
        },
        {
          $type: 'com.linkedin.voyager.dash.identity.profile.Skill',
          name: 'Software Development'
        },
        {
          $type: 'com.linkedin.voyager.dash.identity.profile.Certification',
          name: 'Certified Humanitarian',
          authority: 'Global Trust',
          timePeriod: {
            startDate: { year: 2010 }
          }
        },
        {
          $type: 'com.linkedin.voyager.dash.identity.profile.Language',
          name: 'English',
          proficiency: 'Native or bilingual'
        }
      ]
    };

    const parsed = parseVoyagerProfile('williamhgates', mockPayload);

    // Validate with Zod schema
    const validation = linkedInProfileSchema.safeParse(parsed);
    expect(validation.success).toBe(true);

    expect(parsed.profileUrl).toBe('https://www.linkedin.com/in/williamhgates');
    expect(parsed.name).toBe('Bill Gates');
    expect(parsed.headline).toBe('Co-chair, Bill & Melinda Gates Foundation');
    expect(parsed.location).toBe('Seattle, Washington, United States');
    expect(parsed.profileImageUrl).toBe('https://media.licdn.com/dms/image/test/bill_800.jpg');

    expect(parsed.experience.length).toBe(1);
    expect(parsed.experience[0]?.company).toBe('Bill & Melinda Gates Foundation');
    expect(parsed.experience[0]?.startDate).toBe('2000-01');

    expect(parsed.education.length).toBe(1);
    expect(parsed.education[0]?.school).toBe('Harvard University');

    expect(parsed.skills).toContain('Software Development');
    expect(parsed.certifications[0]?.name).toBe('Certified Humanitarian');
    expect(parsed.certifications[0]?.issuer).toBe('Global Trust');
    expect(parsed.languages[0]?.language).toBe('English');
    expect(parsed.languages[0]?.proficiency).toBe('Native or bilingual');
    expect(parsed.scrapedAt).toBeDefined();
  });

  it('degrades gracefully when sections are empty or omitted', () => {
    const minimalPayload = {
      data: {
        firstName: 'Jane',
        lastName: 'Doe'
      },
      included: []
    };

    const parsed = parseVoyagerProfile('janedoe', minimalPayload);

    expect(parsed.profileUrl).toBe('https://www.linkedin.com/in/janedoe');
    expect(parsed.name).toBe('Jane Doe');
    expect(parsed.experience).toEqual([]);
    expect(parsed.education).toEqual([]);
    expect(parsed.skills).toEqual([]);
    expect(parsed.certifications).toEqual([]);
    expect(parsed.languages).toEqual([]);
    expect(parsed.scrapedAt).toBeDefined();
  });

  it('parses Dash envelope with data.elements[0] and dateRange', () => {
    const parsed = parseVoyagerProfile('satyanadella', {
      data: {
        elements: [
          {
            entityUrn: 'urn:li:fsd_profile:ABC',
            firstName: 'Satya',
            lastName: 'Nadella',
            headline: 'CEO at Microsoft',
            positions: {
              elements: [
                {
                  title: 'CEO',
                  companyName: 'Microsoft',
                  dateRange: {
                    start: { year: 2014, month: 2 }
                  }
                }
              ]
            }
          }
        ]
      },
      included: []
    });

    expect(parsed.name).toBe('Satya Nadella');
    expect(parsed.experience[0]?.title).toBe('CEO');
    expect(parsed.experience[0]?.startDate).toBe('2014-02');
  });
});
