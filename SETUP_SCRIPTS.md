# Damru Setup Scripts Guide

This directory contains automated scripts for setting up and managing Damru with your Discord bot.

## Available Scripts

### 1. **setup-damru.sh** - Full Setup (Recommended)

Complete setup with all checks and verification.

```bash
./scripts/damru/setup-damru.sh
```

**Features:**
- ✓ Checks Docker, disk space, RAM
- ✓ Downloads pre-baked image (~1.2GB)
- ✓ Verifies SHA256 checksum
- ✓ Loads Docker image
- ✓ Mounts binderfs (Linux/WSL2)
- ✓ Starts Docker Compose services
- ✓ Verifies all health checks

**Time:** ~10-15 minutes (depends on download speed)

---

### 2. **quick-setup-damru.sh** - Quick Setup

Fast setup for experienced users (skip most checks).

```bash
./scripts/damru/quick-setup-damru.sh
```

**Features:**
- Downloads image
- Extracts archive
- Loads into Docker
- Starts services
- Basic health check

**Time:** ~5-10 minutes

---

### 3. **damru-status.sh** - Status Monitor

Check current status and health of all services.

```bash
./scripts/damru/damru-status.sh
./scripts/damru/damru-status.sh watch   # Auto-refresh every 2 seconds
```

**Shows:**
- Docker Compose service status
- Damru API health (ADB, Android boot, workers)
- Resource usage (CPU, memory)
- Recent logs
- API endpoints

---

### 4. **cleanup-damru.sh** - Cleanup

Stop and remove Damru services.

```bash
./scripts/damru/cleanup-damru.sh           # Remove containers
./scripts/damru/cleanup-damru.sh -v        # Also remove volumes
./scripts/damru/cleanup-damru.sh -i        # Also remove images
./scripts/damru/cleanup-damru.sh -v -i -f  # Remove all, skip confirmation
```

**Options:**
- `-v, --volumes` - Remove Docker volumes (data loss)
- `-i, --images` - Remove Docker images
- `-f, --force` - Skip confirmation prompts

---

## Using Just (Easier!)

All scripts are also available via `justfile` recipes for convenience:

```bash
make help                 # Show all commands
make damru-setup          # Full setup
make damru-quick          # Quick setup
make damru-status         # Show status
make damru-watch          # Watch status
make damru-logs           # Show logs
make damru-logs-f         # Follow logs
make damru-health         # Health check
make damru-test           # Test API
make damru-restart        # Restart services
make damru-clean          # Cleanup
```

---

## Quick Start (3 Steps)

### Step 1: Run Setup
```bash
make damru-setup
# or
./scripts/damru/setup-damru.sh
```

### Step 2: Verify Health
```bash
make damru-health
# or
curl http://localhost:5000/health
```

### Step 3: Start Using
```javascript
// In your Discord bot
const damru = require('./damru-client');
await damru.navigate('https://example.com');
```

---

## Prerequisites Checklist

Before running setup scripts:

- [ ] Docker installed (`docker --version`)
- [ ] Docker daemon running (`docker ps`)
- [ ] Docker Compose installed (`docker-compose --version`)
- [ ] 15GB free disk space
- [ ] 4GB+ available RAM
- [ ] Internet connection (for downloading image)
- [ ] Linux or WSL2 (on Windows)

---

## Troubleshooting

### "Permission denied" when running scripts

```bash
chmod +x scripts/damru/*.sh
```

### Download stuck or slow

Download manually:
```bash
wget https://dl.damru.dev/assets/damru-baked.tar.gz
```

### Docker daemon not running

Start Docker:
```bash
sudo systemctl start docker  # Linux
docker desktop              # Mac/Windows
```

### binderfs not mounted (Linux/WSL2)

Mount manually:
```bash
sudo mkdir -p /dev/binderfs
sudo mount -t binder binder /dev/binderfs
```

### Services won't start

Check logs:
```bash
make damru-logs
make damru-logs-redroid
```

---

## Environment Setup

Configure Damru by editing `damru-service/.env`:

```bash
cp damru-service/.env.example damru-service/.env
nano damru-service/.env
```

**Key settings:**
- `NUM_DEVICES` - Number of concurrent workers (default: 2)
- `REDROID_CPUS` - CPU per worker (default: 2.0)
- `REDROID_MEMORY` - Memory per worker (default: 2g)
- `FLASK_PORT` - API port (default: 5000)

---

## Common Commands

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs -f

# Restart services
make damru-restart
docker-compose restart

# Stop services
make damru-stop
docker-compose stop

# Start services
make damru-start
docker-compose start

# Full cleanup
make damru-clean-all
```

---

## API Testing

Test Damru API endpoints:

```bash
# Health check
curl http://localhost:5000/health

# Pool status
curl http://localhost:5000/api/status

# Available devices
curl http://localhost:5000/api/devices

# Navigate to URL
curl -X POST http://localhost:5000/api/navigate \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "device": "pixel_8_pro",
    "screenshot": true
  }'
```

Or use the test command:
```bash
make damru-test
```

---

## Discord Bot Integration

Once Damru is running, use it in your bot:

```javascript
const damru = require('./damru-client');

// In a command
const result = await damru.navigate('https://example.com', {
  device: 'random',
  proxy: process.env.PROXY_URL,
  screenshot: true
});

if (result.success) {
  console.log(`Navigated to ${result.url}`);
}
```

---

## Performance Tips

1. **Adjust workers** - More workers = more concurrent tasks but more resources
   ```bash
   # In damru-service/.env or environment
   NUM_DEVICES=3
   REDROID_MEMORY=3g
   ```

2. **Use residential proxies** - For best stealth results
   ```javascript
   await damru.navigate(url, {
     proxy: 'socks5://user:pass@proxy:1080'
   });
   ```

3. **Monitor resources** - Watch CPU/memory usage
   ```bash
   make damru-watch
   ```

---

## Cleanup Before Removing

Clean up before uninstalling:

```bash
# Stop services
make damru-clean

# Remove everything (volumes, images)
make damru-clean-all

# Manual cleanup if needed
docker volume prune
docker image prune
```

---

## Getting Help

- **Damru Project:** https://github.com/akwin1234/damru
- **Setup Guide:** See `DAMRU_SETUP.md`
- **API Docs:** See `damru-service/README.md`
- **Issues:** Check Docker logs and health endpoint

```bash
make damru-logs
make damru-health
```

---

## Support

For issues:

1. Check logs: `make damru-logs`
2. Verify health: `make damru-health`
3. Check prerequisites: `docker ps`, `docker-compose ps`
4. See documentation: `DAMRU_SETUP.md`

For Damru-specific issues, visit: https://github.com/akwin1234/damru/issues
