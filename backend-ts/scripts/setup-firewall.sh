#!/bin/bash
# Egress filtering for Drape containers
# Allow DNS, HTTP, HTTPS only. Block everything else.
# Run on the Docker host (Hetzner server)

set -euo pipefail

DOCKER_BRIDGE=$(docker network inspect drape-net -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || echo "172.18.0.1")
DOCKER_SUBNET=$(docker network inspect drape-net -f '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null || echo "172.18.0.0/16")

echo "Applying egress firewall rules for Drape containers..."
echo "  Bridge gateway: $DOCKER_BRIDGE"
echo "  Subnet: $DOCKER_SUBNET"

# Allow established connections
iptables -I DOCKER-USER -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Allow DNS
iptables -I DOCKER-USER -s $DOCKER_SUBNET -p udp --dport 53 -j ACCEPT
iptables -I DOCKER-USER -s $DOCKER_SUBNET -p tcp --dport 53 -j ACCEPT
# Allow HTTP/HTTPS
iptables -I DOCKER-USER -s $DOCKER_SUBNET -p tcp --dport 80 -j ACCEPT
iptables -I DOCKER-USER -s $DOCKER_SUBNET -p tcp --dport 443 -j ACCEPT
# Allow communication to host (for agent API)
iptables -I DOCKER-USER -s $DOCKER_SUBNET -d $DOCKER_BRIDGE -j ACCEPT
# Block everything else from containers
iptables -A DOCKER-USER -s $DOCKER_SUBNET -j DROP

echo "Firewall rules applied for Drape containers"
