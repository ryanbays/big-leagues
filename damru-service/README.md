# Damru Service Integration

This directory contains the Damru Pool API service that provides stealth browser automation for your Discord bot.

## Files

- **app.py** - Flask REST API server
- **damru_manager.py** - Damru pool manager and worker management
- **config.py** - Configuration for Damru and service settings
- **Dockerfile** - Docker image definition
- **requirements.txt** - Python dependencies

## API Endpoints

### Health & Status

```
GET /health
GET /api/status
```

### Navigate & Scrape

```
POST /api/navigate
POST /api/scrape
POST /api/screenshot
GET /api/devices
POST /api/cleanup
```

## Usage from Discord Bot

### Example: Navigate to URL and Screenshot

```javascript
const axios = require('axios');

async function captureWithDamru(url) {
  try {
    const response = await axios.post('http://damru-pool:5000/api/navigate', {
      url: url,
      device: 'random',
      proxy: process.env.PROXY_URL,
      timeout: 30000,
      screenshot: true
    });
    return response.data;
  } catch (error) {
    console.error('Damru API error:', error.message);
  }
}
```

### Example: Scrape Content

```javascript
async function scrapeWithDamru(url, selectors) {
  try {
    const response = await axios.post('http://damru-pool:5000/api/scrape', {
      url: url,
      device: 'pixel_8_pro',
      selectors: selectors
    });
    return response.data;
  } catch (error) {
    console.error('Damru scrape error:', error.message);
  }
}
```

## Environment Variables

- `REDROID_HOST` - Redroid container hostname (default: damru-redroid)
- `REDROID_PORT` - Redroid ADB port (default: 5555)
- `NUM_DEVICES` - Number of concurrent workers (default: 2)
- `REDROID_CPUS` - CPU allocation per container (default: 2.0)
- `REDROID_MEMORY` - Memory per container (default: 2g)
- `FLASK_PORT` - API port (default: 5000)
- `FLASK_ENV` - Environment (development/production)
- `LOG_LEVEL` - Logging level (INFO, DEBUG, etc.)

## Docker Compose

The service is automatically started when you run:

```bash
docker-compose up
```

The bot automatically connects via `http://damru-pool:5000` (see DAMRU_API_URL in compose file).

## Performance Considerations

- Each Damru worker uses ~2GB RAM
- Adjust NUM_DEVICES based on available resources
- Use residential proxies for best stealth results
- Device profiles rotate between 155 real Android devices
- TLS fingerprints randomize across ~184 variants

## Troubleshooting

### ADB Connection Issues
```bash
docker-compose logs damru-pool
adb connect damru-redroid:5555
adb devices
```

### Android Not Booting
```bash
docker-compose logs damru-redroid
```

### Check Health
```bash
curl http://localhost:5000/health
```

## Next Steps

1. Download pre-baked Damru image: `https://dl.damru.dev/assets/damru-baked.tar.gz`
2. Load into Docker: `docker load -i damru-redroid-latest.tar`
3. Run: `docker-compose up`
4. Test: `curl http://localhost:5000/health`
