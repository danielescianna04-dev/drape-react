# Dockerfile multi-stage per backend Drape v2.
# Alternative al deploy via systemd se preferisci Docker.
#
# Build:
#   docker build -f infra/backend/Dockerfile -t drape-backend:latest backend-v2/
# Run:
#   docker run -d --name drape-backend \
#     -p 3000:3000 \
#     --env-file backend-v2/.env \
#     --restart unless-stopped \
#     drape-backend:latest

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Crea user non-root
RUN addgroup -S drape && adduser -S drape -G drape

COPY --from=deps    --chown=drape:drape /app/node_modules ./node_modules
COPY --from=builder --chown=drape:drape /app/dist        ./dist
COPY --from=builder --chown=drape:drape /app/public      ./public
COPY --chown=drape:drape package.json ./

USER drape

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/index.js"]
