# Projects Reports Service

FastAPI + Strawberry GraphQL service that reads MongoDB and exposes analytics for the RBAC platform.

## Endpoints

| Path | Purpose |
|------|---------|
| `GET /health` | Liveness / DB ping |
| `POST /graphql` | GraphQL API |
| `GET /graphql` | GraphiQL IDE (when enabled) |

## Example query

```graphql
query Overview {
  overview {
    users
    groups
    assets
    surveys
    surveyResponses
    actionLogs
    assetsByKind { key count }
  }
}
```

Send `Authorization: Bearer <JWT>` using a token from `POST /api/auth/login`.

## Local run

```bash
cd reports
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set MONGO_URI=mongodb://root:rootpassword@localhost:27178/projects?authSource=admin
set JWT_SECRET=your-secret
uvicorn app.main:app --reload --port 8000
```

## Docker

Included in root `docker compose` as the `reports` service (default host port `8000`).
