#!/bin/bash

# Deploy via AWS CloudShell (ha Docker preinstallato)
set -e

REGION="us-west-2"
ACCOUNT_ID="703686967361"
REPO_NAME="warp-ecs-flutter"
IMAGE_TAG="latest"
CLUSTER="warp-flutter-cluster"
SERVICE="warp-flutter-service"
TASK_FAMILY="warp-flutter-web-task"

echo "🚀 Deploy ECS Container via CloudShell"
echo "======================================="
echo ""
echo "📋 ISTRUZIONI:"
echo "1. Apri AWS CloudShell: https://console.aws.amazon.com/cloudshell"
echo "2. Carica questi file:"
echo "   - ecs-server.js"
echo "   - Dockerfile.ecs"
echo "   - package.json"
echo "3. Esegui questi comandi:"
echo ""
echo "------- COPIA E INCOLLA IN CLOUDSHELL -------"
cat << 'CLOUDSHELL_SCRIPT'

# Variabili
REGION="us-west-2"
ACCOUNT_ID="703686967361"
REPO_NAME="warp-ecs-flutter"
IMAGE_TAG="latest"
CLUSTER="warp-flutter-cluster"
SERVICE="warp-flutter-service"
TASK_FAMILY="warp-flutter-web-task"

# 1. Login ECR
echo "1️⃣ Login to ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# 2. Build immagine
echo "2️⃣ Building Docker image..."
docker build -f Dockerfile.ecs -t $REPO_NAME:$IMAGE_TAG .

# 3. Tag
echo "3️⃣ Tagging..."
docker tag $REPO_NAME:$IMAGE_TAG $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG

# 4. Push
echo "4️⃣ Pushing to ECR..."
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG

# 5. Update service
echo "5️⃣ Updating ECS service..."
aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --force-new-deployment \
  --region $REGION

echo "✅ Deploy completato!"

CLOUDSHELL_SCRIPT
echo "------- FINE SCRIPT -------"
echo ""
echo "⏳ Tempo stimato: 10-15 minuti"
