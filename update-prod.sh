#!/bin/bash
# Push OTA update to PROD channel with production environment variables
# Usage: ./update-prod.sh "descrizione modifica"

MESSAGE="${1:-prod update}"

eas update --channel production --message "$MESSAGE"
