# 🚀 Deployment Guide - Drape Mobile IDE

## Overview

Drape uses GitHub Actions for automatic deployment to Google Cloud Run (backend) and Expo (frontend). This guide covers both automatic and manual deployment processes.

## 🔧 Prerequisites

### Required Accounts
- **GitHub Account** with repository access
- **Google Cloud Account** with billing enabled
- **Expo Account** for app deployment
- **Firebase Project** (drape-93229)

### Required Tools (for manual deployment)
- **Node.js** 18+ and npm
- **Google Cloud CLI** (gcloud)
- **Expo CLI** (`npm install -g @expo/cli`)
- **EAS CLI** (`npm install -g eas-cli`)

## 🔑 GitHub Secrets Configuration

### Firebase Secrets
```
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyDwUGNfILmN6ilCHzmFBnoVNKnN-iJ2kwo
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=drape-93229.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=drape-93229
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=drape-93229.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1047514620673
EXPO_PUBLIC_FIREBASE_APP_ID=1:1047514620673:web:b600908a79ec68f7ba3100
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=G-NZ5XCTTCRW
```

### Google Cloud Secrets
```
GOOGLE_CLOUD_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
VERTEX_AI_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

### GitHub OAuth Secrets
```
EXPO_PUBLIC_GITHUB_CLIENT_ID=Ov23likDO7phRcPUBcrk
GITHUB_CLIENT_SECRET=your_github_client_secret
```

### Optional AI Secrets
```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
```

### Deployment Secrets
```
EXPO_TOKEN=your_expo_access_token
```

## 🤖 Automatic Deployment (Recommended)

### Setup Process
1. **Configure GitHub Secrets** (see above)
2. **Push to main branch**
3. **GitHub Actions handles everything**

### Deployment Workflow
```bash
# Simple deployment process
git add .
git commit -m "Deploy new features"
git push origin main

# GitHub Actions automatically:
# 1. Deploys backend to Google Cloud Run
# 2. Gets real backend URL
# 3. Configures frontend with correct URLs  
# 4. Builds and deploys mobile app
# 5. Notifies team of deployment status
```

### Monitoring Deployment
1. **Go to GitHub repository**
2. **Click "Actions" tab**
3. **View deployment progress**
4. **Check logs for any issues**

## 🛠️ Manual Deployment

### Backend Deployment
```bash
# 1. Setup Google Cloud CLI
gcloud auth login
gcloud config set project drape-93229

# 2. Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com

# 3. Deploy backend
cd backend
gcloud builds submit --config cloudbuild.yaml

# 4. Get backend URL
gcloud run services describe drape-backend \
  --region=us-central1 \
  --format="value(status.url)"
```

### Frontend Deployment
```bash
# 1. Update .env with backend URL
echo "EXPO_PUBLIC_API_URL=https://your-backend-url" >> .env

# 2. Install dependencies
npm install

# 3. Build for production
npm run build

# 4. Deploy to Expo
eas login
eas build --platform all
eas submit --platform all
```

## 🏗️ Infrastructure Setup

### Google Cloud Services
```bash
# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com
```

### Firebase Configuration
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and select project
firebase login
firebase use drape-93229

# Deploy Firebase rules (if needed)
firebase deploy --only firestore:rules
```

### Container Registry Setup
```bash
# Configure Docker for Google Cloud
gcloud auth configure-docker

# Build and push container (done automatically by Cloud Build)
docker build -t gcr.io/drape-93229/drape-backend .
docker push gcr.io/drape-93229/drape-backend
```

## 🔄 CI/CD Pipeline Details

### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy Drape App

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  deploy-backend:
    # Deploys Node.js backend to Google Cloud Run
    # Gets real backend URL for frontend configuration
    
  deploy-frontend:
    # Uses backend URL to configure frontend
    # Builds and deploys React Native app to Expo
    
  notify-team:
    # Sends deployment notifications
    # Reports success/failure status
```

### Deployment Stages
1. **Code Quality Checks**
   - TypeScript compilation
   - ESLint validation
   - Unit tests execution

2. **Backend Deployment**
   - Build Docker container
   - Deploy to Google Cloud Run
   - Configure environment variables
   - Run health checks

3. **Frontend Configuration**
   - Generate .env with real backend URL
   - Install dependencies
   - Build production bundle

4. **Mobile App Deployment**
   - Build for iOS/Android
   - Submit to app stores (if configured)
   - Deploy web version

5. **Post-Deployment**
   - Run integration tests
   - Send notifications
   - Update documentation

## 🔍 Troubleshooting

### Common Issues

#### Backend Deployment Fails
```bash
# Check Cloud Build logs
gcloud builds list --limit=5

# View specific build logs
gcloud builds log [BUILD_ID]

# Common fixes:
# - Check service account permissions
# - Verify API keys in secrets
# - Ensure billing is enabled
```

#### Frontend Build Fails
```bash
# Check TypeScript errors
npx tsc --noEmit

# Check for missing dependencies
npm install

# Verify environment variables
cat .env

# Common fixes:
# - Update backend URL in .env
# - Check Expo token validity
# - Verify all secrets are configured
```

#### Container Won't Start
```bash
# Check Cloud Run logs
gcloud logs read --service=drape-backend --limit=50

# Test locally
cd backend
npm start

# Common fixes:
# - Check PORT environment variable
# - Verify service account permissions
# - Test API endpoints manually
```

### Health Checks
```bash
# Test backend health
curl https://your-backend-url/health

# Expected response:
{
  "status": "healthy",
  "project": "drape-93229",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 📊 Monitoring & Logging

### Google Cloud Monitoring
- **Cloud Run metrics**: Request count, latency, errors
- **Container metrics**: CPU, memory, disk usage
- **AI API usage**: Vertex AI request count and costs

### Application Logs
```bash
# View backend logs
gcloud logs read --service=drape-backend

# View specific log entries
gcloud logs read --filter="severity>=ERROR"

# Real-time log streaming
gcloud logs tail --service=drape-backend
```

### Performance Monitoring
- **Response times**: API endpoint performance
- **Error rates**: Failed requests and exceptions
- **Resource usage**: Container CPU and memory
- **Cost tracking**: Daily/monthly spending

## 🔒 Security Considerations

### API Key Management
- **Never commit secrets** to repository
- **Use GitHub Secrets** for all sensitive data
- **Rotate keys regularly** (quarterly recommended)
- **Monitor usage** for unusual activity

### Container Security
- **Minimal base images** to reduce attack surface
- **Non-root user** for container execution
- **Resource limits** to prevent abuse
- **Network policies** for service isolation

### Access Control
- **IAM roles** with minimal required permissions
- **Service accounts** for automated processes
- **Audit logging** for all administrative actions
- **Regular security reviews** of permissions

## 💰 Cost Optimization

### Resource Management
```yaml
# Cloud Run configuration for cost optimization
resources:
  limits:
    cpu: "1"
    memory: "512Mi"
  requests:
    cpu: "0.1"
    memory: "128Mi"

# Auto-scaling settings
annotations:
  autoscaling.knative.dev/minScale: "0"
  autoscaling.knative.dev/maxScale: "10"
  run.googleapis.com/cpu-throttling: "true"
```

### Monitoring Costs
- **Set billing alerts** for unexpected usage
- **Review monthly reports** for optimization opportunities
- **Use cost calculators** for capacity planning
- **Implement usage quotas** to prevent overruns

## 🚀 Production Readiness

### Pre-Production Checklist
- [ ] All GitHub Secrets configured
- [ ] Backend health check passes
- [ ] Frontend builds successfully
- [ ] AI integration working
- [ ] Container auto-scaling configured
- [ ] Monitoring and alerting setup
- [ ] Backup and recovery tested
- [ ] Security review completed

### Go-Live Process
1. **Final testing** in staging environment
2. **Deploy to production** via GitHub Actions
3. **Verify all services** are healthy
4. **Monitor for issues** in first 24 hours
5. **Update documentation** with any changes

---

## 📞 Support

For deployment issues:
- **Check GitHub Actions logs** for build failures
- **Review Google Cloud logs** for runtime errors
- **Verify all secrets** are properly configured
- **Test locally** before deploying to production

**Deployment should be smooth and automatic once properly configured!** 🎯
