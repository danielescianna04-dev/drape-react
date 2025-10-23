#!/bin/bash

echo "🔧 Setting up Drape Backend..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
read -p "Enter your Google Cloud Project ID [drape-mobile-ide]: " PROJECT_ID
PROJECT_ID=${PROJECT_ID:-drape-mobile-ide}

echo "📋 Using project: $PROJECT_ID"

# Set project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔌 Enabling required APIs..."
gcloud services enable firestore.googleapis.com
gcloud services enable aiplatform.googleapis.com

# Create service account
echo "👤 Creating service account..."
gcloud iam service-accounts create drape-backend \
    --display-name="Drape Backend Service Account" \
    --project=$PROJECT_ID 2>/dev/null || echo "Service account already exists"

# Grant permissions
echo "🔐 Granting Firestore permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:drape-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/datastore.user"

# Create key
echo "🔑 Creating service account key..."
gcloud iam service-accounts keys create backend/service-account-key.json \
    --iam-account=drape-backend@${PROJECT_ID}.iam.gserviceaccount.com \
    --project=$PROJECT_ID

# Update backend .env
echo "📝 Updating backend .env..."
echo "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" > backend/.env
echo "PORT=3000" >> backend/.env

echo "✅ Backend setup complete!"
echo ""
echo "To start backend:"
echo "  cd backend"
echo "  GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json node server.js"
