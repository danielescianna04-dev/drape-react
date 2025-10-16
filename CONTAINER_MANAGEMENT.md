# 📦 Container Management - Drape Mobile IDE

## 🎯 Overview

Drape uses Google Cloud Run containers to provide isolated development environments for each user project. This document explains how containers work, their lifecycle, and cost optimization strategies.

## 🔄 Container States

### 🟢 RUNNING (Active)
- **Description**: Container actively executing user code
- **CPU Usage**: 50-100% depending on workload
- **Memory Usage**: Full allocation (512MB-2GB)
- **Cost**: Full rate (~$0.05/hour)
- **Response Time**: Instant
- **When**: User actively coding, running commands, or executing code

### 🟡 IDLE (Standby)
- **Description**: Container alive but waiting for user input
- **CPU Usage**: 5-10% (system processes only)
- **Memory Usage**: Minimal (200-300MB)
- **Cost**: Reduced rate (~$0.01/hour - 80% savings)
- **Response Time**: 1-2 seconds (instant wake-up)
- **When**: User in project but not actively coding (5+ minutes)

### 🔴 STOPPED (Shutdown)
- **Description**: Container completely terminated
- **CPU Usage**: 0%
- **Memory Usage**: 0%
- **Cost**: $0 (completely free)
- **Response Time**: 15-30 seconds (cold start)
- **When**: User inactive for 30+ minutes

## ⏰ Automatic Lifecycle Management

### Activity Detection
```javascript
// Backend tracks user activity
let lastActivity = Date.now();

// Activities that reset idle timer:
- Code execution
- File operations
- Terminal commands
- WebSocket connections
- API requests
```

### State Transitions
```
RUNNING → (5 min idle) → IDLE → (30 min idle) → STOPPED
   ↑                        ↑                      ↑
   └── User activity ───────┴── User activity ────┘
```

### Auto-scaling Rules
- **Scale Up**: CPU > 80% for 5+ minutes
- **Scale Down**: CPU < 20% for 10+ minutes
- **Memory Boost**: Memory > 90% usage
- **Emergency Stop**: Idle > 2 hours (safety limit)

## 💰 Cost Optimization

### Pricing Breakdown
| State | CPU Cost | Memory Cost | Total/Hour | Savings |
|-------|----------|-------------|------------|---------|
| RUNNING | $0.04 | $0.01 | $0.05 | 0% |
| IDLE | $0.008 | $0.002 | $0.01 | 80% |
| STOPPED | $0 | $0 | $0 | 100% |

### Daily Usage Example
```
Scenario: Developer working 4 hours/day

Traditional (always on): 24h × $0.05 = $1.20/day
Optimized with auto-scaling:
- 4h RUNNING: $0.20
- 2h IDLE: $0.02  
- 18h STOPPED: $0
Total: $0.22/day (82% savings!)
```

### Monthly Estimates
- **Light user** (2h/day): $6-10/month
- **Regular user** (4h/day): $12-20/month
- **Heavy user** (8h/day): $25-40/month

## 🚀 Performance & Scaling

### Automatic Resource Allocation
```yaml
# Base configuration
resources:
  requests:
    memory: "256Mi"    # Minimum guaranteed
    cpu: "0.1"         # Minimum guaranteed
  limits:
    memory: "2Gi"      # Maximum allowed
    cpu: "2"           # Maximum allowed
```

### Smart Scaling Triggers
- **Light workload**: 0.5 CPU, 512MB RAM
- **Medium workload**: 1 CPU, 1GB RAM  
- **Heavy workload**: 2 CPU, 2GB RAM
- **ML/AI tasks**: 4 CPU, 8GB RAM (temporary boost)

### Container Types by Language
```javascript
const containerConfigs = {
  python: { 
    baseImage: 'python:3.9-slim',
    defaultMemory: '512Mi',
    packages: ['numpy', 'pandas', 'flask']
  },
  nodejs: {
    baseImage: 'node:18-alpine', 
    defaultMemory: '256Mi',
    packages: ['express', 'lodash']
  },
  react: {
    baseImage: 'node:18-alpine',
    defaultMemory: '1Gi',
    packages: ['react', 'webpack', 'babel']
  }
};
```

## 🔒 Security & Isolation

### Container Security
- **Sandboxed execution**: gVisor isolation
- **No root access**: Non-privileged containers
- **Network isolation**: Each container in separate network
- **Resource limits**: CPU/Memory caps prevent abuse
- **Read-only filesystem**: System files protected

### User Data Protection
- **Per-user isolation**: Users can only access their containers
- **Encrypted storage**: All data encrypted at rest
- **Secure networking**: TLS 1.3 for all communications
- **Audit logging**: All container operations logged

### Access Control
```javascript
// Firebase security rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /workstations/{workstationId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
    }
  }
}
```

## 🛠️ Implementation Details

### Container Startup Process
1. **User creates project** → Firebase saves metadata
2. **User clicks "Start"** → Backend triggers container creation
3. **Google Cloud Run** → Pulls container image
4. **Container boots** → Installs dependencies (if needed)
5. **Health check passes** → Container marked as RUNNING
6. **WebSocket established** → Real-time communication ready
7. **User sees green eye** → Container ready for use

### Shutdown Process
1. **Idle timer expires** → Backend initiates shutdown
2. **Graceful shutdown** → Save any pending work
3. **Container stops** → Resources released
4. **User sees grey eye** → Container offline
5. **Metadata preserved** → Project data safe in Firebase

### Error Handling
- **Container crash**: Auto-restart with exponential backoff
- **Out of memory**: Temporary memory boost, then restart
- **Network issues**: Retry with circuit breaker pattern
- **Build failures**: Detailed error logs to user

## 📊 Monitoring & Analytics

### Key Metrics Tracked
- Container uptime/downtime
- Resource utilization (CPU, Memory)
- User activity patterns
- Cost per user/project
- Performance bottlenecks

### Alerts & Notifications
- High resource usage (>90% for 10+ minutes)
- Container crashes or failures
- Unusual cost spikes
- Security incidents

### User Dashboard
```javascript
// Container status in UI
const containerStatus = {
  running: { 
    icon: '👁️', 
    color: 'green', 
    message: 'Active - Ready for coding' 
  },
  idle: { 
    icon: '👁️', 
    color: 'yellow', 
    message: 'Standby - Click to wake up' 
  },
  stopped: { 
    icon: '👁️', 
    color: 'grey', 
    message: 'Offline - 30s to start' 
  }
};
```

## 🔧 Configuration

### Environment Variables
```bash
# Container lifecycle
AUTO_IDLE_MINUTES=5          # Minutes before IDLE
AUTO_STOP_MINUTES=30         # Minutes before STOPPED
MAX_IDLE_HOURS=2             # Safety limit

# Resource limits
DEFAULT_CPU=0.5              # Default CPU allocation
DEFAULT_MEMORY=512Mi         # Default memory
MAX_CPU=4                    # Maximum CPU boost
MAX_MEMORY=8Gi               # Maximum memory boost

# Cost controls
DAILY_COST_LIMIT=5           # Max $5/day per user
MONTHLY_COST_LIMIT=100       # Max $100/month per user
```

### Custom Container Images
```dockerfile
# Example Python container
FROM python:3.9-slim

# Install common packages
RUN pip install numpy pandas flask jupyter

# Security hardening
RUN useradd -m -s /bin/bash coder
USER coder

# Auto-shutdown script
COPY auto-shutdown.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/auto-shutdown.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

EXPOSE 8080
CMD ["python", "app.py"]
```

## 🚀 Future Enhancements

### Planned Features
- **GPU containers** for ML/AI workloads
- **Multi-region deployment** for global users
- **Container templates** for popular frameworks
- **Collaborative containers** for team projects
- **Spot instances** for even lower costs

### Performance Improvements
- **Faster cold starts** with pre-warmed containers
- **Intelligent caching** of dependencies
- **Predictive scaling** based on usage patterns
- **Edge deployment** for reduced latency

---

## 📞 Support

For container-related issues:
- Check container logs in the Drape dashboard
- Monitor resource usage graphs
- Contact support with container ID and timestamp
- Emergency shutdown: Use the red stop button in UI

**Remember: Containers are designed to be ephemeral - your code and data are always safe in Firebase/Cloud Storage!** 🛡️
