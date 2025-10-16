#!/bin/bash

# Set project ID
PROJECT_ID="drape-mobile-ide"
REGION="us-central1"

echo "🚀 Deploying Drape Backend to Google Cloud Run..."

# Navigate to backend directory
cd backend

# Build and deploy using Cloud Build
gcloud builds submit --config cloudbuild.yaml --project=$PROJECT_ID

# Get the service URL
SERVICE_URL=$(gcloud run services describe drape-backend --region=$REGION --project=$PROJECT_ID --format="value(status.url)")

echo "✅ Backend deployed successfully!"
echo "🌐 Backend URL: $SERVICE_URL"
echo ""
echo "📝 Update your .env file:"
echo "EXPO_PUBLIC_API_URL=$SERVICE_URL"
echo "EXPO_PUBLIC_WS_URL=${SERVICE_URL/https:/wss:}"
