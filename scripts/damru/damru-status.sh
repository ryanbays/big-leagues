#!/bin/bash

# Monitor Damru services and health
# Usage: ./scripts/damru/damru-status.sh [watch]

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

show_status() {
    clear
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║          Damru Status Monitor          ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    
    # Docker Compose Status
    echo -e "${BLUE}📦 Docker Compose Services:${NC}"
    docker-compose ps
    echo ""
    
    # Damru API Health
    echo -e "${BLUE}🏥 Damru API Health:${NC}"
    health=$(curl -s http://localhost:5000/health 2>/dev/null || echo "{}")
    
    if echo "$health" | jq -e '.status' > /dev/null 2>&1; then
        status=$(echo "$health" | jq -r '.status')
        adb=$(echo "$health" | jq -r '.adb_connected')
        android=$(echo "$health" | jq -r '.android_booted')
        workers=$(echo "$health" | jq -r '.worker_count')
        max_workers=$(echo "$health" | jq -r '.max_workers')
        
        status_color="${GREEN}"
        [ "$status" != "healthy" ] && status_color="${RED}"
        
        echo -e "  Status:        ${status_color}${status}${NC}"
        echo -e "  ADB:           $([ "$adb" = "true" ] && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}")"
        echo -e "  Android Boot:  $([ "$android" = "true" ] && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}")"
        echo -e "  Workers:       ${workers}/${max_workers}"
    else
        echo -e "  ${RED}✗ API unreachable${NC}"
    fi
    echo ""
    
    # Docker Stats
    echo -e "${BLUE}⚙️  Resource Usage:${NC}"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "  Unable to retrieve stats"
    echo ""
    
    # Recent Logs
    echo -e "${BLUE}📋 Recent Logs:${NC}"
    echo ""
    echo -e "${YELLOW}Damru Pool:${NC}"
    docker-compose logs --tail=5 damru-pool 2>/dev/null || echo "  No logs"
    echo ""
    
    # Endpoints
    echo -e "${BLUE}🔗 API Endpoints:${NC}"
    echo "  Health:    curl http://localhost:5000/health"
    echo "  Status:    curl http://localhost:5000/api/status"
    echo "  Devices:   curl http://localhost:5000/api/devices"
    echo ""
    
    # Commands
    echo -e "${BLUE}⚡ Quick Commands:${NC}"
    echo "  View logs:    docker-compose logs -f [damru-pool|damru-redroid|discord-bot]"
    echo "  Restart:      docker-compose restart"
    echo "  Stop:         docker-compose stop"
    echo "  Interactive:  watch -n 1 ./scripts/damru/damru-status.sh"
}

# Check for watch mode
if [ "$1" = "watch" ]; then
    watch -n 2 "$0"
else
    show_status
fi
