# 🚀 Architettura Ibrida: Lambda + ECS Fargate

Questa soluzione combina **AWS Lambda** per comandi veloci e **ECS Fargate** per comandi pesanti, offrendo il meglio di entrambi i mondi: velocità e potenza.

## 🏗️ Architettura

```
Flutter App ──┐
              ├─► API Gateway ──► Lambda (Smart Router)
              │                     ├─► Comandi veloci (git, ls, cat, etc.)
              │                     └─► Comandi pesanti ──► ECS Fargate
              │                                              ├─► Flutter SDK
              │                                              ├─► Python
              │                                              ├─► Docker
              │                                              └─► Auto-shutdown (10min)
              └─► Load Balancer ──► ECS Fargate (diretto)
```

## ⚡ Smart Routing

Il sistema decide automaticamente dove eseguire i comandi:

### 🚀 **Lambda** (Istantaneo)
- `git status`, `ls`, `cat`, `echo`
- `python script.py` (script piccoli)
- `npm run`, `node file.js`
- Comandi di sistema base

### 💪 **ECS Fargate** (Potente)
- `flutter build`, `flutter doctor`
- `docker build`, `docker run`
- `npm install`, `pip install`
- `apt-get`, `brew install`
- Build e compilazioni

## 🚀 Deploy

```bash
# 1. Vai nella directory backend
cd backend

# 2. Esegui il deploy automatico
./deploy-hybrid.sh
```

Lo script automaticamente:
1. 🐳 Builda e pusha l'immagine Docker
2. ☁️ Deploya l'infrastruttura CloudFormation
3. ⚡ Aggiorna la funzione Lambda
4. 📡 Ti fornisce gli endpoint finali

## 🧪 Test

Dopo il deploy, testa i componenti:

```bash
# Lambda (veloce)
curl https://YOUR-API-GATEWAY/health

# ECS Fargate (potente)  
curl http://YOUR-LOAD-BALANCER/system/info
curl http://YOUR-LOAD-BALANCER/flutter/doctor
```

## 📱 Configurazione Flutter

Aggiorna la tua app Flutter:

```dart
// lib/config/api_config.dart
class ApiConfig {
  static const String baseUrl = 'YOUR-API-GATEWAY-URL';
}
```

## 💰 Costi Stimati

### Uso Normale (8h/giorno sviluppo):
- **Lambda**: ~$0.50/mese
- **ECS Fargate**: ~$3-5/mese (con auto-shutdown)
- **ALB**: ~$20/mese
- **ECR**: ~$1/mese
- **Totale**: ~$25-30/mese

### Ottimizzazioni Costi:
- 🕒 Auto-shutdown ECS dopo 10 minuti
- 💸 FARGATE_SPOT per -70% sui costi
- 📊 CloudWatch monitoring incluso

## 🔧 Comandi Utili

```bash
# Verifica stato ECS
aws ecs describe-services --cluster warp-mobile-ai-ide-prod-cluster --services warp-mobile-ai-ide-prod-ecs-service

# Scala ECS manualmente
aws ecs update-service --cluster warp-mobile-ai-ide-prod-cluster --service warp-mobile-ai-ide-prod-ecs-service --desired-count 1

# Visualizza log ECS
aws logs tail /ecs/warp-mobile-ai-ide-prod --follow

# Aggiorna solo Lambda
aws lambda update-function-code --function-name warp-mobile-ai-ide-prod-command-handler --zip-file fileb://lambda-function.zip
```

## 🐞 Troubleshooting

### ECS Task non si avvia
```bash
# Controlla task definition
aws ecs describe-task-definition --task-definition warp-mobile-ai-ide-prod-task

# Controlla log del container
aws logs get-log-events --log-group-name /ecs/warp-mobile-ai-ide-prod --log-stream-name ecs/warp-mobile-ai-ide-container/TASK-ID
```

### Lambda timeout
I comandi pesanti vanno automaticamente su ECS. Se persiste:
- Aumenta timeout Lambda (max 15 min)
- Forza routing ECS: `{ "command": "flutter build", "forceECS": true }`

### Costi alti
- Verifica auto-shutdown ECS: `curl http://ALB/health`
- Controlla desired count: deve essere 0 quando inattivo

## 📊 Monitoring

- **CloudWatch**: Metriche automatiche
- **X-Ray**: Tracing distribuito (opzionale)
- **Container Insights**: Metriche ECS dettagliate

## 🔄 Aggiornamenti

### Aggiorna container ECS:
```bash
# Build e push nuova immagine
docker build -f Dockerfile.ecs -t warp-mobile-ai-ide:latest .
docker tag warp-mobile-ai-ide:latest ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com/warp-mobile-ai-ide:latest
docker push ACCOUNT-ID.dkr.ecr.us-east-1.amazonaws.com/warp-mobile-ai-ide:latest

# Forza nuovo deployment
aws ecs update-service --cluster warp-mobile-ai-ide-prod-cluster --service warp-mobile-ai-ide-prod-ecs-service --force-new-deployment
```

### Aggiorna Lambda:
```bash
zip -r lambda-function.zip lambda-simple/ package*.json
aws lambda update-function-code --function-name warp-mobile-ai-ide-prod-command-handler --zip-file fileb://lambda-function.zip
```

## 🎯 Funzionalità

✅ **Smart routing automatico**  
✅ **Auto-shutdown ECS (risparmio costi)**  
✅ **Fallback Lambda se ECS non disponibile**  
✅ **Flutter SDK completo**  
✅ **Python + pip**  
✅ **Docker supportato**  
✅ **Scaling automatico**  
✅ **Health checks**  
✅ **Load balancing**  

## 🚨 Limitazioni

- **Docker in Docker**: Limitato in ECS, usa build remoti
- **Timeout max Lambda**: 15 minuti
- **Cold start ECS**: ~15-30 secondi primo avvio
- **Costi fissi ALB**: ~$20/mese sempre attivo

## 🤝 Supporto

Per problemi o miglioramenti, controlla:
1. 📊 CloudWatch Logs
2. 🔍 ECS Task status
3. ⚡ Lambda metrics
4. 🌐 ALB health checks