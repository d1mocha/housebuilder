// Блок 0.2 и блок 1 (итерация 2): режимы и слои, перебор объектов под курсором, мультивыделение,
// индикаторы геометрии (90°, ∥, направляющие), дуговые стены, рулетка.
const { launch, clickWorld, moveWorld, dragWorld, toScreen, state, check } = require('./helpers.cjs');
const path = require('path');
const fs = require('fs');

(async () => {
  const { browser, page, errors } = await launch();
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });
  const ui = () => page.evaluate(() => { const u = window.__hb.useUi.getState(); return { mode: u.mode, tool: u.tool, multi: u.multi, sel: u.selection }; });
  const L = () => page.evaluate(() => window.__hb.useProject.getState().project.levels[0]);
  const mode = (m) => page.click(`.left-panel [data-tab="${m}"]`);
  const shiftClick = async (x, y) => { await page.keyboard.down('Shift'); await clickWorld(page, x, y); await page.keyboard.up('Shift'); };
  const dismiss = async () => { const h = await page.$('.hint-card button.primary'); if (h) await h.click(); };
  const count = (sel) => page.locator(sel).count();

  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('text=Відкрити демо-квартиру');
  await page.waitForTimeout(600);
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Home');
  await page.waitForTimeout(200);
  await dismiss();

  // ── 0.2 режимы: трасса не перехватывает клик по стене в режиме «План» ──
  let u = await ui();
  check('0.2 после открытия проекта активен режим «План»', u.mode === 'plan');
  // кабель идёт по несущей стене (y=3900, трасса y=4000): ищем точку трассы, где под курсором стена, а не дверь
  let hitX = 0;
  for (let x = 2500; x <= 6200 && !hitX; x += 100) {
    const sp = await toScreen(page, x, 4000);
    const top = await page.evaluate(([px, py]) => document.elementsFromPoint(px, py).map((el) => el.closest('[data-t]')).filter(Boolean)[0]?.dataset.t, [sp.x, sp.y]);
    if (top === 'wall') hitX = x;
  }
  await clickWorld(page, hitX, 4000);
  let s = await state(page);
  check('0.2 «План»: клик по стене с проложенным кабелем выделяет стену', s.sel?.type === 'wall', JSON.stringify(s.sel));
  const routeStyle = await page.evaluate(() => { const g = document.querySelector('.editor2d [data-t="route"]'); return { pe: getComputedStyle(g).pointerEvents, op: g.getAttribute('opacity') }; });
  check('0.2 «План»: инженерные трассы приглушены и некликабельны', routeStyle.pe === 'none' && Number(routeStyle.op) < 0.5, JSON.stringify(routeStyle));
  await mode('electrical');
  u = await ui();
  check('0.2 смена режима сбрасывает выделение', u.mode === 'electrical' && u.multi.length === 0);
  await clickWorld(page, hitX, 4000);
  s = await state(page);
  check('0.2 «Електрика»: тот же клик выделяет кабельную трассу', s.sel?.type === 'route', JSON.stringify(s.sel));
  const wallPe = await page.evaluate(() => getComputedStyle(document.querySelector('.editor2d [data-t="wall"]')).pointerEvents);
  check('0.2 «Електрика»: стены некликабельны', wallPe === 'none');
  const furnOp = await page.evaluate(() => { const l = window.__hb.useProject.getState().project.levels[0]; const sofa = l.items.find((i) => i.kind === 'sofa'); return document.querySelector(`.editor2d [data-t="item"][data-id="${sofa.id}"]`).getAttribute('opacity'); });
  check('0.2 «Електрика»: мебель приглушена', Number(furnOp) < 0.5, furnOp);
  await page.screenshot({ path: path.join(out, '20-mode-electrical.png') });

  // ── 0.2 перебор объектов под курсором: повторный клик и Alt+клик ──
  // две трассы выходят из щитка — в его точке под курсором щиток и кабели
  const stack = await page.evaluate(() => {
    const svg = document.querySelector('.editor2d svg');
    const idsAt = (x, y) => { const out = []; for (const el of document.elementsFromPoint(x, y)) { if (!svg.contains(el)) continue; const g = el.closest('[data-t]'); if (g && !out.includes(g.dataset.t + ':' + g.dataset.id)) out.push(g.dataset.t + ':' + g.dataset.id); } return out; };
    for (const g of svg.querySelectorAll('[data-t="item"],[data-t="route"]')) {
      if (getComputedStyle(g).pointerEvents === 'none') continue;
      const r = g.getBoundingClientRect();
      for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.5], [0.5, 0.3], [0.7, 0.5], [0.5, 0.7]]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        const ids = idsAt(x, y);
        if (ids.length >= 2) return { x, y, ids };
      }
    }
    return null;
  });
  check('0.2 в демо есть точка с несколькими объектами активного слоя', !!stack, JSON.stringify(stack?.ids));
  if (stack) {
    const idOf = async () => { const q = (await ui()).sel; return q ? `${q.type}:${q.id}` : null; };
    await page.keyboard.press('Escape');
    await page.mouse.click(stack.x, stack.y);
    check('0.2 первый клик выделяет верхний объект', (await idOf()) === stack.ids[0], await idOf());
    await page.mouse.click(stack.x, stack.y);
    check('0.2 повторный клик в ту же точку выделяет следующий объект под курсором', (await idOf()) === stack.ids[1], await idOf());
    await page.mouse.click(stack.x, stack.y);
    check('0.2 ещё один клик — следующий по кругу', (await idOf()) === stack.ids[2 % stack.ids.length], await idOf());
    const before = await idOf();
    await page.keyboard.down('Alt');
    await page.mouse.click(stack.x, stack.y);
    await page.keyboard.up('Alt');
    const idx = stack.ids.indexOf(before);
    check('0.2 Alt+клик перебирает объекты под курсором', (await idOf()) === stack.ids[(idx + 1) % stack.ids.length], await idOf());
    const lv = await L();
    check('0.2 перебор не сдвигает объекты (нет записей undo)', (await state(page)).past === 0 && lv.items.length > 60);
  }

  // ── 1.2 мультивыделение: Shift+клик, групповое перемещение стен ──
  await mode('plan');
  await page.keyboard.press('Home');
  await page.waitForTimeout(200);
  let l0 = await L();
  const wallAt = (lv, ax, ay, bx, by) => lv.walls.find((w) => w.a.x === ax && w.a.y === ay && w.b.x === bx && w.b.y === by);
  const wA = wallAt(l0, 9000, 0, 9000, 3900); // rightT
  const wB = wallAt(l0, 9000, 3900, 9000, 5700); // rightM
  const wC = wallAt(l0, 9000, 5700, 9000, 6800); // rightB
  await clickWorld(page, 9000, 1200);
  await shiftClick(9000, 4800);
  await shiftClick(9000, 6300);
  u = await ui();
  check('1.2 Shift+клик: выбраны три стены', u.multi.length === 3 && u.multi.every((m) => m.type === 'wall') && [wA, wB, wC].every((w) => u.multi.some((m) => m.id === w.id)), `${u.multi.length}`);
  check('1.2 в строке состояния — счётчик выделенного', (await page.getAttribute('.statusbar [data-count]', 'data-count')) === '3');
  check('1.2 панель свойств показывает группу с общими полями', (await count('[data-group-props="3"]')) === 1 && /Товщина/.test(await page.textContent('[data-group-props]')));
  await page.screenshot({ path: path.join(out, '21-multi-walls.png') });
  await dragWorld(page, 9000, 1200, 9600, 1200);
  let l1 = await L();
  const g = (id) => l1.walls.find((w) => w.id === id);
  check('1.2 три стены сдвинулись вместе на 600 мм', [wA, wB, wC].every((w) => g(w.id).a.x === 9600 && g(w.id).b.x === 9600 && g(w.id).a.y === w.a.y), JSON.stringify([wA, wB, wC].map((w) => g(w.id).a)));
  const pulled = l1.walls.filter((w) => !([wA.id, wB.id, wC.id].includes(w.id)) && (w.a.x === 9600 || w.b.x === 9600)).length;
  check('1.2 примыкающие стены потянулись за узлами (верх, низ, перегородки)', pulled === 4, `${pulled}`);
  check('1.2 помещения сохранились', l1.rooms.length === 6);
  s = await state(page);
  check('1.2 групповое перемещение — одна запись undo', s.past === 1, String(s.past));
  await page.keyboard.press('Control+KeyZ');
  l1 = await L();
  check('1.2 undo возвращает все три стены', [wA, wB, wC].every((w) => g(w.id).a.x === 9000));
  await shiftClick(9000, 4800);
  u = await ui();
  check('1.2 Shift+клик по выделенному убирает его из группы', u.multi.length === 2 && !u.multi.some((m) => m.id === wB.id));
  // общие поля группы: статус
  const st = page.locator('[data-group-props] label.field', { hasText: 'Статус' }).locator('select');
  await st.selectOption('new');
  l1 = await L();
  check('1.2 общее поле группы меняет все выделенные стены', g(wA.id).status === 'new' && g(wC.id).status === 'new' && g(wB.id).status === 'existing');
  await page.keyboard.press('Control+KeyZ');

  // ── 1.2 рамка выделения и Ctrl+A ──
  await mode('furniture');
  l0 = await L();
  const furnBoxes = await page.evaluate(() => {
    const l = window.__hb.useProject.getState().project.levels[0];
    return [...document.querySelectorAll('.editor2d [data-t="item"]')].filter((g) => getComputedStyle(g).pointerEvents !== 'none').map((g) => { const it = l.items.find((i) => i.id === g.dataset.id); return { id: it.id, x: it.x, y: it.y }; });
  });
  const rect = { x1: 4600, y1: -500, x2: 9150, y2: 3780 }; // спальня (правая верхняя комната)
  await dragWorld(page, rect.x1, rect.y1, rect.x2, rect.y2);
  u = await ui();
  const winN = u.multi.length;
  check('1.2 рамка слева направо выделяет объекты целиком внутри', winN >= 3 && u.multi.every((m) => m.type === 'item'), String(winN));
  const centersIn = furnBoxes.filter((b) => b.x > rect.x1 && b.x < rect.x2 && b.y > rect.y1 && b.y < rect.y2).length;
  check('1.2 рамка берёт только активный слой (мебель), без стен и сетей', winN <= centersIn, `${winN} ≤ ${centersIn}`);
  await page.keyboard.press('Escape');
  // справа налево, узкая полоса через середину комнаты: целиком внутри почти никого, пересечённых — больше
  await dragWorld(page, 9150, 1900, 4600, 2000);
  const crossN = (await ui()).multi.length;
  await page.keyboard.press('Escape');
  await dragWorld(page, 4600, 1900, 9150, 2000);
  const winN2 = (await ui()).multi.length;
  check('1.2 рамка справа налево выделяет пересечённые (больше, чем «целиком внутри»)', crossN > winN2 && crossN >= 1, `${crossN} > ${winN2}`);
  await page.keyboard.press('Control+KeyA');
  u = await ui();
  check('1.2 Ctrl+A выделяет всю мебель текущего режима', u.multi.length === furnBoxes.length && u.multi.length > 20, `${u.multi.length} = ${furnBoxes.length}`);
  await page.keyboard.press('ArrowRight');
  l1 = await L();
  check('1.2 стрелка сдвигает всю группу на шаг сетки', furnBoxes.every((b) => l1.items.find((i) => i.id === b.id).x === b.x + 100));
  await page.keyboard.press('Control+KeyZ');
  await page.keyboard.press('Escape');

  // выравнивание и распределение трёх объектов
  const chairs = l0.items.filter((i) => i.kind === 'chair').slice(0, 3);
  await page.evaluate((ids) => { const u2 = window.__hb.useUi.getState(); u2.selectMany(ids.map((id) => ({ type: 'item', id, scope: u2.activeLevelId }))); }, chairs.map((c) => c.id));
  check('1.2 панель группы: кнопки выравнивания и распределения', (await count('[data-align] button')) === 6 && (await count('[data-distribute]')) === 2);
  await page.click('[data-align="top"]');
  l1 = await L();
  const tops = await page.evaluate((ids) => { const l = window.__hb.useProject.getState().project.levels[0]; return ids.map((id) => { const g2 = document.querySelector(`.editor2d [data-t="item"][data-id="${id}"]`).getBoundingClientRect(); return Math.round(g2.top); }); }, chairs.map((c) => c.id));
  check('1.2 «по верхнему краю» выравнивает объекты', Math.max(...tops) - Math.min(...tops) <= 2, JSON.stringify(tops));
  await page.keyboard.press('Control+KeyZ');
  await page.keyboard.press('Control+KeyD');
  const lD = await L();
  check('1.2 Ctrl+D дублирует группу', lD.items.length === l0.items.length + 3 && (await ui()).multi.length === 3);
  await page.keyboard.press('Delete');
  check('1.2 Delete удаляет группу', (await L()).items.length === l0.items.length && (await ui()).multi.length === 0);

  // перемещение мебели: направляющие выравнивания по соседям
  const pair = await page.evaluate(() => {
    const l = window.__hb.useProject.getState().project.levels[0];
    const bed = l.items.find((i) => i.kind.startsWith('bed'));
    const ns = l.items.filter((i) => i.kind === 'nightstand');
    return { bed, ns };
  });
  if (pair.ns.length) {
    const n = pair.ns[0];
    const a = await toScreen(page, n.x, n.y);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    const b = await toScreen(page, n.x + 30, n.y + 400);
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    const guides = await count('.editor2d [data-ind="align"]');
    await page.mouse.up();
    await page.keyboard.press('Control+KeyZ');
    check('1.1 при перемещении мебели видны направляющие выравнивания по соседям', guides >= 1, String(guides));
  }

  // ── 1.1 индикаторы при рисовании стен: 90°, ∥, угол у курсора ──
  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('[data-kind="apartment"]');
  await page.click('[data-action="create"]');
  await page.waitForTimeout(400);
  check('новый проект открывается в режиме «План»', (await ui()).mode === 'plan');
  await page.keyboard.press('KeyW');
  await dismiss();
  await clickWorld(page, 0, 0);
  await clickWorld(page, 4000, 0);
  await moveWorld(page, 4000, 2000);
  check('1.1 рисование стены: значок прямого угла при 90°', (await count('.editor2d [data-ind="right"]')) === 1);
  const ang = await page.textContent('.editor2d [data-ind="angle"]');
  check('1.1 угол в градусах рядом с курсором', /90°/.test(ang), ang);
  await page.screenshot({ path: path.join(out, '22-right-angle.png') });
  await moveWorld(page, 5000, 1000);
  check('1.1 при 45° значка прямого угла нет', (await count('.editor2d [data-ind="right"]')) === 0 && /45°/.test(await page.textContent('.editor2d [data-ind="angle"]')));
  await clickWorld(page, 4000, 3000);
  await moveWorld(page, 1000, 3000);
  check('1.1 рисование стены: метка «∥» и подсветка параллельной стены', (await count('.editor2d [data-ind="parallel"]')) === 1 && /∥/.test(await page.textContent('.editor2d [data-ind="parallel-mark"]')));
  check('1.1 пунктирные направляющие продолжения осей', (await count('.editor2d [data-ind="axis"]')) + (await count('.editor2d [data-ind="guide"]')) >= 1);
  await page.screenshot({ path: path.join(out, '23-parallel.png') });
  await clickWorld(page, 0, 3000);
  await clickWorld(page, 0, 0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  s = await state(page);
  check('1.1 нарисована коробка 4000×3000', s.walls === 4 && s.rooms.length === 1, JSON.stringify(s.rooms));
  let lv0;
  // постоянная подсветка для выбранной стены
  await clickWorld(page, 2000, 0);
  check('1.1 выбранная стена: постоянные значки 90° с соседями и ∥', (await count('.editor2d [data-ind="right"]')) === 2 && (await count('.editor2d [data-ind="parallel"]')) === 1);
  // перемещение стены: индикаторы сохраняются
  const a = await toScreen(page, 1000, 0);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const b = await toScreen(page, 1000, 500);
  await page.mouse.move(b.x, b.y, { steps: 6 });
  const movingMarks = (await count('.editor2d [data-ind="right"]')) + (await count('.editor2d [data-ind="parallel"]'));
  await page.mouse.up();
  check('1.1 индикаторы видны и при перемещении стены', movingMarks >= 2, String(movingMarks));
  lv0 = await L();
  check('1.1 стена сдвинулась перпендикулярно себе, соседние стены укоротились', lv0.walls.filter((w) => w.a.y === 500 || w.b.y === 500).length === 3 && lv0.walls.every((w) => !w.arc));
  await page.keyboard.press('Control+KeyZ');
  await page.keyboard.press('Escape');

  // ── 1.3 дуговая стена: инструмент, ручка, помещение, 3D ──
  await page.keyboard.press('KeyA');
  await dismiss();
  check('1.3 инструмент «Дугова стіна» включается клавишей A', (await ui()).tool === 'arc');
  await clickWorld(page, 4000, 0);
  await clickWorld(page, 4000, 3000);
  await moveWorld(page, 4800, 1500);
  await clickWorld(page, 4800, 1500);
  let lv = await L();
  const arcW = lv.walls.find((w) => w.arc);
  check('1.3 дуговая стена создана: стрела 800 мм', !!arcW && Math.abs(Math.abs(arcW.arc) - 800) <= 10, JSON.stringify(arcW && arcW.arc));
  check('1.3 дуга образует новое помещение (сегмент между прямой и дугой)', lv.rooms.length === 2, lv.rooms.map((r) => r.area).join(', '));
  await page.keyboard.press('Escape');
  await clickWorld(page, 4800, 1500);
  check('1.3 дуговая стена выделяется кликом по дуге', (await ui()).sel?.id === arcW.id);
  // ручка стрелы дуги вынесена в сторону от оси стены — берём её положение из DOM
  const hb = await page.locator('.editor2d [data-h="wm"]').boundingBox();
  const hx = hb.x + hb.width / 2, hy = hb.y + hb.height / 2;
  const dpx = (await toScreen(page, 400, 0)).x - (await toScreen(page, 0, 0)).x;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + dpx / 2, hy, { steps: 4 });
  await page.mouse.move(hx + dpx, hy, { steps: 4 });
  await page.mouse.up();
  lv = await L();
  check('1.3 ручка в середине меняет стрелу дуги', Math.abs(Math.abs(lv.walls.find((w) => w.id === arcW.id).arc) - 1200) <= 10, String(lv.walls.find((w) => w.id === arcW.id).arc));
  const arcField = page.locator('.right-panel label.field', { hasText: 'Стріла дуги' }).locator('input');
  check('1.3 стрела дуги редактируется в свойствах', (await arcField.count()) === 1);
  await page.screenshot({ path: path.join(out, '24-arc-wall.png') });
  await page.click('[data-view="split"]');
  await page.waitForSelector('.view3d canvas');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, '25-arc-3d.png') });
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Home');
  await page.waitForTimeout(200);
  // правый клик → выпрямить
  const ap = await toScreen(page, 5200, 1500);
  await page.mouse.click(ap.x, ap.y, { button: 'right' });
  await page.click('.ctx-menu >> text=Випрямити');
  lv = await L();
  check('1.3 контекстное меню: «Випрямити» убирает дугу', !lv.walls.find((w) => w.id === arcW.id).arc);

  // ── 3.6 рулетка в 2D ──
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyT');
  await dismiss();
  await clickWorld(page, 0, 0);
  await moveWorld(page, 4000, 3000);
  const label = await page.textContent('.editor2d [data-measure-label]');
  check('рулетка: расстояние между двумя точками (диагональ 5000 мм)', /5000 мм/.test(label) && /ΔX 4000/.test(label), label);
  await clickWorld(page, 4000, 3000);
  check('рулетка не создаёт объектов модели', (await state(page)).dims === 0);
  await page.screenshot({ path: path.join(out, '26-measure.png') });

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
