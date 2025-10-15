#!/bin/bash

# Warp Mobile AI IDE - Container Build Script
# Costruisce l'immagine Docker con tutti gli stack di sviluppo

set -e

echo "🚀 Building Warp Development Environment Container..."
echo "⚠️  Warning: This build can take 30-60 minutes and requires good internet connection"
echo ""

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

IMAGE_NAME="warp-dev-environment"
TAG="latest"
DOCKERFILE="Dockerfile.dev"

# Funzione per stampa colorata
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Controlla se Docker è in esecuzione
print_status "Checking Docker availability..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running or not accessible"
    print_error "Please start Docker Desktop and try again"
    exit 1
fi

print_success "Docker is running"

# Controlla spazio disponibile (minimo 10GB consigliati)
print_status "Checking available disk space..."
AVAILABLE_SPACE=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt 10 ]; then
    print_warning "Low disk space detected: ${AVAILABLE_SPACE}GB available"
    print_warning "This build requires ~8-10GB. Continue? (y/N)"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Build cancelled"
        exit 1
    fi
fi

# Rimuovi immagine esistente se presente
print_status "Cleaning up existing images..."
if docker image inspect $IMAGE_NAME:$TAG > /dev/null 2>&1; then
    print_status "Removing existing image $IMAGE_NAME:$TAG"
    docker rmi $IMAGE_NAME:$TAG
fi

# Build dell'immagine con progress output
print_status "Starting build process..."
print_status "Image: $IMAGE_NAME:$TAG"
print_status "Dockerfile: $DOCKERFILE"
echo ""

# Misurazione del tempo
start_time=$(date +%s)

# Build command con build args e cache ottimizzato
docker build \
    -t $IMAGE_NAME:$TAG \
    -f $DOCKERFILE \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --progress=plain \
    . || {
        print_error "Docker build failed"
        exit 1
    }

# Calcola tempo di build
end_time=$(date +%s)
build_time=$((end_time - start_time))
minutes=$((build_time / 60))
seconds=$((build_time % 60))

print_success "Build completed in ${minutes}m ${seconds}s"

# Verifica dimensione immagine
IMAGE_SIZE=$(docker image inspect $IMAGE_NAME:$TAG --format='{{.Size}}' | awk '{print int($1/1024/1024/1024)}')
print_status "Image size: ~${IMAGE_SIZE}GB"

# Test basic functionality
print_status "Testing container functionality..."
docker run --rm $IMAGE_NAME:$TAG /bin/bash -c "
    echo '✅ Testing basic tools...'
    node --version && echo 'Node.js: OK' || echo 'Node.js: FAILED'
    python3 --version && echo 'Python: OK' || echo 'Python: FAILED'
    go version && echo 'Go: OK' || echo 'Go: FAILED'
    flutter --version | head -1 && echo 'Flutter: OK' || echo 'Flutter: FAILED'
    rustc --version && echo 'Rust: OK' || echo 'Rust: FAILED'
    java -version 2>&1 | head -1 && echo 'Java: OK' || echo 'Java: FAILED'
    php --version | head -1 && echo 'PHP: OK' || echo 'PHP: FAILED'
    ruby --version && echo 'Ruby: OK' || echo 'Ruby: FAILED'
    echo '✅ Container test completed'
" || {
    print_error "Container functionality test failed"
    exit 1
}

print_success "Container is ready!"
echo ""
echo "📋 Build Summary:"
echo "   Image: $IMAGE_NAME:$TAG"
echo "   Size: ~${IMAGE_SIZE}GB"
echo "   Build time: ${minutes}m ${seconds}s"
echo ""
echo "🚀 Usage:"
echo "   Start backend server: npm start"
echo "   Test container: docker run -it $IMAGE_NAME:$TAG"
echo ""
print_success "Setup complete! Your Warp development environment is ready to use."

# Opzionale: cleanup build cache
read -p "Clean Docker build cache? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Cleaning build cache..."
    docker builder prune -f
    print_success "Build cache cleaned"
fi