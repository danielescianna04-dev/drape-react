# Drape Workspace - Node.js Optimized
# Lightweight image for Next.js, React, Vue, and Node.js projects
# Target size: ~200-300MB (vs 3-5GB for universal image)

FROM node:20-slim

LABEL maintainer="Drape Team"
LABEL description="Lightweight Node.js workspace for Drape IDE - optimized for Next.js/React"

# Install only essential system packages
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    bash \
    ca-certificates \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install package managers: npm (included), yarn, pnpm
# Note: yarn is already included in node:20-slim, using --force to update
RUN npm install -g npm@latest yarn@latest pnpm --force

# Create coder user (matching workspace structure)
RUN useradd -m -d /home/coder -s /bin/bash coder

# Create project directory
RUN mkdir -p /home/coder/project && chown -R coder:coder /home/coder

# Copy the Drape Agent
COPY --chown=coder:coder drape-agent.js /home/coder/drape-agent.js

# Switch to coder user
USER coder
WORKDIR /home/coder

# Expose Drape Agent port (13338) and application port (3000)
EXPOSE 13338 3000

# Start the Drape Agent
CMD ["node", "/home/coder/drape-agent.js"]
