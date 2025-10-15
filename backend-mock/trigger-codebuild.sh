#!/bin/bash

# Trigger CodeBuild per rebuild immagine con Flutter
REGION="us-west-2"
PROJECT_NAME="warp-flutter-build"

echo "🚀 Triggering CodeBuild..."

# Verifica se progetto esiste
aws codebuild list-projects --region $REGION | grep -q "$PROJECT_NAME" || {
  echo "❌ CodeBuild project non trovato"
  echo "📝 Crea manualmente su: https://console.aws.amazon.com/codesuite/codebuild/projects"
  exit 1
}

# Start build
BUILD_ID=$(aws codebuild start-build \
  --project-name $PROJECT_NAME \
  --region $REGION \
  --query 'build.id' \
  --output text)

echo "✅ Build avviato: $BUILD_ID"
echo "📊 Monitora: https://console.aws.amazon.com/codesuite/codebuild/projects/$PROJECT_NAME/build/$BUILD_ID"
