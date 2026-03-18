#!/bin/bash
# Generate Software Bill of Materials for compliance
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Generating SBOM for frontend..."
cd "$PROJECT_ROOT"
npx --yes license-checker --json > sbom-frontend.json 2>/dev/null || echo "Frontend SBOM generation failed"

echo "Generating SBOM for backend..."
cd "$PROJECT_ROOT/backend-ts"
npx --yes license-checker --json > sbom-backend.json 2>/dev/null || echo "Backend SBOM generation failed"

echo "SBOM files generated:"
echo "  - sbom-frontend.json"
echo "  - backend-ts/sbom-backend.json"
