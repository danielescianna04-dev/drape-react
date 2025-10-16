# 📱 Drape - Publication Guide

## Pre-Publication Checklist

### ✅ App Configuration
- [ ] Update `app.json` with final app name, version, icons
- [ ] Set production API URLs in `.env`
- [ ] Test all features work with production backend
- [ ] Add app icons (1024x1024 for iOS, various sizes for Android)
- [ ] Add splash screen images
- [ ] Configure app permissions in `app.json`

### ✅ Backend Deployment
- [ ] Deploy backend to Google Cloud Run
- [ ] Configure all API keys in Google Secret Manager
- [ ] Test backend endpoints are working
- [ ] Set up monitoring and logging

### ✅ Store Requirements

#### iOS App Store
- [ ] Apple Developer Account ($99/year)
- [ ] App Store Connect setup
- [ ] Privacy Policy URL
- [ ] App description and screenshots
- [ ] Age rating and content warnings

#### Google Play Store
- [ ] Google Play Developer Account ($25 one-time)
- [ ] Play Console setup
- [ ] Privacy Policy URL
- [ ] App description and screenshots
- [ ] Content rating questionnaire

### ✅ Legal & Privacy
- [ ] Privacy Policy (required for both stores)
- [ ] Terms of Service
- [ ] Data handling compliance (GDPR, CCPA)
- [ ] Third-party licenses acknowledgment

## Publication Commands

### iOS
```bash
# Configure EAS
npx eas login
npx eas build:configure

# Build for iOS
npx eas build --platform ios --profile production

# Submit to App Store
npx eas submit --platform ios
```

### Android
```bash
# Build for Android
npx eas build --platform android --profile production

# Submit to Google Play
npx eas submit --platform android
```

### Web
```bash
# Build for web
npx expo export:web

# Deploy to Netlify
netlify deploy --prod --dir web-build
```

## Post-Publication

### ✅ Monitoring
- [ ] Set up crash reporting (Sentry)
- [ ] Monitor backend performance
- [ ] Track user analytics
- [ ] Monitor API usage and costs

### ✅ Updates
- [ ] Set up CI/CD pipeline
- [ ] Plan update schedule
- [ ] Monitor user feedback
- [ ] Prepare bug fix releases

## Estimated Costs

### One-time
- Apple Developer: $99/year
- Google Play Developer: $25 one-time
- Domain name: ~$10/year

### Monthly (estimated)
- Google Cloud Run: $10-50/month (depending on usage)
- Firebase: $0-25/month (depending on usage)
- AI API calls: $20-100/month (depending on usage)

## Timeline
- **Setup & Testing**: 1-2 days
- **Store Review**: 1-7 days (Apple), 1-3 days (Google)
- **Total**: ~1-2 weeks from submission to live

## Support
- Create support email: support@drape.app
- Set up documentation site
- Prepare FAQ and troubleshooting guides
