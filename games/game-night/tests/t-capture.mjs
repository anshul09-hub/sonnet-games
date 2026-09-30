// Force a capture and screenshot the finisher mid-action. FIN=katana,hammer,... FREEZE=slice AFTER=0.12
import { startStatic, launch, newPage, report, sleep, SHOTS, startLudo } from './lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch();
const fins = (process.env.FIN || 'katana').split(','); let ok = true;
for (const fin of fins) {
  const errors = [];
  const { page } = await newPage(browser, { errors, width: +process.env.W || 1280, height: +process.env.H || 720, logs: !!process.env.LOGS });
  await page.goto(url + `?q=${process.env.Q || 'medium'}&dyn=0&scene=${process.env.SCENE || 'meadow'}&norender=1`); await page.waitForSelector('.hub');
  await startLudo(page, { players: 2, level: 'hard', look: { finisher: fin } });
  await sleep(600);
  const freezeName = process.env.FREEZE || 'slice', after = +(process.env.AFTER ?? 0.12);
  await page.evaluate(([name, after]) => { const g = window.__ludo.game; g.freezeAt = { name, after }; window.__ludo.autoplay(true); window.__ludo.setup({ tokens: [[9, -1, -1, -1], [38, -1, -1, -1]], turn: 0 }); window.__ludo.forceNext(3); }, [freezeName, after]);
  let frozen = null;
  for (let i = 0; i < 300; i++) { await sleep(200); frozen = await page.evaluate(() => window.__frozen || null); if (frozen) break; }
  console.log(`${frozen ? '✓' : '✗'} ${fin}: reached "${freezeName}"`); if (!frozen) ok = false;
  if (frozen) { await sleep(700); for (let k = 0; k < 3; k++) { await page.evaluate(() => window.__gn.renderNow()); await sleep(150); } await page.screenshot({ path: SHOTS + `/capture-${fin}-${freezeName}.png` }); }
  const state = await page.evaluate(() => ({ t: window.__ludo.state.tokens, caps: window.__ludo.state.stats.map((s) => s.captures) }));
  console.log('   state', JSON.stringify(state));
  ok = report(errors, fin) && ok;
  await page.context().close();
}
await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
