# FairShare

FairShare is an AI-assisted group receipt splitter. Users upload a receipt image or paste receipt text, Gemini extracts the receipt fields, the payer checks and edits the receipt details, assigns each item to the correct group members, and involved members approve, dispute, and comment on the final split.

FairShare supports itemized splitting with proportional tax/tip, Server-Sent Events notifications, a Canvas balance chart, Drag and Drop item assignment, PWA offline behavior, and HTTPS deployment on Google Kubernetes Engine.

## Tech Stack

* React, Vite, React Router, plain CSS, Vite PWA plugin
* Node.js, Express, JWT HTTP-only cookies, bcrypt, helmet, cors, rate limiting, multer
* Firestore SDK with an in-memory fallback for local development
* Gemini API for receipt image and text parsing
* Server-Sent Events for notifications
* HTML5 Canvas API for balance visualization
* HTML5 Drag and Drop API for item assignment
* Docker, Google Artifact Registry, GKE, GitHub Actions
* cert-manager + Let's Encrypt for HTTPS

## Deployed App

Production deployment:

```text
https://34.102.228.238.sslip.io
```

The app is deployed to Google Kubernetes Engine behind a GKE Ingress. HTTPS is provided by cert-manager and Let's Encrypt using the `34.102.228.238.sslip.io` hostname.

## Local Setup

Create the local server environment file:

```bash
cp .env.example ./server/.env
```

Install dependencies:

```bash
npm run install:all
```

Start the backend and frontend in separate terminals:

```bash
npm run dev:server
npm run dev:client
```

The backend runs on:

```text
http://localhost:8080
```

The Vite frontend runs on:

```text
http://localhost:5173
```

Vite proxies `/api` requests to the backend during local development.

## Local Database Mode

For local development without Firestore credentials, use the in-memory database fallback:

```env
USE_IN_MEMORY_DB=true
FIRESTORE_PROJECT_ID=local
```

In-memory data resets when the server restarts. The deployed GKE version uses Firestore for persistent data.

## Docker

Build and run the production-style container locally:

```bash
npm run docker:build
npm run docker:run
```

Equivalent commands:

```bash
docker build -t fairshare .
docker run --env-file server/.env -p 8080:8080 fairshare
```

Then open:

```text
http://localhost:8080
```

This mode serves the built React frontend and Express API from the same container, which is closer to the GKE deployment behavior than Vite dev mode.

## Test Users

For local testing, set this in `server/.env` before starting the server:

```env
SEED_TEST_USERS=true
```

Then `npm run dev:server` creates or resets these accounts on startup:

| Email               | Password       |
| ------------------- | -------------- |
| `yinan@example.com` | `Password123!` |
| `alice@example.com` | `Password123!` |
| `bob@example.com`   | `Password123!` |
| `chloe@example.com` | `Password123!` |

If the server is already running, seed them manually:

```bash
npm run seed:users --prefix server
```

The seed endpoint is disabled when `NODE_ENV=production`.

## Environment Variables

Important server variables:

```env
NODE_ENV=development
PORT=8080
JWT_SECRET=
CLIENT_ORIGIN=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
FIRESTORE_PROJECT_ID=
USE_IN_MEMORY_DB=
SEED_TEST_USERS=
```

Local development usually uses:

```env
USE_IN_MEMORY_DB=true
FIRESTORE_PROJECT_ID=local
```

The deployed GKE environment uses:

```env
USE_IN_MEMORY_DB=false
FIRESTORE_PROJECT_ID=gen-lang-client-0783211563
CLIENT_ORIGIN=https://34.102.228.238.sslip.io
```

Secrets are provided locally through `server/.env` and in GKE through the Kubernetes Secret named `fairshare-secrets`. Do not commit real secrets to GitHub.

## Verification Commands

Run these before deployment:

```bash
npm run check
npm test --prefix server
npm run build --prefix client
npm audit --prefix client --omit=dev
npm audit --prefix server --omit=dev
docker build -t fairshare .
docker run --env-file server/.env -p 8080:8080 fairshare
```

Health check:

```bash
curl -i http://localhost:8080/api/health
```

Deployed health check:

```bash
curl -I https://34.102.228.238.sslip.io/api/health
```

## Demo Flow

1. Register or log in.
2. Create a group named `Vegas Trip`.
3. Invite or add Yinan, Alice, Bob, and Chloe.
4. Create a new expense.
5. Upload a receipt image or paste receipt text.
6. Use Gemini to extract receipt fields.
7. Check and manually correct the extracted receipt fields.
8. Show this message in the app where appropriate:

```text
We strongly encourage you to review the receipt details before you submit the expense.
```

9. Drag item cards onto member cards.
10. Exclude uninvolved members by leaving them unassigned.
11. Submit the expense.
12. View split totals, Canvas chart, pending approvals, comments, disputes, and SSE notifications.

For the recorded course demo, also show:

* HTTPS deployed app
* GKE Ingress/load balancer address
* PWA offline behavior
* Server-Sent Events notification triggered by backend behavior
* Pod self-healing after deleting one pod
* Manual replica scaling down and back up
* Successful GitHub Actions build/deploy logs

## Deployment

FairShare is deployed to GKE using Docker, Artifact Registry, GitHub Actions, Firestore, GKE Ingress, cert-manager, and Let's Encrypt.

### GCP resources used

* Project: `gen-lang-client-0783211563`
* Region: `us-west1`
* Zone: `us-west1-a`
* Artifact Registry repository: `fairshare`
* GKE cluster: `fairshare-cluster`
* Public hostname: `34.102.228.238.sslip.io`
* HTTPS certificate: cert-manager + Let's Encrypt
* TLS secret: `fairshare-tls`

The project initially targeted `e2-micro` nodes. Because the pods could not be scheduled due to GKE memory constraints, the deployment uses `e2-small` nodes.

### Kubernetes resources

Important manifests:

```text
k8s/deployment.yaml
k8s/service.yaml
k8s/ingress.yaml
k8s/cluster-issuer.yaml
```

`k8s/managed-certificate.yaml` is not used in the final deployment because HTTPS is handled by cert-manager and Let's Encrypt.

### Kubernetes secret

The cluster expects a secret named:

```text
fairshare-secrets
```

It contains the production environment variables such as:

```text
JWT_SECRET
CLIENT_ORIGIN
GEMINI_API_KEY
GEMINI_MODEL
GEMINI_FALLBACK_MODEL
FIRESTORE_PROJECT_ID
USE_IN_MEMORY_DB
```

### GitHub Actions

Deployment is triggered by `.github/workflows/deploy.yml`.

The workflow:

1. Checks out the repository.
2. Installs dependencies.
3. Runs project checks.
4. Runs backend tests.
5. Builds the client.
6. Authenticates to Google Cloud.
7. Builds a Docker image.
8. Pushes the image to Artifact Registry.
9. Gets GKE credentials.
10. Applies Kubernetes manifests.
11. Updates the GKE Deployment image.
12. Waits for rollout success.

Required GitHub Actions secrets:

```text
GCP_SERVICE_ACCOUNT_KEY
GCP_PROJECT_ID
ARTIFACT_REGISTRY_REGION
ARTIFACT_REGISTRY_REPOSITORY
GKE_CLUSTER
GKE_ZONE
```

Current values:

```text
GCP_PROJECT_ID=gen-lang-client-0783211563
ARTIFACT_REGISTRY_REGION=us-west1
ARTIFACT_REGISTRY_REPOSITORY=fairshare
GKE_CLUSTER=fairshare-cluster
GKE_ZONE=us-west1-a
```

Successful GitHub Actions logs are stored in the `logs/` directory.

## Useful GKE Commands

Check deployment:

```bash
kubectl get pods
kubectl get service fairshare
kubectl get ingress fairshare
kubectl get certificate
```

Show health:

```bash
curl -I https://34.102.228.238.sslip.io/api/health
```

Show logs:

```bash
kubectl logs -f deployment/fairshare
```

Self-healing demo:

```bash
kubectl get pods
kubectl delete pod POD_NAME
kubectl get pods --watch
```

Manual scaling demo:

```bash
kubectl scale deployment/fairshare --replicas=1
kubectl get pods
kubectl scale deployment/fairshare --replicas=2
kubectl get pods
```

Leave the deployment at 2 replicas after the demo.

## Notes for Grading

FairShare uses React as a SPA, Express as the backend, Firestore as the persistent database, Gemini for AI-assisted receipt extraction, Canvas and Drag and Drop as meaningful HTML5 APIs, SSE for server-initiated notifications, PWA offline support, JWT HTTP-only cookie authentication, Docker, GKE, HTTPS, and GitHub Actions CI/CD.

The final deployed app is available at:

```text
https://34.102.228.238.sslip.io
```
