#!/bin/bash

# Deploy Lambda Simple (no Docker required)
set -e

PROJECT_NAME="warp-mobile-ai-ide"
ENVIRONMENT="prod" 
REGION="us-east-1"
LAMBDA_FUNCTION="${PROJECT_NAME}-${ENVIRONMENT}-handler"

echo "🚀 Deploying Lambda Simple Code (no Docker)"
echo "📋 Project: $PROJECT_NAME"
echo "🌍 Environment: $ENVIRONMENT" 
echo "🗺️  Region: $REGION"
echo "⚡ Function: $LAMBDA_FUNCTION"
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install and configure it."
    exit 1
fi

# Create temporary package directory
echo "1️⃣  Creating Lambda package..."
mkdir -p lambda-deploy-package
cp -r lambda-simple/* lambda-deploy-package/

# Create deployment zip
echo "🗜️  Creating deployment package..."
cd lambda-deploy-package
zip -r ../lambda-simple-deployment.zip . > /dev/null
cd ..

PACKAGE_SIZE=$(du -h lambda-simple-deployment.zip | cut -f1)
echo "✅ Lambda package created: lambda-simple-deployment.zip ($PACKAGE_SIZE)"
echo ""

# Update Lambda function
echo "2️⃣  Updating Lambda function..."
aws lambda update-function-code \
    --function-name $LAMBDA_FUNCTION \
    --zip-file fileb://lambda-simple-deployment.zip \
    --region $REGION

if [ $? -ne 0 ]; then
    echo "❌ Lambda deployment failed"
    exit 1
fi

echo "⏳ Waiting for function update to complete..."
aws lambda wait function-updated \
    --function-name $LAMBDA_FUNCTION \
    --region $REGION

echo "✅ Lambda function deployed successfully!"
echo ""

# Test deployment
echo "3️⃣  Testing deployment..."
FUNCTION_INFO=$(aws lambda get-function \
    --function-name $LAMBDA_FUNCTION \
    --region $REGION \
    --query 'Configuration.{LastModified:LastModified,Version:Version}' \
    --output json)

echo "📊 Function Info: $FUNCTION_INFO"

# Clean up
echo "🧹 Cleaning up..."
rm -f lambda-simple-deployment.zip
rm -rf lambda-deploy-package

echo ""
echo "🎉 Deployment completed successfully!"
echo "🧪 Test with: curl <API_GATEWAY_URL>/health"
echo "📊 AWS Console: https://console.aws.amazon.com/lambda/home?region=$REGION#/functions/$LAMBDA_FUNCTION"