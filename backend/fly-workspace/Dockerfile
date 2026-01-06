# Drape Workspace Image
# Universal container supporting 45+ frameworks
# Multi-language runtime environment

FROM ubuntu:22.04

LABEL maintainer="Drape Team"
LABEL description="Universal cloud workspace for Drape IDE - supports 45+ frameworks"

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system essentials and build tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    bash \
    openssh-client \
    psmisc \
    ca-certificates \
    gnupg \
    lsb-release \
    build-essential \
    pkg-config \
    libssl-dev \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# ====== NODE.JS / JAVASCRIPT / TYPESCRIPT ======
# Install Node.js 20 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install package managers: npm (included), yarn, pnpm, bun
RUN npm install -g npm@latest yarn pnpm

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# ====== PYTHON ======
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Create python/python3 symlink and upgrade pip
RUN ln -sf /usr/bin/python3 /usr/bin/python \
    && pip3 install --upgrade pip setuptools wheel

# Install Python web framework tools
RUN pip3 install --no-cache-dir \
    flask \
    django \
    fastapi \
    uvicorn[standard] \
    streamlit \
    gunicorn

# ====== GO ======
ENV GO_VERSION=1.21.5
RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz \
    && rm go${GO_VERSION}.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/home/coder/go"
ENV PATH="${GOPATH}/bin:${PATH}"

# ====== RUST ======
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

# ====== RUBY ======
RUN apt-get update && apt-get install -y \
    ruby \
    ruby-dev \
    rubygems \
    && gem install bundler rails sinatra \
    && rm -rf /var/lib/apt/lists/*

# ====== PHP ======
RUN apt-get update && apt-get install -y \
    php \
    php-cli \
    php-mbstring \
    php-xml \
    php-curl \
    php-zip \
    php-mysql \
    php-pgsql \
    && rm -rf /var/lib/apt/lists/*

# Install Composer
RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# Install Symfony CLI
RUN curl -sS https://get.symfony.com/cli/installer | bash \
    && mv /root/.symfony*/bin/symfony /usr/local/bin/symfony

# ====== JAVA / MAVEN / GRADLE ======
RUN apt-get update && apt-get install -y \
    default-jdk \
    maven \
    && rm -rf /var/lib/apt/lists/*

# Install Gradle
ENV GRADLE_VERSION=8.5
RUN wget -q https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip \
    && unzip -q gradle-${GRADLE_VERSION}-bin.zip -d /opt \
    && rm gradle-${GRADLE_VERSION}-bin.zip \
    && ln -s /opt/gradle-${GRADLE_VERSION}/bin/gradle /usr/local/bin/gradle

# ====== .NET / C# ======
RUN wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && rm packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y dotnet-sdk-8.0 \
    && rm -rf /var/lib/apt/lists/*

# ====== DENO ======
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

# ====== Additional Tools ======
# Install http-server for static sites
RUN npm install -g http-server

# Install Angular CLI (common global tool)
RUN npm install -g @angular/cli

# Create coder user (matching Coder workspace structure)
RUN useradd -m -d /home/coder -s /bin/bash coder

# Set up environment for coder user
USER coder
WORKDIR /home/coder

# Copy Rust/Cargo environment to coder user
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/home/coder/.cargo/bin:${PATH}"

# Copy Bun to coder user
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/home/coder/.bun/bin:${PATH}"

# Copy Deno to coder user
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/home/coder/.deno/bin:${PATH}"

# Set up Go for coder user
ENV GOPATH="/home/coder/go"
ENV PATH="${GOPATH}/bin:/usr/local/go/bin:${PATH}"

# Create project directory
RUN mkdir -p /home/coder/project

# Switch back to root to copy files
USER root

# Copy the Drape Agent
COPY --chown=coder:coder drape-agent.js /home/coder/drape-agent.js

# Switch to coder user for runtime
USER coder

# Expose Drape Agent port (13338) and application port (3000)
EXPOSE 13338 3000

# Start the Drape Agent
CMD ["node", "/home/coder/drape-agent.js"]
