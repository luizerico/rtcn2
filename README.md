# Projects RBAC Platform

Unified **Next.js** application: the UI and `/api` backend run in **one process** on one port.

## Contents

- [Prerequisites](#prerequisites)
- [Quick start (local)](#quick-start-local)
- [Run with Docker Compose](#run-with-docker-compose)
- [Cloud deployment](#cloud-deployment)
- [API testing](#api-testing)
- [OpenAPI / Postman](#openapi--postman)
- [Useful scripts](#useful-scripts)

## Prerequisites

- Node.js **20.19+** (required; see `package.json` `engines`)
- npm 10+
- MongoDB 7+ (local install **or** Docker)
- Docker Desktop (optional)

## Quick start (local)

### 1. Install

```bash
git clone <your-repo-url>
cd Projects
npm install
```

### 2. Configure environment

```bash
copy .env.example .env
```

Minimum `.env` values:

```env
PORT=3000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/projects
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRE=1h
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
NEXT_PUBLIC_API_BASE_URL=/api
CLIENT_URL=http://localhost:3000
```

### 3. Start MongoDB

```bash
docker run -d --name projects-mongo -p 27017:27017 mongo:7.0
```

### 4. Seed admin (optional)

```bash
npm run db:init
npm run db:seed-geo
npm run db:import-data
```

Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` (username is not used for login). `db:seed-geo` imports IBGE region, state, microregion, biome, and county sample data (reference catalog, not an RBAC asset class). County status series and emissions are stored in separate collections; the large counties file is streamed. `db:import-data` upserts organizations, users, sponsors, opportunities, and projects from `01_sample_data` into the matching collections (run `npm run db:init` first so imported assets have an owner). Source rows with `isDeleted: true` are skipped unless `IMPORT_DELETED=1`. Geography and legacy permission dumps are not imported by this command. Dump users that collide with the bootstrap admin username/email are skipped so `ADMIN_PASSWORD` is never overwritten.

### 5. Start the app (UI + API together)

```bash
npm run dev
```

Open:

- App: [http://localhost:3000](http://localhost:3000)
- Health: [http://localhost:3000/api/health](http://localhost:3000/api/health)

Production:

```bash
npm run build
npm start
```

You do **not** need a separate Express terminal and a separate Next terminal.

## Run with Docker Compose

```bash
copy .env.example .env
# Set JWT_SECRET and ADMIN_PASSWORD

docker compose up --build
```

Public entry is **nginx** on port `80` (override with `NGINX_HOST_PORT`). Open [http://localhost](http://localhost) and [http://localhost/api/health](http://localhost/api/health).

| Service | Host port (default) | Purpose |
|---------|---------------------|---------|
| nginx | `80` | Reverse proxy (public UI + API) |
| MongoDB | `27178` | Database |
| App | *(internal)* | Next.js UI + API behind nginx |
| Reports | *(internal)* | FastAPI GraphQL; reached via `/api/reports` |

## Cloud deployment

1. Provision MongoDB (Atlas or similar).
2. Set secrets: `JWT_SECRET`, `ADMIN_PASSWORD`, `MONGODB_URI`.
3. Build and run the **single** Node process:

```bash
npm install
npm run build
npm run db:init
npm start
```

4. Expose port `3000` (or your `PORT`) behind HTTPS.
5. Keep `NEXT_PUBLIC_API_BASE_URL=/api` so the browser calls the same origin.

### Security checklist

- Do not commit `.env`
- Require strong `JWT_SECRET` / `ADMIN_PASSWORD`
- Restrict MongoDB network access
- Rotate the seeded admin password after first login
- Configure real email delivery in production (`EMAIL_PROVIDER=smtp` or `module`); the console sender is for local/test only and never returns reset tokens in HTTP responses

### Email (password reset)

Password reset uses a pluggable sender in `api/services/emailService.js`:

| `EMAIL_PROVIDER` | Behavior |
|------------------|----------|
| `console` (default in development/test) | Logs the message; safe for local/CI |
| `memory` | Captures messages in-process (tests) |
| `smtp` | Nodemailer SMTP (`SMTP_*` + `EMAIL_FROM`; requires `nodemailer`) |
| `module` | Loads `EMAIL_SENDER_MODULE` exporting `send(message)` |

Production must set `smtp` or `module` — the console default is rejected so reset links are not silently logged.

### File storage (attachments)

Reusable upload/download for PDF, DOCX, and images (JPEG, PNG, GIF, WEBP). Metadata lives in Mongo (`stored_files`); bytes go to the driver selected by `FILE_STORAGE_DRIVER`.

| `FILE_STORAGE_DRIVER` | Behavior |
|-----------------------|----------|
| `tmp` (default) | Local disk under `FILE_STORAGE_TMP_DIR` (default `tmp/uploads`, gitignored) |
| `azure` | Azure Blob (`AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER`) |
| `aws` | Amazon S3 (`AWS_S3_BUCKET`, `AWS_S3_REGION`, optional `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) |
| `gcs` | Google Cloud Storage (`GCS_BUCKET` plus `GOOGLE_APPLICATION_CREDENTIALS` or `GCS_CLIENT_EMAIL` + `GCS_PRIVATE_KEY`) |

`FILE_MAX_BYTES` defaults to 10MB. Access follows the parent record (for example `OPPORTUNITY:READ` / `OPPORTUNITY:WRITE`), not a separate file permission.

## API testing

```bash
npm test
```

- Component tests (modals)
- API endpoint tests (in-memory MongoDB + Supertest)

API-only suite:

```bash
npm run test:api
```

## OpenAPI / Postman

Spec: [`docs/openapi.yaml`](docs/openapi.yaml)

1. Postman → **Import** → select `docs/openapi.yaml`
2. Set `baseUrl` to `http://localhost:3000`
3. Login via `POST /api/auth/login` with `{ email, password }`, copy `token` (or use the `rbac_session` cookie)
4. Collection auth → Bearer Token (browser apps use the httpOnly cookie with credentials)

## Useful scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Unified Next.js app (UI + API) |
| `npm run build` | Build the Next.js client |
| `npm start` | Run unified app (production) |
| `npm test` | All Jest suites |
| `npm run test:api` | API tests only |
| `npm run lint` | Lint the Next.js client |
| `npm run api:only` | Legacy API-only server (optional) |
| `npm run db:init` | Seed admin user/group/permissions |
| `npm run db:seed-geo` | Idempotent import of region/state/microregion/biome/county sample JSON (streams counties; status + emissions split) |
| `npm run db:import-data` | Upsert organizations, users, sponsors, opportunities, and projects from `01_sample_data` (set `IMPORT_DELETED=1` to include source-deleted rows) |

## Project layout

```text
server.js                 Unified Next.js + API entry
api/                      Express routes mounted at /api/*
client/app/(app)/         Home + Admin UI (with menu)
client/app/(auth)/        Login / register
reports/                  FastAPI + GraphQL reports service (separate container)
docs/openapi.yaml         OpenAPI 3 specification
__tests__/                Component + API tests
```

## Reports GraphQL service

Separate FastAPI container that reads the same MongoDB and exposes analytics at `/graphql`.

In Docker Compose the reports port is internal; the UI calls same-origin `/api/reports` through nginx → app.

- Via proxy (Compose): [http://localhost/api/reports/health](http://localhost/api/reports/health)
- Direct (local reports only): `http://localhost:8000/health` and `/graphql`
- Auth: send `Authorization: Bearer <token>` from the main app login
- Details: [`reports/README.md`](reports/README.md)

## Opportunity document analysis (RTCNAI)

The opportunity detail page can send an attached **PDF or DOCX** to the separate RTCNAI service (`RTCNAI_URL`, default `http://localhost:8008`) and show a persisted summary of relevant funding points.

- The browser calls same-origin `/api/opportunities/{id}/files/{fileId}/analyses`. This app authenticates to RTCNAI with `RTCNAI_API_KEY` (`X-API-Key`).
- RTCNAI reads the file from storage by URI (it does not accept an upload). For local `FILE_STORAGE_DRIVER=tmp`, set RTCNAI `STORAGE_TMP_ROOT` to the **absolute** path of `FILE_STORAGE_TMP_DIR` (default `tmp/uploads`) and keep the RTCNAI analysis worker running.

## RBAC notes

- Permissions live in the **`permissions`** collection (not embedded on groups).
- Each permission row links a **USER or GROUP** principal to a resource action (`READ`, `WRITE`, `CREATE`, `DELETE`, `ADMIN`) for asset subclasses (`DOCUMENT`, `DASHBOARD`, `DATASET`, `SURVEY`, `SURVEY_RESPONSE`).
- **Canonical write API:** `POST /api/permissions/acl` (Windows-style ACL apply used by PermissionModal). Delete scope is limited to the selected assets or class-wide `*`.
- **Deprecated:** `POST /api/groups/{groupId}/permissions` — prefer the ACL endpoint; the group path only mutates that group’s grants for the selection and returns `Deprecation` / `Link` headers.
- `authorize('RESOURCE:ACTION')` resolves the caller’s groups (`roleId` + membership) and loads matching permission rows.
- `ADMIN` on a resource type grants every action; `WRITE` also covers `CREATE`.
- `npm run db:init` upserts the **admin** group and writes the full permission matrix into `permissions`.
- Geography (region/state/microregion/biome/county) is reference catalog data, not an RBAC asset class. Import with `npm run db:seed-geo`. County `hidroRisk`, `endangeredPeople`, and `disasterRate` live in `county_status`; each emission row lives in `county_emissions`.

## Account verification

- `User.isVerified` must be `true` to sign in (`POST /api/auth/login`) and to use an existing session.
- Self-registration creates unverified users; an admin must set `isVerified` (for example `PUT /api/users/{id}`) before they can log in.
- Admin-created users (`POST /api/users`) and the bootstrap admin are verified automatically.
- There is no email-verification flow yet; verification is admin-managed.

- **Two terminals still?** Use root `npm run dev` only — not `client` and `api` separately.
- **`JWT_SECRET is not configured`**: set it in `.env`.
- **401 on protected routes**: login and send `Authorization: Bearer <token>`.
- **Mongo connection failed**: check `MONGO_URI` / `MONGODB_URI`.
