/**
 * Damru Device Pool Manager
 * 
 * Manages device allocation, usage tracking, and cleanup.
 * 
 * Usage:
 *   const pool = require('./src/damru/pool');
 *   
 *   const device = await pool.acquireDevice(30000); // timeout 30s
 *   await pool.navigate(device, 'https://example.com');
 *   await pool.releaseDevice(device);
 *   
 *   // Or use the helper for automatic cleanup:
 *   const result = await pool.use(async (device) => {
 *     return await pool.navigate(device, 'https://example.com');
 *   });
 */

const axios = require('axios');
const EventEmitter = require('events');

const DAMRU_API_URL = process.env.DAMRU_API_URL || 'http://damru-pool:5000';
const TIMEOUT = 60000;

const client = axios.create({
  baseURL: DAMRU_API_URL,
  timeout: TIMEOUT,
});

/**
 * DevicePool - Manages available devices and allocations
 */
class DevicePool extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.availableDevices = new Set();
    this.activeDevices = new Map();
    this.deviceCleanupNeeded = new Set();
    this.waitingQueue = [];
    this.maxWaitTime = options.maxWaitTime || 300000; // 5 minutes default
    this.logger = options.logger || console;
    
    this.initialized = false;
  }

  /**
   * Initialize the pool with available devices
   */
  async initialize() {
    try {
      // Get list of available device profiles from Damru
      const response = await client.get('/api/devices');
      const devices = response.data.devices || [];
      
      // Use sample of devices for pool (typically 5-10 concurrent)
      const poolSize = 5;
      const selectedDevices = devices.slice(0, poolSize);
      
      selectedDevices.forEach(device => {
        this.availableDevices.add(device);
      });
      
      this.initialized = true;
      this.logger.log(`[DevicePool] Initialized with ${selectedDevices.length} devices`);
      this.logger.log(`[DevicePool] Available: ${Array.from(this.availableDevices).join(', ')}`);
      
      return true;
    } catch (error) {
      this.logger.error('[DevicePool] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Acquire a device from the pool
   * Blocks until a device is available or timeout is reached
   * 
   * @param {number} timeout - Max wait time in ms (0 = no wait)
   * @returns {Promise<string>} Device profile name
   */
  async acquireDevice(timeout = 30000) {
    // Return immediately if device available
    if (this.availableDevices.size > 0) {
      const device = this.availableDevices.values().next().value;
      this.availableDevices.delete(device);
      this.activeDevices.set(device, Date.now());
      
      this.logger.log(`[DevicePool] Acquired device: ${device} (${this.availableDevices.size} remaining)`);
      return device;
    }

    // If no timeout, fail immediately
    if (timeout === 0) {
      throw new Error('No devices available and timeout is 0');
    }

    // Wait for device to become available
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue
        const index = this.waitingQueue.indexOf(request);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error(`Device acquisition timeout after ${timeout}ms`));
      }, timeout);

      const request = { resolve, reject, timeoutId };
      this.waitingQueue.push(request);

      this.logger.log(`[DevicePool] Queued request (${this.waitingQueue.length} waiting)`);
    });
  }

  /**
   * Release a device back to the pool
   * Marks it for cleanup if needed
   * 
   * @param {string} device - Device profile name
   * @param {boolean} needsCleanup - Whether device needs cleanup
   */
  async releaseDevice(device, needsCleanup = true) {
    this.activeDevices.delete(device);

    if (needsCleanup) {
      this.deviceCleanupNeeded.add(device);
      await this._cleanDevice(device);
    }

    // Add back to available pool
    this.availableDevices.add(device);
    this.logger.log(`[DevicePool] Released device: ${device} (${this.availableDevices.size} available)`);

    // Process waiting queue
    if (this.waitingQueue.length > 0) {
      const request = this.waitingQueue.shift();
      clearTimeout(request.timeoutId);
      
      // Recursively acquire for the waiting request
      this.acquireDevice(this.maxWaitTime)
        .then(request.resolve)
        .catch(request.reject);
    }
  }

  /**
   * Clean a device (clear cookies, cache, tracking)
   * 
   * @private
   * @param {string} device - Device profile name
   */
  async _cleanDevice(device) {
    try {
      this.logger.log(`[DevicePool] Cleaning device: ${device}`);
      
      await client.post('/api/cleanup', { device });
      
      this.deviceCleanupNeeded.delete(device);
      this.logger.log(`[DevicePool] Device cleaned: ${device}`);
    } catch (error) {
      this.logger.error(`[DevicePool] Cleanup failed for ${device}:`, error.message);
      // Don't throw - device can still be reused even if cleanup had issues
    }
  }

  /**
   * Navigate with a device
   * 
   * @param {string} device - Device profile
   * @param {string} url - Target URL
   * @param {Object} options - Navigation options
   * @returns {Promise<Object>} Navigation result
   */
  async navigate(device, url, options = {}) {
    try {
      const response = await client.post('/api/navigate', {
        url,
        device,
        proxy: options.proxy || null,
        timeout: options.timeout || 30000,
        screenshot: options.screenshot || false,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`[DevicePool] Navigate failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Scrape with a device
   * 
   * @param {string} device - Device profile
   * @param {string} url - Target URL
   * @param {Object} selectors - CSS selectors
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Scraped data
   */
  async scrape(device, url, selectors, options = {}) {
    try {
      const response = await client.post('/api/scrape', {
        url,
        device,
        proxy: options.proxy || null,
        selectors,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`[DevicePool] Scrape failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Screenshot with a device
   * 
   * @param {string} device - Device profile
   * @param {Object} options - Screenshot options
   * @returns {Promise<Object>} Screenshot result
   */
  async screenshot(device, options = {}) {
    try {
      const response = await client.post('/api/screenshot', {
        device,
        output_path: options.output_path || 'screenshot.png',
      });

      return response.data;
    } catch (error) {
      this.logger.error(`[DevicePool] Screenshot failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get pool status
   */
  async getStatus() {
    return {
      available: this.availableDevices.size,
      active: this.activeDevices.size,
      waiting: this.waitingQueue.length,
      needsCleanup: this.deviceCleanupNeeded.size,
      devices: Array.from(this.availableDevices),
    };
  }

  /**
   * Higher-level helper: Acquire device, use it, then release with cleanup
   * Handles device acquisition, usage, and cleanup in one call
   * 
   * @param {Function} callback - Function to use device (async)
   * @param {Object} options - Options
   * @param {number} options.timeout - Device acquisition timeout
   * @param {boolean} options.cleanup - Whether to cleanup after use (default: true)
   * @returns {Promise<*>} Result from callback
   */
  async use(callback, options = {}) {
    const { timeout = 30000, cleanup = true } = options;

    let device = null;
    try {
      // Step 1: Acquire device (blocking with timeout)
      device = await this.acquireDevice(timeout);
      this.logger.log(`[DevicePool] Using device: ${device}`);

      // Step 2: Use device via callback
      const result = await callback(device);

      return result;
    } catch (error) {
      this.logger.error(`[DevicePool] Use error:`, error.message);
      throw error;
    } finally {
      // Step 3: Release device with cleanup
      if (device) {
        await this.releaseDevice(device, cleanup);
      }
    }
  }
}

// Create and export singleton instance
const pool = new DevicePool();

module.exports = {
  pool,
  DevicePool,
  
  // Convenience functions
  initialize: () => pool.initialize(),
  acquireDevice: (timeout) => pool.acquireDevice(timeout),
  releaseDevice: (device, cleanup) => pool.releaseDevice(device, cleanup),
  navigate: (device, url, options) => pool.navigate(device, url, options),
  scrape: (device, url, selectors, options) => pool.scrape(device, url, selectors, options),
  screenshot: (device, options) => pool.screenshot(device, options),
  getStatus: () => pool.getStatus(),
  use: (callback, options) => pool.use(callback, options),
};
