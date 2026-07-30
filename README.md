# Projects RBAC Platform

Full-stack RBAC application with an Express API, MongoDB, and a Next.js client for managing users, groups, memberships, policies, and protected objects.

## Contents

- [Prerequisites](#prerequisites)
- [Quick start (local)](#quick-start-local)
- [Run with Docker Compose](#run-with-docker-compose)
- [Run the Next.js client](#run-the-nextjs-client)
- [Cloud deployment](#cloud-deployment)
- [API testing](#api-testing)
- [OpenAPI / Postman](#openapi--postman)
- [Useful scripts](#useful-scripts)

## Prerequisites

- Node.js **20.19+** (recommended)
- npm 10+
- MongoDB 7+ (local install **or** Docker)
- Docker Desktop (optional, for Compose / cloud-like runs)

## Quick start (local)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd Projects
npm install
```

### 2. Configure environment

Copy the example env file and set secrets:

```bash
copy .env.example .env
```

Minimum values in `.env`:

```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/projects
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRE=7d
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
CLIENT_URL=http://localhost:3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api
```

### 3. Start MongoDB

Local MongoDB:

```bash
# Windows service / mongod, or:
docker run -d --name projects-mongo -p 27017:27017 mongo:7.0
```

### 4. Seed the admin user (optional)

```bash
npm run db:init
```

Uses `MONGO_URI`/`MONGODB_URI` and `ADMIN_PASSWORD` from `.env`.

### 5. Start the API

```bash
npm run dev
```

Production-style start (same process entry):

```bash
npm start
```

Health check: [http://localhost:5000/api/health](http://localhost:5000/api/health)

### 6. Start the client

```bash
cd client
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Run with Docker Compose

From the repository root:

```bash
copy .env.example .env
# Edit .env and set JWT_SECRET and ADMIN_PASSWORD

docker compose up --build
```

Services:

| Service  | Host port (default) | Purpose              |
|----------|---------------------|----------------------|
| MongoDB  | `27178`             | Database             |
| API      | `9980`              | Express API          |

API health: [http://localhost:9980/api/health](http://localhost:9980/api/health)

Stop:

```bash
docker compose down
```

Persist data while removing containers:

```bash
docker compose down
# volume `projects-mongodb-data` is kept unless you pass -v
```

## Run the Next.js client

The client lives in `client/`.

```bash
cd client
npm install
```

Set `NEXT_PUBLIC_API_BASE_URL` to your API base (include `/api`):

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000/api
```

For Docker API:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:9980/api
```

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

## Cloud deployment

### Option A — Managed MongoDB + container API

1. Create a managed MongoDB cluster (Atlas, DocumentDB, Cosmos DB for MongoDB, etc.).
2. Create a strong `JWT_SECRET` and `ADMIN_PASSWORD` in your secrets store.
3. Deploy the API container (or Node process) with:

```env
NODE_ENV=production
PORT=8080
MONGODB_URI=mongodb+srv://USER:PASS@cluster/projects
JWT_SECRET=<secret>
ADMIN_PASSWORD=<secret>
CLIENT_URL=https://your-frontend.example.com
```

4. Run migrations/seed once:

```bash
node api/database-init.js
```

5. Deploy the Next.js client to Vercel/Netlify/Cloud Run and set:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com/api
```

6. Configure HTTPS, CORS (if frontend and API differ), and rotate admin credentials after first login.

### Option B — Full stack on a single VM / Kubernetes

1. Build and push images (API + optional client).
2. Apply the same env vars as Compose (`JWT_SECRET`, `ADMIN_PASSWORD`, `MONGODB_URI`).
3. Expose API and client via ingress/load balancer with TLS.
4. Point health probes at `GET /api/health`.

### Security checklist for cloud

- Never commit `.env` or real secrets.
- Require `JWT_SECRET` and `ADMIN_PASSWORD` (no defaults in production).
- Restrict MongoDB network access to the API.
- Change the seeded admin password immediately.
- Prefer short-lived JWTs and HTTPS only.

## API testing

Install dependencies (already covered by root `npm install`), then:

```bash
npm test
```

This runs:

- Component tests (modals) in jsdom
- API endpoint tests against an in-memory MongoDB (`mongodb-memory-server` + Supertest)

API-only:

```bash
npm run test:api
```

## OpenAPI / Postman

OpenAPI 3 specification:

- [`docs/openapi.yaml`](docs/openapi.yaml)

### Import into Postman

1. Open Postman → **Import**
2. Choose **File** → select `docs/openapi.yaml`
3. Confirm collection generation
4. Set collection variable `baseUrl` to `http://localhost:5000` (or your cloud URL)
5. Login via `POST /api/auth/login`, copy `token`
6. In collection **Authorization**, set type **Bearer Token** and paste the JWT

### Import into other tools

- **Insomnia**: Create → Import from → OpenAPI
- **Thunder Client / REST Client**: Import OpenAPI file
- **Swagger UI**: point at `docs/openapi.yaml`

## Useful scripts

| Script | Description |
|--------|-------------|
| `npm test` | All Jest suites |
| `npm run test:api` | API endpoint tests only |
| `npm run test:components` | Modal component tests only |
| `npm run dev` | Start API (development) |
| `npm start` | Start API |
| `npm run db:init` | Seed admin user/group |
| `docker compose up --build` | API + MongoDB |

## Project layout

```text
api/                 Express API (auth, groups, objects)
client/              Next.js frontend
docs/openapi.yaml    OpenAPI 3 specification
__tests__/           Component + API tests
docker-compose.yml   Local/cloud-like stack
```

## Troubleshooting

- **`JWT_SECRET is not configured`**: set it in `.env` before starting the API.
- **401 on group/object routes**: login first and send `Authorization: Bearer <token>`.
- **Mongo connection failed**: verify `MONGO_URI`/`MONGODB_URI` and that MongoDB is reachable.
- **Docker Compose refuses to start**: ensure `JWT_SECRET` and `ADMIN_PASSWORD` are set in `.env`.
