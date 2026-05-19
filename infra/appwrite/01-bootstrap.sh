#!/bin/bash
# Bootstrap di un VPS pulito per ospitare Appwrite + Drape backend.
# Compatibile con Ubuntu 24.04 LTS sia x86 (amd64) sia ARM (arm64).
# Provider testati: Hetzner, Netcup, OVH.
# Esegui come root.

set -euo pipefail

echo "[1/6] Update OS..."
apt-get update && apt-get upgrade -y

echo "[2/6] Install base tools..."
apt-get install -y \
  curl wget git vim htop iotop tmux \
  ca-certificates gnupg lsb-release \
  ufw fail2ban unattended-upgrades

echo "[3/6] Configure firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[4/6] Install Docker..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

echo "[5/6] Create drape user..."
if ! id -u drape >/dev/null 2>&1; then
  useradd -m -s /bin/bash -G docker,sudo drape
  echo "drape ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/drape
  mkdir -p /home/drape/.ssh
  cp /root/.ssh/authorized_keys /home/drape/.ssh/authorized_keys
  chown -R drape:drape /home/drape/.ssh
  chmod 700 /home/drape/.ssh
  chmod 600 /home/drape/.ssh/authorized_keys
fi

echo "[6/6] Enable automatic security updates..."
dpkg-reconfigure -plow unattended-upgrades || true

echo ""
echo "✅ Bootstrap completato."
echo ""
echo "Prossimi step:"
echo "  1. ssh drape@<vps-ip>"
echo "  2. bash 02-install-appwrite.sh"
echo ""
