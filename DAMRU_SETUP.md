# Damru Integration Setup Guide

This project now includes Damru for stealth browser automation. Follow these steps to get everything running.

## Prerequisites

- Docker & Docker Compose installed
- ~12GB disk space (for Damru image)
- ~8GB RAM available (for one Damru worker + bot)

## Setup Steps

### 1. Download Pre-baked Damru Image

Download the pre-baked Android image (~1.2GB):

```bash
# Option A: Direct download
wget https://dl.damru.dev/assets/damru-baked.tar.gz

# Option B: Using curl
curl -O https://dl.damru.dev/assets/damru-baked.tar.gz

# Verify integrity (optional but recommended)
wget https://dl.damru.dev/assets/damru-redroid-latest.tar.sha256
sha256sum -c damru-redroid-latest.tar.sha256
```

Extract the archive:
```bash
tar -xzf damru-baked.tar.gz
# This creates: damru-redroid-latest.tar
```

### 2. Load Docker Image

Load the Redroid image into Docker:

```bash
docker load -i damru-redroid-latest.tar

# Verify it loaded
docker images | grep damru-redroid
```

### 3. Configure Environment (Optional)

Edit `damru-service/.env` if needed:

```bash
cp damru-service/.env.example damru-service/.env
# Edit damru-service/.env with your settings
```

### 4. Start Services

Start both the Discord bot and Damru:

```bash
docker-compose up -d

# Check status
docker-compose ps
```

### 5. Verify Health

Check if both services are running:

```bash
# Discord bot logs
docker-compose logs -f discord-bot

# Damru logs
docker-compose logs -f damru-pool

# Health check
curl http://localhost:5000/health
```

Expected output:
```json
{
  "status": "healthy",
  "adb_connected": true,
  "android_booted": true,
  "active_sessions": 0,
  "worker_count": 0,
  "max_workers": 2
}
```

## Using Damru in Your Bot

### Import the client

```javascript
const damru = require('./damru-client');
```

### Navigate to a URL

```javascript
const result = await damru.navigate('https://example.com', {
  device: 'pixel_8_pro',
  proxy: 'socks5://user:pass@proxy:1080',
  screenshot: true
});

console.log(result);
// { success: true, session_id: 'nav_0', url: '...', screenshot: '/screenshots/nav_0.png' }
```

### Scrape Content

```javascript
const data = await damru.scrape('https://example.com', {
  title: 'h1',
  price: '.product-price',
  description: '.product-description'
});

console.log(data);
// { success: true, url: '...', device: 'random', data: { title: '...', price: '$99' } }
```

### Check Status

```javascript
const status = await damru.getStatus();
console.log(status);
// { status: 'healthy', active_sessions: 1, worker_count: 1, ... }
```

## Discord Command Example

```javascript
// In your command handler
const damru = require('../damru-client');

module.exports = {
  name: 'scrape',
  async execute(interaction) {
    await interaction.deferReply();
    
    const url = interaction.options.getString('url');
    
    const result = await damru.navigate(url, {
      device: 'random',
      screenshot: true
    });
    
    if (result.success) {
      await interaction.editReply(`✅ Navigated to ${url}`);
    } else {
      await interaction.editReply(`❌ Error: ${result.error}`);
    }
  }
};
```

## Troubleshooting

### "Connection refused" on port 5000

```bash
# Check if service is running
docker-compose ps damru-pool

# Check service logs
docker-compose logs damru-pool
```

### "Android not booted"

Redroid takes 30-60 seconds to boot. Wait and try again:

```bash
# Check boot status
docker-compose logs damru-redroid | grep "boot"

# Manual boot check
adb shell getprop sys.boot_completed
```

### "ADB connection failed"

```bash
# Check ADB connection
docker-compose exec damru-pool adb devices

# Restart Redroid
docker-compose restart damru-redroid
```

### High memory usage

Reduce `NUM_DEVICES` in docker-compose.yml:

```yaml
environment:
  NUM_DEVICES: 1  # Instead of 2
  REDROID_MEMORY: "1g"  # Instead of 2g
```

## Performance Tips

1. **Device Profiles**: `random` picks premium profiles; use explicit device for consistency
2. **Proxies**: Rotate residential proxies for best results
3. **Timeout**: Increase from 30s to 60s for slow sites
4. **Workers**: Each worker uses ~2GB; adjust NUM_DEVICES accordingly

## API Reference

Full API docs: See [damru-service/README.md](damru-service/README.md)

```
GET  /health              - Health check
GET  /api/status          - Pool status
POST /api/navigate        - Navigate to URL
POST /api/scrape          - Scrape content
POST /api/screenshot      - Capture screenshot
GET  /api/devices         - List device profiles
POST /api/cleanup         - Cleanup sessions
```

## Advanced: Using Damru Directly (Python)

For advanced use, you can also use Damru directly in Python:

```python
from damru import AsyncDamru

async with AsyncDamru(device="pixel_8_pro") as browser:
    page = await browser.new_page()
    await page.goto("https://example.com")
    await page.screenshot(path="screenshot.png")
```

See [Damru Documentation](https://github.com/akwin1234/damru) for more.

## Stopping Services

```bash
# Stop all services
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Next Steps

- Explore device profiles: `GET /api/devices`
- Set up proxy rotation for better stealth
- Implement error handling and retries
- Monitor resource usage and scale as needed

## Support

- Damru Issues: https://github.com/akwin1234/damru/issues
- Discord Bot Issues: Check your project's issue tracker
