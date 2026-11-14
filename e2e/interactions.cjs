// Редактирование мышью и клавиатурой: узлы, ручки, контекстное меню, проёмы, вершины, дублирование.
const { launch, clickWorld, dragWorld, toScreen, state, check } = require('./helpers.cjs');

(async () => {
  const { browser, page, errors } = await launch();
  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('text=Відкрити демо-квартиру');
  await page.waitForTimeout(600);
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Home'); // вписать план в окно 2D
  await page.waitForTimeout(200);
  const h = await page.$('.hint-card button');
  if (h) await h.click();
  const P = () => page.evaluate(() => window.__hb.useProject.getState().project.levels[0]);
  const sel = () => page.evaluate(() => window.__hb.useUi.getState().selection);
  const mode = (m) => page.click(`.left-panel [data-tab="${m}"]`);
  const rightClick = async (x, y) => { const p = await toScreen(page, x, y); await page.mouse.click(p.x, p.y, { button: 'right' }); };

  // мебель: перетаскивание, поворот клавишами, сдвиг стрелками, дублирование, удаление
  await mode('furniture');
  let l = await P();
  const sofa0 = l.items.find((i) => i.kind === 'sofa');
  await dragWorld(page, sofa0.x, sofa0.y, sofa0.x + 600, sofa0.y + 700);
  l = await P();
  let sofa = l.items.find((i) => i.id === sofa0.id);
  check('перетаскивание мебели', Math.abs(sofa.x - sofa0.x - 600) < 60 && Math.abs(sofa.y - sofa0.y - 700) < 60, `${sofa.x},${sofa.y}`);
  await page.keyboard.press('KeyE');
  l = await P();
  check('поворот клавишей E на 90°', l.items.find((i) => i.id === sofa0.id).rot === (sofa.rot + 90) % 360);
  await page.keyboard.press('ArrowRight');
  l = await P();
  check('сдвиг стрелкой на шаг сетки', l.items.find((i) => i.id === sofa0.id).x === sofa.x + 100);
  const n0 = l.items.length;
  await page.keyboard.press('Control+KeyD');
  l = await P();
  check('Ctrl+D дублирует', l.items.length === n0 + 1 && (await sel()).id !== sofa0.id);
  await page.keyboard.press('Delete');
  l = await P();
  check('Delete удаляет выделенное', l.items.length === n0 && (await sel()) === null);
  // ручка поворота
  const tbl = l.items.find((i) => i.kind === 'table-dining');
  await clickWorld(page, tbl.x, tbl.y + 250);
  const k = await page.evaluate(() => { const svg = document.querySelector('.editor2d svg'); return 3.78 / (svg.getBoundingClientRect().width / Number(svg.getAttribute('viewBox').split(' ')[2])); });
  const hy = tbl.y + 350 + 6 * k; // ручка: спереди от объекта на 6 мм бумаги
  await dragWorld(page, tbl.x, hy, tbl.x + 900, tbl.y);
  l = await P();
  check('ручка поворота вращает объект', l.items.find((i) => i.id === tbl.id).rot === 270, String(l.items.find((i) => i.id === tbl.id).rot));

  // проём: перетаскивание вдоль стены
  await mode('plan');
  const win0 = l.openings.find((o) => o.kind === 'window' && o.width === 1800);
  await dragWorld(page, win0.pos, 0, win0.pos - 700, 20);
  l = await P();
  check('окно перетаскивается вдоль стены', Math.abs(l.openings.find((o) => o.id === win0.id).pos - (win0.pos - 700)) < 30);

  // контекстное меню стены: разделить
  const w0 = l.walls.length;
  await rightClick(8000, 0);
  await page.click('.ctx-menu >> text=Розділити стіну тут');
  l = await P();
  check('контекстное меню: разделить стену', l.walls.length === w0 + 1 && l.rooms.length === 6);
  // контекстное меню двери: сменить сторону открывания
  const door = l.openings.find((o) => o.kind === 'door' && o.style === 'single');
  const dw = l.walls.find((w) => w.id === door.wallId);
  const dx = dw.a.x + ((dw.b.x - dw.a.x) * door.pos) / Math.hypot(dw.b.x - dw.a.x, dw.b.y - dw.a.y);
  const dy = dw.a.y + ((dw.b.y - dw.a.y) * door.pos) / Math.hypot(dw.b.x - dw.a.x, dw.b.y - dw.a.y);
  await rightClick(dx, dy);
  await page.click('.ctx-menu >> text=Відкривати в інший бік');
  l = await P();
  check('контекстное меню: дверь открывается в другую сторону', l.openings.find((o) => o.id === door.id).swing !== door.swing);

  // узел стены: перетаскивание ручки двигает все примыкающие стены
  const part = l.walls.find((w) => w.a.x === 3400 && w.a.y === 3900 && w.b.y === 6800);
  await clickWorld(page, 3400, 5800);
  check('стена выделена', (await sel())?.id === part.id);
  await dragWorld(page, 3400, 6800, 3000, 6800);
  l = await P();
  const moved = l.walls.filter((w) => (w.a.x === 3000 && w.a.y === 6800) || (w.b.x === 3000 && w.b.y === 6800)).length;
  check('ручка узла двигает все примыкающие стены', moved === 3, `${moved} концов`);
  const kitchen = l.rooms.find((r) => r.type === 'kitchen');
  check('помещения сохраняют названия после правки стен', !!kitchen && kitchen.name === 'Кухня' && l.rooms.length === 6, `${kitchen?.area} м²`);
  await page.keyboard.press('Control+KeyZ');
  l = await P();
  check('undo возвращает узел (одна запись на жест)', l.walls.some((w) => w.b.x === 3400 && w.b.y === 6800));

  // трасса: выделение и вставка вершины двойным кликом (участок, где рядом нет других трасс)
  await mode('water');
  const cable = l.routes.find((r) => r.kind === 'pl-sewer');
  const last = cable.points[cable.points.length - 1];
  const prev = cable.points[cable.points.length - 2];
  const mid = { x: (last.x + prev.x) / 2, y: (last.y + prev.y) / 2 };
  await clickWorld(page, mid.x, mid.y);
  check('трасса выделяется кликом по линии', (await sel())?.id === cable.id);
  const sp = await toScreen(page, mid.x, mid.y);
  await page.mouse.dblclick(sp.x, sp.y);
  l = await P();
  check('двойной клик по трассе вставляет вершину', l.routes.find((r) => r.id === cable.id).points.length === cable.points.length + 1);
  // перетаскивание вершины за ручку
  await dragWorld(page, mid.x, mid.y, mid.x + 300, mid.y);
  l = await P();
  const pts = l.routes.find((r) => r.id === cable.id).points;
  check('вершина трассы перетаскивается за ручку', pts.some((q) => Math.abs(q.x - (mid.x + 300)) < 30 && Math.abs(q.y - mid.y) < 30), JSON.stringify(pts));

  // двойной клик по изделию из конструктора открывает конструктор
  await mode('furniture');
  const cab = l.items.find((i) => i.kind === 'cabinet');
  const cp = await toScreen(page, cab.x, cab.y);
  await page.mouse.dblclick(cp.x, cp.y);
  await page.waitForTimeout(400);
  const opened = await page.$('.dialog.full .cab');
  check('двойной клик по изделию открывает конструктор', !!opened);
  await page.click('.dialog.full footer >> text=Закрити');

  // помещение: переименование
  await mode('plan');
  const hall = l.rooms.find((r) => r.type === 'hall');
  await clickWorld(page, hall.seed.x, hall.seed.y);
  const name = page.locator('.right-panel label.field', { hasText: 'Назва' }).locator('input');
  await name.fill('Хол');
  await name.press('Enter');
  l = await P();
  check('переименование помещения', l.rooms.find((r) => r.id === hall.id).name === 'Хол');

  // точный ввод: длина стены
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const wc = l.walls.find((w) => w.thickness === 100);
  await clickWorld(page, (wc.a.x + wc.b.x) / 2, wc.a.y);
  const len = page.locator('.right-panel label.field', { hasText: 'Довжина (по осі)' }).locator('input');
  await len.fill('1800');
  await len.press('Enter');
  l = await P();
  const w2 = l.walls.find((w) => w.id === wc.id);
  check('точный ввод длины стены в свойствах', Math.abs(Math.hypot(w2.b.x - w2.a.x, w2.b.y - w2.a.y) - 1800) < 1);

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
