#!/bin/bash

# Setup CodeBuild per build Docker
set -e

REGION="us-west-2"
PROJECT_NAME="warp-flutter-docker-build"
REPO_NAME="warp-ecs-flutter"
IMAGE_TAG="with-flutter"
ACCOUNT_ID="703686967361"

echo "🚀 Setup CodeBuild per Docker Build"
echo "===================================="

# 1. Crea buildspec.yml
cat > buildspec-docker.yml << 'EOF'
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
  build:
    commands:
      - echo Build started on `date`
      - echo Building Docker image...
      - docker build -f Dockerfile.ecs -t $IMAGE_REPO_NAME:$IMAGE_TAG .
      - docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG
  post_build:
    commands:
      - echo Build completed on `date`
      - echo Pushing Docker image...
      - docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG
EOF

# 2. Upload file a S3 (per CodeBuild)
echo "📦 Creando archivio source..."
zip -r source.zip Dockerfile.ecs ecs-server.js package.json buildspec-docker.yml

# 3. Crea bucket S3 se non esiste
BUCKET_NAME="warp-codebuild-source-$ACCOUNT_ID"
aws s3 mb s3://$BUCKET_NAME --region $REGION 2>/dev/null || echo "Bucket già esistente"

# 4. Upload source
echo "📤 Uploading source a S3..."
aws s3 cp source.zip s3://$BUCKET_NAME/source.zip --region $REGION

# 5. Crea CodeBuild project
echo "🏗️ Creando CodeBuild project..."
cat > codebuild-project.json << EOF
{
  "name": "$PROJECT_NAME",
  "source": {
    "type": "S3",
    "location": "$BUCKET_NAME/source.zip"
  },
  "artifacts": {
    "type": "NO_ARTIFACTS"
  },
  "environment": {
    "type": "LINUX_CONTAINER",
    "image": "aws/codebuild/standard:7.0",
    "computeType": "BUILD_GENERAL1_LARGE",
    "privilegedMode": true,
    "environmentVariables": [
      {"name": "AWS_DEFAULT_REGION", "value": "$REGION"},
      {"name": "AWS_ACCOUNT_ID", "value": "$ACCOUNT_ID"},
      {"name": "IMAGE_REPO_NAME", "value": "$REPO_NAME"},
      {"name": "IMAGE_TAG", "value": "$IMAGE_TAG"}
    ]
  },
  "serviceRole": "arn:aws:iam::$ACCOUNT_ID:role/CodeBuildServiceRole"
}
EOF

aws codebuild create-project --cli-input-json file://codebuild-project.json --region $REGION 2>/dev/null || \
  aws codebuild update-project --cli-input-json file://codebuild-project.json --region $REGION

# 6. Start build
echo "🚀 Starting build..."
BUILD_ID=$(aws codebuild start-build \
  --project-name $PROJECT_NAME \
  --region $REGION \
  --query 'build.id' \
  --output text)

echo "✅ Build avviato!"
echo "📊 Build ID: $BUILD_ID"
echo "🌐 Monitora: https://console.aws.amazon.com/codesuite/codebuild/projects/$PROJECT_NAME/build/$BUILD_ID"
echo ""
echo "⏳ Il build richiederà 10-15 minuti"
echo "📝 Quando completo, esegui: bash update-ecs-service.sh"
