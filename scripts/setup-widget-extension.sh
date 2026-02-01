#!/bin/bash

# Script per automatizzare il setup del Widget Extension dopo expo prebuild
# Uso: ./scripts/setup-widget-extension.sh

set -e

echo "🟣 Setting up Preview Widget Extension for Dynamic Island..."

# Verifica che siamo nella directory del progetto
if [ ! -f "app.json" ]; then
  echo "❌ Errore: Devi eseguire questo script dalla root del progetto"
  exit 1
fi

# Verifica che il progetto iOS esista
if [ ! -d "ios/drapereact.xcworkspace" ]; then
  echo "⚠️  Il progetto iOS non esiste ancora. Esegui prima:"
  echo "   npx expo prebuild --clean"
  exit 1
fi

echo ""
echo "📋 SETUP MANUALE RICHIESTO:"
echo ""
echo "1. Apri il progetto Xcode:"
echo "   cd ios && open drapereact.xcworkspace"
echo ""
echo "2. Aggiungi Widget Extension Target:"
echo "   - Seleziona progetto → + sotto TARGETS"
echo "   - Widget Extension → Next"
echo "   - Product Name: PreviewWidgetExtension"
echo "   - Bundle ID: com.drape.app.PreviewWidgetExtension"
echo "   - iOS Deployment Target: 16.1"
echo "   - Language: Swift"
echo ""
echo "3. Aggiungi i file Swift al target PreviewWidgetExtension:"
echo "   - PreviewActivityAttributes.swift"
echo "   - PreviewLiveActivity.swift"
echo "   - PreviewWidgetExtensionBundle.swift"
echo "   - Info.plist"
echo ""
echo "4. Aggiungi il bridge React Native al target principale (drapereact):"
echo "   - PreviewActivityModule.swift"
echo "   - PreviewActivityModule.m"
echo ""
echo "5. Configura Capabilities:"
echo "   - Target drapereact: + Push Notifications"
echo "   - Entrambi i target: App Groups → group.com.drape.app"
echo ""
echo "6. Build Settings per PreviewWidgetExtension:"
echo "   - iOS Deployment Target: 16.1"
echo "   - Swift Language Version: Swift 5"
echo ""
echo "✅ Tutti i file sono già in ios/PreviewWidgetExtension/"
echo ""
echo "📖 Per istruzioni dettagliate: ios/PreviewWidgetExtension/README.md"
echo ""
echo "🎯 NOTA: Dopo ogni 'expo prebuild', il widget target viene rimosso"
echo "   e devi rifare questi passaggi. È una limitazione di Expo."
echo ""
