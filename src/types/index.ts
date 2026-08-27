import { z } from 'zod';

export interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  logLevel: string;
  liAtCookie: string;
  liJsessionId: string;
  dailyRequestCap: number;
  requestCooldownSeconds: number;
  cacheTtlHours: number;
}

// ---------------------------------------------------------------------------
// Phase 4: Zod & TypeScript Response Schemas
// ---------------------------------------------------------------------------

export const experienceItemSchema = z.object({
  title: z.string().describe('Position job title'),
  company: z.string().describe('Company or organization name'),
  location: z.string().nullable().optional().describe('Location of the role'),
  startDate: z.string().nullable().optional().describe('Start date (YYYY, YYYY-MM, or YYYY-MM-DD)'),
  endDate: z.string().nullable().optional().describe('End date or null if currently active'),
  description: z.string().nullable().optional().describe('Summary of responsibilities and achievements')
});

export const educationItemSchema = z.object({
  school: z.string().describe('Institution or university name'),
  degree: z.string().nullable().optional().describe('Degree earned (e.g. Bachelor of Science)'),
  field: z.string().nullable().optional().describe('Field of study / Major'),
  startDate: z.string().nullable().optional().describe('Start year or date'),
  endDate: z.string().nullable().optional().describe('Graduation year or date')
});

export const certificationItemSchema = z.object({
  name: z.string().describe('Certification name'),
  issuer: z.string().nullable().optional().describe('Issuing authority or organization'),
  issueDate: z.string().nullable().optional().describe('Date issued (YYYY or YYYY-MM)')
});

export const languageItemSchema = z.object({
  language: z.string().describe('Language name'),
  proficiency: z.string().nullable().optional().describe('Proficiency level (e.g. Native, Professional, Elementary)')
});

export const linkedInProfileSchema = z.object({
  profileUrl: z.string().url().describe('Canonical public LinkedIn profile URL'),
  name: z.string().describe('Full name of the profile member'),
  headline: z.string().nullable().optional().describe('Professional headline / tagline'),
  location: z.string().nullable().optional().describe('Geographic location'),
  about: z.string().nullable().optional().describe('Summary / About biography'),
  profileImageUrl: z.string().nullable().optional().describe('High-resolution avatar CDN URL'),
  bannerImageUrl: z.string().nullable().optional().describe('High-resolution background banner CDN URL'),
  experience: z.array(experienceItemSchema).describe('Work experience history'),
  education: z.array(educationItemSchema).describe('Educational background'),
  skills: z.array(z.string()).describe('List of endorsed / listed skills'),
  certifications: z.array(certificationItemSchema).describe('Licenses and certifications'),
  languages: z.array(languageItemSchema).describe('Languages spoken and proficiencies'),
  scrapedAt: z.string().describe('ISO 8601 timestamp of when profile was retrieved')
});

export type ExperienceItem = z.infer<typeof experienceItemSchema>;
export type EducationItem = z.infer<typeof educationItemSchema>;
export type CertificationItem = z.infer<typeof certificationItemSchema>;
export type LanguageItem = z.infer<typeof languageItemSchema>;
export type LinkedInProfile = z.infer<typeof linkedInProfileSchema>;
export type ProfileData = LinkedInProfile;

// ---------------------------------------------------------------------------
// API Envelopes & System Metadata
// ---------------------------------------------------------------------------

export interface ProfileMeta {
  cached: boolean;
  cached_at?: string | null;
  fetched_at: string;
  execution_time_ms: number;
  daily_requests_remaining: number;
}

export interface ProfileResponse {
  success: true;
  data: LinkedInProfile;
  meta: ProfileMeta;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime_seconds: number;
  version: string;
  session_cookie_configured: boolean;
  daily_quota: {
    cap: number;
    used_today: number;
    remaining: number;
  };
  cache_stats: {
    items_count: number;
  };
}

export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  manual_action_required?: string;
  details?: unknown;
}
