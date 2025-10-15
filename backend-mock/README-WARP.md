# 🎯 Warp AI IDE - Client Backend AWS

## 📱 Utilizzo dal Container Warp

Ora puoi eseguire comandi Flutter, Python e di sviluppo direttamente dal container Warp, che si collegheranno automaticamente al tuo backend AWS con smart routing!

### 🚀 Setup Iniziale

```bash
# 1. Setup iniziale (una volta sola)
./setup-warp.sh

# 2. Controlla che il backend sia attivo
./aws-ide health
```

### 🔧 Comandi Principali

#### **Health Check & Session**
```bash
./aws-ide health                    # Stato del backend AWS
./aws-ide session                   # Crea una nuova sessione
```

#### **Comandi Flutter** (Eseguiti su ECS Fargate)
```bash
./aws-ide flutter --version         # Versione Flutter
./aws-ide flutter doctor            # Flutter doctor  
./aws-ide flutter create myapp      # Crea nuovo progetto
./aws-ide flutter build apk         # Build APK
```

#### **Comandi Python** (Eseguiti su ECS Fargate)  
```bash
./aws-ide python --version          # Versione Python
./aws-ide python3 --version         # Versione Python3
./aws-ide pip install requests      # Installa pacchetti
./aws-ide python script.py          # Esegui script
```

#### **Comandi Generici** (Smart Routing)
```bash
./aws-ide exec "pwd"                # Directory corrente (Lambda)
./aws-ide exec "ls -la"             # Lista file (Lambda)
./aws-ide exec "git status"         # Git status (Lambda)
./aws-ide exec "npm install"        # NPM install (ECS)
```

### 🧠 Smart Routing Automatico

Il sistema decide automaticamente dove eseguire i comandi:

- **📦 Lambda** (veloce): `pwd`, `ls`, `echo`, `git`, comandi semplici
- **🚀 ECS Fargate** (completo): `flutter`, `python`, `dart`, `build`, `install`

### 📋 Esempi Pratici

#### Workflow Flutter Completo:
```bash
# 1. Controlla sistema
./aws-ide flutter doctor

# 2. Crea progetto  
./aws-ide flutter create my_awesome_app

# 3. Naviga nella directory
./aws-ide exec "cd my_awesome_app && ls -la"

# 4. Build app
./aws-ide flutter build apk
```

#### Workflow Python:
```bash
# 1. Controlla versione
./aws-ide python --version

# 2. Installa dipendenze  
./aws-ide pip install flask requests

# 3. Crea ed esegui script
./aws-ide exec "echo 'print(\"Hello from AWS!\")' > hello.py"
./aws-ide python hello.py
```

### ⚙️ Alias Disponibili (dopo setup)

Riavvia la shell e usa:
```bash
aws-ide health                      # Controlla backend
flutter-aws --version               # Flutter rapido
python-aws --version                # Python rapido 
ide-status                          # Status rapido
```

### 🔍 Troubleshooting

#### ECS in Avvio
```bash
# Se vedi timeout su comandi Flutter/Python:
./aws-ide health                    # Controlla se ECS è "configured"
```

L'avvio del task ECS può richiedere 30-60 secondi la prima volta.

#### Sessione Scaduta
```bash
# Se ottieni "Session not found":
./aws-ide session                   # Crea nuova sessione
```

Le sessioni scadono dopo un po' di inattività.

#### Connettività  
```bash
# Se il backend non risponde:
./aws-ide health                    # Verifica connessione
```

### 🎯 Architettura

```
Container Warp 
    ↓ (HTTPS)
AWS API Gateway 
    ↓
Lambda Function (Smart Router)
    ↓
┌─────────────────┬──────────────────┐
│   Lambda        │   ECS Fargate    │
│   (Rapido)      │   (Completo)     │
│                 │                  │
│ • pwd           │ • flutter        │
│ • ls            │ • python         │  
│ • git           │ • dart           │
│ • echo          │ • build          │
│                 │ • install        │
└─────────────────┴──────────────────┘
```

### 💡 Pro Tips

1. **Persistenza**: I file creati rimangono nella sessione fino alla scadenza
2. **Routing**: Comandi ambigui? Usa `./aws-ide exec "comando"` per forzare su Lambda
3. **Velocità**: Comandi su Lambda sono istantanei, su ECS possono richiedere tempo
4. **Debug**: Usa `./aws-ide health` per controllare se tutto funziona

---

🎉 **Il tuo IDE mobile è pronto!** Ora hai Flutter, Python e tutti gli strumenti di sviluppo disponibili direttamente dal container Warp!