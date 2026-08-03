# Improvements Review

Practical improvement opportunities across the unified Next.js + Express RBAC app and reports service. These are concrete enhancements that reduce risk, operational cost, or inconsistency—not vague “clean up the code” notes.

## Findings

### 1. Add rate limiting and security headers at the Express edge
- **GitHub issue:** [#13](https://github.com/luizerico/baseapp/issues/13)
- **Severity:** High
- **Location:** `api/app.js`, `server.js`, `api/routes/authRoutes.js`
- **Why it matters:** Auth and mutation endpoints are unprotected against brute force and payload abuse; the app also lacks common security headers.
- **Recommended fix:** Mount `helmet`, a global JSON body size limit, and stricter `express-rate-limit` on `/api/auth/login`, `/register`, and `/forgot-password` (and a milder global API limit).

### 2. Align reports auth with Express session validation
- **GitHub issue:** [#14](https://github.com/luizerico/baseapp/issues/14)
- **Status:** Fixed — fix/issue-14 @ b252220
- **Severity:** High
- **Location:** `reports/app/auth.py`, `api/services/sessionService.js`, `api/middleware/authMiddleware.js`
- **Why it matters:** Reports and the main API share `JWT_SECRET` but not session semantics, so security posture diverges and logout does not mean logout everywhere.
- **Recommended fix:** Have reports read the `sessions` collection (or call `/api/auth/validate`) and apply the same revoke/expiry/hash checks before serving GraphQL fields. Add RBAC for report fields.

### 3. Scope survey-response APIs the same way as survey lists
- **GitHub issue:** [#15](https://github.com/luizerico/baseapp/issues/15)
- **Status:** Closed as superseded by #3 — fix/issue-3 @ bff95e4
- **Severity:** High
- **Location:** `api/routes/surveyRoutes.js`, `api/controllers/surveyController.js`
- **Why it matters:** Survey listing uses `attachAccessible`; response listing does not. Behavior is inconsistent and over-broad.
- **Recommended fix:** Reuse `listAccessibleResources` / `attachAccessible` for `SURVEY_RESPONSE` and filter by survey id + granted ids. Add regression tests for cross-survey access denial.

### 4. Throttle `touchSession` writes on every authenticated request
- **GitHub issue:** [#16](https://github.com/luizerico/baseapp/issues/16)
- **Status:** Fixed — fix/issue-16 @ b01c062
- **Severity:** Medium
- **Location:** `api/middleware/authMiddleware.js`, `api/services/sessionService.js`
- **Why it matters:** Each protected request does `session.save()` to update `lastSeenAt`, amplifying Mongo write load under polling UIs (admin logs, reports refresh, navigation).
- **Recommended fix:** Update `lastSeenAt` only if older than N seconds (e.g. 60s), or use `updateOne` with a time predicate.

### 5. Introduce a shared password policy helper
- **GitHub issue:** [#17](https://github.com/luizerico/baseapp/issues/17)
- **Status:** Fixed — fix/issue-17 @ 6eb9dc6
- **Severity:** Medium
- **Location:** `api/controllers/authController.js`, `api/controllers/userController.js`
- **Why it matters:** Password rules differ by endpoint (8+ chars only on change/admin change; none on register/create/reset).
- **Recommended fix:** One `assertPasswordPolicy(password)` used by register, create, reset, and change; document it in OpenAPI.

### 6. Prefer cookie-based session delivery for the browser app
- **GitHub issue:** [#18](https://github.com/luizerico/baseapp/issues/18)
- **Status:** Fixed — fix/issue-18 @ 359456c
- **Severity:** Medium
- **Location:** `client/lib/apiUtils.ts`, `client/app/(auth)/login/page.tsx`, `api/controllers/authController.js`
- **Why it matters:** Bearer-in-`localStorage` maximizes XSS impact and forces every client helper to reimplement auth headers (`apiUtils`, `reportsGraphql`).
- **Recommended fix:** Set httpOnly session cookie on login; use `credentials: 'include'` for same-origin `/api`; keep bearer only for non-browser clients if needed.

### 7. Centralize API error responses
- **GitHub issue:** [#19](https://github.com/luizerico/baseapp/issues/19)
- **Status:** Closed as covered by #8+#29 — fix/issue-8 @ 8ae9cd8 / fix/issue-29 @ 6f74365
- **Severity:** Medium
- **Location:** `api/app.js`, controllers under `api/controllers/`
- **Why it matters:** Hand-rolled `res.status(500).json({ message, error: error.message })` is duplicated and leaks internals.
- **Recommended fix:** Throw typed errors or use a single `sendError(res, status, code, message)` helper; let the Express error middleware format responses.

### 8. Add client-side admin route guards (defense in depth)
- **GitHub issue:** [#20](https://github.com/luizerico/baseapp/issues/20)
- **Status:** Fixed — fix/issue-20 @ a9ea16f
- **Severity:** Medium
- **Location:** `client/app/(app)/admin/**`, `client/components/AuthGate.tsx`, `client/components/AppNav.tsx`
- **Why it matters:** Nav hides admin links via `isAdmin`, but pages like `admin/reports/page.tsx` load data for any authenticated visitor who knows the URL.
- **Recommended fix:** Shared `AdminGate` that redirects non-admins after `ensure()`, while keeping server-side authorization as the real control.

### 9. Extract shared list-query parsing
- **GitHub issue:** [#21](https://github.com/luizerico/baseapp/issues/21)
- **Status:** Fixed — fix/issue-21 @ 7fa74ff
- **Severity:** Low
- **Location:** `api/controllers/surveyController.js` (`parseListQuery`), `api/services/actionLogService.js` (`queryActionLogs`)
- **Why it matters:** Page/limit/sort/order parsing is copy-pasted with slight differences, inviting inconsistent caps and bugs.
- **Recommended fix:** Small `parsePaginationQuery(query, { sortableFields, defaultSort })` utility used by surveys, logs, and future list endpoints.

### 10. Close the dead auth path on asset create
- **GitHub issue:** [#22](https://github.com/luizerico/baseapp/issues/22)
- **Status:** Fixed — fix/issue-22 @ 023a453
- **Severity:** Low
- **Location:** `api/routes/assetRoutes.js`
- **Why it matters:** Survey kinds skip CREATE checks then fail in the controller—easy to misread during future edits.
- **Recommended fix:** Return 400 in the route for survey kinds (or always authorize) so middleware intent is obvious.
