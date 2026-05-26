# 🟣 Dynamic Island - Setup Completo

Il Dynamic Island è ora configurato per mostrare il progresso del preview quando l'app va in background!

## 🎯 Cosa Fa

Quando clicchi "Start Preview" e mandi l'app in background:

- **Dynamic Island Leading (⬅️ sinistra)**: Mostra i secondi rimanenti stimati (es. "120s")
- **Dynamic Island Trailing (➡️ destra)**: Mostra l'occhio viola 👁️🟣
- **Expanded (long press)**: Mostra nome progetto, step corrente, progress bar completa

## 📱 Requisiti

- **iOS 16.1+** (per Live Activities)
- **iPhone 14 Pro / 15 Pro / 16 Pro** (per Dynamic Island visivo)
  - Su altri iPhone con iOS 16.1+, appare come notifica persistente
  - Su iPhone più vecchi, viene ignorato silenziosamente

## ✅ Stato Implementazione

### Completato ✅
- [x] Config plugin Expo (`plugins/withLiveActivity.js`)
- [x] Swift Widget Extension files (`ios/PreviewWidgetExtension/`)
- [x] React Native bridge (`PreviewActivityModule.swift/m`)
- [x] Service TypeScript (`src/core/services/liveActivityService.ts`)
- [x] Integrazione in PreviewPanel (auto-start quando va in background)
- [x] Calcolo automatico secondi rimanenti basato su progresso
- [x] Aggiornamento automatico del Dynamic Island durante caricamento
- [x] Auto-cleanup quando preview completo

### Da Fare Manualmente 🔧

Il Widget Extension **deve essere configurato manualmente in Xcode** perché Expo non supporta (ancora) l'aggiunta automatica di target extension.

## 🚀 Setup (Una Volta Sola)

### Step 1: Prebuild
```bash
npx expo prebuild --clean
```

### Step 2: Configurazione Xcode

Segui la guida completa in:
```
ios/PreviewWidgetExtension/README.md
```

Oppure esegui:
```bash
./scripts/setup-widget-extension.sh
```

Questo script ti mostrerà tutti i passaggi da seguire in Xcode.

### Passaggi Chiave (TL;DR)

1. Apri Xcode: `cd ios && open bynotreact.xcworkspace`
2. Aggiungi Widget Extension target (nome: `PreviewWidgetExtension`)
3. Aggiungi i file Swift dal folder `ios/PreviewWidgetExtension/`
4. Configura App Groups: `group.com.bynot.app`
5. iOS Deployment Target widget: `16.1`
6. Build e test su device reale con Dynamic Island

## 🔄 Dopo Ogni Prebuild

⚠️ **IMPORTANTE**: Ogni volta che esegui `expo prebuild`, il target del Widget Extension viene rimosso.

Devi:
1. Riaprire Xcode
2. Riaggiungere il target Widget Extension
3. Riassegnare i file Swift

È una limitazione di Expo. In futuro, potrebbe essere automatizzato con un config plugin più avanzato.

## 🧪 Come Testare

1. Build l'app su un **iPhone fisico** con Dynamic Island (14 Pro+)
2. Apri l'app
3. Vai su un progetto
4. Clicca "Start Preview" nella tab Preview
5. Mentre il preview carica, premi il tasto Home (o swipe up)
6. 🟣 **Dovrebbe apparire il Dynamic Island!**
   - Sinistra: Secondi rimanenti
   - Destra: Occhio viola
7. Long press per vedere la vista expanded con dettagli

## 📊 Come Funziona

### Lifecycle

1. **Preview Start** → `isStarting = true`
2. **App Background** → Avvia Live Activity con:
   - Nome progetto
   - Step corrente
   - Progresso (0-100%)
   - Secondi rimanenti (calcolati da progresso)
3. **Durante Caricamento (in background)** → Aggiorna Live Activity ogni volta che cambia:
   - Step
   - Progresso
   - Secondi rimanenti
4. **Preview Ready** → Termina Live Activity
5. **App Foreground** → Termina Live Activity

### Calcolo Secondi Rimanenti

Basato sul progresso corrente e tempo stimato totale:
- **Next.js**: 480 secondi (8 minuti)
- **Altri progetti**: 240 secondi (4 minuti)

Formula: `remaining = totalTime * (1 - progress/100)`

## 🎨 Personalizzazione

### Modifica Colori/Icone

Edita `ios/PreviewWidgetExtension/PreviewLiveActivity.swift`:

```swift
// Cambia colore viola
Color(red: 0.58, green: 0.4, blue: 0.9)

// Cambia icona
Image(systemName: "eye.fill")
```

### Modifica Testi

Edita i messaggi passati dal PreviewPanel:
- `startupSteps` labels
- `currentStep` text

## 🐛 Troubleshooting

### Dynamic Island non appare

1. **Verifica iOS version**: Settings → General → About → iOS Version ≥ 16.1
2. **Verifica device**: Solo iPhone 14 Pro, 15 Pro, 16 Pro hanno il Dynamic Island fisico
3. **Verifica Xcode setup**: Hai completato tutti i passaggi manuali?
4. **Verifica logs**: In Xcode, filtra per "LiveActivity" nella console

### "Module not found" error

```bash
# Pulisci e rebuilda
cd ios
rm -rf build
pod install
cd ..
npx expo start --clear
```

Verifica anche che i file `PreviewActivityModule.swift/m` abbiano Target Membership su `bynotreact` (non sul widget).

### Widget non si aggiorna

- Live Activities si aggiornano ogni ~5 secondi per risparmiare batteria
- Non è real-time istantaneo, è normale un leggero ritardo

### Xcode build errors

```bash
# Pulisci Xcode
# In Xcode: Product → Clean Build Folder (Cmd+Shift+K)

# Oppure da terminale
cd ios
xcodebuild clean -workspace bynotreact.xcworkspace -scheme bynotreact
```

## 📚 Risorse

- [Apple: ActivityKit Documentation](https://developer.apple.com/documentation/activitykit)
- [Apple: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- [Dynamic Island Design Guidelines](https://developer.apple.com/design/human-interface-guidelines/live-activities#The-Dynamic-Island)

## 🎉 Risultato Finale

Quando tutto è configurato, l'utente potrà:
1. Cliccare "Start Preview"
2. Uscire dall'app per fare altro
3. Vedere nell'occhio viola 🟣 nel Dynamic Island i secondi rimanenti
4. Sapere esattamente quando il preview sarà pronto
5. Long press per più dettagli

**Esperienza utente premium!** 🚀
