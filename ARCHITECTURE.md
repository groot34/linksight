# Architecture & Technical Design Document

**Project**: LinkSight &mdash; Hosted LinkedIn Profile Structured Data API  
**Status**: Proposed (Phase 0)  
**Author**: Engineering Pair

---

## 1. Scraping & Reverse-Engineered Ingestion Approach

LinkedIn's public API does not expose full profile data (work experience, education, skills, certifications, about summary) without enterprise partner approval. Browser-based scraping (Playwright/Puppeteer) is explicitly prohibited due to high overhead, brittle DOM selectors, and aggressive bot detection.

LinkSight employs a **Pure HTTP Reverse-Engineering Approach**:
- Mimics the internal network requests made by LinkedIn's single-page web application (Voyager API / GraphQL endpoints).
- Executes lightweight HTTPS requests (`/voyager/api/identity/dash/profiles`, `/voyager/api/identity/profiles/{vanity}`, `/voyager/api/graphql`) directly via HTTP client (`axios`/`undici`).
- Injects session authentication headers (`Cookie: li_at=...; JSESSIONID="..."`, `csrf-token: ...`, `x-restli-protocol-version: 2.0.0`, `x-li-lang: en_US`).
- Natively receives structured JSON directly from LinkedIn backend and maps it to a unified, strongly-typed profile schema.

> [!WARNING]
> **Internal & Undocumented Endpoints Notice**: The LinkedIn Voyager and Dash API endpoints used by this service are internal, undocumented, and unofficial. LinkedIn may change payload structures, endpoint paths, or headers without notice. LinkSight abstracts these schemas behind a resilient parser layer with multiple fallback paths for common schema variations.

---

## 2. Runtime & Web Framework

- **Runtime**: **Node.js (v20+ / v22) with TypeScript**
- **Web Framework**: **Fastify**
  - Ultra-high throughput and minimal memory footprint (~30-50MB RAM).
  - Native JSON Schema validation and serialization.
  - Automatic OpenAPI / Swagger UI generation at `/docs`.
  - Zero browser dependencies, zero headless Chromium packages, and zero binary bloat.

---

## 3. Session & Authentication Strategy

### Zero Automated Login Policy
- **Hard Rule**: The application **never** accepts, stores, or automates email/password credentials. No automated login forms or scripted authentication attempts exist in the codebase.
- **Session Injection**:
  1. User manually logs into `linkedin.com` in their standard desktop browser.
  2. User opens **DevTools $\rightarrow$ Application $\rightarrow$ Cookies $\rightarrow$ `https://www.linkedin.com`**.
  3. Copies values for:
     - `li_at` $\rightarrow$ set as `LI_AT_COOKIE` in `.env`
     - `JSESSIONID` $\rightarrow$ set as `LI_JSESSIONID` in `.env` (passed in the `csrf-token` header, stripping quotes if present).
- **Session Expiry Handling**:
  - If LinkedIn returns `401 Unauthorized` or redirects to `/authwall` / `/login`, LinkSight immediately traps this and returns a structured API error:
    ```json
    {
      "statusCode": 401,
      "error": "Unauthorized",
      "code": "SESSION_EXPIRED_OR_INVALID",
      "message": "The LinkedIn session cookie (LI_AT_COOKIE / LI_JSESSIONID) is expired or invalid. Please manually copy fresh cookies from your browser into the environment variables.",
      "manual_action_required": "Log into linkedin.com in your browser, copy li_at and JSESSIONID from DevTools, update .env, and restart."
    }
    ```
  - **No automated retry loop** will ever be triggered upon cookie failure.

---

## 4. Rate Limiting, Throttling & Caching (Safety Guardrails)

Because this is a demo take-home API, safety guardrails are enforced in code to prevent account flagging:

1. **Persistent / In-Memory Cache**:
   - Keyed by normalized profile identifier (e.g. `cache:profile:john-doe`).
   - Default TTL: **24 hours**.
   - Repeated requests for the same profile during reviewer testing return instantaneously without making any outbound requests to LinkedIn.
2. **Outbound Inter-Request Throttler (Mutex Queue)**:
   - Enforces a mandatory **minimum 5–10 second cooldown delay** between any two live outbound requests to LinkedIn.
   - Live requests are queued through an asynchronous mutex so parallel API calls never burst to LinkedIn simultaneously.
3. **Hard Daily Request Cap**:
   - Enforced in code (configurable via `DAILY_REQUEST_CAP`, default: `20` requests/day).
   - Tracks live outbound requests count on disk/in memory with a 24-hour reset window.
   - If exceeded, returns `429 Too Many Requests` with a clear explanation and reset time.

---

## 5. Deployment & Hosting Strategy
 
Because the service uses pure HTTP requests and requires zero headless browser binaries or Chromium processes, resource utilization is minimal (<50MB RAM, instant cold start).
 
### Platform Comparison & Recommendation:
- **Render / Railway / Fly.io (Recommended)**:
  - Standard lightweight web service container.
  - Native support for persistent environment variables (`LI_AT_COOKIE`, `LI_JSESSIONID`).
  - Automatic HTTPS and continuous deployment from GitHub.
  - Generous free/low-cost tiers sufficient for take-home assignment demonstration.
- **Serverless (Vercel / Netlify / AWS Lambda)**:
  - Fully compatible since execution times for direct Voyager HTTP requests are ~150–350ms (well under serverless timeouts).
  - Note: Serverless environments may spin up fresh container instances across different edge IPs; hosting on a fixed container (Render/Railway) reduces IP volatility against LinkedIn's session cookie.

- **Containerization**: Multi-stage `Dockerfile` producing a lean Node 22 slim image (<120MB).
- **Environment Isolation**: All configuration passed via strict environment variables. `.env` is git-ignored, and `.env.example` provides placeholder documentation.

---

## 6. Target Output Schema

The API normalizes LinkedIn Voyager payload into a clean, intuitive, and strongly typed JSON structure:

```json
{
  "success": true,
  "data": {
    "vanity_name": "williamhgates",
    "full_name": "Bill Gates",
    "first_name": "Bill",
    "last_name": "Gates",
    "headline": "Co-chair, Bill & Melinda Gates Foundation",
    "location": "Seattle, Washington, United States",
    "about": "Co-chair of the Bill & Melinda Gates Foundation...",
    "profile_picture_url": "https://media.licdn.com/dms/image/...",
    "background_image_url": "https://media.licdn.com/dms/image/...",
    "experience": [
      {
        "title": "Co-chair",
        "company_name": "Bill & Melinda Gates Foundation",
        "location": "Seattle, WA",
        "starts_at": "2000-01-01",
        "ends_at": null,
        "is_current": true,
        "description": "..."
      }
    ],
    "education": [
      {
        "school_name": "Harvard University",
        "degree_name": "Doctor of Laws",
        "field_of_study": "Honorary",
        "starts_at": "1973",
        "ends_at": "1975"
      }
    ],
    "skills": ["Software Development", "Philanthropy", "Global Health"],
    "certifications": [],
    "languages": ["English"]
  },
  "meta": {
    "cached": false,
    "fetched_at": "2026-08-27T12:00:00.000Z",
    "daily_requests_remaining": 19,
    "execution_time_ms": 284
  }
}
```
