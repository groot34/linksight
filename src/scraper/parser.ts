import {
  ProfileData,
  ExperienceItem,
  EducationItem,
  CertificationItem
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
 * Parses Voyager identity response / Dash full profile payload into our normalized ProfileData schema.
 * Each section is wrapped in isolated try/catch blocks to degrade gracefully on missing or malformed sections.
 */
export function parseVoyagerProfile(vanityName: string, raw: any): ProfileData {
  if (!raw) {
    throw new Error('EMPTY_PAYLOAD: Received empty response from LinkedIn Voyager API.');
  }

  const included: any[] = Array.isArray(raw.included) ? raw.included : [];
  const data = raw.data || raw;

  // 1. Identify Main Profile Entity
  let profileEntity: any = null;
  try {
    profileEntity = included.find((item: any) =>
      item.$type?.includes('identity.profile.Profile') ||
      item.$type?.includes('dash.identity.profile.Profile') ||
      item.entityUrn?.includes('fsd_profile')
    ) || data;

    // Fallback: search across raw elements if wrapped in Dash response
    if (!profileEntity && Array.isArray(data.elements) && data.elements.length > 0) {
      profileEntity = data.elements[0];
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
  let profilePictureUrl: string | null = null;
  let backgroundImageUrl: string | null = null;

  try {
    profilePictureUrl =
      resolveVectorImage(profileEntity?.picture) ||
      resolveVectorImage(profileEntity?.profilePicture?.displayImageReference?.vectorImage) ||
      resolveVectorImage(profileEntity?.displayPictureUrl) ||
      null;

    backgroundImageUrl =
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
        const timePeriod = pos.timePeriod || {};
        const startsAt = formatLinkedInDate(timePeriod.startDate);
        const endsAt = formatLinkedInDate(timePeriod.endDate);
        const isCurrent = !endsAt || pos.isCurrent === true;

        experience.push({
          title: pos.title || 'Unknown Position',
          company_name: pos.companyName || pos.company?.name || 'Unknown Company',
          company_url: pos.companyUrn ? `https://www.linkedin.com/company/${pos.companyUrn.split(':').pop()}` : null,
          location: pos.locationName || pos.location || null,
          starts_at: startsAt,
          ends_at: endsAt,
          is_current: isCurrent,
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
        const timePeriod = edu.timePeriod || {};
        education.push({
          school_name: edu.schoolName || edu.school?.name || 'Unknown School',
          degree_name: edu.degreeName || null,
          field_of_study: edu.fieldOfStudy || null,
          starts_at: formatLinkedInDate(timePeriod.startDate),
          ends_at: formatLinkedInDate(timePeriod.endDate),
          description: edu.description || edu.activities || null
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
          authority: cert.authority || cert.company?.name || null,
          url: cert.url || null,
          starts_at: formatLinkedInDate(cert.timePeriod?.startDate),
          ends_at: formatLinkedInDate(cert.timePeriod?.endDate),
          license_number: cert.licenseNumber || null
        });
      } catch {
        // Skip malformed certification item
      }
    }
  } catch {
    // Certifications degrades to empty array
  }

  // 8. Extract Languages
  const languagesSet = new Set<string>();
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
        const name = lang.name || lang.language;
        if (name && typeof name === 'string') {
          languagesSet.add(name.trim());
        }
      } catch {
        // Skip malformed language item
      }
    }
  } catch {
    // Languages degrades to empty set
  }

  return {
    vanity_name: vanityName,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    headline,
    location,
    about,
    profile_picture_url: profilePictureUrl,
    background_image_url: backgroundImageUrl,
    experience,
    education,
    skills: Array.from(skillsSet),
    certifications,
    languages: Array.from(languagesSet)
  };
}
