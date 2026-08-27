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

export interface ExperienceItem {
  title: string;
  company_name: string;
  company_url?: string | null;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_current?: boolean;
  description?: string | null;
}

export interface EducationItem {
  school_name: string;
  degree_name?: string | null;
  field_of_study?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  description?: string | null;
}

export interface CertificationItem {
  name: string;
  authority?: string | null;
  url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  license_number?: string | null;
}

export interface ProfileData {
  vanity_name: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  headline?: string | null;
  location?: string | null;
  about?: string | null;
  profile_picture_url?: string | null;
  background_image_url?: string | null;
  experience: ExperienceItem[];
  education: EducationItem[];
  skills: string[];
  certifications: CertificationItem[];
  languages: string[];
}

export interface ProfileMeta {
  cached: boolean;
  cached_at?: string | null;
  fetched_at: string;
  execution_time_ms: number;
  daily_requests_remaining: number;
}

export interface ProfileResponse {
  success: true;
  data: ProfileData;
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
