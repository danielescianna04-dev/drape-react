# Preview Widget Extension - Dynamic Island

Questa estensione fornisce la UI per Dynamic Island durante le operazioni di preview, clone, etc.

## Setup in Xcode

### 1. Aggiungi Widget Extension Target

1. Apri `ios/Drape.xcworkspace` in Xcode
2. Seleziona il progetto nella sidebar
3. Clicca `+` sotto TARGETS
4. Scegli `Widget Extension` → Next
5. Configura:
   - **Product Name**: `PreviewWidgetExtension`
   - **Team**: Il tuo team
   - **Bundle Identifier**: `com.drape.app.PreviewWidgetExtension`
   - **Include Configuration App Intent**: NO (deseleziona)
   - **Language**: Swift
6. Clicca Finish

### 2. Configura il Widget Target

1. Seleziona il target `PreviewWidgetExtension`
2. Tab **General**:
   - **iOS Deployment Target**: `16.1`
3. Tab **Build Settings**:
   - **Swift Language Version**: `Swift 5`

### 3. Aggiungi i File al Widget Target

1. Elimina i file generati automaticamente da Xcode nel gruppo PreviewWidgetExtension
2. Trascina i seguenti file dal Finder al gruppo PreviewWidgetExtension in Xcode:
   - `PreviewActivityAttributes.swift`
   - `PreviewLiveActivity.swift`
   - `PreviewWidgetExtensionBundle.swift`
   - `Info.plist`
3. Assicurati che "Target Membership" includa solo `PreviewWidgetExtension`

### 4. Aggiungi PreviewActivityAttributes al Main App

Il file `PreviewActivityAttributes.swift` deve essere disponibile anche nel target principale:

1. Seleziona `PreviewActivityAttributes.swift`
2. Nel pannello File Inspector, sotto "Target Membership", seleziona anche `Drape`

### 5. Configura App Groups

Per comunicazione tra app e widget:

1. Seleziona il target `Drape`
2. Tab **Signing & Capabilities**
3. Clicca `+ Capability` → `App Groups`
4. Aggiungi: `group.com.drape.app`

5. Ripeti per il target `PreviewWidgetExtension`

### 6. Build & Test

1. Seleziona un dispositivo fisico con Dynamic Island (iPhone 14 Pro, 15 Pro, 16 Pro)
2. Build & Run
3. L'app invierà Live Activities che appariranno nel Dynamic Island

## Note

- **expo prebuild**: Dopo ogni `npx expo prebuild --clean`, devi rifare questi passaggi
- **Simulatore**: Le Live Activities funzionano solo su device fisico
- **iOS Version**: Richiede iOS 16.1+
