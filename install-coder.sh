#!/bin/bash
set -e

# 1. Connect to Cluster (Ensure we are targeted correctly)
gcloud container clusters get-credentials drape-cluster --zone=us-central1-a --project=drape-mobile-ide

# 2. Add Coder Helm Repo
helm repo add coder-v2 https://helm.coder.com/v2
helm repo update

# 3. Install Coder (Postgres built-in for MVP)
# We use the values file we created
helm upgrade --install coder coder-v2/coder \
    --namespace coder \
    --create-namespace \
    --values backend/coder-values.yaml

echo "✅ Coder installation initiated!"
echo "⏳ Waiting for LoadBalancer IP..."

# 4. Wait for IP (Loop)
EXTERNAL_IP=""
while [ -z "$EXTERNAL_IP" ]; do
  echo "Waiting for External IP..."
  EXTERNAL_IP=$(kubectl get svc coder -n coder -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
  [ -z "$EXTERNAL_IP" ] && sleep 10
done

echo "🎉 Coder is available at: http://$EXTERNAL_IP"
echo "👉 You can now access the dashboard to create the first user."
