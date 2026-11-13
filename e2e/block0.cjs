// Блок 0 (итерация 2): регрессионные проверки исправленных багов в браузере.
const { launch, clickWorld, state, check } = require('./helpers.cjs');
const path = require('path');
const fs = require('fs');

(async () => {
  const { browser, page, errors } = await launch();
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });

  // ── первая загрузка: план целиком вписан в окно 2D ──
  const fit = await page.evaluate(() => {
    const svg = document.querySelector('.editor2d svg');
    const [vx, vy, vw, vh] = svg.getAttribute('viewBox').split(' ').map(Number);
    const l = window.__hb.useProject.getState().project.levels[0];
    const pts = l.walls.flatMap((w) => [w.a, w.b]);
    return pts.every((p) => p.x > vx && p.x < vx + vw && p.y > vy && p.y < vy + vh);
  });
  check('первая загрузка: план целиком виден в окне 2D', fit);

  // ── 0.1 демо: нет объектов вне помещений (модель и DOM) ──
  const outside = await page.evaluate(() => {
    const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    const l = window.__hb.useProject.getState().project.levels[0];
    const rot = (x, y, deg) => { const r = (deg * Math.PI) / 180; return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) }; };
    const bad = [];
    for (const it of l.items) {
      const f = rot(0, 200, it.rot);
      const ok = l.rooms.some((r) => inPoly({ x: it.x, y: it.y }, r.polygon) || inPoly({ x: it.x + f.x, y: it.y + f.y }, r.polygon));
      if (!ok) bad.push(it.kind);
    }
    // DOM: каждый нарисованный объект стоит там же, где в модели
    const dom = [...document.querySelectorAll('.editor2d [data-t="item"]')].map((g) => g.getAttribute('transform'));
    const mismatch = l.items.filter((it) => !dom.includes(`translate(${it.x} ${it.y}) rotate(${it.rot})`)).length;
    return { bad, items: l.items.length, dom: dom.length, mismatch };
  });
  check('0.1 в демо нет объектов вне контура помещений', outside.bad.length === 0 && outside.items > 60 && outside.dom === outside.items && outside.mismatch === 0, JSON.stringify(outside));
  await page.screenshot({ path: path.join(out, '50-demo-first-load.png') });

  // ── 0.6 кнопка ⚠ открывает список нарушений, справочник — отдельно ──
  const hint = await page.$('.hint-card button');
  if (hint) await hint.click();
  await page.click('[data-menu="issues"]');
  const pop = await page.$('[data-issues-pop]');
  const n = await page.locator('[data-issues-pop] .issue').count();
  check('0.6 кнопка ⚠ открывает список нарушений (не справочник)', !!pop && n > 0 && !(await page.$('.dialog')), `${n} записей`);
  await page.click('[data-issues-pop] .issue >> nth=0');
  let s = await state(page);
  check('0.6 клик по нарушению переходит к объекту и закрывает список', !!s.sel && !(await page.$('[data-issues-pop]')), JSON.stringify(s.sel));
  await page.click('[data-menu="issues"]');
  await page.click('[data-action="open-rules"]');
  await page.waitForSelector('[data-table="rules"]');
  const cols = await page.evaluate(() => {
    const th = [...document.querySelectorAll('[data-table="rules"] thead th')].map((e) => e.getBoundingClientRect());
    const cells = [...document.querySelectorAll('[data-table="rules"] td[data-col="count"]')].map((e) => e.getBoundingClientRect());
    const last = th[th.length - 1];
    return { n: cells.length, aligned: cells.every((c) => Math.abs(c.left - last.left) < 1 && Math.abs(c.width - last.width) < 1), inside: last.right <= document.querySelector('.dialog-body').getBoundingClientRect().right + 1 };
  });
  check('0.6 справочник норм: колонка «Порушень» выровнена по заголовку', cols.n > 20 && cols.aligned && cols.inside, JSON.stringify(cols));
  await page.screenshot({ path: path.join(out, '51-rules-table.png') });
  await page.keyboard.press('Escape');

  // ── 0.5 прогулка: старт в свободной зоне, лицом к центру комнаты ──
  await page.click('[data-view="3d"]');
  await page.waitForSelector('.view3d canvas');
  await page.waitForTimeout(1200);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(900);
  const walk = await page.evaluate(() => {
    const cam = window.__hbCam();
    const l = window.__hb.useProject.getState().project.levels[0];
    const room = [...l.rooms].sort((a, b) => b.area - a.area)[0];
    const c = room.polygon.reduce((s, p) => ({ x: s.x + p.x / room.polygon.length, y: s.y + p.y / room.polygon.length }), { x: 0, y: 0 });
    const pos = { x: cam.x * 1000, y: cam.z * 1000 };
    const fwd = { x: -Math.sin(cam.yaw), y: -Math.cos(cam.yaw) };
    const to = { x: c.x - pos.x, y: c.y - pos.y };
    const len = Math.hypot(to.x, to.y);
    // расстояние до ближайшего предмета мебели (по центрам и габаритам — грубо)
    const near = Math.min(...l.items.filter((i) => i.params.w && i.params.h >= 250 && i.z < 1700).map((i) => Math.hypot(i.x - pos.x, i.y - pos.y) - Math.max(i.params.w, i.params.d) / 2));
    return { pos, room: room.name, cos: len > 400 ? (fwd.x * to.x + fwd.y * to.y) / len : 1, near: Math.round(near), eye: cam.y };
  });
  check('0.5 прогулка стартует в свободной зоне самой большой комнаты', walk.room === 'Вітальня' && walk.near > 0 && Math.abs(walk.eye - 1.6) < 0.01, JSON.stringify(walk));
  check('0.5 прогулка: взгляд к центру комнаты', walk.cos > 0.98, walk.cos.toFixed(3));
  await page.screenshot({ path: path.join(out, '52-walk-start.png') });
  await page.keyboard.press('KeyF');

  // ── 0.3 конструктор: шаблон «Шафа-купе» — раздвижные двери, штанга, полки, ящики нормальной высоты ──
  await page.click('[data-view="split"]');
  await page.click('.topbar >> text=Конструктор меблів');
  await page.waitForSelector('.dialog.full');
  await page.selectOption('[data-select="design"]', '');
  await page.click('[data-template="wardrobe-sliding"]');
  await page.waitForSelector('.cab');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, '53-wardrobe-doors.png') });
  const cab = await page.evaluate(() => {
    const p = window.__hb.useProject.getState().project;
    const c = p.cabinets[p.cabinets.length - 1];
    return { type: c.facade.type, doors: c.facade.slidingCount, overlap: c.facade.slidingOverlap, profile: c.facade.slidingProfile, drawers: c.columns.map((x) => x.drawers), dh: c.columns.map((x) => x.drawerHeight), rods: c.columns.filter((x) => x.rod).length, shelves: c.columns.reduce((a, x) => a + x.shelves, 0), size: [c.width, c.height, c.depth] };
  });
  check('0.3 шаблон «Шафа-купе»: 2400×2600×600, раздвижные двери, штанга, полки, 1–2 ящика ≈180 мм', cab.type === 'sliding' && cab.doors >= 2 && cab.doors <= 3 && cab.overlap > 0 && cab.profile > 0 && cab.rods >= 1 && cab.shelves >= 5 && cab.drawers.reduce((a, b) => a + b, 0) <= 2 && cab.dh.every((h) => h >= 150 && h <= 200) && cab.size.join('x') === '2400x2600x600', JSON.stringify(cab));
  await page.click('[data-cabtab="hw"]');
  const hw = await page.$$eval('[data-table="hardware"] tbody tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ')));
  check('0.3 спецификация купе: двери с перекрытием, профили, направляющие, ролики', hw.some((r) => /Двері-купе .*перекриття/.test(r)) && hw.some((r) => /Профіль вертикальний/.test(r)) && hw.some((r) => /Напрямна верхня/.test(r)) && hw.some((r) => /роликів/.test(r)));
  await page.click('[data-cabtab="cut"]');
  const rows = await page.$$eval('[data-table="cutlist"] tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.querySelector('select') ? td.querySelector('select').value : td.innerText.trim()))));
  const infill = rows.find((r) => r[1] === 'Наповнення дверей-купе');
  const front = rows.find((r) => r[1] === 'Фасад шухляди');
  check('0.3 деталировка: наполнение дверей (ЛДСП 10) и фасады ящиков 180 мм', infill && infill[2] === 'ldsp10' && infill[10] === '3' && front && /× 180$/.test(front[3]), JSON.stringify([infill && infill.slice(2, 4), front && front[3]]));
  check('0.3 у детали есть параметр направления текстуры (вдоль/поперёк/без)', infill && infill[9] === 'length' && (await page.locator('[data-table="cutlist"] select[data-grain] option').first().count()) === 1);
  const shelfRow = page.locator('[data-table="cutlist"] tbody tr', { hasText: 'Полиця' }).first();
  await page.click('[data-cabtab="nest"]');
  await page.waitForSelector('.sheet-card svg');
  const nestInfo = async () => page.evaluate(() => ({ sheets: document.querySelectorAll('[data-nest="ldsp18"] .sheet-card').length, offcuts: document.querySelectorAll('[data-nest="ldsp18"] [data-offcut]').length, waste: document.querySelector('[data-nest="ldsp18"] [data-waste]').innerText, rot: [...document.querySelectorAll('[data-nest="ldsp18"] svg text')].filter((t) => t.textContent.includes('↻')).length }));
  const n1 = await nestInfo();
  check('0.3 раскрой: 3 листа ЛДСП 18, показаны деловые остатки и отходы', n1.sheets === 3 && n1.offcuts >= 1 && parseFloat(n1.waste.replace(',', '.')) < 20 && n1.rot === 0, JSON.stringify(n1));
  await page.screenshot({ path: path.join(out, '54-wardrobe-nesting.png') });
  await page.click('[data-cabtab="cut"]');
  await shelfRow.locator('select[data-grain]').selectOption('width');
  await page.click('[data-cabtab="nest"]');
  await page.waitForSelector('.sheet-card svg');
  const n2 = await nestInfo();
  check('0.3 раскрой учитывает направление текстуры: полки «поперёк» уложены с поворотом', n2.rot >= 4, JSON.stringify(n2));
  await page.click('.dialog.full footer >> text=Закрити');

  // ── 0.7 статусы стен и смета ──
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Home');
  await page.waitForTimeout(200);
  await clickWorld(page, 3400, 6000); // перегородка кухня/прихожая
  s = await state(page);
  check('0.7 стена выделена', s.sel?.type === 'wall');
  const stSel = page.locator('.right-panel label.field', { hasText: 'Статус' }).locator('select');
  check('0.7 существующая стена квартиры по умолчанию «існуюче»', (await stSel.inputValue()) === 'existing');
  await stSel.selectOption('demolish');
  s = await state(page);
  check('0.7 демонтаж перегородки объединяет кухню и прихожую', s.rooms.length === 5, `${s.rooms.length} помещений`);
  await page.click('.topbar >> text=Кошторис');
  await page.waitForSelector('[data-table="estimate"]');
  const est = await page.evaluate(() => ({ cats: [...document.querySelectorAll('[data-table="estimate"] tr[data-category]')].map((e) => e.dataset.category), demo: [...document.querySelectorAll('[data-table="estimate"] tr[data-line^="demo."]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()) }));
  check('0.7 смета: раздел «Демонтаж» отдельно, материалы кладки существующих стен не считаются', est.cats[0] === 'demolition' && !est.cats.includes('walls') && est.demo.some((r) => /Демонтаж стін: Цегла, 120 мм/.test(r)), est.demo.join(' | ').slice(0, 160));
  await page.click('.dialog footer >> text=Закрити');
  await page.screenshot({ path: path.join(out, '56-demolish.png') });
  await page.keyboard.press('Control+KeyZ');

  // ── 0.8 чертежи: внешние цепочки, марки, ведомость ──
  await page.click('.topbar >> text=Креслення');
  await page.waitForSelector('[data-sheet-preview]');
  const sheetTexts = await page.$$eval('[data-sheet-preview] text', (els) => els.map((e) => ({ t: e.textContent, size: Number(e.getAttribute('font-size')) })));
  const vals = sheetTexts.map((x) => x.t);
  const dimSizes = sheetTexts.filter((x) => /^\d{3,5}$/.test(x.t)).map((x) => x.size);
  check('0.8 обмерный план: габаритные размеры и цепочки по проёмам', vals.includes('9300') && vals.includes('7100') && vals.includes('1550') && vals.includes('4750'));
  check('0.8 марки окон и дверей и ведомость проёмов', vals.includes('В-1') && vals.includes('Д-1') && vals.includes('ПР-1') && vals.includes('Відомість прорізів') && vals.includes('1800×1500'));
  check('0.8 размерные числа читаемы (не меньше 2 мм на бумаге)', dimSizes.length > 20 && dimSizes.filter((x) => x < 2).length / dimSizes.length < 0.15, `мин. ${Math.min(...dimSizes)} мм, всего ${dimSizes.length}`);
  await page.click('.dialog footer >> text=Закрити');

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
