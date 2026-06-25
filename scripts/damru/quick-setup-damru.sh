#!/bin/bash

# Quick setup for Damru - downloads, loads, and starts everything
# Usage: ./scripts/damru/quick-setup-damru.sh

set -e

echo "📦 Damru Quick Setup"
echo ""

# Download
echo "1️⃣  Downloading image..."
wget -q --show-progress https://dl.damru.dev/assets/damru-baked.tar.gz || {
    echo "Download failed. Try manual download from:"
    echo "https://dl.damru.dev/assets/damru-baked.tar.gz"
    exit 1
}

# Extract
echo "2️⃣  Extracting..."
tar -xzf damru-baked.tar.gz

# Load
echo "3️⃣  Loading into Docker..."
docker load -i damru-redroid-latest.tar

# Start
echo "4️⃣  Starting services..."
docker-compose up -d

# Wait
echo "5️⃣  Waiting for startup (30s)..."
sleep 30

# Health
echo "6️⃣  Checking health..."
curl http://localhost:5000/health | jq '.' || echo "Checking..."

echo ""
echo "✅ Done! Damru is running."
echo ""
echo "Check status:    docker-compose ps"
echo "View logs:       docker-compose logs -f"
echo "Health check:    curl http://localhost:5000/health"
