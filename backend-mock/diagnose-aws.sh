#!/bin/bash

# Script di diagnostica AWS per Warp Mobile AI IDE
# Esegui: bash diagnose-aws.sh

REGION="us-west-2"
CLUSTER="warp-mobile-cluster"
SERVICE="warp-flutter-service"
LAMBDA="WarpMobileCommandHandler"

echo "🔍 DIAGNOSTICA AWS - Warp Mobile AI IDE"
echo "========================================"
echo ""

# 1. Lambda Function
echo "1️⃣ LAMBDA FUNCTION STATUS"
echo "---"
aws lambda get-function-configuration \
  --function-name $LAMBDA \
  --region $REGION \
  --query '{State:State,LastModified:LastModified,Runtime:Runtime,Timeout:Timeout,MemorySize:MemorySize,Environment:Environment.Variables}' \
  --output json 2>&1 | head -20
echo ""

# 2. ECS Service
echo "2️⃣ ECS SERVICE STATUS"
echo "---"
aws ecs describe-services \
  --cluster $CLUSTER \
  --services $SERVICE \
  --region $REGION \
  --query 'services[0].{Status:status,RunningCount:runningCount,DesiredCount:desiredCount,PendingCount:pendingCount,Events:events[0:3]}' \
  --output json 2>&1
echo ""

# 3. ECS Tasks
echo "3️⃣ ECS RUNNING TASKS"
echo "---"
TASK_ARNS=$(aws ecs list-tasks \
  --cluster $CLUSTER \
  --service-name $SERVICE \
  --region $REGION \
  --query 'taskArns[0]' \
  --output text 2>&1)

if [ "$TASK_ARNS" != "None" ] && [ ! -z "$TASK_ARNS" ]; then
  echo "Task ARN: $TASK_ARNS"
  aws ecs describe-tasks \
    --cluster $CLUSTER \
    --tasks $TASK_ARNS \
    --region $REGION \
    --query 'tasks[0].{LastStatus:lastStatus,HealthStatus:healthStatus,Connectivity:connectivity,PublicIP:attachments[0].details[?name==`networkInterfaceId`].value | [0]}' \
    --output json 2>&1
else
  echo "⚠️  Nessun task in esecuzione!"
fi
echo ""

# 4. Load Balancer
echo "4️⃣ LOAD BALANCER STATUS"
echo "---"
aws elbv2 describe-load-balancers \
  --region $REGION \
  --query 'LoadBalancers[?contains(LoadBalancerName, `warp`)].{Name:LoadBalancerName,DNS:DNSName,State:State.Code}' \
  --output table 2>&1
echo ""

# 5. Target Health
echo "5️⃣ TARGET GROUP HEALTH"
echo "---"
TG_ARN=$(aws elbv2 describe-target-groups \
  --region $REGION \
  --query 'TargetGroups[?contains(TargetGroupName, `warp`)].TargetGroupArn | [0]' \
  --output text 2>&1)

if [ ! -z "$TG_ARN" ] && [ "$TG_ARN" != "None" ]; then
  aws elbv2 describe-target-health \
    --target-group-arn $TG_ARN \
    --region $REGION \
    --query 'TargetHealthDescriptions[*].{Target:Target.Id,Port:Target.Port,Health:TargetHealth.State,Reason:TargetHealth.Reason}' \
    --output table 2>&1
else
  echo "⚠️  Target group non trovato"
fi
echo ""

# 6. Recent Lambda Logs
echo "6️⃣ LAMBDA LOGS (ultimi 5 minuti)"
echo "---"
aws logs tail /aws/lambda/$LAMBDA \
  --since 5m \
  --region $REGION \
  --format short 2>&1 | tail -30
echo ""

# 7. Recent ECS Logs
echo "7️⃣ ECS CONTAINER LOGS (ultimi 5 minuti)"
echo "---"
aws logs tail /ecs/$SERVICE \
  --since 5m \
  --region $REGION \
  --format short 2>&1 | tail -30
echo ""

# 8. Environment Variables Check
echo "8️⃣ LAMBDA ENVIRONMENT VARIABLES"
echo "---"
aws lambda get-function-configuration \
  --function-name $LAMBDA \
  --region $REGION \
  --query 'Environment.Variables.{ECS_ENDPOINT:ECS_ENDPOINT,ECS_SERVICE_NAME:ECS_SERVICE_NAME,ECS_CLUSTER_NAME:ECS_CLUSTER_NAME}' \
  --output json 2>&1
echo ""

# 9. Test Connectivity
echo "9️⃣ TEST CONNECTIVITY"
echo "---"
ALB_DNS=$(aws elbv2 describe-load-balancers \
  --region $REGION \
  --query 'LoadBalancers[?contains(LoadBalancerName, `warp`)].DNSName | [0]' \
  --output text 2>&1)

if [ ! -z "$ALB_DNS" ] && [ "$ALB_DNS" != "None" ]; then
  echo "Testing: http://$ALB_DNS/health"
  curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "http://$ALB_DNS/health" 2>&1 || echo "❌ Connection failed"
else
  echo "⚠️  ALB DNS non trovato"
fi
echo ""

echo "✅ Diagnostica completata!"
echo ""
echo "📝 PROSSIMI PASSI:"
echo "   1. Controlla se ci sono errori nei log Lambda/ECS"
echo "   2. Verifica che ECS task sia RUNNING e HEALTHY"
echo "   3. Controlla che Target Group sia 'healthy'"
echo "   4. Testa manualmente l'endpoint ALB"
