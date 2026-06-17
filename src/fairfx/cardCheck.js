const { chromium } = require('playwright');
const { parentPort } = require("worker_threads")


async function getAccountBalance(page) {
  await page.goto('https://dashboard.fairfx.com/overview');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(4000); // increased from 2000

  const rawText = await page.evaluate(() => document.body.innerText);
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let gbpAvailable = '?', gbpPending = '?', usdAvailable = '?', usdPending = '?';

  for (let i = 0; i < lines.length; i++) {
    const curr = lines[i];
    const next = lines[i + 1] ?? '';

    if (curr === 'Available' && next.includes('GBP') && gbpAvailable === '?') {
      gbpAvailable = next.replace(' GBP', '').trim();
    }
    if (curr === 'Pending' && next.includes('GBP') && gbpPending === '?') {
      gbpPending = next.replace(' GBP', '').trim();
    }
    if (curr === 'Available' && next.includes('USD') && usdAvailable === '?') {
      usdAvailable = next.replace(' USD', '').trim();
    }
    if (curr === 'Pending' && next.includes('USD') && usdPending === '?') {
      usdPending = next.replace(' USD', '').trim();
    }
  }

  return { gbpAvailable, gbpPending, usdAvailable, usdPending };
}

async function run() {
  await new Promise(r => setTimeout(r, 1000));

  const context = await chromium.launchPersistentContext(CARD_PROFILE_PATH, {
    headless: true,
    channel: 'chromium',
    args: ['--start-maximized'],
    viewport: null,
  });

  const page = context.pages()[0] ?? await context.newPage();

  await page.goto('https://dashboard.fairfx.com/cards?tab=shared');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  try {
    const emailBox = page.getByRole('textbox', { name: 'Email address' });
    await emailBox.waitFor({ state: 'visible', timeout: 3000 });
    await emailBox.click();
    await emailBox.fill('fitzmman28@gmail.com');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('Kanunu1990@@');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    console.log('✅ Logged in');
  } catch {
    console.log('ℹ️  Already logged in, skipping...');
  }

  console.log('💰 Fetching account balance...');
  const { gbpAvailable, gbpPending, usdAvailable, usdPending } = await getAccountBalance(page);
  console.log(`GBP: ${gbpAvailable} available, ${gbpPending} pending`);
  console.log(`USD: ${usdAvailable} available, ${usdPending} pending`);

  await page.goto('https://dashboard.fairfx.com/cards?tab=shared');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  const rawText = await page.evaluate(() => document.body.innerText);
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  const activeCards = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^CARD \d+$/.test(lines[i])) {
      const nextLine = lines[i + 1] ?? '';
      if (nextLine !== 'Cancelled') {
        const cardName = lines[i];
        const cardDetails = lines[i + 1] ?? '';
        activeCards.push({ cardName, cardDetails });
      }
    }
  }

  const results = [];

  for (const card of activeCards) {
    const { cardName, cardDetails } = card;

    const last4Match = cardDetails.match(/(\d{4})/);
    const last4 = last4Match ? last4Match[1] : '????';

    let uberBurnt = false;

    try {
      await page.goto('https://dashboard.fairfx.com/cards?tab=shared');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);

      await page.getByText(cardName).first().click();
      await page.waitForTimeout(1000);

      await page.getByRole('button', { name: 'View all transactions' }).click();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      const txText = await page.evaluate(() => document.body.innerText);
      if (txText.toLowerCase().includes('uber')) {
        uberBurnt = true;
      } else {
        console.log(`✅ ${cardName} is clean`);
      }

    } catch (err) {
      console.log(`⚠️  Could not check ${cardName}: ${err.message}`);
    }

    const status = uberBurnt ? '[UBER BURNT]' : '[CLEAN]';
    results.push(`[${cardName}] — •••• ${last4} — Virtual — ${status}`);
  }

  const balanceLine = [
    `[ BALANCE ]`,
    `GBP — Available: ${gbpAvailable} | Pending: ${gbpPending}`,
    `USD — Available: ${usdAvailable} | Pending: ${usdPending}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `[ ACTIVE CARDS ]`,
    ...results,
  ].join('\n');

  const output = [
    `[ BALANCE ]`,
    `GBP — Available: ${gbpAvailable} | Pending: ${gbpPending}`,
    `USD — Available: ${usdAvailable} | Pending: ${usdPending}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    results.length > 0 ? `[ ACTIVE CARDS ]\n${results.join('\n')}` : `[ ACTIVE CARDS ]\nNo active cards found.`,
  ].join('\n');
  console.log('\nFinal result:\n' + output);


  await context.close();
}

run().catch((err) => {
  console.error('❌ Error:', err.message);
});