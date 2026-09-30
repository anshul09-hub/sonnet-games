// Customize screen screenshots for each category (live 3D preview).
import { startStatic, launch, newPage, report, sleep, SHOTS } from './lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch(); let ok = true;
const errors = [];
const { page } = await newPage(browser, { errors, width: +process.env.W || 1280, height: +process.env.H || 720, touch: !!process.env.TOUCH, dpr: +process.env.DPR || 1, logs: !!process.env.LOGS });
await page.goto(url + `?q=${process.env.Q || 'medium'}&dyn=0&norender=1&screen=customize`); await page.waitForSelector('.cz-panel', { timeout: 30000 });
const shot = async (name, wait = 1500) => { await sleep(wait); for (let k = 0; k < 3; k++) { await page.evaluate(() => window.__gn.renderNow()); await sleep(150); } await page.screenshot({ path: SHOTS + `/customize-${name}.png` }); };
const cats = (process.env.CATS || 'skin,scene,dice,finisher,dance,trail,sound,frame').split(',');
for (const cat of cats) {
  await page.click('#tab-' + cat); 
  if (cat === 'skin' && process.env.SKIN) await page.click(`#cz-grid .tile[data-id="${process.env.SKIN}"]`);
  await sleep(cat === 'scene' || cat === 'dance' || cat === 'finisher' || cat === 'trail' || cat === 'dice' ? 6000 : 1500);
  if (cat === 'finisher') { await page.click('#cz-action'); await sleep(4500); }
  if (cat === 'dice') { await page.click('#cz-action'); await sleep(2500); }
  await shot(cat, 500);
  console.log('shot', cat);
}
ok = report(errors, 'customize') && ok;
await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
