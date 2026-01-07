# Pre-Production Checklist

## Da completare prima del deploy in produzione

### Database & Cache
- [ ] **Redis** - Configurare Redis per persistenza stato
  - Opzioni: Redis Cloud, Upstash, AWS ElastiCache
  - Settare `REDIS_URL` nel `.env`
  - Motivo: senza Redis lo stato delle workstation si perde al riavvio

### Sicurezza
- [ ] **Firebase credentials** - Non committare `serviceAccountKey.json`
  - Usare variabili d'ambiente o secret manager in produzione
- [ ] **CORS** - Restringere origini permesse
- [ ] **Rate limiting** - Aggiungere protezione API

### AI & Vector Store
- [x] **LanceDB** - Installato
- [x] **Gemini** - Configurato

### Infrastruttura
- [ ] **SSL/HTTPS** - Certificati per dominio produzione
- [ ] **Load Balancer** - Se multi-istanza
- [ ] **Monitoring** - Logging e alerting (es. Sentry, Datadog)
- [ ] **Backup** - Strategia backup per Firestore/Redis

### Environment Variables (produzione)
```env
PORT=3000
REDIS_URL=redis://...
GOOGLE_CLOUD_PROJECT=drape-mobile-ide
CODER_API_URL=...
CODER_SESSION_TOKEN=...
CODER_WILDCARD_DOMAIN=...
```

---
Ultimo aggiornamento: 2026-01-06
