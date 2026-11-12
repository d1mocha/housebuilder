// Этап 2: отделка (плитка, расчёт количества), параметры объектов библиотеки, импорт OBJ.
const { launch, clickWorld, state, check } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const { browser, page, errors } = await launch();
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });
  // демо-квартира
  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('text=Відкрити демо-квартиру');
  await page.waitForTimeout(600);
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);
  const hint = await page.$('.hint-card button');
  if (hint) await hint.click();

  // выделить помещение «Ванна кімната» кликом по подписи
  const seed = await page.evaluate(() => window.__hb.useProject.getState().project.levels[0].rooms.find((r) => r.type === 'bathroom').seed);
  await clickWorld(page, seed.x, seed.y);
  let s = await state(page);
  check('помещение выделяется кликом по подписи', s.sel?.type === 'room');
  const txt = await page.textContent('.right-panel');
  check('в свойствах — раскладка плитки пола и стен с количеством', /Підлога — розкладка/.test(txt) && /Стіни — розкладка/.test(txt) && /уп\./.test(txt), (txt.match(/Разом із запасом[^)]*\)/g) || []).join(' | '));

  // смена покрытия пола → плитка считается заново
  const floorSel = page.locator('.right-panel label.field', { hasText: 'Підлога' }).locator('select');
  await floorSel.selectOption('tile-floor-grey');
  const fin = await page.evaluate(() => window.__hb.useProject.getState().project.levels[0].rooms.find((r) => r.type === 'bathroom').floorFinish);
  check('покрытие пола меняется из панели свойств', fin === 'tile-floor-grey');

  // каталог отделки: добавить плитку
  await page.click('text=Каталог оздоблення…');
  const n0 = await page.evaluate(() => window.__hb.useProject.getState().project.finishes.length);
  await page.click('.dialog footer >> text=+ Плитка');
  const n1 = await page.evaluate(() => window.__hb.useProject.getState().project.finishes.length);
  check('каталог отделки редактируется (добавлена плитка)', n1 === n0 + 1);
  await page.screenshot({ path: path.join(out, '05-finishes.png') });
  await page.keyboard.press('Escape');

  // библиотека: количество объектов и параметры
  await page.click('[data-tab="library"]');
  const libCount = await page.locator('.left-panel .lib-item').count();
  check('в библиотеке не меньше 40 объектов', libCount >= 40, String(libCount));
  await page.click('text=Шафа розпашна');
  await clickWorld(page, 2600, 1200);
  s = await state(page);
  check('объект библиотеки поставлен', s.sel?.type === 'item');
  const wInput = page.locator('.right-panel label.field', { hasText: 'Ширина' }).locator('input');
  await wInput.fill('1500');
  await wInput.press('Enter');
  const w = await page.evaluate(() => { const st = window.__hb.useProject.getState().project.levels[0]; const sel = window.__hb.useUi.getState().selection; return st.items.find((i) => i.id === sel.id).params.w; });
  check('параметр объекта меняется точным вводом', w === 1500);

  // импорт OBJ
  const obj = path.join(out, 'cube.obj');
  fs.writeFileSync(obj, ['v 0 0 0', 'v 1 0 0', 'v 1 2 0', 'v 0 2 0', 'v 0 0 0.5', 'v 1 0 0.5', 'v 1 2 0.5', 'v 0 2 0.5', 'f 1 2 3 4', 'f 5 6 7 8', 'f 1 2 6 5', 'f 2 3 7 6', 'f 3 4 8 7', 'f 4 1 5 8'].join('\n'));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Імпорт моделі glTF / GLB / OBJ…')]);
  await chooser.setFiles(obj);
  await page.waitForTimeout(1200);
  const models = await page.evaluate(() => window.__hb.useProject.getState().project.models.map((m) => ({ name: m.name, bbox: m.bbox })));
  check('OBJ импортирован, габариты прочитаны', models.length === 1 && Math.abs(models[0].bbox.w - 1) < 1e-6 && Math.abs(models[0].bbox.h - 2) < 1e-6, JSON.stringify(models));
  await page.click('.left-panel >> text=cube');
  await clickWorld(page, 2300, 3000);
  const placed = await page.evaluate(() => window.__hb.useProject.getState().project.levels[0].items.find((i) => i.kind === 'model'));
  check('импортированная модель поставлена на план (метры → мм)', placed && placed.params.w === 1000 && placed.params.h === 2000, JSON.stringify(placed && placed.params));

  // 3D: отделка и модель отрисовываются без ошибок
  await page.click('[data-view="split"]');
  await page.waitForSelector('.view3d canvas');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '06-stage2.png') });
  const meshes = await page.evaluate(() => !!document.querySelector('.view3d canvas'));
  check('3D-вид отрисован', meshes);
  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
