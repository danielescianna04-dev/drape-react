# Drape Workspace - Node.js Full
# Full-featured image for Next.js, React, Vue, and Node.js projects
# Includes Python3, build tools (gcc, g++, make) for native npm packages
# Target size: ~900MB (100% npm compatibility)

FROM node:20

LABEL maintainer="Drape Team"
LABEL description="Full Node.js workspace for Drape IDE - supports all npm packages including native bindings"

# node:20 already includes:
# ✅ git, curl, wget, bash, ca-certificates, procps
# ✅ python3 (for node-gyp and npm native packages)
# ✅ gcc, g++, make, build-essential (for compiling native modules like sharp, bcrypt)

# Enable pnpm via corepack (already included in node:20)
RUN corepack enable && corepack prepare pnpm@latest --activate

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
