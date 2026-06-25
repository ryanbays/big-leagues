const { parentPort } = require('worker_threads');
const {
    safeClick,
    typeHuman,
    wait,
    startChromiumBrowserSession
} = require('../playwright/helpers.js');

const FAIRFX_URL = 'https://dashboard.fairfx.com/login/';

let otpBuffer = null;

function log(...parts) {
    const message = parts
        .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
        .join(' ');

    console.log(message);

    if (parentPort) {
        parentPort.postMessage({ type: 'log', payload: { message } });
    }
}

parentPort.on('message', async (message) => {
    if (message.type === 'start') {
        await run(message.payload);
        return;
    }

    if (message.type === 'stop') {
        process.exit(0);
    }

    if (message.type === 'otp') {
        log('Received OTP message');
        otpBuffer = message.payload && message.payload.otp ? message.payload.otp : null;
        return;
    }
});

async function waitForOTP(timeout = 120000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        if (otpBuffer) {
            const otp = otpBuffer;
            otpBuffer = null;
            return otp;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Timeout waiting for OTP');
}

async function run(payload) {
    let browser;

    try {
        const headless = payload && Object.prototype.hasOwnProperty.call(payload, 'headless')
            ? Boolean(payload.headless)
            : true;

        log('Launching FairFX browser session');

        browser = await startChromiumBrowserSession({
            headless
        });

        const context = await browser.newContext({
            locale: 'en-GB',
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: {
                width: 1280,
                height: 720
            }
        });

        const page = await context.newPage();
        await page.goto(FAIRFX_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 60_000
        });
        await page.waitForTimeout(4000);

        log('Opened FairFX login page');

        const emailInput = page.locator('input[id="username"]');
        await typeHuman(emailInput, payload.email);
        await page.keyboard.press('Enter');

        const passwordInput = page.locator('input[id="password"]');
        await typeHuman(passwordInput, payload.password);
        await page.keyboard.press('Enter');

        await page.waitForTimeout(4000);

        log('Waiting for OTP challenge');
        parentPort.postMessage({ type: 'otp_request', payload: {} });

        const otp = await waitForOTP();

        const otpInput = page.locator('input[id="code"]');
        await otpInput.waitFor({ state: 'visible', timeout: 10000 });

        const codeLabel = page.locator('label[for="code"]');
        await safeClick(codeLabel);
        await typeHuman(otpInput, String(otp).trim());

        const rememberMeCheckbox = page.locator('label[for="rememberBrowser"]');
        await safeClick(rememberMeCheckbox);

        await page.keyboard.press('Enter');
        await page.waitForTimeout(5000);

        if (page.url().includes('login')) {
            parentPort.postMessage({
                type: 'error',
                payload: { message: 'Login failed, please check your credentials or OTP.' }
            });
            return;
        }

        await context.storageState({ path: payload.storagePath });

        parentPort.postMessage({
            type: 'success',
            payload: { message: 'Login successful and session state saved.' }
        });

        await wait(500);
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        console.error('Error in run function:', error);

        if (parentPort) {
            parentPort.postMessage({ type: 'error', payload: { message } });
        }
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
