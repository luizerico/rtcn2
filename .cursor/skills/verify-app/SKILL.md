---
name: verify-app
description: >-
  Run and verify the unified Next.js + API app locally. Use when checking startup,
  database init, health, admin login, or confirming tests after changes.
---

# Verify App Workflow

## Quick verification

1. Ensure `.env` exists (from `.env.example`).
2. For Docker Mongo, credentials must resolve (explicit URI or `MONGO_ROOT_*`).
3. Install if needed:

```bash
npm install
```

4. Seed admin:

```bash
npm run db:init
```

5. Start unified app:

```bash
npm run dev
```

6. Check:
   - UI: `http://localhost:3000`
   - Health: `http://localhost:3000/api/health`
   - Login with seeded admin, open `/admin/users|groups|permissions`

7. Tests:

```bash
npm test
```

## Common failures

| Symptom | Fix |
|---------|-----|
| `Command find requires authentication` | Add Mongo credentials / `authSource=admin` |
| `JWT_SECRET is not configured` | Set `JWT_SECRET` in `.env` |
| 403 on admin pages | Re-run `npm run db:init` |
| Two terminals needed | Use root `npm run dev` only |
