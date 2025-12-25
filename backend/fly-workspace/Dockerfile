# Drape Workspace Image
# Lightweight container for instant cloud IDE
# Based on Alpine for minimal size and fast startup

FROM node:20-alpine

LABEL maintainer="Drape Team"
LABEL description="Instant cloud workspace for Drape IDE"

# Install essential tools
RUN apk add --no-cache \
    git \
    python3 \
    py3-pip \
    curl \
    bash \
    openssh-client \
    && rm -rf /var/cache/apk/*

# Create coder user (matching Coder workspace structure)
RUN adduser -D -h /home/coder -s /bin/bash coder
USER coder
WORKDIR /home/coder

# Create project directory
RUN mkdir -p /home/coder/project

# Copy the Drape Agent
COPY --chown=coder:coder drape-agent.js /home/coder/drape-agent.js

# Expose Drape Agent port
EXPOSE 13338

# Start the Drape Agent
CMD ["node", "/home/coder/drape-agent.js"]
