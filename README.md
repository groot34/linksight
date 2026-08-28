# LinkSight 🔍

> **Hosted LinkedIn Profile Structured Data API**  
> Extracts structured public LinkedIn profile data with manual session authentication, strict safety throttling, hard daily quotas, and persistent caching.

---

## 🔒 Authentication & Manual Cookie Extraction

### Zero Automated Login Policy
To safeguard accounts and eliminate credential leakage, **LinkSight intentionally contains zero automated login code**. It will never ask for, store, or submit email/password credentials.

Instead, authentication operates via **session injection** using your browser's existing session cookies (`li_at` and `JSESSIONID`).

---

### How to Retrieve `li_at` and `JSESSIONID` (Step-by-Step)

1. Open your regular browser (Chrome, Brave, Edge, Firefox, or Safari) where you are already logged into [linkedin.com](https://www.linkedin.com).
2. Open **Developer Tools**:
   - **Windows / Linux**: Press <kbd>F12</kbd> or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd>
   - **macOS**: Press <kbd>Cmd</kbd> + <kbd>Option</kbd> + <kbd>I</kbd>
3. In DevTools, click on the **Application** tab (or **Storage** in Firefox).
4. In the left sidebar, expand **Cookies** and select `https://www.linkedin.com`.
5. Locate the following two cookies and copy their **Value**:
   - **`li_at`**: The main LinkedIn authentication session token.
   - **`JSESSIONID`**: The session CSRF token (often formatted like `ajax:1234567890`).
6. Paste these into your `.env` file:
   ```env
   LI_AT_COOKIE=AQEDAT...your_copied_li_at_value_here...
   LI_JSESSIONID=ajax:your_copied_jsessionid_value_here
   ```
7. Restart the server.

> [!NOTE]
> **When Cookies Expire**: LinkedIn cookies typically remain valid for several weeks to months. If your cookie expires, the API returns a structured `401 Unauthorized` with a clear message. Simply repeat the 1-minute step above to update your `.env` file. The server will **never** trigger an automated retry loop.

---

## 🛡️ Rate Limiting & Safety Guardrails

To protect accounts during demonstrations, LinkSight strictly enforces safety guardrails directly at the outbound request layer:

1. **Idempotent In-Memory Caching (24h TTL)**:
   - Repeated requests for the same profile URL return instantly from memory with `meta.cached: true` without dispatching live requests to LinkedIn.
2. **Outbound Inter-Request Mutex Throttler**:
   - Live requests are queued and throttled with a mandatory **5–10 second cooldown delay** plus randomized jitter.
3. **Randomized Delay / Jitter**:
   - Adds randomized intervals (750ms–3250ms) between outbound requests to avoid uniform machine timing patterns.
   > [!NOTE]
   > **Bot-Detection Notice**: Randomized timing and request throttling are best-effort mitigations to reduce automated footprint; they do not provide an absolute guarantee against detection or rate limiting.
4. **Hard Daily Request Cap**:
   - Enforced in code via `DAILY_REQUEST_CAP` (default: 20/day). If the cap is reached, further live requests return `429 Too Many Requests` until the quota resets at midnight UTC.

---

## 🔑 Access Control (API Key)

LinkSight supports simple API key access control to prevent the deployed API from being freely spammed across the public internet:

- To enable, set `API_KEY=your_secret_key` in `.env`.
- Clients include the header: `x-api-key: your_secret_key`.
- If `API_KEY` is empty or unset in `.env`, the API runs in open mode (recommended for local development).

> [!NOTE]
> **Access Control Note**: This API key header is provided as basic abuse and exposure control for deployment demonstrations, not an enterprise authentication or security guarantee.

---

## 📡 API Endpoints & Usage

### 1. Extract Profile Data
`POST /api/profile`

**Request Headers**:
```http
Content-Type: application/json
x-api-key: your_secret_api_key (optional if configured)
```

**Request Body**:
```json
{
  "profileUrl": "https://www.linkedin.com/in/williamhgates",
  "skipCache": false
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -H "x-api-key: your_secret_api_key" \
  -d '{"profileUrl": "https://www.linkedin.com/in/williamhgates"}'
```

**Response (`200 OK`)**:
```json
{
  "success": true,
  "data": {
    "profileUrl": "https://www.linkedin.com/in/williamhgates",
    "name": "Bill Gates",
    "headline": "Co-chair, Bill & Melinda Gates Foundation",
    "location": "Seattle, Washington, United States",
    "about": "Co-chair of the Bill & Melinda Gates Foundation...",
    "profileImageUrl": "https://media.licdn.com/dms/image/...",
    "bannerImageUrl": "https://media.licdn.com/dms/image/...",
    "experience": [
      {
        "title": "Co-chair",
        "company": "Bill & Melinda Gates Foundation",
        "location": "Seattle, WA",
        "startDate": "2000-01",
        "endDate": null,
        "description": "..."
      }
    ],
    "education": [
      {
        "school": "Harvard University",
        "degree": "Doctor of Laws",
        "field": "Honorary",
        "startDate": "1973",
        "endDate": "1975"
      }
    ],
    "skills": ["Software Development", "Philanthropy", "Global Health"],
    "certifications": [
      {
        "name": "Certified Humanitarian",
        "issuer": "Global Trust",
        "issueDate": "2010"
      }
    ],
    "languages": [
      {
        "language": "English",
        "proficiency": "Native or bilingual"
      }
    ],
    "scrapedAt": "2026-08-27T17:00:00.000Z"
  },
  "meta": {
    "cached": false,
    "fetched_at": "2026-08-27T17:00:00.000Z",
    "execution_time_ms": 284,
    "daily_requests_remaining": 19
  }
}
```

### 2. HTTP Status Code Mapping
| Status Code | Meaning | Example Scenario |
| :--- | :--- | :--- |
| **`200 OK`** | Success | Structured JSON profile data returned (cached or live). |
| **`400 Bad Request`** | Invalid input | Malformed or non-LinkedIn profile URL. |
| **`401 Unauthorized`** | Auth issue | `LI_AT_COOKIE` expired or invalid `x-api-key`. |
| **`404 Not Found`** | Profile missing | LinkedIn vanity slug does not exist or is private. |
| **`429 Too Many Requests`** | Rate limited | Server rate limit or daily request cap (`20/day`) reached. |
| **`502 Bad Gateway`** | Upstream failure | LinkedIn network drop or unexpected internal response. |

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env and paste your LI_AT_COOKIE and LI_JSESSIONID
```

### 3. Run Locally
```bash
# Start development server with auto-reload
npm run dev
```

- **Interactive API Docs (Swagger UI)**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **Health Check & Quota Status**: [http://localhost:3000/health](http://localhost:3000/health)

---

## 🧪 Running Tests
```bash
npm test
```
