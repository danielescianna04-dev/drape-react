FROM node:20-alpine

RUN apk add --no-cache git bash

WORKDIR /app

# Copy package files and install production deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built JS output
COPY dist/ ./dist/

# Copy env and service account
COPY .env ./
COPY service-account-key.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]
