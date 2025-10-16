#!/bin/bash

# Setup Google Cloud service account for GitHub Actions
PROJECT_ID="drape-93229"
SERVICE_ACCOUNT_NAME="github-actions"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Creating service account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
    --description="Service account for GitHub Actions" \
    --display-name="GitHub Actions"

echo "Granting necessary roles..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/cloudbuild.builds.builder"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
    --role="roles/iam.serviceAccountUser"

echo "Creating and downloading key..."
gcloud iam service-accounts keys create key.json \
    --iam-account=$SERVICE_ACCOUNT_EMAIL

echo "Key created in key.json"
echo "Copy the contents of key.json to GitHub Secret: GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY"
