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
