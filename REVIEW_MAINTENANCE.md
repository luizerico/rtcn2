# Maintenance Review

Findings that increase long-term cost: dual code paths, dead fields, missing tests, and cleanup gaps that will bite the next feature.

## Findings

### 1. Two overlapping permission-write APIs
- **GitHub issue:** [#33](https://github.com/luizerico/baseapp/issues/33)
- **Status:** Fixed — fix/issue-33 @ 78bbd4a
- **Severity:** High
- **Location:** `api/controllers/groupMembershipController.js` (`updateGroupPermissions` → `replaceGroupClassPermissions`), `api/controllers/permissionController.js` (`applyAssetAcl` → `replaceAssetAcl`), `client/components/ui/PermissionModal.tsx`
- **Why it matters:** Group-scoped “replace all grants for this resource type” and Windows-style asset ACL apply both mutate `Permission` documents with different delete scopes. Operators and future code can wipe instance grants unintentionally when using the group endpoint (`deleteMany` on group+resourceType in `replaceGroupClassPermissions`).
- **Recommended fix:** Pick one write model as canonical (prefer asset ACL apply), deprecate or narrow the group permissions POST, and document delete semantics in OpenAPI.

### 2. Legacy principal queries remain on every authorization hot path
- **GitHub issue:** [#34](https://github.com/luizerico/baseapp/issues/34)
- **Status:** Fixed — fix/issue-34 @ 9884b7b
- **Severity:** High
- **Location:** `api/services/rbacService.js` (`principalQueryForUser`, `listGroupPermissions`, `migratePermissionPrincipals`), `api/models/Permission.js`
- **Why it matters:** Every permission load still `$or`s legacy `groupId` rows without `principalType`. Migration exists but hot-path complexity and index behavior stay forever until legacy support is dropped.
- **Recommended fix:** Run migration in deploy/init, backfill, then remove legacy clauses and the deprecated `groupId` field in a versioned cleanup.

### 3. Deleting groups does not clean related permissions
- **GitHub issue:** [#35](https://github.com/luizerico/baseapp/issues/35)
- **Status:** Fixed — fix/issue-35 @ fdf8cff
- **Severity:** High
- **Location:** `api/controllers/groupController.js` (`deleteGroup`), `api/models/Permission.js`
- **Why it matters:** `findByIdAndDelete` removes the group document only. Orphaned GROUP principal permissions remain, and `roleId` references on users are not cleared. Behavior becomes hard to reason about and audit.
- **Recommended fix:** Transactional delete: remove permissions for that principal, pull members if needed, null out `user.roleId` references, then delete the group. Add an API/integration test.

### 4. Missing automated coverage for high-risk authz paths
- **GitHub issue:** [#36](https://github.com/luizerico/baseapp/issues/36)
- **Status:** Fixed — fix/issue-36 @ 1612841
- **Severity:** High
- **Location:** `__tests__/api.rbac.test.js`, `__tests__/api.endpoints.test.js` (no reports tests; weak response scoping)
- **Why it matters:** Tests cover broad survey-group grants and forgot-password happy paths, but not: cross-survey response IDOR under instance grants, mass assignment of `roleId`/`members`, or reports GraphQL session/RBAC behavior.
- **Recommended fix:** Add focused Jest cases for response scoping and update whitelists; add pytest (or HTTP) tests for reports auth revoke and forbidden non-admin access.

### 5. `isVerified` is dead weight in the domain model
- **GitHub issue:** [#37](https://github.com/luizerico/baseapp/issues/37)
- **Status:** Fixed — fix/issue-37 @ e2e7568
- **Severity:** Medium
- **Location:** `api/models/User.js`, `api/controllers/authController.js`, `client/app/(app)/admin/users/page.tsx`
- **Why it matters:** Displayed in admin UI and returned from `/auth/me`, but never enforced. Future contributors may build features on a false invariant.
- **Recommended fix:** Implement verification end-to-end or remove the field from schema, API, and UI in one change.

### 6. No shared request-validation layer
- **GitHub issue:** [#38](https://github.com/luizerico/baseapp/issues/38)
- **Status:** Fixed — fix/issue-38 @ cf0cb16
- **Severity:** Medium
- **Location:** Controllers under `api/controllers/` (ad-hoc `if (!name)` checks)
- **Why it matters:** Validation rules are scattered; OpenAPI (`docs/openapi.yaml`) can drift from runtime behavior (password length, ACL payloads, pagination caps).
- **Recommended fix:** Introduce Zod/Joi (or similar) schemas per route family and optionally generate/validate against OpenAPI in CI.

### 7. Password reset depends on a mock email logger
- **GitHub issue:** [#39](https://github.com/luizerico/baseapp/issues/39)
- **Status:** Fixed — fix/issue-39 @ fc20222
- **Severity:** Medium
- **Location:** `api/controllers/authController.js` (`mockSendEmail`)
- **Why it matters:** Production readiness is blocked by a `console.log` “email” path; tests encode returning `resetToken` in non-production responses, which trains insecure habits.
- **Recommended fix:** Define a `mailer` interface (console adapter for dev, SMTP/provider for prod); stop returning tokens in HTTP; update tests to read the token from the mailer fake.

### 8. Example config encourages week-long JWTs
- **GitHub issue:** [#40](https://github.com/luizerico/baseapp/issues/40)
- **Status:** Fixed — fix/issue-40 @ 7a7ba0f
- **Severity:** Medium
- **Location:** `.env.example`, `README.md`, `api/services/sessionService.js`
- **Why it matters:** `JWT_EXPIRE=7d` coupled with reports JWT-only auth widens the stolen-token window. Defaults shape how operators deploy.
- **Recommended fix:** Default examples to short access lifetime (e.g. `1h` or less) and document refresh/session revoke behavior; keep long TTL only behind an explicit comment.

### 9. Reports service sits outside the main Jest verification loop
- **GitHub issue:** [#41](https://github.com/luizerico/baseapp/issues/41)
- **Status:** Fixed — fix/issue-41 @ 3bee594
- **Severity:** Medium
- **Location:** `reports/`, root `package.json` (`npm test`), `.cursor/skills/verify-app`
- **Why it matters:** Auth and schema regressions in FastAPI will not fail the primary `npm test` gate used for the platform.
- **Recommended fix:** Add a `reports` test script (pytest) and wire it into CI / `verify-app` skill steps beside Jest.

### 10. Access-cache fingerprint embeds token fragments
- **GitHub issue:** [#42](https://github.com/luizerico/baseapp/issues/42)
- **Status:** Fixed — fix/issue-42 @ a337a95
- **Severity:** Low
- **Location:** `client/lib/accessCache.ts` (`tokenFingerprint`)
- **Why it matters:** Storing `token.slice(0, 12)` and last 8 chars in `sessionStorage` increases residual secret material and couples cache invalidation to token shape.
- **Recommended fix:** Fingerprint `sessionId` (already stored) or a hash of the token, not raw substrings.
