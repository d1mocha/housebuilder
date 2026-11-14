// Блок 3 (итерация 2): UX — подсказки внизу холста, каталог с миниатюрами/поиском/избранным/drag&drop,
// 3D (тени, сети скрыты по умолчанию, рулетка), конструктор (выбор детали в 3D, размерные линии).
const { launch, toScreen, state, check } = require('./helpers.cjs');
const path = require('path');
const fs = require('fs');

(async () => {
  const { browser, page, errors } = await launch(undefined, { hints: true });
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });
  const ui = () => page.evaluate(() => { const u = window.__hb.useUi.getState(); return { mode: u.mode, tool: u.tool, multi: u.multi.length, sel: u.selection, hintsOff: u.hintsOff, favorites: u.favorites }; });
  const L = () => page.evaluate(() => window.__hb.useProject.getState().project.levels[0]);
  const mode = (m) => page.click(`.left-panel [data-tab="${m}"]`);
  const count = (sel) => page.locator(sel).count();

  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('text=Відкрити демо-квартиру');
  await page.waitForTimeout(600);
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Home');
  await page.waitForTimeout(200);

  // ── 3.3 подсказки внизу холста ──
  const hintBox = await page.locator('.hint-card').boundingBox();
  const centerBox = await page.locator('.center').boundingBox();
  check('3.3 подсказка показана внизу холста', !!hintBox && hintBox.y > centerBox.y + centerBox.height * 0.6 && hintBox.y + hintBox.height <= centerBox.y + centerBox.height, JSON.stringify(hintBox));
  check('3.3 подсказка режима «План» упоминает мультивыделение и перебор', /Shift\+клік/.test(await page.textContent('.hint-card')) && /Alt\+клік/.test(await page.textContent('.hint-card')));
  await page.click('.hint-card button.primary');
  await page.keyboard.press('KeyW');
  check('3.3 у каждого инструмента своя подсказка', (await count('[data-hint="wall"]')) === 1 && /прямий кут/.test(await page.textContent('.hint-card')));
  await page.click('[data-action="hints-off"]');
  check('3.3 «Не показувати більше» убирает подсказку', (await count('.hint-card')) === 0 && (await ui()).hintsOff === true);
  await page.keyboard.press('KeyA');
  await page.keyboard.press('KeyT');
  await mode('electrical');
  check('3.3 после отключения подсказки не появляются при смене инструмента и режима', (await count('.hint-card')) === 0);
  check('3.3 отключение подсказок сохраняется между сеансами', await page.evaluate(() => JSON.parse(localStorage.getItem('hb.ui')).hintsOff === true));
  await page.click('.topbar >> text=?');
  check('3.3 подсказки можно включить обратно в справке', (await count('[data-setting="hints"] input')) === 1 && !(await page.locator('[data-setting="hints"] input').isChecked()));
  await page.click('.dialog > header button');

  // ── 3.1 режимы: видны и кликабельны только нужные слои ──
  const modes = await page.$$eval('.mode-tabs [data-tab]', (els) => els.map((e) => e.dataset.tab));
  check('3.1 режимы: План / Меблі / Електрика / Вода / Опалення', ['plan', 'furniture', 'electrical', 'water', 'heating'].every((m) => modes.includes(m)), modes.join(','));
  const layerState = await page.evaluate(() => {
    const st = (sel) => { const g = document.querySelector(sel); return g ? { pe: getComputedStyle(g).pointerEvents, op: Number(g.getAttribute('opacity') ?? 1) } : null; };
    const l = window.__hb.useProject.getState().project.levels[0];
    const sofa = l.items.find((i) => i.kind === 'sofa');
    const socket = l.items.find((i) => i.kind === 'el-socket');
    return { sofa: st(`.editor2d [data-t="item"][data-id="${sofa.id}"]`), socket: st(`.editor2d [data-t="item"][data-id="${socket.id}"]`), wall: st('.editor2d [data-t="wall"]') };
  });
  check('3.1 «Електрика»: розетки активны, мебель приглушена и некликабельна, стены некликабельны', layerState.socket.pe !== 'none' && layerState.socket.op === 1 && layerState.sofa.pe === 'none' && layerState.sofa.op < 0.5 && layerState.wall.pe === 'none', JSON.stringify(layerState));

  // ── 3.2 каталог: карточки с миниатюрами ──
  await mode('furniture');
  await page.waitForFunction(() => document.querySelectorAll('.left-panel .card-thumb[data-thumb="3d"] img').length >= 60, null, { timeout: 30000 });
  const cards = await count('.left-panel .lib-card');
  const thumbs = await page.$$eval('.left-panel .card-thumb[data-thumb="3d"] img', (imgs) => imgs.filter((i) => i.src.startsWith('data:image/png') && i.naturalWidth >= 100).length);
  check('3.2 каталог мебели: карточки с миниатюрами, отрисованными из параметрических моделей', cards >= 60 && thumbs >= 60, `${cards} карточек, ${thumbs} миниатюр`);
  const distinct = await page.$$eval('.left-panel .card-thumb[data-thumb="3d"] img', (imgs) => new Set(imgs.map((i) => i.src.length + ':' + i.src.slice(-40))).size);
  check('3.2 миниатюры разные (не одна заглушка)', distinct >= 40, String(distinct));
  await page.screenshot({ path: path.join(out, '40-catalog-cards.png') });
  // поиск
  await page.fill('[data-catalog-search]', 'диван');
  const found = await page.$$eval('.left-panel .lib-card .card-name', (els) => els.map((e) => e.textContent));
  check('3.2 поиск по каталогу', found.length >= 2 && found.length < 10 && found.every((n) => /диван/i.test(n)), found.join(' | '));
  await page.fill('[data-catalog-search]', '');
  // избранное
  await page.click('.left-panel [data-fav="sofa"]');
  await page.click('.left-panel [data-fav="bed-double"]').catch(() => undefined);
  let u = await ui();
  check('3.2 избранное: звёздочка добавляет объект в раздел «Обране»', u.favorites.includes('sofa') && (await count('[data-favorites] .lib-card[data-kind="sofa"]')) === 1);
  check('3.2 избранное сохраняется между сеансами', await page.evaluate(() => JSON.parse(localStorage.getItem('hb.ui')).favorites.includes('sofa')));
  await page.click('[data-favorites] [data-fav="sofa"]');
  u = await ui();
  check('3.2 повторный щелчок по звёздочке убирает из избранного', !u.favorites.includes('sofa') && (await count('[data-favorites] .lib-card[data-kind="sofa"]')) === 0);
  // инженерные карточки — условные обозначения, трассы — образец линии
  await mode('electrical');
  check('3.2 инженерный каталог: карточки с условными обозначениями и образцами линий', (await count('.left-panel .card-thumb[data-thumb="2d"] svg')) >= 5 && (await count('.left-panel .card-thumb[data-thumb="line"] svg')) >= 1);
  await page.screenshot({ path: path.join(out, '41-catalog-electrical.png') });

  // drag&drop на план
  await mode('furniture');
  let l0 = await L();
  const dropAt = async (cardSel, target, pos) => page.dragAndDrop(cardSel, target, { targetPosition: pos });
  const svgBox = await page.locator('.editor2d svg').boundingBox();
  const sp = await toScreen(page, 2400, 2000); // свободное место в гостиной
  await dropAt('.left-panel .lib-card[data-kind="armchair"]', '.editor2d svg', { x: sp.x - svgBox.x, y: sp.y - svgBox.y });
  let l1 = await L();
  const dropped = l1.items.find((i) => !l0.items.some((o) => o.id === i.id));
  check('3.2 перетаскивание карточки на план ставит объект в точку под курсором', !!dropped && dropped.kind === 'armchair' && Math.abs(dropped.x - 2400) < 120 && Math.abs(dropped.y - 2000) < 120, JSON.stringify(dropped && { kind: dropped.kind, x: dropped.x, y: dropped.y }));
  u = await ui();
  check('3.2 поставленный объект выделен, инструмент — «Вибір»', u.sel?.id === dropped?.id && u.tool === 'select' && u.mode === 'furniture');
  check('3.2 перетаскивание — одна запись undo', (await state(page)).past === 1);

  // ── 3.4 3D: сети скрыты по умолчанию, тени ──
  await page.click('[data-view="split"]');
  await page.waitForSelector('.view3d canvas');
  await page.waitForFunction(() => window.__hbSels && window.__hbSels().wall > 5, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  let sels = await page.evaluate(() => window.__hbSels());
  check('3.4 инженерные сети (трассы и зоны) в 3D скрыты по умолчанию', !sels.route && !sels.zone && sels.item > 40, JSON.stringify(sels));
  let glInfo = await page.evaluate(() => window.__hbGl());
  check('3.4 тени включены: карта теней и источник, отбрасывающий тени', glInfo.shadows === true && sels.shadowLights === 1, JSON.stringify({ shadows: glInfo.shadows, lights: sels.shadowLights }));
  const tex = await page.evaluate(() => window.__hbMats().filter((m) => m.textured).length);
  check('3.4 поверхности в 3D — с текстурами', tex >= 10, String(tex));
  await page.screenshot({ path: path.join(out, '42-3d-shadows.png') });
  await page.click('[data-3d="networks"]');
  await page.waitForTimeout(500);
  sels = await page.evaluate(() => window.__hbSels());
  check('3.4 кнопка «Мережі» показывает трассы в 3D', sels.route >= 5, JSON.stringify(sels));
  await page.click('[data-3d="networks"]');
  await page.click('[data-3d="shadows"]');
  await page.waitForTimeout(500);
  sels = await page.evaluate(() => window.__hbSels());
  check('3.4 кнопка «Тіні» отключает тени', sels.shadowLights === 0);
  await page.click('[data-3d="shadows"]');

  // drag&drop в 3D: объект ставится на пол под курсором
  l0 = await L();
  const cv = await page.locator('.view3d canvas').boundingBox();
  await dropAt('.left-panel .lib-card[data-kind="lamp-floor"]', '.view3d canvas', { x: cv.width * 0.5, y: cv.height * 0.55 });
  l1 = await L();
  const d3 = l1.items.find((i) => !l0.items.some((o) => o.id === i.id));
  check('3.2 перетаскивание карточки в 3D ставит объект на пол', !!d3 && d3.kind === 'lamp-floor' && d3.x > -500 && d3.x < 9500 && d3.y > -500 && d3.y < 7300, JSON.stringify(d3 && { kind: d3.kind, x: d3.x, y: d3.y }));

  // ── 3.6 рулетка в 3D ──
  await page.click('[data-3d="measure"]');
  const selBefore = (await ui()).sel;
  await page.mouse.click(cv.x + cv.width * 0.42, cv.y + cv.height * 0.5);
  await page.mouse.click(cv.x + cv.width * 0.6, cv.y + cv.height * 0.62);
  await page.waitForFunction(() => Number(document.querySelector('[data-measure3d]')?.dataset.measure3d) > 0, null, { timeout: 10000 });
  const m3 = await page.evaluate(() => ({ pts: window.__hbMeasure3d(), label: Number(document.querySelector('[data-measure3d]').dataset.measure3d), text: document.querySelector('[data-measure3d]').textContent }));
  const d = Math.round(Math.hypot(m3.pts[1].x - m3.pts[0].x, m3.pts[1].y - m3.pts[0].y, m3.pts[1].z - m3.pts[0].z));
  check('3.6 рулетка в 3D: расстояние между двумя точками на поверхностях', m3.pts.length === 2 && m3.label > 300 && Math.abs(m3.label - d) <= 2 && /мм/.test(m3.text) && /ΔH/.test(m3.text), `${m3.text} (по точкам ${d})`);
  check('3.6 рулетка не меняет выделение и модель', JSON.stringify((await ui()).sel) === JSON.stringify(selBefore) && (await L()).items.length === l1.items.length);
  await page.screenshot({ path: path.join(out, '43-3d-measure.png') });
  await page.click('[data-3d="measure"]');
  check('3.6 выключение рулетки убирает замер', (await count('[data-measure3d]')) === 0);

  // прогулка: свет в помещениях
  await page.click('[data-view="3d"]');
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  sels = await page.evaluate(() => window.__hbSels());
  check('3.4 прогулка: помещения освещены своими светильниками', sels.pointLights >= 4, String(sels.pointLights));
  await page.screenshot({ path: path.join(out, '44-walk-lights.png') });
  await page.keyboard.press('KeyF');
  await page.click('[data-view="2d"]');

  // ── 3.5 конструктор: щелчок по детали в 3D выделяет её в деталировке, размерные линии ──
  await page.click('.topbar >> text=Конструктор меблів');
  await page.waitForSelector('.dialog.full .cab canvas');
  await page.waitForFunction(() => window.__hbCabParts && window.__hbCabParts().length > 10, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const design = await page.evaluate(() => { const p = window.__hb.useProject.getState().project; const c = p.cabinets.find((x) => x.id === window.__hb.useUi.getState().cabinetEditId) || p.cabinets[0]; return { w: c.width, h: c.height }; });
  const dims = await page.evaluate(() => window.__hbCabDims());
  check('3.5 размерные линии в 3D: ширина, высота, глубина изделия', dims.includes(String(design.w)) && dims.includes(String(design.h)) && dims.length === 3, dims.join(' × '));
  const parts = await page.evaluate(() => window.__hbCabParts());
  // правая боковина: наружная грань видна с камеры
  const side = parts.filter((p) => p.sx < 0.03 && p.sy > 1).sort((a, b) => b.cx - a.cx)[0];
  await page.mouse.click(side.x, side.y);
  await page.waitForSelector('[data-part-info]', { timeout: 5000 });
  const info = await page.getAttribute('[data-part-info]', 'data-part-info');
  check('3.5 щелчок по детали в 3D выделяет её', info === side.key, `${info} / ${side.key}: ${await page.textContent('[data-part-info]')}`);
  await page.screenshot({ path: path.join(out, '45-cabinet-pick.png') });
  await page.click('[data-action="to-cutlist"]');
  const selRows = await page.$$eval('[data-part-sel]', (trs) => trs.map((tr) => ({ keys: tr.dataset.partRow, name: tr.children[1].textContent })));
  check('3.5 деталь выделена в деталировке', selRows.length === 1 && selRows[0].keys.split(' ').includes(side.key) && /Боковина/.test(selRows[0].name), JSON.stringify(selRows));
  const visible = await page.evaluate(() => { const r = document.querySelector('[data-part-sel]').getBoundingClientRect(); const c = document.querySelector('.cab-content').getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom + 2; });
  check('3.5 выделенная строка прокручена в видимую область', visible);
  await page.screenshot({ path: path.join(out, '46-cabinet-cutlist-sel.png') });
  // обратное направление: строка деталировки → деталь в 3D
  const otherKey = await page.evaluate((k) => { const tr = [...document.querySelectorAll('[data-part-row]')].find((x) => !x.dataset.partRow.split(' ').includes(k) && /Полиця|Дно|Кришка/.test(x.children[1].textContent)); tr.children[0].click(); return tr.dataset.partRow.split(' ')[0]; }, side.key);
  await page.click('[data-cabtab="preview"]');
  await page.waitForSelector('[data-part-info]');
  check('3.5 выбор строки в деталировке подсвечивает деталь в 3D', (await page.getAttribute('[data-part-info]', 'data-part-info')) === otherKey);
  await page.click('[data-toggle="dims"]');
  await page.waitForTimeout(300);
  check('3.5 размерные линии отключаются', (await page.evaluate(() => window.__hbCabDims().length)) === 0);
  await page.click('.dialog.full footer >> text=Закрити');

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
