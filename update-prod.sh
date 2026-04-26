#!/bin/bash
# Push OTA update to PROD channel with production environment variables
# Usage: ./update-prod.sh "descrizione modifica"

MESSAGE="${1:-prod update}"

EXPO_PUBLIC_ENV=production \
EXPO_PUBLIC_API_URL=https://drape.info \
EXPO_PUBLIC_WS_URL=wss://drape.info \
eas update --channel production --message "$MESSAGE"
