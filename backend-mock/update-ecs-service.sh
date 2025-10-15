#!/bin/bash

# Update ECS service con nuova immagine Flutter
set -e

REGION="us-west-2"
ACCOUNT_ID="703686967361"
REPO_NAME="warp-ecs-flutter"
IMAGE_TAG="with-flutter"
CLUSTER="warp-flutter-cluster"
SERVICE="warp-flutter-service"

echo "🔄 Updating ECS Service con Flutter"
echo "===================================="

# 1. Crea task definition
echo "1️⃣ Creating task definition..."
cat > /tmp/task-def-flutter.json << EOF
{
  "family": "warp-flutter-web-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "containerDefinitions": [{
    "name": "warp-flutter-container",
    "image": "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:$IMAGE_TAG",
    "essential": true,
    "portMappings": [{"containerPort": 3000, "protocol": "tcp"}],
    "environment": [
      {"name": "PORT", "value": "3000"},
      {"name": "NODE_ENV", "value": "production"},
      {"name": "FLUTTER_HOME", "value": "/opt/flutter"},
      {"name": "DART_HOME", "value": "/opt/flutter/bin/cache/dart-sdk"},
      {"name": "PATH", "value": "/opt/flutter/bin:/opt/flutter/bin/cache/dart-sdk/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/warp-flutter-service",
        "awslogs-region": "$REGION",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }],
  "executionRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::$ACCOUNT_ID:role/ecsTaskExecutionRole"
}
EOF

# 2. Registra task definition
echo "2️⃣ Registering task definition..."
TASK_DEF_ARN=$(aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-def-flutter.json \
  --region $REGION \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

echo "✅ Task definition: $TASK_DEF_ARN"

# 3. Update service
echo "3️⃣ Updating ECS service..."
aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --task-definition $TASK_DEF_ARN \
  --force-new-deployment \
  --region $REGION

echo "✅ Service update avviato!"
echo ""
echo "📊 Monitora deployment:"
echo "   watch -n 5 'aws ecs describe-services --cluster $CLUSTER --services $SERVICE --region $REGION --query \"services[0].{Running:runningCount,Desired:desiredCount}\"'"
echo ""
echo "🧪 Test dopo 2-3 minuti:"
echo "   curl -X POST http://warp-flutter-alb-1904513476.us-west-2.elb.amazonaws.com/execute-heavy -H 'Content-Type: application/json' -d '{\"command\":\"flutter --version\",\"repository\":\"test\"}'"
