---
name: rbac-api-endpoint
description: >-
  Add or change Express API endpoints with JWT protect and RBAC authorize checks.
  Use when creating routes, controllers, models, permissions, or updating OpenAPI
  for USER/GROUP/OBJECT resources.
---

# RBAC API Endpoint Workflow

## When to use

- New `/api/...` route
- Changing authorization on an existing route
- Seeding or modeling permissions

## Steps

1. Add/update controller in `api/controllers/`.
2. Wire route in `api/routes/` with:

```js
router.use(protect);
router.get('/', authorize('RESOURCE:ACTION'), handler);
```

3. Register the router in `api/app.js`.
4. Ensure permission actions exist in `api/constants/rbac.js`.
5. Update `docs/openapi.yaml`.
6. Add/adjust tests in `__tests__/api.*.test.js`:
   - admin allowed
   - unprivileged denied (403)
7. If admin needs the new permission by default, update `buildFullAdminPermissions` / bootstrap.

## Checklist

- [ ] `protect` + `authorize` present
- [ ] No secrets logged
- [ ] OpenAPI updated
- [ ] Tests cover allow + deny
