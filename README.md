# FairShare

FairShare is an AI-assisted group receipt splitter. Users upload a receipt image or paste receipt text, Gemini extracts the receipt fields, the payer assigns each item to the right group members, and involved members approve, dispute, and comment on the final split.

## Tech Stack

- React, Vite, React Router, plain CSS, Vite PWA plugin
- Node.js, Express, JWT HTTP-only cookies, bcrypt, helmet, cors, rate limiting, multer
- Firestore SDK with an in-memory fallback for local demos
- Gemini API for receipt image and text parsing
- Server-Sent Events for notifications
- Docker, Google Artifact Registry, GKE, GitHub Actions

## Local Setup

```bash
cp .env.example ./server/.env
npm run install:all
npm run dev:server
npm run dev:client
```

## Docker
```bash
npm run docker:build
npm run docker:run
```

The API runs on `http://localhost:8080`; Vite runs on `http://localhost:5173` and proxies `/api`.

Without Firestore credentials, the server uses in-memory data so the demo flow still works locally. Set `FIRESTORE_PROJECT_ID` and Google credentials to use Firestore.

### Test Users

For local testing, set `SEED_TEST_USERS=true` in `.env` before starting the server.

Then `npm run dev:server` creates or resets these accounts on startup:

| Email | Password |
| --- | --- |
| `yinan@example.com` | `Password123!` |
| `alice@example.com` | `Password123!` |
| `bob@example.com` | `Password123!` |
| `chloe@example.com` | `Password123!` |

If the server is already running, seed them on demand:

```bash
npm run seed:users --prefix server
```

The seed endpoint is disabled when `NODE_ENV=production`.

## Environment Variables

Required for production:

- `JWT_SECRET`
- `CLIENT_ORIGIN`
- `GEMINI_API_KEY`
- `FIRESTORE_PROJECT_ID`
- `GOOGLE_APPLICATION_CREDENTIALS` or workload identity credentials

Deployment variables are listed in `.env.example` and mirrored as GitHub Actions secrets.

## Commands

```bash
npm test
npm run build
docker build -t fairshare .
docker run --env-file .env -p 8080:8080 fairshare
```

## Demo Flow

1. Register or log in.
2. Create a group named `Vegas Trip`.
3. Add Yinan, Alice, Bob, and Chloe.
4. Create a new expense.
5. Upload a receipt image or paste receipt text.
6. Check and manually correct the extracted receipt fields.
7. Drag item cards onto member cards.
8. Exclude uninvolved members by leaving them unassigned.
9. Submit the expense.
10. View split totals, Canvas chart, pending approvals, comments, disputes, and SSE notifications.

For the recorded course demo, also show the deployed HTTPS URL, the GKE load balancer or ingress address, pod self-healing after deleting one pod, manual replica scaling, PWA offline behavior, and GitHub Actions build/deploy logs in one continuous deployment segment.

## Deployment

1. Create Artifact Registry and a GKE cluster with at least 2 e2-micro nodes.
2. Create a Kubernetes Secret named `fairshare-secrets` with the production environment variables.
3. Configure a domain and HTTPS. `k8s/managed-certificate.yaml` shows the GKE ManagedCertificate setup; replace `fairshare.example.com` with the provided course domain.
4. Replace `PROJECT_ID` in `k8s/deployment.yaml` or let GitHub Actions set the image after applying manifests.
5. Configure GitHub repository secrets used by `.github/workflows/deploy.yml`.
6. Push to `main` or run the workflow manually.

Example cluster command:

```bash
gcloud container clusters create fairshare-cluster \
  --zone us-west1-a \
  --machine-type e2-micro \
  --num-nodes 2
```
