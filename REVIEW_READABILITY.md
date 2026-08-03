# Readability Review

Findings focused on how hard the current code is to understand, reason about, and navigate. Locations point at the largest clarity problems found during inspection.

## Findings

### 1. `rbacService.js` mixes ACL core with presentation/catalog concerns
- **GitHub issue:** [#23](https://github.com/luizerico/baseapp/issues/23)
- **Severity:** High
- **Location:** `api/services/rbacService.js` (~670 lines)
- **Why it matters:** Permission evaluation (`userHasPermission`, `collectGrantedActions`) sits beside survey-response label builders, owner maps, catalog DTOs, and index migration. Readers cannot find the security-critical path quickly, and UI formatting changes risk touching authorization logic.
- **Recommended fix:** Split into modules such as `rbacEvaluate.js`, `rbacAclWrite.js`, `rbacCatalog.js`, and `permissionMigrate.js` with a thin `rbacService` re-export if needed.

### 2. `PermissionModal.tsx` is a monolith UI + data layer
- **GitHub issue:** [#24](https://github.com/luizerico/baseapp/issues/24)
- **Severity:** High
- **Location:** `client/components/ui/PermissionModal.tsx` (~700 lines)
- **Why it matters:** Catalog loading, ACL fetch, principal selection, scope toggles, locking rules, and Apply payload assembly live in one component, making review and targeted tests difficult.
- **Recommended fix:** Extract hooks (`usePermissionCatalog`, `useAssetAclEditor`) and presentational subcomponents (object picker, principal list, scope checkboxes).

### 3. Identity `authorize('USER:…')` signatures are misleading
- **GitHub issue:** [#25](https://github.com/luizerico/baseapp/issues/25)
- **Severity:** High
- **Location:** `api/constants/rbac.js` (`parsePermissionString`), `api/services/rbacService.js` (`userHasPermission`), `api/routes/userRoutes.js`, `api/routes/groupRoutes.js`
- **Why it matters:** Routes look instance-scoped (`authorize('USER:WRITE', { param: 'id' })`), but identity permissions ignore `resourceId` and only check admin-group membership. New contributors will assume fine-grained user ACL exists.
- **Recommended fix:** Introduce explicit middleware `requireAdminGroup()` (or `authorizeIdentity('USER')`) and stop using asset-style `param` options for identity routes. Document the model in one short comment near route mounts.

### 4. Asset create middleware has a confusing “authorize by falling through” path
- **GitHub issue:** [#26](https://github.com/luizerico/baseapp/issues/26)
- **Severity:** Medium
- **Location:** `api/routes/assetRoutes.js` (POST `/`)
- **Why it matters:** `SURVEY` / `SURVEY_RESPONSE` call `next()` without a permission check, relying on a later 400 in `createAsset`. The control flow reads as an auth bypass.
- **Recommended fix:** Handle survey kinds with an early `return res.status(400)…` so the happy path is only “check CREATE → createAsset”.

### 5. Client and server duplicate RBAC evaluation rules
- **GitHub issue:** [#27](https://github.com/luizerico/baseapp/issues/27)
- **Severity:** Medium
- **Location:** `client/lib/access.ts`, `api/services/rbacService.js`, `api/constants/rbac.js`
- **Why it matters:** `isClassWide`, `allowAnyInstance`, `classWideOnly`, and `WRITE` implying `CREATE` are duplicated. Drift will produce UI that claims access the API denies (or the reverse).
- **Recommended fix:** Share a small pure module (package or generated constants) for parsing and grant evaluation; keep Mongo loading server-only.

### 6. Duplicated `requestMeta` helpers
- **GitHub issue:** [#28](https://github.com/luizerico/baseapp/issues/28)
- **Severity:** Medium
- **Location:** `api/controllers/authController.js`, `api/middleware/actionLogMiddleware.js`
- **Why it matters:** Same IP/UA/`x-client-app` extraction in two places invites inconsistent logging vs session fields.
- **Recommended fix:** One `api/utils/requestMeta.js` imported by auth and action-log middleware.

### 7. Inconsistent API error JSON shapes
- **GitHub issue:** [#29](https://github.com/luizerico/baseapp/issues/29)
- **Severity:** Medium
- **Location:** Across `api/controllers/*` vs `api/middleware/authMiddleware.js` (`authError`)
- **Why it matters:** Some errors use `{ message, code }`, others `{ message, error }`, some add `hint`/`username`. Clients (`apiUtils.parseError`) special-case a subset, which obscures which fields are stable.
- **Recommended fix:** Standardize on `{ message, code, details? }` and update the client parser once.

### 8. `roleId` naming vs group membership model
- **GitHub issue:** [#30](https://github.com/luizerico/baseapp/issues/30)
- **Severity:** Medium
- **Location:** `api/models/User.js`, `api/services/rbacService.js` (`getUserGroupIds`), `client/lib/access.ts`
- **Why it matters:** `roleId` is an ObjectId ref to `Group`, while users also appear in `Group.members`. Comments still say “default role group.” Readers must discover that both paths grant permissions.
- **Recommended fix:** Rename (migration) to `primaryGroupId` or document clearly; align UI copy with “groups,” not “roles,” unless roles become first-class.

### 9. Large inline GraphQL document in the client helper
- **GitHub issue:** [#31](https://github.com/luizerico/baseapp/issues/31)
- **Severity:** Low
- **Location:** `client/lib/reportsGraphql.ts` (`SAMPLE_REPORTS_QUERY`)
- **Why it matters:** A long query string dominates the module and hides the fetch/error-handling logic.
- **Recommended fix:** Move operations to `client/lib/reports/queries.ts` (or `.graphql` files) and keep the helper focused on transport.

### 10. Leftover structural comments in models
- **GitHub issue:** [#32](https://github.com/luizerico/baseapp/issues/32)
- **Severity:** Low
- **Location:** `api/models/User.js` (`// --- 1. User Model ---`)
- **Why it matters:** Numbered section headers imply a multi-model file that no longer exists, adding noise.
- **Recommended fix:** Remove obsolete banners; keep only comments that explain non-obvious invariants (e.g. password hashing responsibility).
