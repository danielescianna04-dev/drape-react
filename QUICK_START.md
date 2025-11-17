# 🚀 Quick Start - Drape React

Setup rapido per iniziare in 5 minuti!

## 1. Clona e Installa

```bash
git clone https://github.com/danielescianna04-dev/drape-react.git
cd drape-react
npm install
cd backend && npm install && cd ..
```

## 2. Trova il Tuo IP

### macOS/Linux:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

### Windows:
```bash
ipconfig | findstr IPv4
```

Cerca un IP tipo `192.168.x.x` o `10.0.x.x`

## 3. Configura `.env`

```bash
cp .env.example .env
```

Apri `.env` e **sostituisci l'IP** nella riga:
```bash
EXPO_PUBLIC_API_URL=http://IL_TUO_IP_QUI:3000
```

Esempio:
```bash
EXPO_PUBLIC_API_URL=http://192.168.1.105:3000
```

## 4. Avvia Backend

```bash
cd backend
node server.js
```

Vedrai l'IP del backend nei log - **verificalo** e usalo nel file `.env`!

## 5. Avvia App

In un altro terminale:
```bash
npm start
```

Scansiona il QR code con **Expo Go** sul tuo telefono.

## ✅ Test Preview

1. Apri un progetto nell'app
2. Tap sull'icona Preview (razzo 🚀)
3. Tap "Avvia Server"
4. Il preview dovrebbe apparire!

## 🐛 Problemi?

Leggi [SETUP_GUIDE.md](./SETUP_GUIDE.md) per la guida completa con troubleshooting.

## 📝 Note Importanti

- **Telefono e PC devono essere sulla STESSA rete WiFi**
- **Riavvia l'app Expo dopo aver modificato `.env`**
- Il backend rileva **automaticamente** l'IP - non serve configurarlo manualmente!
- Le porte 3000 (backend) e 8081 (main app) sono **protette** - non crasherà mai
