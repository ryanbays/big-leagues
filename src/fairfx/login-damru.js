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

function buildRunStamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

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

async function captureStepScreenshot(device, screenshotDir, stepName, stepIndex) {
    if (!device || !screenshotDir) {
        return null;
    }

    const safeStepName = String(stepName || 'step').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `${String(stepIndex).padStart(2, '0')}_${safeStepName}.png`;
    const outputPath = path.join(screenshotDir, fileName);

    try {
        const result = await damru.screenshot(device, { output_path: outputPath });
        if (!result || result.success === false) {
            const reason = result && (result.error || result.message)
                ? result.error || result.message
                : 'unknown reason';
            log(`Screenshot failed for ${fileName}: ${reason}`);
            return null;
        }

        const savedPath = result.path || outputPath;
        log(`Saved screenshot: ${savedPath}`);
        return savedPath;
    } catch (error) {
        log(`Screenshot error for ${fileName}: ${error.message || String(error)}`);
        return null;
    }
}

async function run(payload) {
    let device = null;
    let screenshotDir = null;
    let screenshotIndex = 1;

    const baseStepDelayMs = Number(payload && payload.stepDelayMs) || Number(process.env.DAMRU_STEP_DELAY_MS) || 1200;
    const initialPageLoadDelayMs = Number(payload && payload.initialPageLoadDelayMs) || Number(process.env.DAMRU_INITIAL_PAGE_LOAD_DELAY_MS) || 4500;
    const postSubmitDelayMs = Number(payload && payload.postSubmitDelayMs) || Number(process.env.DAMRU_POST_SUBMIT_DELAY_MS) || 5000;

    const snap = async (stepName) => {
        const savedPath = await captureStepScreenshot(device, screenshotDir, stepName, screenshotIndex);
        screenshotIndex += 1;
        return savedPath;
    };

    const waitForSettle = async (reason, ms = baseStepDelayMs) => {
        const delay = Math.max(0, Number(ms) || 0);
        if (delay > 0) {
            log(`Waiting ${delay}ms for ${reason}`);
            await wait(delay);
        }
    };

    try {
        if (!payload || !payload.email || !payload.password) {
            throw new Error('Missing required payload fields: email and password');
        }

        const statesRoot = payload && payload.storagePath
            ? path.dirname(payload.storagePath)
            : path.resolve(process.cwd(), 'data', 'states');
        const screenshotsRoot = path.join(statesRoot, 'fairfx-login-screenshots');
        const runId = buildRunStamp();
        screenshotDir = path.join(screenshotsRoot, runId);
        fs.mkdirSync(screenshotDir, { recursive: true });
        log('Screenshot folder prepared', screenshotDir);

        log('Launching FairFX Damru session');
        await ensurePool();

        device = await damru.acquireDevice(45000);
        log('Using Damru device', device);
        await snap('device_acquired');
        await waitForSettle('post_device_acquire');

        const navigateResult = await damru.navigate(device, FAIRFX_URL, {
            timeout: 60000,
            screenshot: false
        });
        ensureResultSuccess(navigateResult, 'Failed to open FairFX login page');

        await waitForSettle('initial_login_page_load', initialPageLoadDelayMs);
        log('Opened FairFX login page');
        await snap('login_page_opened');
        await waitForSettle('login_page_render');

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
        await waitForSettle('email_input_render');
        await snap('email_entered');
        await waitForSettle('post_email_screenshot');

        ensureResultSuccess(
            await postDamru('/api/press', {
                key: 'Enter',
                device,
                count: 1
            }),
            'Failed submitting email step'
        );
        await waitForSettle('email_submit_navigation', postSubmitDelayMs);
        await snap('email_submitted');
        await waitForSettle('post_email_submit_screenshot');

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
        await waitForSettle('password_input_render');
        await snap('password_entered');
        await waitForSettle('post_password_screenshot');

        ensureResultSuccess(
            await postDamru('/api/press', {
                key: 'Enter',
                device,
                count: 1
            }),
            'Failed submitting password step'
        );
        await waitForSettle('password_submit_navigation', postSubmitDelayMs);
        await snap('password_submitted');
        await waitForSettle('pre_otp_wait');

        ensureResultSuccess(
            await postDamru('/api/wait', {
                selector: 'input[id="code"]',
                device,
                timeout: 15000,
                state: 'visible'
            }),
            'OTP field did not appear'
        );
        await waitForSettle('otp_prompt_render');
        await snap('otp_prompt_visible');

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
        await waitForSettle('otp_input_render');
        await snap('otp_entered');

        // Remember browser is optional; do not fail flow if this action cannot be performed.
        try {
            await postDamru('/api/click', {
                selector: 'label[for="rememberBrowser"]',
                device,
                retries: 2,
                wait_visible_timeout: 7000
            });
            await waitForSettle('remember_browser_toggle');
            await snap('remember_browser_clicked');
        } catch (error) {
            log('Remember browser click skipped', error.message || String(error));
            await snap('remember_browser_skipped');
        }

        ensureResultSuccess(
            await postDamru('/api/press', {
                key: 'Enter',
                device,
                count: 1
            }),
            'Failed submitting OTP step'
        );
        await waitForSettle('otp_submit_navigation', postSubmitDelayMs);
        await snap('otp_submitted');
        await waitForSettle('post_otp_submit_stabilize');

        const locationResult = ensureResultSuccess(
            await postDamru('/api/execute', {
                script: 'window.location.href',
                device
            }),
            'Failed reading post-login URL'
        );

        const currentUrl = String(locationResult.result || '').trim();
        await snap('post_login_check');
        if (!currentUrl) {
            await snap('login_failed_no_url_context');
            if (parentPort) {
                parentPort.postMessage({
                    type: 'error',
                    payload: { message: 'Damru did not return current URL. UI automation is not active yet.' }
                });
            }
            return;
        }

        if (currentUrl.includes('login')) {
            await snap('login_failed_still_on_login');
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
            device,
            screenshotDir
        });

        await snap('login_success');

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
        await snap('error_state');

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
