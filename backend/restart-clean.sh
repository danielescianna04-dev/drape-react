#!/bin/bash
# Script per riavvio pulito del backend con invalidazione cache

echo "🔄 Stopping all Node processes..."
killall -9 node 2>/dev/null
sleep 2

echo "🧹 Cleaning caches..."
rm -rf node_modules/.cache 2>/dev/null
rm -rf .cache 2>/dev/null

echo "🚀 Starting fresh server..."
cd "$(dirname "$0")"
node server.js > /tmp/drape-backend.log 2>&1 &
NEW_PID=$!

sleep 8
echo "✅ Server started with PID: $NEW_PID"
echo "📋 Logs: tail -f /tmp/drape-backend.log"

# Verifica che il server sia attivo
if ps -p $NEW_PID > /dev/null; then
   echo "✅ Server is running"
else
   echo "❌ Server failed to start. Check logs."
fi
