#!/bin/bash

# Deploy ECS Container con Flutter
set -e

REGION="us-west-2"
ACCOUNT_ID="703686967361"
REPO_NAME="warp-ecs-flutter"
IMAGE_TAG="latest"
CLUSTER="warp-flutter-cluster"
SERVICE="warp-flutter-service"
TASK_FAMILY="warp-flutter-web-task"

echo "🚀 Deploy ECS Container con Flutter"
echo "===================================="

# 1. Login ECR
echo "1️⃣ Login to ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# 2. Build immagine Docker
echo "2️⃣ Building Docker image..."
docker build -f Dockerfile.ecs -t $REPO_NAME:$IMAGE_TAG .

# 3. Tag immagine
echo "3️⃣ Tagging image..."
docker tag $REPO_NAME:$IMAGE_TAG $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG

# 4. Push a ECR
echo "4️⃣ Pushing to ECR..."
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG

# 5. Registra nuova task definition
echo "5️⃣ Registering new task definition..."
TASK_DEF=$(cat <<EOF
{
  "family": "$TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [
    {
      "name": "warp-flutter-container",
      "image": "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "PORT", "value": "3000"},
        {"name": "NODE_ENV", "value": "production"},
        {"name": "FLUTTER_HOME", "value": "/opt/flutter"},
        {"name": "PATH", "value": "/opt/flutter/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/$SERVICE",
          "awslogs-region": "$REGION",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
EOF
)

echo "$TASK_DEF" > /tmp/task-def.json
aws ecs register-task-definition --cli-input-json file:///tmp/task-def.json --region $REGION

# 6. Update service
echo "6️⃣ Updating ECS service..."
NEW_TASK_DEF=$(aws ecs describe-task-definition --task-definition $TASK_FAMILY --region $REGION --query 'taskDefinition.taskDefinitionArn' --output text)

aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --task-definition $NEW_TASK_DEF \
  --force-new-deployment \
  --region $REGION

echo "✅ Deploy completato!"
echo ""
echo "📝 Monitoraggio:"
echo "   aws ecs describe-services --cluster $CLUSTER --services $SERVICE --region $REGION"
echo "   aws logs tail /ecs/$SERVICE --follow --region $REGION"
