# Architecture

```text
React PWA
  -> REST API and SSE
Express API Server on GKE
  -> Firestore

Express API Server
  -> Gemini API for receipt parsing

GitHub Actions
  -> Artifact Registry
  -> GKE Deployment
```

## Frontend

The React SPA uses routes for login, register, dashboard, groups, new expense, expense detail, and notifications. Vite PWA caches the app shell so the UI loads offline and shows an offline banner when network access is unavailable.

## Backend

Express serves `/api/*` and the production React build. Security middleware includes helmet, cors, express-rate-limit, cookie-parser, JWT verification, bcrypt password hashing, upload MIME validation, and a 5 MB upload limit.

## Database

Firestore collections are `users`, `groups`, `expenses`, `comments`, and `notifications`. The local memory store follows the same collection names, which keeps local demos simple.

## AI Flow

```text
Receipt image/text
  -> /api/ai/parse-receipt-image or /api/ai/parse-receipt-text
  -> strict JSON Gemini prompt
  -> normalization and validation
  -> editable React review form
  -> user submits validated expense
```

Gemini output is never saved automatically. The user can edit merchant, title, category, money fields, item names, prices, quantities, and assignments before submission.

## SSE Flow

The frontend connects to `/api/notifications/stream` after login. The server keeps a response open per user and writes events when expenses are created, AI parsing finishes, approvals happen, disputes happen, or comments are added.
