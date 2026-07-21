#!/usr/bin/env node
/**
 * VERIFY-KIT — render smoke test (needs a running dev server + Playwright).
 *
 * Playwright is NOT a project dependency (kept out of package.json on purpose —
 * see scripts/verify/README.md). Install it temporarily before running this,
 * and remove it again afterward:
 *
 *   npm install --no-save --no-package-lock playwright@1.61.1
 *   npx playwright install chromium
 *   npm run dev -- -p 3100 &         # or any port; pass it as argv[2]
 *   npx tsx scripts/verify/render-smoke.mjs 3100
 *   # afterward:
 *   npm install                      # restores node_modules to package-lock.json
 *
 * Checks (each prints its own PASS/FAIL, exit code is nonzero if any failed):
 *   1. Onboarding DateInput: typing "2"/"4"/"1989" into month/day/year yields
 *      02/04/1989 and enables the Continue CTA (BRIEF-058-FIX regression).
 *   2. All 5 tab headers (home/people/ask/you/settings) share one height, and
 *      the Settings link appears exactly on home/people/ask/you, not settings
 *      (BRIEF-077).
 *   3. /you: tapping the DAY column opens the Ilju sheet with a rendered name
 *      (BRIEF-074).
 *
 * Screenshots go to /tmp only — never commit them.
 */

import { chromium } from 'playwright';

const port = process.argv[2] ?? '3100';
const base = `http://localhost:${port}`;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();

// ── 1) Onboarding DateInput single-digit normalization (BRIEF-058-FIX) ──────
{
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  await page.goto(`${base}/onboarding`, { waitUntil: 'networkidle' });

  await page.locator('[aria-label="Month"]').click();
  await page.keyboard.type('2');
  await page.locator('[aria-label="Day"]').click(); // blurs month -> pads to "02"
  await page.keyboard.type('4');
  await page.locator('[aria-label="Year"]').click(); // blurs day -> pads to "04"
  await page.keyboard.type('1989');
  await page.locator('[aria-label="Month"]').click(); // blur year, done typing

  const month = await page.locator('[aria-label="Month"]').inputValue();
  const day   = await page.locator('[aria-label="Day"]').inputValue();
  const year  = await page.locator('[aria-label="Year"]').inputValue();
  await page.screenshot({ path: '/tmp/verify-render-smoke-onboarding.png' });

  check('DateInput: month="02"', month === '02', `got "${month}"`);
  check('DateInput: day="04"', day === '04', `got "${day}"`);
  check('DateInput: year="1989"', year === '1989', `got "${year}"`);

  const continueBtn = page.locator('button:has-text("Continue")');
  const disabled = await continueBtn.isDisabled();
  check('Continue CTA enabled', disabled === false, `disabled=${disabled}`);

  await page.close();
}

// ── 2) Header height parity + Settings link placement (BRIEF-077) ───────────
{
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1985-11-10', time: '20:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
  });

  const heights = {};
  const settingsCounts = {};
  for (const tab of ['home', 'people', 'ask', 'you', 'settings']) {
    await page.goto(`${base}/${tab}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const header = page.locator('header').first();
    const box = await header.boundingBox().catch(() => null);
    heights[tab] = box ? Math.round(box.height * 100) / 100 : null;
    settingsCounts[tab] = await page.getByLabel('Settings').count();
  }

  const distinctHeights = new Set(Object.values(heights));
  check('all 5 headers share one height', distinctHeights.size === 1, JSON.stringify(heights));

  const expectedCounts = { home: 1, people: 1, ask: 1, you: 1, settings: 0 };
  const countsMatch = Object.keys(expectedCounts).every(tab => settingsCounts[tab] === expectedCounts[tab]);
  check('Settings link count matches 1/1/1/1/0', countsMatch, JSON.stringify(settingsCounts));

  await page.close();
}

// ── 3) You: DAY tap opens the Ilju sheet with a rendered name (BRIEF-074) ───
{
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1985-11-10', time: '20:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
  });
  await page.goto(`${base}/you`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const dayButton = page.getByRole('button').first();
  await dayButton.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/verify-render-smoke-ilju-sheet.png' });

  const sheetHeading = page.locator('h2');
  const headingCount = await sheetHeading.count();
  const headingText = headingCount > 0 ? (await sheetHeading.first().textContent())?.trim() : '';
  check('Ilju sheet renders a name heading', !!headingText && headingText.length > 0, `"${headingText}"`);

  await page.close();
}

await browser.close();

console.log('');
const failures = results.filter(r => !r.pass).length;
if (failures === 0) {
  console.log('ALL PASS');
  process.exit(0);
} else {
  console.log(`${failures} check(s) FAILED`);
  process.exit(1);
}
