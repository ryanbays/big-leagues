/**
 * Damru Integration Module for Discord Bot
 * 
 * Usage:
 *   const damru = require('./src/damru/client');
 *   await damru.navigate('https://example.com');
 */

const axios = require('axios');

const DAMRU_API_URL = process.env.DAMRU_API_URL || 'http://damru-pool:5000';
const TIMEOUT = 60000; // 60 seconds

// Create axios instance with defaults
const client = axios.create({
  baseURL: DAMRU_API_URL,
  timeout: TIMEOUT,
});

/**
 * Health check - verify Damru service is running
 */
async function healthCheck() {
  try {
    const response = await client.get('/health');
    return response.data;
  } catch (error) {
    console.error('Damru health check failed:', error.message);
    return { status: 'unhealthy', error: error.message };
  }
}

/**
 * Navigate to a URL with stealth automation
 * 
 * @param {string} url - Target URL
 * @param {Object} options - Navigation options
 * @param {string} options.device - Device profile ('random', 'pixel_8_pro', etc.)
 * @param {string} options.proxy - SOCKS5/HTTP proxy URL
 * @param {number} options.timeout - Navigation timeout in ms
 * @param {boolean} options.screenshot - Capture screenshot after navigation
 * @returns {Promise<Object>} Result with session_id and optional screenshot
 */
async function navigate(url, options = {}) {
  try {
    const {
      device = 'random',
      proxy = null,
      timeout = 30000,
      screenshot = false,
    } = options;

    const response = await client.post('/api/navigate', {
      url,
      device,
      proxy,
      timeout,
      screenshot,
    });

    return response.data;
  } catch (error) {
    console.error(`Navigate failed for ${url}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Scrape content from a URL using CSS selectors
 * 
 * @param {string} url - Target URL
 * @param {Object} selectors - Selectors object: { title: 'h1', price: '.price' }
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Scraped data
 */
async function scrape(url, selectors, options = {}) {
  try {
    const {
      device = 'random',
      proxy = null,
    } = options;

    const response = await client.post('/api/scrape', {
      url,
      device,
      proxy,
      selectors,
    });

    return response.data;
  } catch (error) {
    console.error(`Scrape failed for ${url}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Capture Android screenshot
 * 
 * @param {Object} options - Screenshot options
 * @returns {Promise<Object>} Path to screenshot
 */
async function screenshot(options = {}) {
  try {
    const {
      device = 'random',
      output_path = 'screenshot.png',
    } = options;

    const response = await client.post('/api/screenshot', {
      device,
      output_path,
    });

    return response.data;
  } catch (error) {
    console.error('Screenshot failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get list of available device profiles
 */
async function getDevices() {
  try {
    const response = await client.get('/api/devices');
    return response.data;
  } catch (error) {
    console.error('Failed to get devices:', error.message);
    return { devices: [], error: error.message };
  }
}

/**
 * Get current pool status
 */
async function getStatus() {
  try {
    const response = await client.get('/api/status');
    return response.data;
  } catch (error) {
    console.error('Status check failed:', error.message);
    return { status: 'unknown', error: error.message };
  }
}

/**
 * Cleanup all active sessions
 */
async function cleanup() {
  try {
    const response = await client.post('/api/cleanup');
    return response.data;
  } catch (error) {
    console.error('Cleanup failed:', error.message);
    return { error: error.message };
  }
}

/**
 * Example: Use Damru in a Discord command
 * 
 * Usage in your command handler:
 * const damru = require('./src/damru/client');
 * 
 * const result = await damru.navigate('https://example.com', {
 *   device: 'pixel_8_pro',
 *   proxy: 'socks5://proxy:1080',
 *   screenshot: true
 * });
 */

module.exports = {
  healthCheck,
  navigate,
  scrape,
  screenshot,
  getDevices,
  getStatus,
  cleanup,
};
