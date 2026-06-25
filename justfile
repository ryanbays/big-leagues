# Damru Setup & Management Commands
# Usage: just <command>
# List all commands: just --list

# Colors
RED := "\\033[0;31m"
GREEN := "\\033[0;32m"
YELLOW := "\\033[1;33m"
BLUE := "\\033[0;34m"
NC := "\\033[0m"

# Default recipe
default:
    @echo "{{BLUE}}Damru Setup & Management Commands{{NC}}"
    @echo ""
    @just --list

# Show help
help:
    @echo "{{BLUE}}Damru Setup & Management Commands{{NC}}"
    @echo ""
    @echo "{{BLUE}}Setup:{{NC}}"
    @echo "  just damru-setup      Full setup with checks and verification"
    @echo "  just damru-quick      Quick setup (download, load, start)"
    @echo ""
    @echo "{{BLUE}}Management:{{NC}}"
    @echo "  just damru-status     Show Damru status"
    @echo "  just damru-watch      Watch Damru status (auto-refresh)"
    @echo "  just damru-logs       Show Damru logs"
    @echo "  just damru-logs-f     Follow Damru logs"
    @echo "  just damru-restart    Restart Damru services"
    @echo ""
    @echo "{{BLUE}}Cleanup:{{NC}}"
    @echo "  just damru-clean      Stop and remove containers"
    @echo "  just damru-clean-all  Remove containers, volumes, and images"
    @echo ""
    @echo "{{BLUE}}Testing:{{NC}}"
    @echo "  just damru-test       Test Damru API"
    @echo "  just damru-health     Check health endpoint"
    @echo ""
    @echo "{{BLUE}}Docker:{{NC}}"
    @echo "  just up               Start all services"
    @echo "  just down             Stop all services"
    @echo "  just logs             Show all logs"
    @echo "  just ps               Show service status"
    @echo ""
    @echo "{{BLUE}}Info:{{NC}}"
    @echo "  just info             Show setup information"
    @echo ""

# ============================================================================
# Setup Commands
# ============================================================================

# Full setup with checks and verification
damru-setup:
    @./scripts/damru/setup-damru.sh

# Quick setup (download, load, start)
damru-quick:
    @./scripts/damru/quick-setup-damru.sh

# ============================================================================
# Status & Monitoring Commands
# ============================================================================

# Show Damru status
damru-status:
    @./scripts/damru/damru-status.sh

# Watch Damru status (auto-refresh every 2 seconds)
damru-watch:
    @watch -n 2 './scripts/damru/damru-status.sh'

# Show Damru pool logs
damru-logs:
    docker-compose logs damru-pool

# Follow Damru pool logs
damru-logs-f:
    docker-compose logs -f damru-pool

# Show Redroid logs
damru-logs-redroid:
    docker-compose logs -f damru-redroid

# Show Discord bot logs
damru-logs-bot:
    docker-compose logs -f discord-bot

# ============================================================================
# Management Commands
# ============================================================================

# Restart Damru services
damru-restart:
    @echo "Restarting Damru services..."
    docker-compose restart damru-pool damru-redroid
    @sleep 5
    @just damru-health

# Stop Damru services
damru-stop:
    docker-compose stop damru-pool damru-redroid

# Start Damru services
damru-start:
    docker-compose start damru-pool damru-redroid

# ============================================================================
# Cleanup Commands
# ============================================================================

# Stop and remove containers
damru-clean:
    @./scripts/damru/cleanup-damru.sh

# Remove containers, volumes, and images
damru-clean-all:
    @./scripts/damru/cleanup-damru.sh -v -i

# ============================================================================
# Testing & Health Commands
# ============================================================================

# Check Damru health endpoint
damru-health:
    @echo "Checking Damru health..."
    @curl -s http://localhost:5000/health | jq '.' || echo "API not responding"

# Test Damru API endpoints
damru-test:
    @echo "Running Damru API tests..."
    @echo ""
    @echo "1. Health check:"
    @curl -s http://localhost:5000/health | jq '.'
    @echo ""
    @echo "2. Status:"
    @curl -s http://localhost:5000/api/status | jq '.'
    @echo ""
    @echo "3. Available devices:"
    @curl -s http://localhost:5000/api/devices | jq '.'

# Show available device profiles
damru-devices:
    @curl -s http://localhost:5000/api/devices | jq '.devices'

# ============================================================================
# Docker Compose Shortcuts
# ============================================================================

# Start all services
up:
    docker-compose up -d
    @echo "✓ Services started"
    docker-compose ps

# Stop all services
down:
    docker-compose down
    @echo "✓ Services stopped"

# Restart all services
restart:
    docker-compose restart
    @echo "✓ Services restarted"

# Show service logs
logs:
    docker-compose logs -f

# Show service status
ps:
    docker-compose ps

# Show detailed service status
ps-detailed:
    docker-compose ps -a

# Pull latest images
pull:
    docker-compose pull

# Build images without cache
build:
    docker-compose build --no-cache

# ============================================================================
# All-in-One Commands
# ============================================================================

# Complete setup: full damru setup + start services + health check
setup-all: damru-setup up
    @just damru-health

# Development mode: start services + follow logs
dev: up
    @just damru-logs-f

# Development watch mode: watch status continuously
dev-watch:
    @just damru-watch

# ============================================================================
# Information Commands
# ============================================================================

# Show setup information
info:
    @echo "{{BLUE}}Big Leagues Bot + Damru Setup{{NC}}"
    @echo ""
    @echo "{{BLUE}}Services:{{NC}}"
    @echo "  discord-bot     Node.js Discord bot (port: variable)"
    @echo "  damru-pool      Flask API for Damru (port: 5000)"
    @echo "  damru-redroid   Android 14 in Docker (ADB: 5555)"
    @echo ""
    @echo "{{BLUE}}Documentation:{{NC}}"
    @echo "  DAMRU_SETUP.md              Complete setup guide"
    @echo "  SETUP_SCRIPTS.md            Scripts documentation"
    @echo "  damru-service/README.md     API documentation"
    @echo "  docker-compose.yml          Service configuration"
    @echo ""
    @echo "{{BLUE}}Quick Start:{{NC}}"
    @echo "  just damru-setup            Run full setup"
    @echo "  just damru-health           Check health"
    @echo "  just help                   Show all commands"
    @echo ""

# Show versions
versions:
    @echo "{{BLUE}}Installed Versions:{{NC}}"
    @echo "Docker:"
    @docker --version
    @echo ""
    @echo "Docker Compose:"
    @docker-compose --version
    @echo ""
    @echo "Just:"
    @just --version
    @echo ""
    @echo "ADB (if installed):"
    @adb version 2>/dev/null || echo "Not installed"
    @echo ""

# ============================================================================
# Utility Commands
# ============================================================================

# Show all Docker images related to Damru
images:
    @docker images | grep -E "damru|big-leagues"

# Show all Docker volumes related to Damru
volumes:
    @docker volume ls | grep -E "damru|big-leagues|db"

# Show Docker network info
network:
    docker network ls
    @echo ""
    docker network inspect big-leagues-bot_default 2>/dev/null || echo "Network not found (services may not be running)"

# Clean up Docker system (prune unused images/volumes)
docker-prune:
    @echo "Cleaning up Docker system..."
    docker system prune -f
    @echo "✓ Cleaned"

# Check disk usage
disk-usage:
    @echo "{{BLUE}}Disk Usage:{{NC}}"
    @du -sh . 2>/dev/null || echo "Unable to calculate"
    @echo ""
    @echo "{{BLUE}}Docker Usage:{{NC}}"
    @docker system df

# ============================================================================
# Quick Test Commands
# ============================================================================

# Navigate to example.com
test-navigate:
    @echo "Testing navigate to example.com..."
    curl -X POST http://localhost:5000/api/navigate \
      -H "Content-Type: application/json" \
      -d '{"url":"https://example.com","device":"random"}' \
      | jq '.'

# Take screenshot
test-screenshot:
    @echo "Testing screenshot..."
    curl -X POST http://localhost:5000/api/screenshot \
      -H "Content-Type: application/json" \
      -d '{"device":"random"}' \
      | jq '.'

# Get pool status
test-status:
    @echo "Testing API status..."
    curl -s http://localhost:5000/api/status | jq '.'

# ============================================================================
# All Commands (for reference)
# ============================================================================

# List all available commands
list:
    just --list
