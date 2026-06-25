# Damru Integration - Setup Complete ✅

## Overview
Your Discord bot project now has integrated Damru Android stealth browser automation. All services are running and ready for use.

## Current Status

### Services (All Running ✅)
```
Service         Status               Port
─────────────────────────────────────────
damru-pool      Up (healthy)         5000
damru-redroid   Up (running)         5555
discord-bot     Up (running)         -
```

### API Health Check
```bash
$ curl http://localhost:5000/health
{
  "status": "healthy",
  "adb_connected": true,
  "android_booted": true,
  "max_workers": 2,
  "active_sessions": 0,
  "worker_count": 0
}
```

## What Was Created

### Docker & Orchestration
- **docker-compose.yml** - Defines three services with volumes, networking, and health checks
- **damru-service/Dockerfile** - Python Flask API service
- **Dockerfile.bot** - Existing Discord bot (unchanged)

### Damru Service (Python Flask)
- **damru-service/app.py** - REST API endpoints
- **damru-service/damru_manager.py** - Business logic for Damru operations  
- **damru-service/config.py** - Configuration management
- **damru-service/requirements.txt** - Python dependencies

### Bot Integration
- **damru-client.js** - Node.js client module for calling Damru API
  - `healthCheck()` - Verify service status
  - `navigate(url, options)` - Stealth navigation
  - `scrape(url, selectors, options)` - Extract content
  - `screenshot(options)` - Capture screen
  - `getDevices()` - List device profiles
  - `getStatus()` - Pool status
  - `cleanup()` - Session cleanup

### Automation
- **scripts/damru/setup-damru.sh** - Automated setup script with:
  - Prerequisites validation
  - OCI image handling (auto-installs skopeo)
  - Docker image loading
  - Binderfs mounting
  - Environment configuration
  - Service startup and health verification

- **justfile** - 40+ recipes for common tasks:
  - `just up/down/restart/ps` - Docker Compose shortcuts
  - `just damru-setup` - Run full setup
  - `just damru-health` - Check health
  - `just damru-logs-f` - Follow logs
  - `just damru-test` - Test all API endpoints
  - `just damru-clean` - Cleanup

### Documentation
- **DAMRU_SETUP.md** - Complete setup guide
- **SETUP_SCRIPTS.md** - Script documentation
- **JUSTFILE_README.md** - Justfile reference
- **damru-service/README.md** - API documentation

## Quick Start Guide

### View Services
```bash
docker-compose ps                    # List services
docker-compose logs damru-pool -f    # Follow Flask logs
docker-compose logs damru-redroid    # See Android boot logs
```

### Test API
```bash
curl http://localhost:5000/health                    # Health check
curl http://localhost:5000/api/status                # Pool status
curl http://localhost:5000/api/devices               # Available devices
```

### Use in Discord Bot
```javascript
const damru = require('./damru-client');

// In a command handler:
await damru.navigate('https://example.com', {
  device: 'pixel_8_pro',
  proxy: 'http://proxy.example.com:8080',
  screenshot: true
});

// Get list of 155 device profiles
const devices = await damru.getDevices();

// Scrape content
const data = await damru.scrape('https://example.com', {
  selectors: {
    title: 'h1',
    price: '.price',
    items: '.product-list li'
  }
});
```

### Stop Services
```bash
docker-compose down                  # Stop all services
just damru-clean-all                 # Stop and remove volumes
```

## API Endpoints

### Health
- **GET** `/health` - Service health status
- **GET** `/api/status` - Worker pool status

### Operations
- **POST** `/api/navigate` - Navigate to URL with options
  - Request: `{url, device?, proxy?, timeout?, screenshot?}`
  - Response: `{success, session_id, url, screenshot_path}`

- **POST** `/api/scrape` - Extract content from page
  - Request: `{url, device?, proxy?, selectors}`
  - Response: `{success, data}`

- **POST** `/api/screenshot` - Capture current screen
  - Request: `{device?, output_path?}`
  - Response: `{success, path}`

### Reference
- **GET** `/api/devices` - List 155 device profiles
- **POST** `/api/cleanup` - Clean up sessions

## Available Devices (Sample)
- Pixel 8 Pro, Pixel 8
- Samsung Galaxy S24 Ultra, S24
- iPhone 15 Pro Max, iPhone 15
- iPad Pro, iPad Air
- And 147 more...

## Configuration

### Environment Variables (damru-service/.env)
```bash
NUM_DEVICES=2              # Number of concurrent workers
REDROID_CPUS=2.0          # CPU allocation per device
REDROID_MEMORY=2g         # Memory per device
REDROID_HOST=damru-redroid # Host connection
REDROID_PORT=5555         # ADB port
```

### Discord Bot (docker-compose.yml)
```bash
DAMRU_API_URL=http://damru-pool:5000  # Service endpoint (inside Docker)
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Docker Compose Network                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐   │
│  │              │  │              │  │            │   │
│  │ discord-bot  │  │ damru-pool   │  │damru-redroid│  │
│  │ (Node.js)    │  │ (Flask/5000) │  │(Android)   │   │
│  │              │──────── HTTP ────────│ (5555)   │   │
│  │              │  │              │  │            │   │
│  └──────────────┘  └──────────────┘  └────────────┘   │
│                                                         │
│  Volumes:                                              │
│  - db: Bot data                                        │
│  - damru-data: Android storage                         │
│  - damru-pool-data: Damru assets                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Next Steps

1. **Create a test command** to verify Damru integration
   ```javascript
   // In your commands file
   await interaction.reply('Testing Damru...');
   const status = await damru.healthCheck();
   await interaction.followUp(`Status: ${status.status}`);
   ```

2. **Implement a navigation command** for stealth browsing
   ```javascript
   const result = await damru.navigate(url, {device: 'pixel_8_pro'});
   ```

3. **Add data scraping** for web content extraction
   ```javascript
   const data = await damru.scrape(url, {selectors: {...}});
   ```

4. **Monitor logs** during testing
   ```bash
   docker-compose logs -f
   ```

5. **Scale workers** if needed (edit damru-service/.env NUM_DEVICES)

## Troubleshooting

### Services not healthy
```bash
# Check logs
docker-compose logs damru-pool
docker-compose logs damru-redroid

# Restart services
docker-compose restart
```

### API not responding
```bash
# Verify it's running
curl http://localhost:5000/health

# Check network
docker network inspect big-leagues-bot_default
```

### High resource usage
```bash
# Reduce workers in damru-service/.env
NUM_DEVICES=1
REDROID_MEMORY=1g

# Restart services
docker-compose restart
```

## Performance Notes

- **Initial boot time**: ~2 minutes (Android initialization)
- **Memory per device**: ~2GB (configurable)
- **CPU per device**: ~2 cores (configurable)
- **Stealth level**: Maximum (8 layers - OS, binary, CDP, profile)
- **Device profiles**: 155 real Android devices with unique fingerprints
- **TLS fingerprints**: ~184 unique profiles

## Support

For detailed information, see:
- [DAMRU_SETUP.md](DAMRU_SETUP.md) - Complete setup guide
- [damru-service/README.md](damru-service/README.md) - API reference
- [JUSTFILE_README.md](JUSTFILE_README.md) - Command reference

## Security

- Services run in isolated Docker containers
- Network isolation via Docker Compose
- No ports exposed except explicitly defined
- Environment variables for sensitive config
- Volumes for data persistence

---

**Setup Date**: 2026-06-24
**Status**: ✅ All systems operational
