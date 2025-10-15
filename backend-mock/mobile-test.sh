#!/bin/bash

# 🚀 Test Script per Warp Mobile AI IDE
# Copia e incolla questi comandi uno alla volta nell'app Warp

echo "=== 🏥 Health Check ==="
curl -s https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod/health

echo -e "\n\n=== 👤 Crea Sessione ==="
RESPONSE=$(curl -s -X POST https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod/session/create \
  -H "Content-Type: application/json" \
  -H "X-User-ID: mobile-test")

echo "$RESPONSE"

# Estrai SESSION_ID dalla risposta (manualmente per ora)
echo -e "\n🔑 Copia il sessionId dalla risposta sopra e esegui:"
echo 'export SID="INCOLLA-QUI-IL-SESSION-ID"'

echo -e "\n=== 📁 Test Comandi Base ==="
echo "Dopo aver impostato SID, prova questi:"

echo -e "\n# Directory corrente:"
echo 'curl -X POST https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod/command/execute -H "Content-Type: application/json" -H "X-Session-ID: $SID" -d '"'"'{"command":"pwd"}'"'"

echo -e "\n# Lista file:"
echo 'curl -X POST https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod/command/execute -H "Content-Type: application/json" -H "X-Session-ID: $SID" -d '"'"'{"command":"ls -la"}'"'"

echo -e "\n# Crea file di test:"
echo 'curl -X POST https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod/command/execute -H "Content-Type: application/json" -H "X-Session-ID: $SID" -d '"'"'{"command":"echo Hello Mobile > test.txt && cat test.txt"}'"'"

echo -e "\n# Versione Python:"
echo 'curl -X POST https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod/command/execute -H "Content-Type: application/json" -H "X-Session-ID: $SID" -d '"'"'{"command":"python3 --version"}'"'"

echo -e "\n=== 🚛 Test ECS (Comando Pesante) ==="
echo 'curl -X POST https://o571gs6nb7.execute-api.us-east-1.amazonaws.com/prod/command/execute -H "Content-Type: application/json" -H "X-Session-ID: $SID" -d '"'"'{"command":"flutter --version"}'"'"

echo -e "\n\n🎯 Usa questi comandi uno alla volta per testare il tuo IDE!"