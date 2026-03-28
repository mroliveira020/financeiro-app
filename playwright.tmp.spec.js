const { test } = require('playwright/test');

test('captura erros do boot', async ({ page }) => {
  const logs = [];
  page.on('console', msg => logs.push({ type: 'console', level: msg.type(), text: msg.text() }));
  page.on('pageerror', err => logs.push({ type: 'pageerror', text: err.stack || err.message }));
  page.on('requestfailed', req => logs.push({ type: 'requestfailed', text: `${req.method()} ${req.url()} :: ${req.failure()?.errorText}` }));
  const response = await page.goto('https://financeiro-frontend-hg4w.onrender.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('STATUS=' + (response ? response.status() : 'sem-resposta'));
  console.log('TITLE=' + await page.title());
  console.log('BODY=' + (await page.locator('body').innerText()).slice(0, 500));
  console.log('LOGS=' + JSON.stringify(logs, null, 2));
});
