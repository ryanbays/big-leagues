#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DAMRU_IMAGE_URL="https://dl.damru.dev/assets/damru-baked.tar.gz"
DAMRU_CHECKSUM_URL="https://dl.damru.dev/assets/damru-redroid-latest.tar.sha256"
DAMRU_EXTRACT_DIR="damru-oci-extract"
DAMRU_ARCHIVE_NAME="damru-baked.tar.gz"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Damru Setup Script                ║${NC}"
echo -e "${BLUE}║  Android Stealth Browser Automation    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Function to print step
print_step() {
    echo -e "${BLUE}→${NC} $1"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo "  Install from: https://docs.docker.com/get-docker/"
        exit 1
    fi
    print_success "Docker found"
    
    # Check Docker daemon
    if ! docker ps &> /dev/null; then
        print_error "Docker daemon is not running"
        echo "  Start Docker and try again"
        exit 1
    fi
    print_success "Docker daemon is running"
    
    # Check docker-compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        echo "  Install from: https://docs.docker.com/compose/install/"
        exit 1
    fi
    print_success "Docker Compose found"
    
    # Check available disk space (need at least 15GB)
    available_space=$(df . | awk 'NR==2 {print $4}')
    required_space=$((15 * 1024 * 1024)) # 15GB in KB
    
    if [ "$available_space" -lt "$required_space" ]; then
        print_warning "Low disk space: $(numfmt --to=iec $((available_space * 1024)) 2>/dev/null || echo "${available_space}KB") available"
        echo "  Damru requires at least 15GB. Proceed? (y/n)"
        read -r response
        if [[ ! $response =~ ^[yY]$ ]]; then
            exit 1
        fi
    else
        print_success "Disk space check passed: $(numfmt --to=iec $((available_space * 1024)) 2>/dev/null || echo "${available_space}KB") available"
    fi
    
    # Check available RAM (need at least 4GB)
    available_ram=$(free -m | awk 'NR==2 {print $7}')
    if [ "$available_ram" -lt 4096 ]; then
        print_warning "Low RAM available: ${available_ram}MB"
        echo "  Damru recommends at least 4GB. Proceed? (y/n)"
        read -r response
        if [[ ! $response =~ ^[yY]$ ]]; then
            exit 1
        fi
    else
        print_success "RAM check passed: ${available_ram}MB available"
    fi
    
    echo ""
}

# Check for required tools to load OCI images
check_oci_tools() {
    print_step "Checking for OCI image tools..."
    
    # Check for skopeo or podman
    if command -v skopeo &> /dev/null; then
        print_success "skopeo found"
        return 0
    fi
    
    if command -v podman &> /dev/null; then
        print_success "podman found"
        return 0
    fi
    
    # If neither found, offer to install skopeo
    print_warning "OCI image tools not found (skopeo or podman needed)"
    echo "  Install skopeo? (y/n)"
    read -r response
    if [[ $response =~ ^[yY]$ ]]; then
        print_step "Installing skopeo..."
        
        # Detect OS and install
        if command -v pacman &> /dev/null; then
            sudo pacman -S --noconfirm skopeo
        elif command -v apt &> /dev/null; then
            sudo apt update && sudo apt install -y skopeo
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y skopeo
        elif command -v brew &> /dev/null; then
            brew install skopeo
        else
            print_error "Cannot auto-install skopeo on this system"
            echo "  Please install manually from:"
            echo "    https://github.com/containers/skopeo"
            exit 1
        fi
        print_success "skopeo installed"
    else
        print_error "skopeo is required to load OCI images"
        exit 1
    fi
    echo ""
}

# Download image
download_image() {
    print_step "Downloading Damru image (~1.2GB)..."
    echo "  URL: $DAMRU_IMAGE_URL"
    echo ""
    
    if [ -f "$DAMRU_ARCHIVE_NAME" ]; then
        print_warning "Archive already exists: $DAMRU_ARCHIVE_NAME"
        echo "  Use existing? (y/n)"
        read -r response
        if [[ ! $response =~ ^[yY]$ ]]; then
            rm -f "$DAMRU_ARCHIVE_NAME"
            wget --progress=bar:force:noscroll "$DAMRU_IMAGE_URL" -O "$DAMRU_ARCHIVE_NAME"
        fi
    else
        wget --progress=bar:force:noscroll "$DAMRU_IMAGE_URL" -O "$DAMRU_ARCHIVE_NAME"
    fi
    
    print_success "Image downloaded"
    echo ""
}

# Download and verify checksum
download_and_verify_checksum() {
    print_step "Extracting OCI image archive..."
    
    # Remove old extraction if it exists
    if [ -d "$DAMRU_EXTRACT_DIR" ]; then
        rm -rf "$DAMRU_EXTRACT_DIR"
    fi
    
    mkdir -p "$DAMRU_EXTRACT_DIR"
    
    # Extract the tar.gz to OCI format directory
    if ! tar -xzf "$DAMRU_ARCHIVE_NAME" -C "$DAMRU_EXTRACT_DIR"; then
        print_error "Failed to extract archive"
        exit 1
    fi
    
    # Verify OCI layout
    if [ ! -f "$DAMRU_EXTRACT_DIR/oci-layout" ]; then
        print_error "Invalid OCI archive: oci-layout not found"
        exit 1
    fi
    
    print_success "OCI archive extracted to $DAMRU_EXTRACT_DIR"
    echo ""
}

# Load Docker image
load_docker_image() {
    print_step "Loading Docker image from OCI format..."
    
    if [ ! -d "$DAMRU_EXTRACT_DIR" ]; then
        print_error "OCI extraction directory not found: $DAMRU_EXTRACT_DIR"
        echo "  Please run extraction first"
        exit 1
    fi
    
    if docker image inspect damru-redroid:latest &> /dev/null; then
        print_warning "Image already loaded: damru-redroid:latest"
        echo "  Reload? (y/n)"
        read -r response
        if [[ ! $response =~ ^[yY]$ ]]; then
            print_success "Using existing image"
            return 0
        fi
    fi
    
    # Use skopeo to load OCI image
    if command -v skopeo &> /dev/null; then
        print_step "Loading with skopeo..."
        if ! skopeo copy "oci:$(pwd)/$DAMRU_EXTRACT_DIR" "docker-daemon:damru-redroid:latest"; then
            print_error "Failed to load image with skopeo"
            exit 1
        fi
        print_success "Docker image loaded with skopeo"
        return 0
    fi
    
    # Fallback to podman if available
    if command -v podman &> /dev/null; then
        print_step "Loading with podman..."
        if ! podman load -i "$(pwd)/$DAMRU_EXTRACT_DIR"; then
            print_error "Failed to load image with podman"
            exit 1
        fi
        print_success "Docker image loaded with podman"
        return 0
    fi
    
    # If we get here, something went wrong
    print_error "Could not load OCI image: no suitable tool found"
    exit 1
}

# Verify image loaded
verify_image() {
    print_step "Verifying image..."
    
    if ! docker image inspect damru-redroid:latest &> /dev/null; then
        print_error "Image failed to load!"
        exit 1
    fi
    
    size=$(docker image inspect damru-redroid:latest --format='{{.Size}}')
    size_gb=$((size / 1024 / 1024 / 1024))
    print_success "Image verified (${size_gb}GB)"
    echo ""
}

# Check Linux/WSL binderfs
check_binderfs() {
    print_step "Checking binderfs support..."
    
    if [ ! -d "/dev/binderfs" ]; then
        print_warning "binderfs not mounted"
        
        # Try to mount it
        if sudo mkdir -p /dev/binderfs 2>/dev/null && sudo mount -t binder binder /dev/binderfs 2>/dev/null; then
            print_success "binderfs mounted"
        else
            print_warning "Could not auto-mount binderfs"
            echo "  To mount manually, run:"
            echo "    sudo mkdir -p /dev/binderfs"
            echo "    sudo mount -t binder binder /dev/binderfs"
            echo ""
            echo "  For persistent mounting, add to /etc/fstab:"
            echo "    binder  /dev/binderfs  binder  defaults  0  0"
        fi
    else
        print_success "binderfs is mounted"
    fi
    echo ""
}

# Setup environment
setup_environment() {
    print_step "Setting up environment..."
    
    # Check if damru-service/.env exists
    if [ ! -f "damru-service/.env" ]; then
        if [ -f "damru-service/.env.example" ]; then
            cp "damru-service/.env.example" "damru-service/.env"
            print_success "Created damru-service/.env from template"
        else
            print_warning "damru-service/.env.example not found, skipping"
        fi
    else
        print_success "damru-service/.env already exists"
    fi
    echo ""
}

# Start services
start_services() {
    print_step "Starting Docker Compose services..."
    
    if ! docker-compose up -d; then
        print_error "Failed to start services"
        exit 1
    fi
    
    print_success "Services starting..."
    echo ""
    
    # Wait for services to be ready
    print_step "Waiting for services to be ready..."
    sleep 10
    
    # Check health
    for i in {1..30}; do
        if curl -s http://localhost:5000/health > /dev/null 2>&1; then
            print_success "Services are ready"
            break
        fi
        echo -n "."
        sleep 2
    done
    echo ""
    echo ""
}

# Verify health
verify_health() {
    print_step "Verifying health..."
    
    health_response=$(curl -s http://localhost:5000/health || echo "{}")
    
    if echo "$health_response" | grep -q "healthy"; then
        print_success "Damru API is healthy"
        echo "$health_response" | jq '.' 2>/dev/null || echo "$health_response"
    else
        print_warning "Damru API health check uncertain"
        echo "  Response: $health_response"
        echo ""
        echo "  Check logs:"
        echo "    docker-compose logs damru-pool"
        echo "    docker-compose logs damru-redroid"
    fi
    echo ""
}

# Print summary
print_summary() {
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║        Setup Complete!                 ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${GREEN}✓${NC} Damru is ready to use!"
    echo ""
    
    echo "Quick Start Commands:"
    echo -e "  ${BLUE}docker-compose ps${NC}              # Check service status"
    echo -e "  ${BLUE}docker-compose logs -f${NC}         # View logs"
    echo -e "  ${BLUE}curl http://localhost:5000/health${NC}  # Health check"
    echo ""
    
    echo "API Endpoints:"
    echo -e "  ${YELLOW}Navigate:${NC}   POST /api/navigate"
    echo -e "  ${YELLOW}Scrape:${NC}     POST /api/scrape"
    echo -e "  ${YELLOW}Screenshot:${NC} POST /api/screenshot"
    echo -e "  ${YELLOW}Status:${NC}     GET /api/status"
    echo ""
    
    echo "Using from Discord Bot:"
    echo -e "  ${BLUE}const damru = require('./damru-client');${NC}"
    echo -e "  ${BLUE}await damru.navigate('https://example.com');${NC}"
    echo ""
    
    echo "Documentation:"
    echo -e "  ${YELLOW}Setup Guide:${NC}    DAMRU_SETUP.md"
    echo -e "  ${YELLOW}Service Docs:${NC}   damru-service/README.md"
    echo -e "  ${YELLOW}Damru Project:${NC}  https://github.com/akwin1234/damru"
    echo ""
}

# Cleanup temporary files
cleanup() {
    print_step "Cleaning up temporary files..."
    rm -rf "$DAMRU_EXTRACT_DIR"
    rm -f "$DAMRU_ARCHIVE_NAME.sha256"
    print_success "Cleaned up"
    echo ""
}

# Main flow
main() {
    check_prerequisites
    check_oci_tools
    download_image
    download_and_verify_checksum
    load_docker_image
    verify_image
    check_binderfs
    setup_environment
    start_services
    verify_health
    cleanup
    print_summary
}

# Run main function
main
