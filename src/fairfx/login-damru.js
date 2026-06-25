const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parentPort } = require('worker_threads');

const damru = require('../damru/pool');

const FAIRFX_URL = 'https://dashboard.fairfx.com/login/';
const DAMRU_API_URL = process.env.DAMRU_API_URL || 'http://damru-pool:5000';

const http = axios.create({
    baseURL: DAMRU_API_URL,
    timeout: 60_000
});

let otpBuffer = null;
let poolInitialized = false;

function log(...parts) {
    const message = parts
        .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
        .join(' ');

    console.log(message);

    if (parentPort) {
        parentPort.postMessage({ type: 'log', payload: { message } });
    }
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOTP(timeout = 120000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        if (otpBuffer) {
            const otp = otpBuffer;
            otpBuffer = null;
            return otp;
        }

        await wait(1000);
    }

    throw new Error('Timeout waiting for OTP');
}

async function ensurePool() {
    if (poolInitialized) {
        return;
    }

    const ok = await damru.initialize();
    if (!ok) {
        throw new Error('Damru pool initialization failed');
    }

    poolInitialized = true;
}

async function postDamru(pathname, payload) {
    const response = await http.post(pathname, payload);
    return response.data;
}

function ensureResultSuccess(result, contextMessage) {
    if (!result || result.success === false) {
        const details = result && (result.error || result.message)
            ? result.error || result.message
            : 'Unknown Damru error';
        throw new Error(`${contextMessage}: ${details}`);
    }

    return result;
}

function writeCompatibilityStorage(storagePath, metadata) {
    if (!storagePath) {
        return;
    }

    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(
        storagePath,
        JSON.stringify(
            {
                provider: 'damru',
                createdAt: Date.now(),
                ...metadata
            },
            null,
            2
        )
    );
}

async function run(payload) {
    let device = null;

    try {
        if (!payload || !payload.email || !payload.password) {
            throw new Error('Missing required payload fields: email and password');
        }

        log('Launching FairFX Damru session');
        await ensurePool();

        device = await damru.acquireDevice(45000);
        log('Using Damru device', device);

        const navigateResult = await damru.navigate(device, FAIRFX_URL, {
            timeout: 60000,
            screenshot: false
        });
        ensureResultSuccess(navigateResult, 'Failed to open FairFX login page');

        await wait(2000);
        log('Opened FairFX login page');

        ensureResultSuccess(
            await postDamru('/api/type', {
                selector: 'input[id="username"]',
                text: String(payload.email),
                device,
                human_like: true,
                delay_min: 45,
                delay_max: 110
            }),
            'Failed typing email'
        );

        ensureResultSuccess(
            await postDamru('/api/press', {
                key: 'Enter',
                device,
                count: 1
            }),
            'Failed submitting email step'
        );

        ensureResultSuccess(
            await postDamru('/api/type', {
                selector: 'input[id="password"]',
                text: String(payload.password),
                device,
                human_like: true,
                delay_min: 45,
                delay_max: 110
            }),
            'Failed typing password'
        );

        ensureResultSuccess(
            await postDamru('/api/press', {
                key: 'Enter',
                device,
                count: 1
            }),
            'Failed submitting password step'
        );

        await wait(3000);

        ensureResultSuccess(
            await postDamru('/api/wait', {
                selector: 'input[id="code"]',
                device,
                timeout: 15000,
                state: 'visible'
            }),
            'OTP field did not appear'
        );

        log('Waiting for OTP challenge');
        if (parentPort) {
            parentPort.postMessage({ type: 'otp_request', payload: {} });
        }

        const otp = await waitForOTP();

        ensureResultSuccess(
            await postDamru('/api/type', {
                selector: 'input[id="code"]',
                text: String(otp).trim(),
                device,
                human_like: true,
                delay_min: 60,
                delay_max: 140
            }),
            'Failed typing OTP'
        );

        // Remember browser is optional; do not fail flow if this action cannot be performed.
        try {
            await postDamru('/api/click', {
                selector: 'label[for="rememberBrowser"]',
                device,
                retries: 2,
                wait_visible_timeout: 7000
            });
        } catch (error) {
            log('Remember browser click skipped', error.message || String(error));
        }

        ensureResultSuccess(
            await postDamru('/api/press', {
                key: 'Enter',
                device,
                count: 1
            }),
            'Failed submitting OTP step'
        );

        await wait(5000);

        const locationResult = ensureResultSuccess(
            await postDamru('/api/execute', {
                script: 'window.location.href',
                device
            }),
            'Failed reading post-login URL'
        );

        const currentUrl = locationResult.result || '';
        if (String(currentUrl).includes('login')) {
            if (parentPort) {
                parentPort.postMessage({
                    type: 'error',
                    payload: { message: 'Login failed, please check your credentials or OTP.' }
                });
            }
            return;
        }

        writeCompatibilityStorage(payload.storagePath, {
            mode: 'fairfx-login',
            currentUrl,
            device
        });

        if (parentPort) {
            parentPort.postMessage({
                type: 'success',
                payload: { message: 'Login successful and session state saved.' }
            });
        }

        await wait(300);
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        console.error('Damru FairFX worker error:', error);

        if (parentPort) {
            parentPort.postMessage({ type: 'error', payload: { message } });
        }
    } finally {
        if (device) {
            try {
                await damru.releaseDevice(device, true);
            } catch (releaseError) {
                log('Failed to release Damru device', releaseError.message || String(releaseError));
            }
        }
    }
}

if (parentPort) {
    parentPort.on('message', async (message) => {
        if (message.type === 'start') {
            await run(message.payload || {});
            return;
        }

        if (message.type === 'stop') {
            process.exit(0);
        }

        if (message.type === 'otp') {
            log('Received OTP message');
            otpBuffer = message.payload && message.payload.otp ? message.payload.otp : null;
        }
    });
}
