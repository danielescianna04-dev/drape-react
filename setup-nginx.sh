#!/bin/bash
# Setup nginx + SSL for drape.info on Hetzner

# 1. Create nginx config
cat > /etc/nginx/sites-available/drape.info << 'NGINX_EOF'
server {
    listen 80;
    server_name drape.info www.drape.info;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
NGINX_EOF

echo "✅ Nginx config created"

# 2. Enable site
ln -sf /etc/nginx/sites-available/drape.info /etc/nginx/sites-enabled/
echo "✅ Site enabled"

# 3. Test and reload nginx
nginx -t && systemctl reload nginx
echo "✅ Nginx reloaded"

# 4. Get SSL certificate (replace email)
certbot --nginx -d drape.info -d www.drape.info --non-interactive --agree-tos -m admin@drape.info
echo "✅ SSL certificate installed"

# 5. Test
echo "Testing HTTPS..."
curl -s https://drape.info/health
