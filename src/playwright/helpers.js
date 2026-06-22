const wait = (ms) => new Promise(r => setTimeout(r, ms));

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
    clearInput
};
