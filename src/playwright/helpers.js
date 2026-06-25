const { chromium } = require('playwright');

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const DEFAULT_CHROMIUM_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-size=1280,720'
];

const ANDROID_DELIVEROO_HEADERS = {
    'User-Agent': 'Deliveroo/5.12.0 (Android; 14; SM-S918B; en_GB)',
    'x-roo-client': 'consumer-android',
    'x-roo-platform': 'android',
    'x-roo-client-referer': 'deliveroo://account'
}

async function deliverooRequestRules(page) {
    await page.route('.*api\.uk\.deliveroo\.com.*', (route) => {
        const request = route.request();
        const headers = {
            ...request.headers(),
            ...ANDROID_DELIVEROO_HEADERS
        };
        route.continue({ headers });
    })
}

async function startChromiumBrowserSession(options = {}) {
    const {
        headless = true,
        args = [],
        ...launchOptions
    } = options;

    return chromium.launch({
        headless,
        args: [...DEFAULT_CHROMIUM_ARGS, ...args],
        ...launchOptions
    });
}

/** Returns the first visible error/alert text on the page, or null if none found. */
async function getPageError(page) {
    const selectors = [
        '[class*="error"]',
        '[class*="alert"]',
        '[role="alert"]',
        '[class*="notification"]',
        '[class*="message"]'
    ];

    for (const selector of selectors) {
        try {
            const el = page.locator(selector).first();
            const visible = await el.isVisible();
            if (visible) {
                const text = (await el.innerText()).trim();
                if (text) return text;
            }
        } catch {
            // element not found, try next selector
        }
    }

    return null;
}

async function humanDelay(min = 300, max = 900) {
    await wait(min + Math.random() * (max - min));
}

async function safeClick(locator, retries = 4) {
    for (let i = 0; i < retries; i++) {
        try {
            await locator.waitFor({ state: 'visible', timeout: 7000 });
            await locator.click({ timeout: 8000 });
            return true;
        } catch (e) {
            console.log(`[!] Click retry ${i + 1}/${retries}`);
            await humanDelay(500, 900);
        }
    }
    return false;
}

async function typeHuman(locator, text) {
    await locator.click().catch(() => { });
    await wait(150);
    for (const char of text) {
        await locator.type(char, { delay: 45 + Math.random() * 65 });
        if (Math.random() > 0.88) await wait(80);
    }
}

async function clearInput(locator) {
    await locator.click().catch(() => { });
    await wait(100);
    await locator.press('Control+A');
    await wait(80);
    await locator.press('Backspace');
    await wait(100);
}

module.exports = {
    wait,
    humanDelay,
    safeClick,
    typeHuman,
    clearInput,
    DEFAULT_CHROMIUM_ARGS,
    ANDROID_DELIVEROO_HEADERS,
    deliverooRequestRules,
    getPageError,
    startChromiumBrowserSession,
};