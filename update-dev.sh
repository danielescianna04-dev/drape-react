#!/bin/bash
# Push OTA update to DEV channel with dev environment variables
# Usage: ./update-dev.sh "descrizione modifica"

MESSAGE="${1:-dev update}"

EXPO_PUBLIC_ENV=development \
EXPO_PUBLIC_API_URL=https://dev.drape.info \
EXPO_PUBLIC_WS_URL=wss://dev.drape.info \
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSyApLi3ZCoaJxE9PKV617LczwOGnffyHca4 \
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=drape-dev.firebaseapp.com \
EXPO_PUBLIC_FIREBASE_PROJECT_ID=drape-dev \
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=drape-dev.firebasestorage.app \
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=127888670449 \
EXPO_PUBLIC_FIREBASE_APP_ID=1:127888670449:web:d7de3fe78034aaa74b3350 \
eas update --channel preview --message "$MESSAGE"
