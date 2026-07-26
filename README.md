# FairShare

### AI-assisted receipt splitting for groups

[Deployment](#deployment) · [Architecture](ARCHITECTURE.md) · [Data Model](DATABASE.md)

> **Demo status:** The public GKE cluster is currently shut down to avoid ongoing cloud costs. The application remains fully reproducible locally using the instructions below.

FairShare turns a shared receipt into a transparent, itemized expense split. Upload a receipt image or paste its text, review the fields extracted by Gemini, assign items to group members, and let FairShare distribute tax and tip proportionally. Members can then approve or dispute their share and discuss corrections in one place.

This full-stack project was built to explore a practical AI workflow: automation speeds up data entry, while the user remains in control of every value before it is saved.

## Product highlights

- **AI-assisted receipt capture** — Gemini extracts merchants, line items, quantities, tax, tip, and totals from receipt images or text.
- **Human-in-the-loop review** — extracted values remain editable and are never saved automatically.
- **Itemized group splitting** — items can be assigned by drag and drop, including shared items; tax and tip are allocated in proportion to each member's subtotal.
- **Collaborative approval flow** — members can accept invitations, approve or dispute expenses, and leave comments.
- **Real-time updates** — Server-Sent Events deliver in-app expense and approval notifications without polling.
- **Resilient experience** — the installable PWA caches its application shell and reports offline state.
- **Production deployment** — a multi-stage Docker image runs on Google Kubernetes Engine with Firestore, HTTPS, health probes, two replicas, and automated GitHub Actions deployment.

## How it works

```text
Receipt image or text
        ↓
Gemini extraction + server-side normalization
        ↓
Editable receipt review
        ↓
Drag-and-drop item assignment
        ↓
Proportional tax and tip calculation
        ↓
Member approval, disputes, comments, and live notifications
```

## Engineering highlights

FairShare is a React single-page application backed by an Express REST API. Authentication uses signed JWTs stored in HTTP-only cookies, while Helmet, CORS, rate limiting, upload type checks, and a 5 MB upload limit protect the API.

The receipt parser validates and normalizes Gemini output before returning it to the client. If AI is unavailable, text receipts fall back to local pattern-based parsing so the workflow can continue. The split calculation is isolated as a tested domain function and handles shared items plus proportional tax and tip with currency rounding.

In production, Express serves both the API and the compiled React app from one container:

```text
React PWA ── REST + SSE ──> Express API ──> Firestore
                                  │
                                  └────────> Gemini API

GitHub Actions ──> Artifact Registry ──> GKE
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design and [DATABASE.md](DATABASE.md) for the Firestore schema.

## Tech stack

| Area | Technologies |
| --- | --- |
| Frontend | React 18, Vite, React Router, CSS, Canvas API, Drag and Drop API, PWA |
| Backend | Node.js, Express, JWT, bcrypt, Server-Sent Events, Multer |
| AI and data | Gemini API, Google Cloud Firestore |
| Security | HTTP-only cookies, Helmet, CORS, rate limiting, input and upload validation |
| Delivery | Docker, GitHub Actions, Artifact Registry, GKE, Kubernetes, cert-manager |
| Testing | Node.js test runner |

## Run locally

### Prerequisites

- Node.js 20+
- npm
- A Gemini API key is optional; without one, pasted receipt text uses the local fallback parser

### 1. Configure the server

```bash
cp .env.example server/.env
```

The example configuration uses the in-memory data store, so Google Cloud credentials are not required for local development. Add a Gemini key to enable AI extraction:

```env
GEMINI_API_KEY=your_key_here
JWT_SECRET=replace_with_a_long_random_value
```

### 2. Install and start

```bash
npm run install:all
```

Run the API and web client in separate terminals:

```bash
npm run dev:server
npm run dev:client
```

Open [http://localhost:5173](http://localhost:5173). The API runs on port `8080`, and Vite proxies `/api` requests to it.

Local in-memory data resets whenever the server restarts. To create repeatable demo accounts, set `SEED_TEST_USERS=true` in `server/.env`.

### Troubleshooting Firestore credentials

If the server reports `Could not load the default credentials`, it is attempting to connect to Firestore without Google Cloud credentials.

For local development, confirm that `server/.env` contains:

```env
USE_IN_MEMORY_DB=true
FIRESTORE_PROJECT_ID=local
```

Restart the server after changing the file:

```bash
npm run dev:server
```

To use Firestore locally instead of the in-memory store, authenticate with Google Cloud Application Default Credentials:

```bash
gcloud auth application-default login
```

## Test and build

Run the automated split-calculation test and create a production frontend build:

```bash
npm run check
```

Run the production-style application in Docker:

```bash
npm run docker:build
npm run docker:run
```

Then open [http://localhost:8080](http://localhost:8080).

## Deployment

Pushes to `main` trigger the deployment workflow:

1. Install dependencies and run tests.
2. Build the React application and Docker image.
3. Push the image to Google Artifact Registry.
4. Apply the Kubernetes manifests.
5. Deploy the new image and wait for a successful rollout.

The GKE deployment runs two replicas with readiness and liveness probes. Firestore provides persistent storage, while cert-manager and Let's Encrypt provide HTTPS. Runtime credentials are injected through GitHub Actions and Kubernetes secrets; no real secrets belong in the repository.

The application was deployed at `https://34.102.228.238.sslip.io`. The GKE cluster is currently shut down to avoid ongoing cloud costs, so the hosted demo is temporarily unavailable. The Docker and Kubernetes configuration remains in this repository, and the application can be run locally with the steps above.
