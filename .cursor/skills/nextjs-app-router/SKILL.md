---
name: nextjs-app-router
description: >-
  Scaffold or update Next.js App Router pages and layouts in this RBAC app.
  Use when adding pages, route groups, admin screens, navigation entries, or
  client/server component boundaries under client/app.
---

# Next.js App Router Workflow

## When to use

- New page under `client/app/`
- Admin submenu or shell navigation changes
- Deciding server vs client components

## Steps

1. Place authenticated pages in `client/app/(app)/` (inherits `AppNav` layout).
2. Place public auth pages in `client/app/(auth)/`.
3. Add `"use client"` only if the page needs hooks, events, or `localStorage`.
4. Fetch with `@/lib/apiUtils` (`/users`, `/groups`, etc. — paths are under `/api`).
5. If adding an Admin item, update `client/components/AppNav.tsx` links.
6. Reuse existing UI primitives in `client/components/ui/`.
7. Keep visual language (teal/slate CSS variables in `globals.css`).

## Checklist

- [ ] Correct route group
- [ ] Loading + error UI for data pages
- [ ] Nav link added when user-facing
- [ ] No hardcoded absolute API hosts
