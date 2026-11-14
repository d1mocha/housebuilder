// Итерация 3: сдвиг стен без смещения проёмов и с мебелью, уборка объектов вне помещений, форма товара,
// старт прогулки, чертежи, выравнивание стен, склонения, импорт цен.
const { launch, clickWorld, dragWorld, toScreen, state, check } = require('./helpers.cjs');
const path = require('path');
const fs = require('fs');

(async () => {
  const { browser, page, errors } = await launch();
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });
  const ui = () => page.evaluate(() => { const u = window.__hb.useUi.getState(); return { mode: u.mode, tool: u.tool, multi: u.multi, sel: u.selection }; });
  const L = () => page.evaluate(() => window.__hb.useProject.getState().project.levels[0]);
  const mode = (m) => page.click(`.left-panel [data-tab="${m}"]`);
  const count = (sel) => page.locator(sel).count();
  const openDemo = async () => {
    await page.click('[data-menu="file"]');
    await page.click('text=Новий проєкт…');
    await page.click('text=Відкрити демо-квартиру');
    await page.waitForTimeout(600);
    await page.click('[data-view="2d"]');
    await page.waitForTimeout(300);
    await page.keyboard.press('Home');
    await page.waitForTimeout(200);
  };
  /** Абсолютные центры проёмов. */
  const absOpenings = (l) => l.openings.map((o) => { const w = l.walls.find((x) => x.id === o.wallId); const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); return { id: o.id, kind: o.kind, x: Math.round(w.a.x + ((w.b.x - w.a.x) * o.pos) / len), y: Math.round(w.a.y + ((w.b.y - w.a.y) * o.pos) / len) }; });

  await openDemo();

  // ── 1. сдвиг перегородки Вітальня / Спальня на 400 мм ──
  let l0 = await L();
  const cross = l0.walls.find((w) => w.a.x === 4600 && w.a.y === 0 && w.b.x === 4600 && w.b.y === 3900);
  const cab0 = l0.items.find((i) => i.kind === 'cabinet');
  const tv0 = l0.items.find((i) => i.kind === 'tv-stand');
  check('1 в исходном демо нет коллизий', (await count('[data-collision]')) === 0 && (await count('[data-opening-out]')) === 0);
  await dragWorld(page, 4600, 2600, 5000, 2600);
  let l1 = await L();
  const c1 = l1.walls.find((w) => w.id === cross.id);
  check('1 перегородка сдвинута на 400 мм', c1.a.x === 5000 && c1.b.x === 5000, JSON.stringify(c1.a));
  const same = JSON.stringify(absOpenings(l1)) === JSON.stringify(absOpenings(l0));
  const wins = absOpenings(l1).filter((o) => o.kind === 'window').map((o) => `${o.x},${o.y}`).join(' | ');
  check('1 окна и двери соседних стен остались на месте', same, wins);
  const cab1 = l1.items.find((i) => i.id === cab0.id);
  const tv1 = l1.items.find((i) => i.id === tv0.id);
  check('1 шкаф и ТВ-тумба, стоявшие вплотную, сдвинулись вместе со стеной', cab1.x === cab0.x + 400 && tv1.x === tv0.x + 400, `${cab0.x}→${cab1.x}, ${tv0.x}→${tv1.x}`);
  check('1 шкаф не в стене: коллизий нет', (await count('[data-collision]')) === 0 && (await count(`[data-collision="${cab0.id}"]`)) === 0);
  check('1 помещения сохранились, площадь спальни уменьшилась', l1.rooms.length === 6 && l1.rooms.find((r) => r.type === 'bedroom').area < l0.rooms.find((r) => r.type === 'bedroom').area);
  check('1 сдвиг стены с мебелью — одна запись undo', (await state(page)).past === 1);
  await page.screenshot({ path: path.join(out, '50-wall-move.png') });
  await page.keyboard.press('Control+KeyZ');
  l1 = await L();
  check('1 undo возвращает стену и мебель', l1.walls.find((w) => w.id === cross.id).a.x === 4600 && l1.items.find((i) => i.id === cab0.id).x === cab0.x);

  // стена наезжает на мебель и «съедает» дверной проём соседней стены → подсветка и нарушения
  await page.keyboard.press('Escape');
  await dragWorld(page, 4600, 2600, 4200, 2600);
  await page.waitForTimeout(200);
  l1 = await L();
  check('1 коллизия мебели со стеной подсвечена', (await count('[data-collision]')) >= 1);
  check('1 проём за пределами стены подсвечен, но не сдвинут', (await count('[data-opening-out]')) === 1 && JSON.stringify(absOpenings(l1)) === JSON.stringify(absOpenings(l0)));
  const toast = await page.textContent('.toast');
  check('1 предупреждение после сдвига', /перетинаються зі стіною/.test(toast) && /поза межами стіни/.test(toast), toast);
  await page.screenshot({ path: path.join(out, '51-wall-collision.png') });
  await page.click('[data-menu="issues"]');
  const rules = await page.$$eval('[data-issues-pop] .issue', (els) => els.map((e) => e.getAttribute('title')));
  check('1 в списке нарушений — мебель в стене и проём вне стены', rules.includes('geom.item.inWall') && rules.includes('geom.opening.outOfWall'), rules.filter((r) => r.startsWith('geom')).join(','));
  await page.click('[data-issues-pop] .issue[title="geom.item.inWall"]');
  let u = await ui();
  check('1 переход от нарушения к объекту', u.sel?.type === 'item' && u.mode === 'furniture');
  await mode('plan');
  await page.keyboard.press('Control+KeyZ');
  check('1 после undo коллизий нет', (await count('[data-collision]')) === 0 && (await count('[data-opening-out]')) === 0);

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
