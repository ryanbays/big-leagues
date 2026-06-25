# Damru Device Pool Module

Device pool management for stealth browser automation with automatic cleanup.

## Overview

The device pool manages concurrent access to Damru devices:
- **Automatic device allocation** - Get a device from the pool (blocks if none available)
- **Timeout handling** - Configurable timeout when waiting for devices
- **Automatic cleanup** - Clear cookies, cache, and tracking after each use
- **Queue management** - Requests queue when all devices are busy

## Files

- `client.js` - Low-level REST API client
- `pool.js` - Device pool manager (main module)
- `examples.js` - Usage examples

## Quick Start

### Initialize on startup

```javascript
const damru = require('./src/damru/pool');

// Initialize pool
await damru.initialize();
```

### Simple usage (recommended)

```javascript
// Use the helper function - handles acquire, use, cleanup, release
const result = await damru.use(
  async (device) => {
    console.log(`Using device: ${device}`);
    return await damru.navigate(device, 'https://example.com');
  },
  { timeout: 30000, cleanup: true }
);
```

### Manual device management

```javascript
// Manually acquire and release
const device = await damru.acquireDevice(30000); // 30s timeout

try {
  // Use the device
  await damru.navigate(device, 'https://example.com');
  
} finally {
  // Release device (with cleanup)
  await damru.releaseDevice(device, true);
}
```

## API Reference

### `initialize()`
Initialize the device pool from available Damru devices.

```javascript
await damru.initialize();
// Pool is now ready to use
```

### `acquireDevice(timeout)`
Acquire a device from the pool. Blocks until one is available or timeout.

**Parameters:**
- `timeout` (number, ms) - Max wait time. 0 = fail immediately if none available

**Returns:** Device name string

**Throws:** Error if timeout exceeded

```javascript
try {
  const device = await damru.acquireDevice(30000);
} catch (error) {
  console.error('No devices available:', error.message);
}
```

### `releaseDevice(device, needsCleanup)`
Release a device back to the pool.

**Parameters:**
- `device` (string) - Device name
- `needsCleanup` (boolean, default: true) - Whether to cleanup first

**Returns:** Promise

```javascript
await damru.releaseDevice(device, true); // Cleanup before release
```

### `navigate(device, url, options)`
Navigate to a URL using a specific device.

**Parameters:**
- `device` (string) - Device name
- `url` (string) - Target URL
- `options` (object):
  - `proxy` (string) - Optional proxy URL
  - `timeout` (number, ms) - Navigation timeout
  - `screenshot` (boolean) - Capture screenshot

**Returns:** `{success, url, session_id, screenshot_path, ...}`

```javascript
const result = await damru.navigate(device, 'https://example.com', {
  proxy: 'socks5://proxy:1080',
  screenshot: true
});
```

### `scrape(device, url, selectors, options)`
Scrape content from a URL using CSS selectors.

**Parameters:**
- `device` (string) - Device name
- `url` (string) - Target URL
- `selectors` (object) - CSS selectors: `{title: 'h1', price: '.price'}`
- `options` (object):
  - `proxy` (string) - Optional proxy

**Returns:** `{success, data, ...}`

```javascript
const data = await damru.scrape(device, 'https://example.com', {
  title: 'h1.title',
  price: '.price',
  items: '.product'
});
```

### `screenshot(device, options)`
Capture Android device screenshot.

**Parameters:**
- `device` (string) - Device name
- `options` (object):
  - `output_path` (string) - Where to save screenshot

**Returns:** `{success, path, ...}`

```javascript
const result = await damru.screenshot(device, {
  output_path: '/tmp/screenshot.png'
});
```

### `getStatus()`
Get current pool status.

**Returns:** `{available, active, waiting, needsCleanup, devices}`

```javascript
const status = await damru.getStatus();
console.log(`Available: ${status.available}, Active: ${status.active}`);
```

### `use(callback, options)`
**High-level helper** - Acquire device, use it, cleanup, release.

This is the recommended way to use devices. Handles all lifecycle automatically.

**Parameters:**
- `callback` (async function) - Receives device name, should return result
- `options` (object):
  - `timeout` (number, ms) - Device acquisition timeout (default: 30000)
  - `cleanup` (boolean) - Whether to cleanup after (default: true)

**Returns:** Result from callback

```javascript
const result = await damru.use(
  async (device) => {
    // Use device here
    return await damru.navigate(device, 'https://example.com');
  },
  { timeout: 30000, cleanup: true }
);
```

## Cleanup

Cleanup removes:
- Browser cookies
- Cache data
- Temporary files
- Tracking data
- Session artifacts

Called automatically when device is released (if `cleanup: true`).

## Lifecycle Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. acquireDevice(timeout)                               │
│    ├─ If device available: return immediately          │
│    └─ If none available: wait up to timeout            │
├─────────────────────────────────────────────────────────┤
│ 2. Use device for operations                            │
│    ├─ navigate(device, url, options)                   │
│    ├─ scrape(device, url, selectors)                   │
│    └─ screenshot(device, options)                      │
├─────────────────────────────────────────────────────────┤
│ 3. releaseDevice(device, needsCleanup)                  │
│    ├─ If needsCleanup: clear cookies/cache/tracking   │
│    └─ Return device to available pool                  │
└─────────────────────────────────────────────────────────┘
```

## Usage in Discord Commands

```javascript
const damru = require('./src/damru/pool');

// In your command handler
async function handleCommand(interaction) {
  try {
    await interaction.deferReply();
    
    const result = await damru.use(async (device) => {
      return await damru.navigate(device, 'https://example.com', {
        screenshot: true
      });
    });
    
    if (result.success) {
      await interaction.editReply(`✓ Success! ${result.url}`);
    } else {
      await interaction.editReply(`✗ Failed: ${result.error}`);
    }
    
  } catch (error) {
    await interaction.editReply(`✗ Error: ${error.message}`);
  }
}
```

## Concurrent Operations

The pool automatically handles multiple concurrent operations:

```javascript
// Run 5 tasks concurrently
// If pool has 2 devices, tasks will queue as devices free up
const results = await Promise.all([
  damru.use(async (d) => damru.navigate(d, 'https://site1.com')),
  damru.use(async (d) => damru.navigate(d, 'https://site2.com')),
  damru.use(async (d) => damru.scrape(d, 'https://site3.com', {...})),
  damru.use(async (d) => damru.navigate(d, 'https://site4.com')),
  damru.use(async (d) => damru.navigate(d, 'https://site5.com')),
]);
```

## Error Handling

### Device Timeout
```javascript
try {
  const device = await damru.acquireDevice(5000);
} catch (error) {
  console.error('No devices available within 5 seconds');
  // Queue request, inform user, retry later, etc.
}
```

### Navigation Failure
```javascript
const result = await damru.use(async (device) => {
  return await damru.navigate(device, 'https://example.com');
});

if (!result.success) {
  console.error('Navigation failed:', result.error);
}
```

## Configuration

Set environment variables to customize behavior:

```bash
DAMRU_API_URL=http://damru-pool:5000    # API endpoint
```

Or pass options when creating pool:

```javascript
const { DevicePool } = require('./src/damru/pool');
const pool = new DevicePool({
  maxWaitTime: 300000,  // 5 minutes default queue wait
  logger: customLogger   // Custom logging
});
```

## Performance Tips

1. **Always use cleanup** - Prevents tracking accumulation
2. **Set appropriate timeouts** - Balance speed vs. waiting
3. **Monitor pool status** - Watch for queue buildup
4. **Use concurrent operations** - Maximize device throughput
5. **Rotate proxies** - Distribute load across proxy servers

## Troubleshooting

### All devices busy
- Increase `NUM_DEVICES` in damru-service/.env
- Check for abandoned sessions not being released

### Cleanup failing
- Check Damru API logs: `docker-compose logs damru-pool`
- Cleanup errors don't prevent device reuse

### High queue length
- Add more devices to pool
- Optimize callback functions for speed
- Use timeout to fail fast instead of waiting

## Examples

See `examples.js` for:
- Simple navigation
- Scraping with selectors
- Concurrent operations
- Proxy rotation
- Discord command integration
