/**
 * FairFX Login using Damru Device Pool with Interactive Endpoints
 * 
 * Now with full support for form interactions with human-like behavior!
 * 
 * This example shows:
 * 1. Getting a device from the pool
 * 2. Navigating to login page (stealth)
 * 3. Filling form fields with human-like typing delays
 * 4. Clicking buttons with retry logic
 * 5. Waiting for elements to appear
 * 6. Handling OTP
 * 7. Automatic cleanup (removes tracking/cookies)
 * 8. Releasing device back to pool
 */

const damru = require('../damru/pool');

// OTP handling - can be via Discord message, email, SMS API, etc.
let otpBuffer = null;

function setOTP(otp) {
  otpBuffer = otp;
  console.log(`[FairFX] OTP received: ${otp}`);
}

function getOTP(timeout = 120000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (otpBuffer) {
        clearInterval(interval);
        const otp = otpBuffer;
        otpBuffer = null;
        resolve(otp);
        return;
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error('Timeout waiting for OTP'));
      }
    }, 500);
  });
}

/**
 * FairFX login flow using Damru interactive endpoints
 * 
 * Full form automation with human-like behavior!
 */
async function fairfxLoginWithDamru(credentials, options = {}) {
  const {
    device = 'random',
    timeout = 30000,
    proxy = null,
    screenshot = false,
  } = options;

  console.log('[FairFX] Starting login flow with Damru');

  return damru.use(
    async (allocatedDevice) => {
      const device = allocatedDevice;
      console.log(`[FairFX] Using device: ${device}`);

      // Step 1: Navigate to FairFX login page
      console.log('[FairFX] Navigating to login page...');
      let result = await damru.navigate(
        device,
        'https://dashboard.fairfx.com/login/',
        {
          proxy,
          timeout: 60000,
          screenshot
        }
      );

      if (!result.success) {
        return {
          success: false,
          error: 'Failed to navigate to login page',
          details: result.error
        };
      }

      console.log('[FairFX] Login page loaded');

      try {
        // Step 2: Fill email field with human-like typing
        // 45-110ms between characters, 12% chance of extra 80ms pause (simulating thinking)
        console.log('[FairFX] Entering email...');
        let typeResult = await damru.pool.type_input(
          device,
          'input[id="username"]',
          credentials.email,
          {
            human_like: true,
            delay_min: 45,
            delay_max: 110
          }
        );
        if (!typeResult.success) {
          throw new Error(`Failed to enter email: ${typeResult.error}`);
        }

        // Step 3: Press Tab to move to password field (with human pause)
        await damru.pool.press_key(device, 'Tab');
        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));

        // Step 4: Fill password field with human-like typing
        console.log('[FairFX] Entering password...');
        typeResult = await damru.pool.type_input(
          device,
          'input[id="password"]',
          credentials.password,
          {
            human_like: true,
            delay_min: 45,
            delay_max: 110
          }
        );
        if (!typeResult.success) {
          throw new Error(`Failed to enter password: ${typeResult.error}`);
        }

        // Step 5: Submit login form by pressing Enter
        console.log('[FairFX] Submitting login form...');
        await damru.pool.press_key(device, 'Enter');
        await new Promise(r => setTimeout(r, 4000)); // Wait for server response

        // Step 6: Wait for OTP field to appear (with timeout)
        console.log('[FairFX] Waiting for OTP field...');
        let waitResult = await damru.pool.wait_for_element(
          device,
          'input[id="code"]',
          10000,
          'visible'
        );
        if (!waitResult.success) {
          throw new Error('OTP field did not appear');
        }

        // Step 7: Request OTP (via Discord DM, email, SMS API, etc.)
        console.log('[FairFX] Requesting OTP from user...');
        const otp = await getOTP();
        console.log('[FairFX] OTP received, entering...');

        // Step 8: Fill OTP field with human-like typing (slower for OTP)
        typeResult = await damru.pool.type_input(
          device,
          'input[id="code"]',
          String(otp).trim(),
          {
            human_like: true,
            delay_min: 60,  // Slower for OTP
            delay_max: 140
          }
        );
        if (!typeResult.success) {
          throw new Error(`Failed to enter OTP: ${typeResult.error}`);
        }

        // Step 9: Click "remember browser" checkbox (with retries and human delays)
        console.log('[FairFX] Clicking remember browser checkbox...');
        let clickResult = await damru.pool.click(
          device,
          'label[for="rememberBrowser"]',
          7000,
          3
        );
        if (!clickResult.success) {
          console.warn('[FairFX] Remember checkbox click failed, continuing anyway');
        }

        // Step 10: Submit OTP form by pressing Enter
        console.log('[FairFX] Submitting OTP...');
        await damru.pool.press_key(device, 'Enter');
        await new Promise(r => setTimeout(r, 5000)); // Wait for redirect

        // Step 11: Verify login success by checking page content
        console.log('[FairFX] Verifying login...');
        let contentResult = await damru.pool.get_page_content(
          device,
          {
            currentUrl: 'window.location.href',
            errorMessage: '.error-message',
            dashboardHeader: '.dashboard-header'
          }
        );

        if (!contentResult.success) {
          return {
            success: false,
            error: 'Failed to verify login',
            details: contentResult.error
          };
        }

        const pageContent = contentResult.content || {};
        if (pageContent.currentUrl && pageContent.currentUrl.includes('login')) {
          return {
            success: false,
            error: 'Login failed - still on login page',
            errorMessage: pageContent.errorMessage
          };
        }

        console.log('[FairFX] Login successful!');

        // Step 12: Capture proof (optional screenshot)
        if (screenshot) {
          const screenshotResult = await damru.pool.screenshot(device, {
            output_path: '/tmp/fairfx-logged-in.png'
          });
          console.log('[FairFX] Screenshot saved:', screenshotResult.path);
        }

        return {
          success: true,
          message: 'Login completed successfully',
          device,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        console.error('[FairFX] Error during login:', error.message);
        return {
          success: false,
          error: error.message,
          device
        };
      }
    },
    { timeout, cleanup: true }
  );
}

/**
 * Higher-level wrapper for Discord bot command
 * 
 * Usage in Discord command:
 * const result = await fairfxLogin(interaction, credentials);
 */
async function fairfxLogin(interaction, credentials, options = {}) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Check if Damru is healthy
    const health = await damru.getStatus();
    if (health.available === 0 && health.waiting > 0) {
      return await interaction.editReply(
        '⏳ All devices busy. Your request is queued. Please wait...'
      );
    }

    await interaction.editReply('🔐 Starting FairFX login process...');

    // Run login with Damru
    const result = await fairfxLoginWithDamru(credentials, {
      device: options.device || 'random',
      proxy: options.proxy,
      screenshot: true,
      timeout: 30000
    });

    if (result.success) {
      await interaction.editReply(
        `✅ Login successful!\nUsed device: ${result.device}\nTime: ${result.timestamp}`
      );
    } else {
      await interaction.editReply(
        `❌ Login failed: ${result.error}\n${result.details || ''}`
      );
    }

    return result;

  } catch (error) {
    console.error('[FairFX] Error:', error);
    await interaction.editReply(`❌ Error: ${error.message}`);
    throw error;
  }
}

// ============================================================
// NEW INTERACTIVE ENDPOINTS - NOW AVAILABLE!
// ============================================================

/**
 * Interactive endpoints now available via damru.pool:
 * 
 * TYPE INPUT (Human-like typing):
 * - type_input(device, selector, text, options)
 *   Options: {human_like, delay_min: 45, delay_max: 110}
 *   Typing speeds mimic human behavior with 12% chance of thinking pauses
 * 
 * CLICK (With retries):
 * - click(device, selector, wait_visible_timeout, retries)
 *   Click with retry logic, visibility checks, human delays between retries
 * 
 * WAIT (Element visibility):
 * - wait_for_element(device, selector, timeout, state)
 *   States: 'visible', 'hidden', 'attached', 'detached'
 * 
 * FILL (Smart form fill):
 * - fill_input(device, selector, value, options)
 *   Click + select all + type with human behavior
 * 
 * SUBMIT (Form submission):
 * - submit_form(device, selector)
 *   Submit form by pressing Enter
 * 
 * PRESS (Keyboard keys):
 * - press_key(device, key, count)
 *   Press: Enter, Tab, Escape, Control+A, Control+C, etc.
 * 
 * EXECUTE (JavaScript):
 * - execute_script(device, script)
 *   Execute JavaScript on the page
 * 
 * CONTENT (Extract data):
 * - get_page_content(device, selectors)
 *   Extract page content or specific elements by CSS selector
 * 
 * 
 * HUMAN-LIKE BEHAVIOR:
 * 
 * ✓ Typing delays: 45-110ms per character (configurable)
 * ✓ Thinking pauses: 12% chance of 80ms extra delay
 * ✓ Human-like pause before Tab key
 * ✓ Retry logic for clicks (configurable retries)
 * ✓ Random delays between retries (500-900ms)
 * ✓ Element visibility checks before clicking
 * ✓ Natural navigation flow
 * 
 * 
 * WORKS WITH:
 * 
 * ✅ Multi-step form workflows (like FairFX login)
 * ✅ OTP flows (request → enter → submit)
 * ✅ Dynamic content (wait for elements to appear)
 * ✅ JavaScript-rendered pages (can execute JS)
 * ✅ Checkbox/radio interactions (click + verify)
 * ✅ Dropdown/select handling (click + keyboard navigation)
 * ✅ Session persistence (with cleanup between uses)
 */

module.exports = {
  fairfxLoginWithDamru,
  fairfxLogin,
  setOTP,
  getOTP,
};
