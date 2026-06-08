# Requirements Checklist

## CS144 Full Stack

- React SPA: `client/src/main.jsx` implements all required routes with React Router.
- Express backend: `server/src/index.js` exposes `/api` routes and serves the built SPA.
- Database: Firestore SDK is implemented; memory fallback supports local demo without credentials.
- Authentication: register, login, logout, JWT HTTP-only cookie, bcrypt hashing, protected middleware.
- Security: helmet, cors, rate limit, SameSite cookie, secure cookie in production, upload size and MIME validation, plain text comment rendering, ID/body validation.
- AI: Gemini parses receipt text and receipt images into strict JSON.
- Editable receipt workflow: users can edit receipt fields, items, and assignments before save.
- PWA: Vite PWA plugin, manifest, service worker, offline shell and offline banner.
- Server notifications: SSE stream and notification panel.
- HTML5 APIs: native Drag and Drop assigns items to members; Canvas draws amount owed.
- Responsive/accessibility: semantic sections, labels, focus states, mobile/tablet/desktop CSS.
- Docker/GKE: Dockerfile plus deployment, service, ingress manifests with 2 replicas and health probes.
- HTTPS: GKE ingress and ManagedCertificate manifests are included; the deployment docs explain replacing the placeholder domain with the course-provided HTTPS domain.
- CI/CD: GitHub Actions workflow builds, tests, pushes Artifact Registry image, and deploys to GKE.

## Product Requirements

- Groups: create, list, detail, invite registered users by email, accept/decline invitations, balances.
- Expenses: create from AI-filled receipt data or manual edits, list, detail, update/delete API, edit and resubmit with approval reset.
- Itemized split: assigned items split equally among assignees, tax/tip allocated proportionally, totals rounded to cents.
- Approval/dispute: endpoints for approve and dispute; disputes require comments.
- Comments: list and add expense comments.
- Notifications: expense add, approval, dispute, comment, and AI parse completion.

## AI Usage Disclosure

AI helped generate implementation structure and code suggestions. The application itself uses Gemini as a core feature to parse receipt images and text, but it requires users to validate AI output before saving expenses.

## Remaining Deployment Evidence

`logs/github-actions-sample.log` is a sample log format. Replace it with copied successful GitHub Actions and GKE logs after the real deployment run, because those values depend on the submitter's Google Cloud project.
