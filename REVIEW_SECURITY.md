# Security Review

Defect-first security review of the RBAC Next.js + Express platform and the FastAPI reports service. Findings below are grounded in inspected code paths for auth, sessions, RBAC, password flows, and GraphQL reporting. Issues are ordered roughly by severity; each should be treated as actionable work, not general advice.

## Findings

### 1. Reports GraphQL accepts any signed JWT without session or RBAC checks
- **GitHub issue:** [#2](https://github.com/luizerico/baseapp/issues/2)
- **Severity:** Critical
- **Location:** `reports/app/auth.py`, `reports/app/schema/queries.py`, `client/app/(app)/admin/reports/page.tsx`, `client/lib/reportsGraphql.ts`
- **Why it matters:** `decode_token` only verifies JWT signature/claims. It does not look up `sid` in Mongo sessions, check revocation, or enforce admin/`LOG:READ`/`USER:READ` permissions. Any logged-in user who can obtain a bearer token (including by visiting `/admin/reports`, which has no client `isAdmin` gate) can query platform-wide overview, action-log aggregates, user activity, and survey analytics. Logout/session disconnect on the main API does not invalidate reports access until JWT expiry (`JWT_EXPIRE` defaults to `7d` in `.env.example`).
- **Recommended fix:** Validate sessions the same way as Express `protect` (session id + token hash + not revoked), then authorize with RBAC (e.g. admin group or `LOG:READ`). Fail closed when `require_auth` is true. Gate the admin reports page on `isAdmin` and keep authorization on the server.

### 2. Survey response listing is effectively an IDOR under `allowAnyInstance`
- **GitHub issue:** [#3](https://github.com/luizerico/baseapp/issues/3)
- **Severity:** High
- **Location:** `api/routes/surveyRoutes.js` (`GET /:id/responses`), `api/controllers/surveyController.js` (`listSurveyResponses`)
- **Why it matters:** The route authorizes `SURVEY_RESPONSE:READ` with `{ allowAnyInstance: true }` and the controller then loads **all** responses for the requested survey id without filtering to granted `resourceId`s or requiring `SURVEY:READ` on that survey. A principal with READ on a single response object can read every respondent’s answers for any survey they can address by id.
- **Recommended fix:** Require instance-scoped access (or class-wide `*`) for the responses being returned; ideally also require `SURVEY:READ` on `:id`. Mirror the survey list pattern with `attachAccessible` and filter `SurveyResponse` by accessible ids (and/or by survey ownership rules).

### 3. Password-reset flow enumerates users and stores usable tokens insecurely
- **GitHub issue:** [#4](https://github.com/luizerico/baseapp/issues/4)
- **Severity:** High
- **Location:** `api/controllers/authController.js` (`requestPasswordReset`, `resetPassword`), `api/routes/authRoutes.js`, `api/models/User.js`
- **Why it matters:** Unknown emails return `404` while known emails succeed (account enumeration). The endpoint is `GET` with the email in the query string (cache/proxy/log leakage). Reset tokens are stored plaintext on the user document, last for three days, and are returned in the JSON body when `NODE_ENV !== 'production'`. There is no rate limit.
- **Recommended fix:** Always return a generic 200; switch to `POST`; store only a hash of the token; shorten TTL (minutes/hours); never return the token in API responses; rate-limit by IP/email; send mail through a real provider abstraction.

### 4. Session bearer tokens live in `localStorage`
- **GitHub issue:** [#5](https://github.com/luizerico/baseapp/issues/5)
- **Severity:** High
- **Location:** `client/lib/apiUtils.ts`, `client/lib/reportsGraphql.ts`, `client/app/(auth)/login/page.tsx`, `client/components/AuthGate.tsx`
- **Why it matters:** Any XSS in the Next app (or a dependency) can steal `authToken` and call `/api/*` and the reports GraphQL service as the victim until session revoke or JWT expiry.
- **Recommended fix:** Prefer httpOnly, Secure, SameSite cookies issued by the API (or BFF), keep CSRF protections for cookie auth, and stop persisting JWTs in `localStorage`/`sessionStorage` fingerprints that embed token material.

### 5. Mass assignment on user and group updates
- **GitHub issue:** [#6](https://github.com/luizerico/baseapp/issues/6)
- **Severity:** High
- **Location:** `api/controllers/userController.js` (`updateUser`), `api/controllers/groupController.js` (`updateGroup`)
- **Why it matters:** `updateUser` spreads `req.body` after only deleting `password` / `resetToken` / `tokenExpiry`, so callers can set `roleId` (admin group membership) and `isVerified`. `updateGroup` passes entire `req.body` into `findByIdAndUpdate`, allowing direct overwrite of `members` and bypassing membership endpoints/auditing. Combined with identity checks that collapse to “admin group member,” this is a dangerous footgun and expands blast radius of any future non-admin grant mistake.
- **Recommended fix:** Whitelist fields (`username`, `email`, `description`, `name` only). Keep membership and role changes on dedicated endpoints with explicit checks and action logs.

### 6. No rate limiting or baseline HTTP security middleware on the API
- **GitHub issue:** [#7](https://github.com/luizerico/baseapp/issues/7)
- **Severity:** High
- **Location:** `api/app.js`, `api/routes/authRoutes.js`
- **Why it matters:** Login, register, and forgot-password are unauthenticated and unlimited. Combined with user enumeration and long-lived JWTs, this enables credential stuffing and reset spam. `express.json()` has no size limit; there is no Helmet (or equivalent) for common headers.
- **Recommended fix:** Add `express-rate-limit` (stricter on `/api/auth/*`), set a JSON body limit, and enable Helmet / sensible security headers on the unified server.

### 7. Controllers leak internal exception messages to clients
- **GitHub issue:** [#8](https://github.com/luizerico/baseapp/issues/8)
- **Severity:** Medium
- **Location:** Controllers under `api/controllers/` (e.g. `surveyController.js`, `userController.js`, `permissionController.js`, `groupMembershipController.js`, `actionLogController.js`)
- **Why it matters:** Responses include `error: error.message`, which can expose Mongo/driver details, path fragments, or validation internals useful to attackers and noisy for clients.
- **Recommended fix:** Centralize error handling: log server-side, return stable `message` + `code` only. Reserve detail fields for non-production if absolutely needed.

### 8. Client access cache can retain elevated grants for five minutes
- **GitHub issue:** [#9](https://github.com/luizerico/baseapp/issues/9)
- **Severity:** Medium
- **Location:** `client/lib/accessCache.ts`, `client/components/AccessProvider.tsx`, `client/components/AuthGate.tsx`
- **Why it matters:** UI authorization (`can` / `isAdmin`) is cached in `sessionStorage` for `ACCESS_CACHE_TTL_MS` (5 minutes) keyed by a token fingerprint. After an admin removes permissions, the UI may still show admin links and enable actions until refetch; the API remains the real gate, but this increases confused-deputy UX and accidental privileged clicks.
- **Recommended fix:** Shorten TTL, invalidate cache on focus/visibility, and force `ensure({ force: true })` when opening admin routes. Never treat client `can` as security.

### 9. Registration and admin user creation skip password policy
- **GitHub issue:** [#10](https://github.com/luizerico/baseapp/issues/10)
- **Severity:** Medium
- **Location:** `api/controllers/authController.js` (`registerUser`), `api/controllers/userController.js` (`createUser`), `api/controllers/authController.js` (`resetPassword`)
- **Why it matters:** `changeOwnPassword` / `adminChangeUserPassword` require length ≥ 8, but register, admin create, and reset accept any non-empty password. Weak passwords undermine bcrypt hashing and session security.
- **Recommended fix:** Share one password validator (length, complexity as required by policy) across register, create, reset, and change flows.

### 10. `isVerified` is never enforced at login
- **GitHub issue:** [#11](https://github.com/luizerico/baseapp/issues/11)
- **Severity:** Low
- **Location:** `api/models/User.js`, `api/controllers/authController.js` (`loginUser`), `api/services/adminBootstrap.js`
- **Why it matters:** The field is seeded/displayed but login does not require verification. Operators may believe unverified users are blocked when they are not.
- **Recommended fix:** Either enforce `isVerified` (and document the flow) or remove the field until email verification exists.

### 11. Asset POST briefly skips authorization for survey kinds
- **GitHub issue:** [#12](https://github.com/luizerico/baseapp/issues/12)
- **Severity:** Low
- **Location:** `api/routes/assetRoutes.js` (POST `/` middleware), `api/controllers/assetController.js` (`createAsset`)
- **Why it matters:** For `SURVEY` / `SURVEY_RESPONSE`, the route calls `next()` without a CREATE check; `createAsset` then returns 400. Today this is not exploitable for creation, but it is a defense-in-depth hazard if the controller changes.
- **Recommended fix:** Reject survey kinds in the route middleware with 400 before `next()`, or always run a CREATE authorization check.
