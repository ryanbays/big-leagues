#!/bin/bash

# Cleanup script for Damru setup
# Removes containers, volumes, and optionally images

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Damru Cleanup Script${NC}"
echo ""

# Show what will be removed
echo -e "${YELLOW}This will:${NC}"
echo "  • Stop all Docker Compose services"
echo "  • Remove containers"
echo ""
echo -e "${YELLOW}Options:${NC}"
echo "  -v, --volumes    Also remove volumes (data will be lost)"
echo "  -i, --images     Also remove Docker images"
echo "  -f, --force      Skip confirmation"
echo ""

# Parse arguments
remove_volumes=false
remove_images=false
force=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--volumes)
            remove_volumes=true
            echo "  ✓ Will remove volumes"
            ;;
        -i|--images)
            remove_images=true
            echo "  ✓ Will remove images"
            ;;
        -f|--force)
            force=true
            echo "  ✓ Skipping confirmation"
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
    shift
done

echo ""

# Confirmation
if [ "$force" = false ]; then
    echo -e "${YELLOW}Continue? (y/N)${NC}"
    read -r response
    if [[ ! $response =~ ^[yY]$ ]]; then
        echo "Cancelled"
        exit 0
    fi
fi

echo ""
echo -e "${BLUE}Cleaning up...${NC}"

# Stop services
echo -n "Stopping services..."
docker-compose down ${remove_volumes:+"-v"} > /dev/null 2>&1 && echo -e " ${GREEN}✓${NC}" || echo -e " ${YELLOW}⚠${NC}"

# Remove images if requested
if [ "$remove_images" = true ]; then
    echo -n "Removing damru-redroid image..."
    docker rmi damru-redroid:latest > /dev/null 2>&1 && echo -e " ${GREEN}✓${NC}" || echo -e " ${YELLOW}not found${NC}"
    
    echo -n "Removing damru-pool image..."
    docker rmi big-leagues-bot-damru-pool > /dev/null 2>&1 && echo -e " ${GREEN}✓${NC}" || echo -e " ${YELLOW}not found${NC}"
fi

# Clean tar files if requested
if [ "$force" = false ]; then
    echo ""
    echo -e "${YELLOW}Remove downloaded tar files? (y/N)${NC}"
    read -r response
    if [[ $response =~ ^[yY]$ ]]; then
        rm -f damru-redroid-latest.tar damru-baked.tar.gz
        echo -e "  ${GREEN}✓${NC} Removed tar files"
    fi
fi

echo ""
echo -e "${GREEN}✓ Cleanup complete!${NC}"
