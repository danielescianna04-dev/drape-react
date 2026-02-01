# 🟣 Dynamic Island - Quick Start

## TL;DR - Cosa Fare Adesso

### 1. Prebuild (se non fatto)
```bash
npx expo prebuild --clean
```

### 2. Setup Xcode
```bash
cd ios
open drapereact.xcworkspace
```

In Xcode:
1. ➕ Aggiungi Widget Extension target: `PreviewWidgetExtension`
2. 📁 Aggiungi file Swift da `ios/PreviewWidgetExtension/` al widget target
3. 🔗 Aggiungi `PreviewActivityModule.swift/m` al target principale (drapereact)
4. ⚙️ Configura App Groups: `group.com.drape.app` (su entrambi i target)
5. 📱 iOS Deployment Target widget: `16.1`

### 3. Build & Test
```bash
# Build su device fisico con Dynamic Island
# (iPhone 14 Pro, 15 Pro, o 16 Pro)
```

### 4. Test nell'App
1. Apri un progetto
2. Vai su Preview tab
3. Clicca "Start Preview"
4. Manda app in background (Home button)
5. 🟣 **Vedi il Dynamic Island con occhio viola e secondi rimanenti!**

## 📖 Documentazione Completa

Vedi `DYNAMIC_ISLAND_SETUP.md` per:
- Istruzioni dettagliate Xcode
- Troubleshooting
- Personalizzazione
- Come funziona internamente

## ⚠️ Note Importanti

- ✅ Codice TypeScript/React Native: **completato e funzionante**
- 🔧 Setup Xcode: **richiede configurazione manuale una volta**
- 🔄 Dopo ogni `expo prebuild`: **devi rifare setup Xcode**
- 📱 Test: **solo su device reale con Dynamic Island**
- 🍎 iOS: **16.1+ richiesto**

## 🎯 Risultato

Quando l'utente avvia il preview e va in background:
- **⬅️ Sinistra**: Secondi rimanenti (es. "120s")
- **➡️ Destra**: Occhio viola 🟣
- **Long press**: Dettagli completi (progetto, step, progress bar)

Tutto si aggiorna automaticamente in real-time! 🚀
