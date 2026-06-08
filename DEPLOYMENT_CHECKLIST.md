# FairShare Finish Checklist

This is the work that must happen outside the codebase before final submission.

## 1. Create or Confirm Google Cloud Access

1. Go to `https://console.cloud.google.com/`.
2. Create a project, for example `fairshare-cs144`.
3. Enable billing for the project.
4. Enable these APIs:
   - Kubernetes Engine API
   - Artifact Registry API
   - Firestore API
   - IAM Service Account Credentials API

CLI version:

```bash
gcloud projects create fairshare-cs144
gcloud config set project fairshare-cs144
gcloud services enable container.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com iamcredentials.googleapis.com
```

## 2. Create Firestore

1. In Google Cloud Console, open Firestore.
2. Create a Firestore database.
3. Choose Native mode.
4. Pick a region close to the GKE region, such as `us-west1`.

CLI version:

```bash
gcloud firestore databases create --location=us-west1
```

## 3. Get a Gemini API Key

1. Go to `https://aistudio.google.com/app/apikey`.
2. Create an API key.
3. Save it for `GEMINI_API_KEY`.
4. Do not commit it to GitHub.

## 4. Replace Local Secrets

Copy `.env.example` to `.env` for local testing.

```bash
cp .env.example .env
```

Set these values:

```env
JWT_SECRET=use-a-long-random-secret
GEMINI_API_KEY=your-gemini-api-key
FIRESTORE_PROJECT_ID=your-gcp-project-id
CLIENT_ORIGIN=http://localhost:5173
```

Generate a strong JWT secret:

```bash
openssl rand -base64 48
```

## 5. Create Artifact Registry

```bash
gcloud artifacts repositories create fairshare \
  --repository-format=docker \
  --location=us-west1 \
  --description="FairShare Docker images"
```

## 6. Create a GKE Cluster

The course requires at least 2 nodes and at least 2 pod replicas.

```bash
gcloud container clusters create fairshare-cluster \
  --zone us-west1-a \
  --machine-type e2-micro \
  --num-nodes 2
```

If e2-micro is too constrained, ask the instructor before using e2-small.

## 7. Create Kubernetes Secrets

```bash
kubectl create secret generic fairshare-secrets \
  --from-literal=NODE_ENV=production \
  --from-literal=PORT=8080 \
  --from-literal=CLIENT_ORIGIN=https://YOUR_DOMAIN \
  --from-literal=JWT_SECRET='YOUR_LONG_RANDOM_SECRET' \
  --from-literal=GEMINI_API_KEY='YOUR_GEMINI_KEY' \
  --from-literal=FIRESTORE_PROJECT_ID='YOUR_GCP_PROJECT_ID'
```

## 8. Configure HTTPS Domain

The course requires HTTPS.

1. Get the course-provided domain or approved domain.
2. Replace `fairshare.example.com` in:
   - `k8s/ingress.yaml`
   - `k8s/managed-certificate.yaml`
3. Point the domain DNS record to the GKE ingress IP after deployment.
4. Wait for the managed certificate to become active.

Useful commands:

```bash
kubectl get ingress fairshare
kubectl describe managedcertificate fairshare-cert
```

## 9. Configure GitHub Actions Secrets

In GitHub, open repo Settings -> Secrets and variables -> Actions.

Add:

```text
GCP_SERVICE_ACCOUNT_KEY
GCP_PROJECT_ID
ARTIFACT_REGISTRY_REGION
ARTIFACT_REGISTRY_REPOSITORY
GKE_CLUSTER
GKE_ZONE
```

Suggested values:

```text
ARTIFACT_REGISTRY_REGION=us-west1
ARTIFACT_REGISTRY_REPOSITORY=fairshare
GKE_CLUSTER=fairshare-cluster
GKE_ZONE=us-west1-a
```

## 10. Create the GitHub Actions Service Account

```bash
gcloud iam service-accounts create github-actions-fairshare

gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT_ID \
  --member="serviceAccount:github-actions-fairshare@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding YOUR_GCP_PROJECT_ID \
  --member="serviceAccount:github-actions-fairshare@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/container.developer"

gcloud iam service-accounts keys create gcp-key.json \
  --iam-account=github-actions-fairshare@YOUR_GCP_PROJECT_ID.iam.gserviceaccount.com
```

Paste the contents of `gcp-key.json` into the GitHub secret `GCP_SERVICE_ACCOUNT_KEY`.

## 11. Push and Run CI/CD

```bash
git add .
git commit -m "Build FairShare final project"
git push origin main
```

Then open GitHub Actions and confirm the workflow builds, tests, pushes the Docker image, and deploys to GKE.

## 12. Capture Required Logs

Replace or supplement `logs/github-actions-sample.log` with copied successful logs from GitHub Actions.

The logs should show:

- dependency install
- backend tests
- frontend build
- Docker build
- Docker push
- GKE deploy

## 13. Record the Demo

Show:

1. Deployed HTTPS app URL.
2. Register/login.
3. Create `Vegas Trip`.
4. Add Yinan, Alice, Bob, Chloe.
5. Upload or paste receipt.
6. Check and edit receipt fields.
7. Assign items with drag and drop.
8. Submit expense.
9. Show SSE notification.
10. Approve or dispute with comment.
11. Show Canvas chart.
12. Show PWA offline behavior.
13. Show GKE load balancer or ingress IP.
14. Delete a pod and show Kubernetes recreates it.
15. Scale replicas down/up.
16. Show GitHub Actions logs.

Useful GKE demo commands:

```bash
kubectl get pods
kubectl delete pod POD_NAME
kubectl get pods --watch
kubectl scale deployment/fairshare --replicas=1
kubectl scale deployment/fairshare --replicas=2
kubectl get service fairshare
kubectl get ingress fairshare
```
