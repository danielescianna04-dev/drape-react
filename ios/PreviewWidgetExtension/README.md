# Preview Widget Extension - Dynamic Island Setup

Questa directory contiene i file Swift per il Widget Extension che abilita il **Dynamic Island** durante il caricamento del preview.

## 🎯 Funzionalità

Quando l'utente avvia il preview e manda l'app in background, appare:
- **Dynamic Island Leading (sinistra)**: Secondi rimanenti stimati
- **Dynamic Island Trailing (destra)**: Occhio viola 🟣
- **Expanded**: Mostra progetto, step corrente, progress bar

## 📋 Setup Manuale (Xcode)

Dato che questo è un progetto Expo, il Widget Extension deve essere aggiunto manualmente al progetto Xcode dopo il prebuild.

### Step 1: Apri il progetto Xcode
```bash
cd ios
open drapereact.xcworkspace
```

### Step 2: Aggiungi Widget Extension Target

1. Nel Project Navigator, seleziona il progetto `drapereact`
2. Clicca il pulsante `+` sotto "TARGETS"
3. Cerca "Widget Extension" e selezionalo
4. Clicca "Next"
5. Configura:
   - **Product Name**: `PreviewWidgetExtension`
   - **Team**: Il tuo team di sviluppo
   - **Organization Identifier**: `com.drape`
   - **Bundle Identifier**: `com.drape.app.PreviewWidgetExtension`
   - **Language**: Swift
   - Deseleziona "Include Configuration Intent"
6. Clicca "Finish"
7. Quando chiede "Activate scheme?", clicca "Activate"

### Step 3: Aggiungi i file Swift

1. Elimina i file auto-generati nel gruppo `PreviewWidgetExtension`:
   - `PreviewWidgetExtension.swift`
   - `PreviewWidgetExtensionBundle.swift` (se esiste)
   - `Assets.xcassets` (mantienilo se vuoi aggiungere icone custom)

2. Trascina i seguenti file dalla directory `ios/PreviewWidgetExtension` nel gruppo `PreviewWidgetExtension` in Xcode:
   - `PreviewActivityAttributes.swift`
   - `PreviewLiveActivity.swift`
   - `PreviewWidgetExtensionBundle.swift`
   - `Info.plist` (sostituisci quello esistente)

3. Quando chiede "Copy items if needed", seleziona "Don't copy"
4. Assicurati che "Target Membership" sia impostato su `PreviewWidgetExtension`

### Step 4: Aggiungi il modulo nativo all'app principale

1. Nel Project Navigator, trova il gruppo con il tuo codice principale
2. Crea un gruppo chiamato `LiveActivity` (click destro sul progetto → New Group)
3. Trascina i seguenti file dalla directory `ios/PreviewWidgetExtension`:
   - `PreviewActivityModule.swift`
   - `PreviewActivityModule.m`

4. **IMPORTANTE**: Per questi file, imposta "Target Membership" su `drapereact` (l'app principale), NON il widget extension

### Step 5: Configura Capabilities

#### Per il Target principale (drapereact):
1. Seleziona il target `drapereact`
2. Vai su "Signing & Capabilities"
3. Clicca `+ Capability`
4. Aggiungi "Push Notifications"

#### Per il Widget Extension (PreviewWidgetExtension):
1. Seleziona il target `PreviewWidgetExtension`
2. Vai su "Signing & Capabilities"
3. Verifica che "App Groups" sia presente (se no, aggiungilo)
4. Aggiungi un App Group ID: `group.com.drape.app`
5. Assicurati che lo stesso App Group sia presente anche nel target principale

### Step 6: Build Settings

#### Per PreviewWidgetExtension:
1. Seleziona il target `PreviewWidgetExtension`
2. Vai su "Build Settings"
3. Cerca "Swift Optimization Level"
   - Debug: `-Onone`
   - Release: `-O`
4. Cerca "Swift Language Version": `Swift 5`
5. Cerca "iOS Deployment Target": `16.1` (minimo per Live Activities)

### Step 7: Verifica Bridging Header (se necessario)

Se Xcode mostra errori sui moduli React:
1. Seleziona il target principale `drapereact`
2. Vai su "Build Settings"
3. Cerca "Objective-C Bridging Header"
4. Assicurati che punti a `drapereact-Bridging-Header.h`

### Step 8: Test

1. Esegui `npx expo prebuild --clean` per rigenerare il progetto nativo
2. **IMPORTANTE**: Dopo ogni prebuild, devi rifare lo Step 2-4 (il target del widget viene rimosso)
3. Build e run su un dispositivo reale con Dynamic Island (iPhone 14 Pro, 15 Pro, 16 Pro)
4. Avvia un preview, manda l'app in background → dovresti vedere il Dynamic Island!

## 🔧 Troubleshooting

### Il modulo non viene trovato
- Verifica che `PreviewActivityModule.swift` e `.m` abbiano target membership su `drapereact` (non sul widget)
- Riavvia Metro bundler: `npx expo start --clear`

### Widget non appare
- Verifica iOS Deployment Target >= 16.1 per il widget extension
- Verifica che `NSSupportsLiveActivities = true` sia in `Info.plist` dell'app principale
- Testa su un dispositivo reale con Dynamic Island (non funziona su simulatore)

### Build errors
- Pulisci la build: Product → Clean Build Folder (Cmd+Shift+K)
- Riavvia Xcode

## 🎨 Personalizzazione

Per modificare l'aspetto del Dynamic Island, edita `PreviewLiveActivity.swift`:
- Colore viola: `Color(red: 0.58, green: 0.4, blue: 0.9)`
- Icona: `Image(systemName: "eye.fill")`
- Layout: Modifica le sezioni `compactLeading`, `compactTrailing`, `expanded`

## 📝 Note

- Le Live Activities richiedono iOS 16.1+
- Il Dynamic Island è disponibile solo su iPhone 14 Pro/15 Pro/16 Pro
- Su altri dispositivi, appare come notifica persistente
- L'activity si aggiorna automaticamente quando cambia lo stato del preview
