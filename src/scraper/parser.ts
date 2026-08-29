import {
  LinkedInProfile,
  ExperienceItem,
  EducationItem,
  CertificationItem,
  LanguageItem
} from '../types/index.js';

/**
 * Resolves high-resolution image CDN URLs from LinkedIn's VectorImage format.
 */
export function resolveVectorImage(vectorImage: any): string | null {
  if (!vectorImage) return null;
  if (typeof vectorImage === 'string' && vectorImage.startsWith('http')) {
    return vectorImage;
  }

  try {
    // Handle standard LinkedIn VectorImage: rootUrl + artifacts[last].fileIdentifyingUrlPathSegment
    if (vectorImage.rootUrl && Array.isArray(vectorImage.artifacts) && vectorImage.artifacts.length > 0) {
      const sorted = [...vectorImage.artifacts].sort((a, b) => (b.width || 0) - (a.width || 0));
      const bestArtifact = sorted[0];
      if (bestArtifact && bestArtifact.fileIdentifyingUrlPathSegment) {
        return `${vectorImage.rootUrl}${bestArtifact.fileIdentifyingUrlPathSegment}`;
      }
    }

    // Handle com.linkedin.common.VectorImage inside miniProfile
    if (vectorImage['com.linkedin.common.VectorImage']) {
      return resolveVectorImage(vectorImage['com.linkedin.common.VectorImage']);
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Formats LinkedIn Date objects ({ year, month, day }) into standard ISO/readable strings.
 */
export function formatLinkedInDate(dateObj: any): string | null {
  if (!dateObj) return null;
  if (typeof dateObj === 'string') return dateObj;

  try {
    const year = dateObj.year;
    const month = dateObj.month ? String(dateObj.month).padStart(2, '0') : null;
    const day = dateObj.day ? String(dateObj.day).padStart(2, '0') : null;

    if (year && month && day) return `${year}-${month}-${day}`;
    if (year && month) return `${year}-${month}`;
    if (year) return `${year}`;
  } catch {
    return null;
  }
  return null;
}

/**
 * Parses Voyager identity response / Dash full profile payload into our normalized LinkedInProfile schema.
 * Each section is wrapped in isolated try/catch blocks to degrade gracefully on missing or malformed sections.
 */

export function extractString(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') return val.trim() || null;
  if (typeof val.text === 'string') return val.text.trim() || null;
  if (val.localized && typeof val.localized === 'object') {
    const values = Object.values(val.localized);
    if (values.length > 0 && typeof values[0] === 'string') return (values[0] as string).trim() || null;
  }
  return null;
}

export function parseVoyagerProfile(vanityName: string, raw: any): LinkedInProfile {
  if (!raw) {
    throw new Error('EMPTY_PAYLOAD: Received empty response from LinkedIn Voyager API.');
  }

  const included: any[] = Array.isArray(raw.included) ? raw.included : [];
  const data = raw.data || raw;

  // 1. Identify Main Profile Entity
  let profileEntity: any = null;
  try {
    const fromIncluded = included.find((item: any) =>
      item.$type?.includes('identity.profile.Profile') ||
      item.$type?.includes('dash.identity.profile.Profile') ||
      item.entityUrn?.includes('fsd_profile')
    );

    const dashElements = Array.isArray(data.elements)
      ? data.elements
      : Array.isArray(raw.elements)
        ? raw.elements
        : [];

    if (fromIncluded) {
      profileEntity = fromIncluded;
    } else if (dashElements.length > 0) {
      profileEntity = dashElements[0];
    } else {
      profileEntity = data;
    }
  } catch {
    profileEntity = data || {};
  }

  // 2. Extract Basic Details
  let firstName: string | null = null;
  let lastName: string | null = null;
  let fullName: string = vanityName;
  let headline: string | null = null;
  let location: string | null = null;
  let about: string | null = null;

  try {
    firstName = profileEntity?.firstName || profileEntity?.localizedFirstName || null;
    lastName = profileEntity?.lastName || profileEntity?.localizedLastName || null;
    fullName = profileEntity?.fullName || `${firstName || ''} ${lastName || ''}`.trim() || vanityName;
    headline = profileEntity?.headline || profileEntity?.occupation || null;
    location = profileEntity?.locationName || profileEntity?.geoLocationName || profileEntity?.geoRegion || null;
    about = profileEntity?.summary || profileEntity?.about || null;
  } catch {
    // Graceful fallback to default values
  }

  // 3. Extract Profile & Background Images
  let profileImageUrl: string | null = null;
  let bannerImageUrl: string | null = null;

  try {
    profileImageUrl =
      resolveVectorImage(profileEntity?.picture) ||
      resolveVectorImage(profileEntity?.profilePicture?.displayImageReference?.vectorImage) ||
      resolveVectorImage(profileEntity?.displayPictureUrl) ||
      null;

    bannerImageUrl =
      resolveVectorImage(profileEntity?.backgroundImage) ||
      resolveVectorImage(profileEntity?.backgroundPicture?.displayImageReference?.vectorImage) ||
      resolveVectorImage(profileEntity?.backgroundPictureUrl) ||
      null;
  } catch {
    // Graceful fallback
  }

  // 4. Extract Experience / Positions
  const experience: ExperienceItem[] = [];
  try {
    const positionEntities = included.filter((item: any) =>
      item.$type?.includes('identity.profile.Position') ||
      item.$type?.includes('dash.identity.profile.Position')
    );

    const rawPositions = positionEntities.length > 0
      ? positionEntities
      : (Array.isArray(profileEntity?.positions?.elements) ? profileEntity.positions.elements : []);

    for (const pos of rawPositions) {
      try {
        const timePeriod = pos.timePeriod || pos.dateRange || {};
        const startDate = formatLinkedInDate(timePeriod.startDate || timePeriod.start);
        const endDate = formatLinkedInDate(timePeriod.endDate || timePeriod.end);

        experience.push({
          title: pos.title || 'Unknown Position',
          company: pos.companyName || pos.company?.name || 'Unknown Company',
          location: pos.locationName || pos.location || null,
          startDate,
          endDate,
          description: pos.description || null
        });
      } catch {
        // Skip malformed individual position
      }
    }
  } catch {
    // Experience degrades to empty array
  }

  // 5. Extract Education
  const education: EducationItem[] = [];
  try {
    const educationEntities = included.filter((item: any) =>
      item.$type?.includes('identity.profile.Education') ||
      item.$type?.includes('dash.identity.profile.Education')
    );

    const rawEducations = educationEntities.length > 0
      ? educationEntities
      : (Array.isArray(profileEntity?.educations?.elements) ? profileEntity.educations.elements : []);

    for (const edu of rawEducations) {
      try {
        const timePeriod = edu.timePeriod || edu.dateRange || {};
        education.push({
          school: edu.schoolName || edu.school?.name || 'Unknown School',
          degree: edu.degreeName || null,
          field: edu.fieldOfStudy || null,
          startDate: formatLinkedInDate(timePeriod.startDate || timePeriod.start),
          endDate: formatLinkedInDate(timePeriod.endDate || timePeriod.end)
        });
      } catch {
        // Skip malformed individual education item
      }
    }
  } catch {
    // Education degrades to empty array
  }

  // 6. Extract Skills
  const skillsSet = new Set<string>();
  try {
    const skillEntities = included.filter((item: any) =>
      item.$type?.includes('identity.profile.Skill') ||
      item.$type?.includes('dash.identity.profile.Skill')
    );

    const rawSkills = skillEntities.length > 0
      ? skillEntities
      : (Array.isArray(profileEntity?.skills?.elements) ? profileEntity.skills.elements : []);

    for (const sk of rawSkills) {
      try {
        const name = sk.name || sk.skill?.name;
        if (name && typeof name === 'string') {
          skillsSet.add(name.trim());
        }
      } catch {
        // Skip malformed skill item
      }
    }
  } catch {
    // Skills degrades to empty set
  }

  // 7. Extract Certifications
  const certifications: CertificationItem[] = [];
  try {
    const certEntities = included.filter((item: any) =>
      item.$type?.includes('identity.profile.Certification') ||
      item.$type?.includes('dash.identity.profile.Certification')
    );

    const rawCerts = certEntities.length > 0
      ? certEntities
      : (Array.isArray(profileEntity?.certifications?.elements) ? profileEntity.certifications.elements : []);

    for (const cert of rawCerts) {
      try {
        certifications.push({
          name: cert.name || 'Unnamed Certification',
          issuer: cert.authority || cert.company?.name || null,
          issueDate: formatLinkedInDate(cert.timePeriod?.startDate)
        });
      } catch {
        // Skip malformed certification item
      }
    }
  } catch {
    // Certifications degrades to empty array
  }

  // 8. Extract Languages
  const languages: LanguageItem[] = [];
  try {
    const langEntities = included.filter((item: any) =>
      item.$type?.includes('identity.profile.Language') ||
      item.$type?.includes('dash.identity.profile.Language')
    );

    const rawLangs = langEntities.length > 0
      ? langEntities
      : (Array.isArray(profileEntity?.languages?.elements) ? profileEntity.languages.elements : []);

    for (const lang of rawLangs) {
      try {
        const languageName = lang.name || lang.language;
        if (languageName && typeof languageName === 'string') {
          languages.push({
            language: languageName.trim(),
            proficiency: lang.proficiency || lang.proficiencyName || null
          });
        }
      } catch {
        // Skip malformed language item
      }
    }
  } catch {
    // Languages degrades to empty list
  }

  return {
    profileUrl: `https://www.linkedin.com/in/${vanityName}`,
    name: fullName,
    headline,
    location,
    about,
    profileImageUrl,
    bannerImageUrl,
    experience,
    education,
    skills: Array.from(skillsSet),
    certifications,
    languages,
    scrapedAt: new Date().toISOString()
  };
}
