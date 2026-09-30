import { startStatic, launch, newPage, report, sleep, SHOTS } from './harness.mjs';
const { srv, url } = await startStatic(); const browser = await launch();
const themes = (process.env.THEMES || 'anime').split(',');
const errors = [];
for (const theme of themes) {
  const { page } = await newPage(browser, { errors, width: 1400, height: 760 });
  await page.goto(url + `tests/tokens.html?theme=${theme}&c=${process.env.C || 0}`); await page.waitForFunction(() => window.ready, null, { timeout: 30000 });
  await page.evaluate(() => window.render(1.3)); await sleep(500);
  await page.screenshot({ path: SHOTS + `/tokens-${theme}.png` });
  await page.context().close();
}
report(errors, 'tokens'); await browser.close(); srv.close();
