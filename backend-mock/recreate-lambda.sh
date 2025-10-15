#!/bin/bash

# Script per ricreare Lambda Function
REGION="us-west-2"
FUNCTION_NAME="WarpMobileCommandHandler"
ROLE_NAME="WarpLambdaExecutionRole"
ECS_ENDPOINT="http://internal-warp-flutter-alb.us-west-2.elb.amazonaws.com"

echo "🚀 Ricreazione Lambda Function"
echo "================================"

# 1. Crea IAM Role per Lambda (se non esiste)
echo "1️⃣ Creazione IAM Role..."
aws iam create-role \
  --role-name $ROLE_NAME \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "lambda.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }' \
  --region $REGION 2>/dev/null || echo "Role già esistente"

# Attach policy
aws iam attach-role-policy \
  --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam attach-role-policy \
  --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess

sleep 5

# 2. Package Lambda
echo "2️⃣ Packaging Lambda code..."
cd lambda
npm install --production
zip -r ../lambda-package.zip . -x "*.git*" "test*" "*.md"
cd ..

# 3. Create Lambda Function
echo "3️⃣ Creazione Lambda Function..."
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text)

aws lambda create-function \
  --function-name $FUNCTION_NAME \
  --runtime nodejs18.x \
  --role $ROLE_ARN \
  --handler command-handler.handler \
  --zip-file fileb://lambda-package.zip \
  --timeout 900 \
  --memory-size 512 \
  --environment "Variables={
    ECS_ENDPOINT=$ECS_ENDPOINT,
    ECS_CLUSTER_NAME=warp-flutter-cluster,
    ECS_SERVICE_NAME=warp-flutter-service
  }" \
  --region $REGION

echo "✅ Lambda creata!"
echo ""
echo "📝 Prossimi passi:"
echo "   1. Crea API Gateway"
echo "   2. Collega Lambda ad API Gateway"
echo "   3. Aggiorna endpoint nell'app Flutter"
