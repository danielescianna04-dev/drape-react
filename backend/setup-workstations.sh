#!/bin/bash

PROJECT_ID="drape-93229"
LOCATION="us-central1"
CLUSTER="drape-cluster"
CONFIG="drape-config"

echo "🚀 Setting up Google Cloud Workstations..."

# Create cluster
echo "📦 Creating workstation cluster..."
gcloud workstations clusters create $CLUSTER \
  --region=$LOCATION \
  --project=$PROJECT_ID \
  --network=default \
  --subnetwork=default

# Create config
echo "⚙️ Creating workstation config..."
gcloud workstations configs create $CONFIG \
  --cluster=$CLUSTER \
  --region=$LOCATION \
  --project=$PROJECT_ID \
  --machine-type=e2-standard-4 \
  --boot-disk-size=50GB

echo "✅ Setup complete!"
echo "Cluster: $CLUSTER"
echo "Config: $CONFIG"
