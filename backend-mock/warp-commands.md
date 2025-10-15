# 🎯 Comandi per Container Warp

## 🚀 Setup (Fai Questo Prima)

### 1. Avvia il Proxy sul Mac:
```bash
# Nel terminale del Mac (fuori dal container)
node warp-proxy.js
```

### 2. Nel Container Warp, crea questo script:
```bash
# Crea uno script helper nel container Warp
cat > ~/aws-cmd << 'EOF'
#!/bin/bash

PROXY_URL="http://host.docker.internal:8888"

if [ $# -eq 0 ]; then
    echo "🎯 Warp AI IDE Commands"
    echo "Utilizzo: aws-cmd [comando]"
    echo ""
    echo "Esempi:"
    echo "  aws-cmd health"
    echo "  aws-cmd 'flutter --version'"
    echo "  aws-cmd 'python --version'"
    echo "  aws-cmd 'pwd'"
    exit 0
fi

if [ "$1" = "health" ]; then
    curl -s "$PROXY_URL/health" | grep -o '"[^"]*":[^,}]*' | head -5
else
    COMMAND="$*"
    echo "🚀 Eseguendo: $COMMAND"
    curl -s -X POST "$PROXY_URL/cmd" \
        -H "Content-Type: application/json" \
        -d "{\"command\": \"$COMMAND\"}" \
        | grep -E '"(success|output|executor|error)"' \
        | sed 's/.*"output":"\([^"]*\)".*/Output: \1/' \
        | sed 's/.*"executor":"\([^"]*\)".*/Executor: \1/' \
        | sed 's/.*"error":"\([^"]*\)".*/❌ Error: \1/'
fi
EOF

chmod +x ~/aws-cmd
```

### 3. Crea alias rapidi:
```bash
# Nel container Warp
alias flutter-aws='~/aws-cmd flutter'
alias python-aws='~/aws-cmd python'
alias ide-health='~/aws-cmd health'
```

## 🎯 Utilizzo dal Container Warp

### Comandi Base:
```bash
# Health check
~/aws-cmd health

# Comandi semplici (Lambda)
~/aws-cmd pwd
~/aws-cmd "ls -la"
~/aws-cmd "echo Hello World"

# Comandi Flutter (ECS)  
~/aws-cmd "flutter --version"
~/aws-cmd "flutter doctor"

# Comandi Python (ECS)
~/aws-cmd "python --version"
~/aws-cmd "python -c 'print(\"Hello from AWS!\")"

# Con alias
flutter-aws --version
python-aws --version
ide-health
```

### Test Rapido:
```bash
# 1. Test connessione
~/aws-cmd health

# 2. Test comando semplice
~/aws-cmd pwd

# 3. Test comando pesante  
~/aws-cmd "flutter --version"
```

## 🔧 Troubleshooting

### Se non funziona:
1. **Controlla che il proxy sia attivo sul Mac**:
   ```bash
   curl http://localhost:8888/health
   ```

2. **Verifica connettività dal container**:
   ```bash
   curl -s http://host.docker.internal:8888/health
   ```

3. **Se `host.docker.internal` non funziona**, usa l'IP del Mac:
   ```bash
   # Trova IP Mac
   ifconfig | grep inet
   
   # Usa IP instead (esempio)
   curl http://192.168.1.100:8888/health
   ```

## 🎉 Workflow Completo

### Workflow Flutter:
```bash
~/aws-cmd health                    # Verifica backend
~/aws-cmd "flutter doctor"          # Controlli Flutter
~/aws-cmd "flutter create myapp"    # Crea progetto
~/aws-cmd "cd myapp && ls -la"     # Esplora progetto
```

### Workflow Python:
```bash  
~/aws-cmd "python --version"           # Versione Python
~/aws-cmd "pip install requests"       # Installa pacchetti
~/aws-cmd "python -c 'import requests; print(requests.__version__)'"
```

Questo dovrebbe permetterti di usare Flutter, Python e tutti i comandi dal container Warp! 🚀