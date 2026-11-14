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

  // ── 2. открытие сохранённого проекта: объекты вне помещений ──
  check('2 в новом демо предложения убрать объекты нет', (await count('[data-orphans]')) === 0);
  l0 = await L();
  const lost = l0.items.filter((i) => i.kind === 'chair').slice(0, 3).map((i) => i.id);
  await page.evaluate((ids) => window.__hb.useProject.getState().update((d) => { d.levels[0].items.filter((i) => ids.includes(i.id)).forEach((it, k) => { it.x = -3500 - k * 900; it.y = 1500; }); }), lost);
  check('2 во время работы предложение не появляется (только при открытии проекта)', (await count('[data-orphans]')) === 0);
  await page.waitForTimeout(1500); // автосохранение в IndexedDB
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.editor2d svg');
  await page.waitForSelector('[data-orphans]', { timeout: 10000 });
  const banner = await page.textContent('[data-orphans]');
  check('2 при открытии проекта из IndexedDB найдены объекты вне помещений', (await page.getAttribute('[data-orphans]', 'data-orphans')) === '3' && /3 об’єкти/.test(banner), banner);
  check('2 кнопка «Прибрати N об’єктів поза приміщеннями»', /Прибрати 3 об’єкти поза приміщеннями/.test(await page.textContent('[data-action="orphans-remove"]')));
  await page.screenshot({ path: path.join(out, '52-orphans.png') });
  await page.click('[data-action="orphans-show"]');
  u = await ui();
  check('2 «Показати» выделяет потерянные объекты', u.multi.length === 3 && u.multi.every((m) => lost.includes(m.id)));
  await page.click('[data-action="orphans-remove"]');
  l1 = await L();
  check('2 объекты убраны одной операцией', l1.items.length === l0.items.length - 3 && !l1.items.some((i) => lost.includes(i.id)) && (await state(page)).past === 1);
  check('2 предложение скрыто, показано сообщение с подсказкой про отмену', (await count('[data-orphans]')) === 0 && /Ctrl\+Z/.test(await page.textContent('.toast')));
  await page.keyboard.press('Control+KeyZ');
  l1 = await L();
  check('2 undo возвращает убранные объекты', l1.items.length === l0.items.length && lost.every((id) => l1.items.some((i) => i.id === id)));
  // вернуть стулья на место, чтобы следующие проверки шли на чистом демо
  await openDemo();

  // ── 3. «Товар з магазину»: форма, материал создаётся только по «Зберегти» ──
  const P = () => page.evaluate(() => window.__hb.useProject.getState().project);
  let pr = await P();
  const bed = pr.levels[0].rooms.find((r) => r.type === 'bedroom');
  await clickWorld(page, bed.seed.x, bed.seed.y);
  await page.click('[data-action="materials"]');
  await page.waitForSelector('[data-dialog="materials"]');
  const fin0 = pr.finishes.length;
  const past0 = (await state(page)).past;
  await page.selectOption('[data-shop-type]', 'laminate');
  await page.click('[data-action="add-shop"]');
  pr = await P();
  check('3 форма товара открыта, материал не создан, история не тронута', pr.finishes.length === fin0 && (await count('[data-draft-bar]')) === 1 && (await state(page)).past === past0);
  check('3 пустой черновик нельзя сохранить', (await page.locator('[data-action="save-draft"]').isDisabled()) && (await page.getAttribute('[data-draft-problem]', 'data-draft-problem')) === 'empty');
  check('3 в форме сначала идут ссылка и данные магазина', (await count('[data-draft] [data-field="shopUrl"]')) === 1 && (await count('[data-draft] [data-apply]')) === 0);
  await page.click('[data-action="cancel-draft"]');
  pr = await P();
  check('3 «Скасувати» ничего не сохраняет', pr.finishes.length === fin0 && (await count('[data-draft-bar]')) === 0);
  // черновик с параметрами, но без сохранения: закрыть диалог
  await page.click('[data-action="add-shop"]');
  await page.fill('[data-field="shopUrl"]', 'https://shop.example.com/laminat/777');
  await page.click('.dialog > header button');
  pr = await P();
  check('3 закрытие диалога с несохранённой формой не создаёт материал', pr.finishes.length === fin0 && (await state(page)).past === past0);
  // неверная ссылка → нельзя; верная → можно
  await page.click('[data-action="materials"]');
  await page.waitForSelector('[data-dialog="materials"]');
  await page.selectOption('[data-shop-type]', 'laminate');
  await page.click('[data-action="add-shop"]');
  await page.fill('[data-field="shopUrl"]', 'shop.example.com/laminat/777');
  check('3 ссылка без http(s) не принимается', (await page.locator('[data-action="save-draft"]').isDisabled()) && (await page.getAttribute('[data-draft-problem]', 'data-draft-problem')) === 'badUrl');
  await page.fill('[data-field="shopUrl"]', 'https://shop.example.com/laminat/777');
  await page.fill('[data-field="name"]', 'Ламінат «Дуб альпійський» (магазин)');
  const priceF = page.locator('[data-edit] label.field', { hasText: 'Ціна за одиницю' }).locator('input');
  await priceF.fill('640');
  await priceF.press('Enter');
  pr = await P();
  check('3 правки формы не попадают в проект до сохранения', pr.finishes.length === fin0 && (await count('[data-draft-problem]')) === 0 && !(await page.locator('[data-action="save-draft"]').isDisabled()));
  await page.click('[data-action="save-draft"]');
  pr = await P();
  const saved = pr.finishes[pr.finishes.length - 1];
  check('3 «Зберегти» создаёт материал одной записью истории', pr.finishes.length === fin0 + 1 && saved.shopUrl === 'https://shop.example.com/laminat/777' && saved.price === 640 && saved.name.uk === 'Ламінат «Дуб альпійський» (магазин)' && saved.type === 'laminate' && (await state(page)).past === past0 + 1, JSON.stringify({ n: pr.finishes.length, url: saved.shopUrl, price: saved.price }));
  check('3 сохранённый товар выбран в списке и доступен для назначения помещению', (await page.getAttribute('.mat-item.active', 'data-finish')) === saved.id && (await count('[data-apply="floor"]')) === 1);
  await page.screenshot({ path: path.join(out, '53-shop-saved.png') });
  await page.click('.dialog > header button');

  // ── 4. прогулка: высота глаз, свободная точка старта, подвесы не ниже 2,1 м ──
  await openDemo();
  await page.click('[data-view="3d"]');
  await page.waitForSelector('.view3d canvas');
  await page.waitForTimeout(1500);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => !!window.__hbCam, null, { timeout: 10000 });
  await page.waitForTimeout(1200);
  const cam = await page.evaluate(() => window.__hbCam());
  check('4 прогулка стартует на высоте глаз 1,6 м', Math.abs(cam.y - 1.6) < 0.001, String(cam.y));
  const walkInfo = await page.evaluate((c) => {
    const l = window.__hb.useProject.getState().project.levels[0];
    const inPoly = (p, poly) => { let r = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) r = !r; } return r; };
    const pos = { x: c.x * 1000, y: c.z * 1000 };
    const room = l.rooms.find((r) => inPoly(pos, r.polygon));
    const pend = l.items.filter((i) => i.kind === 'lamp-pendant');
    const dPend = Math.min(...pend.map((i) => Math.hypot(i.x - pos.x, i.y - pos.y)));
    // подвес в секторе взгляда ±45° ближе 1,5 м?
    const fwd = { x: -Math.sin(c.yaw), y: -Math.cos(c.yaw) };
    const inView = pend.some((i) => { const d = Math.hypot(i.x - pos.x, i.y - pos.y); const cos = ((i.x - pos.x) * fwd.x + (i.y - pos.y) * fwd.y) / (d || 1); return d < 1500 + 190 && cos > Math.cos(Math.PI / 4); });
    return { room: room?.name, biggest: [...l.rooms].sort((a, b) => b.area - a.area)[0].name, dPend: Math.round(dPend), inView, pendZ: pend.map((i) => i.z) };
  }, cam);
  check('4 старт — в самой большой комнате, подвесной светильник не ближе 0,6 м и не в поле зрения', walkInfo.room === walkInfo.biggest && walkInfo.dPend >= 600 + 190 - 1 && !walkInfo.inView, JSON.stringify(walkInfo));
  check('4 низ подвесных светильников — не ниже 2,1 м', walkInfo.pendZ.length >= 2 && walkInfo.pendZ.every((z) => z >= 2100), walkInfo.pendZ.join(','));
  await page.screenshot({ path: path.join(out, '54-walk-start.png') });
  await page.keyboard.press('KeyF');
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);

  // ── 5. чертежи: масштаб «Авто» и подписи ──
  await page.click('.topbar >> text=Креслення');
  await page.waitForSelector('.dialog .sheet-preview svg, .dialog svg', { timeout: 10000 });
  await page.waitForTimeout(500);
  const dlgText = await page.textContent('.dialog');
  check('5 обмерный план демо на A3: «Авто» выбирает 1:50', /1:50 · A3/.test(dlgText), (dlgText.match(/[^·]{0,30}· 1:\d+ · A\d/) || [''])[0]);
  const scaleOpts = await page.locator('.dialog label.field', { hasText: 'Масштаб' }).locator('option').allInnerTexts();
  check('5 в списке масштабов есть «Авто», 1:50, 1:75, 1:100', ['Авто', '1:50', '1:75', '1:100'].every((o) => scaleOpts.includes(o)), scaleOpts.join(' '));
  // подписи помещений и марки проёмов на листе не перекрываются (по фактическим габаритам текста в SVG)
  const clash = await page.evaluate(() => {
    const svg = document.querySelector('.dialog svg');
    const rooms = window.__hb.useProject.getState().project.levels[0].rooms.map((r) => r.name);
    const texts = [...svg.querySelectorAll('text')];
    const labels = texts.filter((t) => rooms.includes(t.textContent.trim())).map((t) => t.getBoundingClientRect());
    const marks = texts.filter((t) => /^(В|Д|ПР)-\d+$/.test(t.textContent.trim())).map((t) => t.getBoundingClientRect());
    const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    let n = 0;
    for (const a of labels) for (const b of marks) if (hit(a, b)) n++;
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (hit(labels[i], labels[j])) n++;
    return { labels: labels.length, marks: marks.length, n };
  });
  check('5 на обмерном плане марки проёмов и подписи комнат не перекрываются', clash.labels === 6 && clash.marks >= 9 && clash.n === 0, JSON.stringify(clash));
  await page.screenshot({ path: path.join(out, '55-drawing-auto.png') });
  await page.click('.dialog footer >> text=Закрити');

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
