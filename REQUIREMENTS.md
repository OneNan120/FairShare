# Requirements Checklist

## CS144 Technical Requirements

### 1. Full-stack web application

FairShare is a full-stack web application. The frontend is a React SPA built with Vite, and the backend is an Express API server. The Express server also serves the built React app in production.

Relevant files:

```text
client/src/main.jsx
server/src/index.js
Dockerfile
```

### 2. Semantic HTML, responsive layout, and accessibility

FairShare uses semantic page structure, labels, form controls, focus states, and responsive plain CSS. The layout is designed for mobile, tablet, and desktop widths.

Responsive targets:

```text
320px mobile
768px tablet
1024px desktop
```

### 3. HTML5 APIs

FairShare uses two meaningful HTML5 APIs:

* HTML5 Drag and Drop API: receipt item cards can be dragged onto member cards to assign split responsibility.
* HTML5 Canvas API: the group balance chart is drawn with Canvas.

These APIs directly support the expense splitting workflow rather than being decorative.

### 4. Single Page Application

FairShare is a React SPA using React Router. Navigation between views does not require full page reloads.

Implemented routes include:

```text
/login
/register
/dashboard
/groups
/groups/:groupId
/groups/:groupId/new-expense
/expenses/:expenseId
/notifications
```

### 5. Frontend framework

FairShare uses React with Vite.

### 6. Backend framework

FairShare uses Node.js and Express.

### 7. Progressive Web App

FairShare is configured as a PWA using the Vite PWA plugin. It includes a manifest, generated service worker, offline shell behavior, and an offline banner.

The app remains reachable in offline mode with a basic UI shell. Live database operations still require network access.

### 8. Server-initiated notifications

FairShare uses Server-Sent Events.

The backend exposes:

```text
/api/notifications/stream
```

The frontend receives live notification updates for events such as group invitations, expense creation, approvals, disputes, comments, and receipt parsing completion.

### 9. HTTPS

FairShare is deployed with HTTPS.

Final deployed URL:

```text
https://34.102.228.238.sslip.io
```

HTTPS is provided through:

```text
GKE Ingress
cert-manager
Let's Encrypt
sslip.io hostname
fairshare-tls Kubernetes TLS secret
```

The final deployment does not use `k8s/managed-certificate.yaml`; HTTPS is handled by cert-manager and Let's Encrypt instead.

### 10. Authentication

FairShare implements user authentication with:

* Register
* Login
* Logout
* JWT stored in HTTP-only cookies
* bcrypt password hashing
* Protected route middleware

Relevant backend behavior:

```text
JWT is not stored in localStorage
Protected routes derive user identity from the verified cookie
Passwords are hashed with bcrypt
```

### 11. Security mitigations

FairShare includes several security measures:

* Helmet security headers
* CORS configuration
* Express rate limiting
* HTTP-only JWT cookies
* SameSite cookie configuration
* Secure cookies in production
* File upload size checks
* File MIME type validation
* Plain text rendering for comments
* ID/body validation on API routes
* Secrets supplied through `.env`, Kubernetes Secrets, and GitHub Actions Secrets instead of hardcoding

### 12. Persistent database

FairShare uses Firestore as the production persistent database.

The backend also includes an in-memory database fallback for local development and local demos without Firestore credentials.

Production GKE deployment uses:

```text
USE_IN_MEMORY_DB=false
FIRESTORE_PROJECT_ID=gen-lang-client-0783211563
```

Local development can use:

```text
USE_IN_MEMORY_DB=true
FIRESTORE_PROJECT_ID=local
```

### 13. AI integration

FairShare integrates Gemini for receipt parsing.

Gemini parses:

* receipt text paste
* receipt image upload

The parser returns structured receipt data such as merchant, date, items, subtotal, tax, tip, and total. If Gemini is unavailable or returns invalid JSON, the backend falls back to a local parser so the expense creation flow can continue.

Gemini model configuration:

```text
GEMINI_MODEL=gemini-2.5-flash
GEMINI_FALLBACK_MODEL=gemini-2.5-flash-lite
```

User-facing review message:

```text
We strongly encourage you to review the receipt details before you submit the expense.
```

### 14. GKE deployment

FairShare is deployed to Google Kubernetes Engine.

GKE resources include:

```text
Deployment
Service
Ingress
Kubernetes Secret
cert-manager ClusterIssuer
TLS Certificate
```

The deployment uses at least 2 FairShare pod replicas.

The project initially targeted `e2-micro` nodes. During deployment, the pods could not be scheduled because GKE reported insufficient memory after system overhead. The node pool was upgraded to `e2-small` to resolve the resource constraint.

### 15. Self-healing and manual scaling

FairShare can demonstrate Kubernetes self-healing by deleting a pod and showing Kubernetes automatically creates a replacement.

Useful command:

```bash
kubectl delete pod POD_NAME
kubectl get pods --watch
```

FairShare can demonstrate manual scaling:

```bash
kubectl scale deployment/fairshare --replicas=1
kubectl get pods
kubectl scale deployment/fairshare --replicas=2
kubectl get pods
```

The final deployment should be left at 2 replicas.

### 16. GitHub Actions CI/CD

FairShare uses GitHub Actions for CI/CD.

The workflow:

1. Checks out the repository.
2. Installs dependencies.
3. Runs project checks.
4. Runs backend tests.
5. Builds the React client.
6. Authenticates to Google Cloud.
7. Builds the Docker image.
8. Pushes the image to Artifact Registry.
9. Gets GKE credentials.
10. Applies Kubernetes manifests.
11. Updates the GKE Deployment image.
12. Waits for rollout status.

Successful build/deploy logs are stored in:

```text
logs/
```

## Product Requirements

### Groups

FairShare supports:

* create groups
* list groups
* view group detail
* invite registered users by email
* show user-not-found when an invited email does not belong to a registered user
* accept or decline group invitations
* view group balances

### Expenses

FairShare supports:

* creating expenses from receipt text
* creating expenses from receipt image upload
* AI-filled receipt fields
* manual receipt edits
* expense detail page
* expense update/delete API
* edit and resubmit behavior with approval reset

### Itemized split calculation

FairShare calculates itemized splits.

Rules:

* Assigned items are split equally among their assignees.
* Unassigned members are excluded.
* Tax and tip are allocated proportionally based on each member's assigned item subtotal.
* Final totals are rounded to cents.

### Approval and dispute workflow

FairShare supports:

* approving expenses
* disputing expenses
* dispute comments
* approval/dispute status display

### Comments

FairShare supports adding and listing comments on expenses.

### Notifications

FairShare supports notifications for:

* group invitations
* expense creation
* approvals
* disputes
* comments
* AI parse completion

Notifications are available through both a notification panel and SSE live updates.

## AI Usage Disclosure

AI tools helped with implementation planning, debugging, code structure suggestions, deployment troubleshooting, and documentation drafting.

The application itself uses Gemini as a core feature to parse receipt images and receipt text into editable receipt fields. Because AI output may be imperfect, the app shows this message to users:

```text
We strongly encourage you to review the receipt details before you submit the expense.
```

All generated code and AI-assisted changes were tested and verified through local checks, Docker testing, GKE deployment testing, and GitHub Actions CI/CD.

## Deployment Evidence

FairShare has been deployed to GKE with HTTPS.

Deployment evidence includes:

```text
kubectl get pods
kubectl get service fairshare
kubectl get ingress fairshare
kubectl get certificate
curl -I https://34.102.228.238.sslip.io/api/health
```

Successful GitHub Actions build/deploy logs are included in the `logs/` directory.

The recorded demo should show:

* HTTPS deployed app
* authentication flow
* group creation
* group invitation flow
* receipt parsing
* receipt review/editing
* Drag and Drop item assignment
* expense submission
* SSE notification
* approval/dispute/comment flow
* Canvas chart
* PWA offline behavior
* GKE ingress/load balancer address
* pod self-healing
* manual scaling down and back up
* successful GitHub Actions logs
