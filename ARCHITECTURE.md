# Architecture & Technical Design Document

**Project**: LinkSight &mdash; Hosted LinkedIn Profile Structured Data API  
**Status**: Proposed (Phase 0)  
**Author**: Engineering Pair

---

## 1. Scraping & Data Ingestion Approach

We evaluated two potential approaches for extracting public LinkedIn profile data given LinkedIn's lack of an open public profile API:

| Dimension | Option A: Direct HTTP (Voyager API) **[RECOMMENDED PRIMARY]** | Option B: Headless Browser (Playwright / Chromium) **[DOCUMENTED FALLBACK]** |
| :--- | :--- | :--- |
| **Mechanism** | Sends direct HTTPS calls to LinkedIn internal Voyager endpoints (`/voyager/api/identity/dash/profiles` or `/voyager/api/identity/profiles/{vanity}`) with `li_at` and `csrf-token: {JSESSIONID}` headers. | Spins up headless Chromium, injects `li_at` & `JSESSIONID` into browser storage/cookies, navigates to `https://linkedin.com/in/{vanity}`, and parses DOM. |
| **Footprint & Speed** | **Extremely lightweight (~100–300ms)**. Single JSON request/response cycle. Zero DOM rendering or image downloading. | **Heavy (~3–8s per profile)**. High CPU and memory overhead (~300MB–1GB RAM per Chromium instance). |
| **Data Fidelity** | **Structured JSON natively returned by LinkedIn**. Exact typed strings for experience, education, skills, certifications, and high-resolution image artifact URLs. | Relies on brittle CSS selectors/XPath that break whenever LinkedIn updates frontend classes or DOM structures. |
| **Detection Profile** | Mimics standard LinkedIn web SPA data fetching. Very low request volume footprint (1 request per profile). | Browser fingerprinting risks (WebDriver flags, canvas/WebGL fingerprinting, aggressive client-side bot detection scripts). |
| **Hosting Requirements** | Runs anywhere (Render, Railway, Fly.io, standard small container or VPS) on minimal resources (128MB–256MB RAM). | Requires large Docker images with Chromium dependencies, fonts, and substantial RAM/CPU allocation. Incompatible with standard lightweight hosting. |

### Decision
- **Primary Approach**: **Direct HTTP to LinkedIn Voyager API** using `undici` / `axios` with browser-accurate HTTP headers.
- **Fallback Strategy**: Headless Playwright automation architecture documented in `README.md` as an alternative if LinkedIn rotates internal Voyager endpoint signatures.

---

## 2. Runtime & Web Framework

- **Runtime**: **Node.js (v20+ / v24) with TypeScript**
- **Web Framework**: **Fastify**
  - High performance, low overhead, native JSON schema validation, and first-class async request lifecycle support.
  - Automatic OpenAPI / Swagger generation via `@fastify/swagger` and `@fastify/swagger-ui` for seamless interactive reviewer testing at `/docs`.
  - Strict input/output validation with JSON Schema / TypeBox / Zod.

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

- **Target Platforms**: **Render / Railway / Fly.io / Docker**.
- **Containerization**: Multi-stage `Dockerfile` producing a lean, production-ready Alpine/Debian Node image (~120MB).
- **Environment Isolation**: All configuration passed via strict environment variables validated at startup. `.env` is ignored via `.gitignore`, and a clean `.env.example` is provided for reviewers.

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
