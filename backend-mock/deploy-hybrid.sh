#!/bin/bash

# Deploy script per architettura ibrida Lambda + ECS Fargate
set -e

PROJECT_NAME="warp-mobile-ai-ide"
ENVIRONMENT="prod"
AWS_REGION="us-east-1"

echo "🚀 Deploying Hybrid Architecture: Lambda + ECS Fargate"
echo "📋 Project: $PROJECT_NAME"
echo "🌍 Environment: $ENVIRONMENT"
echo "🗺️  Region: $AWS_REGION"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install and configure it."
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker."
    exit 1
fi

echo "1️⃣  Building and pushing ECS container image..."

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPOSITORY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${PROJECT_NAME}"

# Login to ECR
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY

# Build Docker image
echo "🏗️  Building Docker image..."
docker build -f Dockerfile.ecs -t $PROJECT_NAME:latest .

# Tag for ECR
docker tag $PROJECT_NAME:latest $ECR_REPOSITORY:latest

# Push to ECR
echo "⬆️  Pushing to ECR..."
docker push $ECR_REPOSITORY:latest

echo "✅ Container image pushed successfully!"
echo ""

echo "2️⃣  Deploying CloudFormation stack..."

# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file ../aws/cloudformation-template.yaml \
  --stack-name "${PROJECT_NAME}-${ENVIRONMENT}" \
  --parameter-overrides \
    ProjectName=$PROJECT_NAME \
    Environment=$ENVIRONMENT \
  --capabilities CAPABILITY_NAMED_IAM \
  --region $AWS_REGION

echo "✅ CloudFormation stack deployed successfully!"
echo ""

echo "3️⃣  Updating Lambda function code..."

# Package Lambda function
zip -r lambda-function.zip \
  lambda-simple/ \
  package*.json \
  -x "*.git*"

# Update Lambda function
LAMBDA_FUNCTION_NAME="${PROJECT_NAME}-${ENVIRONMENT}-command-handler"

aws lambda update-function-code \
  --function-name $LAMBDA_FUNCTION_NAME \
  --zip-file fileb://lambda-function.zip \
  --region $AWS_REGION

echo "✅ Lambda function updated successfully!"
echo ""

echo "4️⃣  Getting deployment info..."

# Get outputs from CloudFormation
API_GATEWAY_URL=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-${ENVIRONMENT}" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayUrl'].OutputValue" \
  --output text \
  --region $AWS_REGION)

ALB_DNS_NAME=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-${ENVIRONMENT}" \
  --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" \
  --output text \
  --region $AWS_REGION)

ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name "${PROJECT_NAME}-${ENVIRONMENT}" \
  --query "Stacks[0].Outputs[?OutputKey=='ECRRepositoryURI'].OutputValue" \
  --output text \
  --region $AWS_REGION)

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📡 API Gateway URL: $API_GATEWAY_URL"
echo "⚖️  Load Balancer: http://$ALB_DNS_NAME"
echo "🐳 ECR Repository: $ECR_URI"
echo ""
echo "📱 Update your Flutter app with the API Gateway URL:"
echo "   const API_BASE_URL = '$API_GATEWAY_URL';"
echo ""
echo "🧪 Test endpoints:"
echo "   Health Check (Lambda): curl $API_GATEWAY_URL/health"
echo "   System Info (ECS): curl http://$ALB_DNS_NAME/system/info"
echo "   Flutter Doctor (ECS): curl http://$ALB_DNS_NAME/flutter/doctor"
echo ""

# Clean up
rm -f lambda-function.zip

echo "🏁 All done! Your hybrid architecture is ready to use."