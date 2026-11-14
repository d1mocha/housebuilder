// Этап 1: новый проект, стены с точной длиной, проёмы, перетаскивание, undo/redo, подложка, 3D-прогулка, экспорт.
const { launch, clickWorld, moveWorld, dragWorld, state, check } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const { browser, page, errors } = await launch();
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });
  let s = await state(page);
  check('демо-проект загружен при первом запуске', s.rooms.length === 6 && s.items > 40, JSON.stringify(s.rooms.map((r) => r.area)));

  // новый проект: квартира
  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('[data-kind="apartment"]');
  await page.click('[data-action="create"]');
  await page.waitForTimeout(400);
  s = await state(page);
  check('создан пустой проект-квартира', s.walls === 0 && s.kind === 'apartment');
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);

  // стены: первая точка кликом, длина с клавиатуры
  await page.keyboard.press('KeyW');
  const hint = await page.$('[data-hint="wall"]');
  check('подсказка при первом использовании инструмента', !!hint);
  if (hint) await page.click('[data-hint="wall"] button');
  await clickWorld(page, 0, 0);
  await moveWorld(page, 3000, 30);
  await page.keyboard.type('5000');
  await page.keyboard.press('Enter');
  await moveWorld(page, 5020, 2000);
  await page.keyboard.type('4000');
  await page.keyboard.press('Enter');
  await moveWorld(page, 2000, 4010);
  await page.keyboard.type('5000');
  await page.keyboard.press('Enter');
  await moveWorld(page, 10, 1000);
  await clickWorld(page, 0, 0); // замыкание на первый узел
  await page.waitForTimeout(200);
  s = await state(page);
  check('4 стены нарисованы с точной длиной', s.walls === 4);
  const expected = ((5000 - 120) * (4000 - 120)) / 1e6;
  check('помещение найдено, площадь по внутреннему контуру', s.rooms.length === 1 && Math.abs(s.rooms[0].area - expected) < 0.02, `${s.rooms[0]?.area} ≈ ${expected.toFixed(2)}`);

  // перегородка с привязкой к осям стен
  await clickWorld(page, 2000, 0);
  await clickWorld(page, 2000, 4000);
  await page.keyboard.press('Escape');
  s = await state(page);
  check('перегородка делит помещение на два', s.rooms.length === 2, JSON.stringify(s.rooms));

  // дверь и окно
  await page.keyboard.press('KeyD');
  await moveWorld(page, 2030, 2000);
  await clickWorld(page, 2030, 2000);
  await page.keyboard.press('KeyN');
  await moveWorld(page, 3500, 20);
  await clickWorld(page, 3500, 20);
  s = await state(page);
  check('дверь и окно добавлены', s.openings === 2);

  // undo / redo
  await page.keyboard.press('Control+KeyZ');
  s = await state(page);
  check('undo убирает окно', s.openings === 1);
  await page.keyboard.press('Control+KeyY');
  s = await state(page);
  check('redo возвращает окно', s.openings === 2);

  // перетаскивание стены (правая стена на 1000 мм вправо)
  await page.keyboard.press('KeyV');
  await page.keyboard.press('Escape');
  await dragWorld(page, 5000, 3000, 6000, 3000);
  s = await state(page);
  const exp2 = ((6000 - 2000 - 120) * (4000 - 120)) / 1e6;
  const big = Math.max(...s.rooms.map((r) => r.area));
  check('перетаскивание стены меняет площадь помещения', Math.abs(big - exp2) < 0.05, `${big} ≈ ${exp2.toFixed(2)}`);

  // мебель из библиотеки
  await page.click('[data-tab="furniture"]');
  await page.click('text=Диван прямий');
  await moveWorld(page, 4000, 300);
  await clickWorld(page, 4000, 300);
  s = await state(page);
  check('мебель поставлена и выделена', s.items === 1 && s.sel?.type === 'item');
  const it = await page.evaluate(() => window.__hb.useProject.getState().project.levels[0].items[0]);
  check('диван прилип спинкой к стене', Math.abs(it.y - (60 + 475)) < 2 && it.rot === 0, JSON.stringify({ y: it.y, rot: it.rot }));

  // размерная линия
  await page.keyboard.press('KeyM');
  await clickWorld(page, 2060, 60);
  await clickWorld(page, 5940, 60);
  await clickWorld(page, 4000, 900);
  s = await state(page);
  check('размерная линия создана', s.dims === 1);

  // подложка + калибровка
  await page.keyboard.press('KeyV');
  await page.keyboard.press('Escape');
  const png = path.join(out, 'underlay.png');
  await page.screenshot({ path: png, clip: { x: 300, y: 100, width: 400, height: 300 } });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Завантажити зображення…')]);
  await chooser.setFiles(png);
  await page.waitForTimeout(600);
  s = await state(page);
  check('подложка загружена', !!s.underlay, JSON.stringify(s.underlay));
  const before = s.underlay.scale;
  await page.click('text=Калібрувати масштаб за розміром');
  await clickWorld(page, 1000, 1000);
  await clickWorld(page, 3000, 1000);
  await page.fill('.float-card input', '4000');
  await page.click('.float-card button.primary');
  await page.waitForTimeout(200);
  s = await state(page);
  check('калибровка масштаба: 2000 мм → 4000 мм удваивает масштаб', Math.abs(s.underlay.scale / before - 2) < 0.01, `${before} → ${s.underlay.scale}`);
  await page.screenshot({ path: path.join(out, '02-plan.png') });

  // 3D и прогулка
  await page.click('[data-view="3d"]');
  await page.waitForSelector('.view3d canvas');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, '03-3d.png') });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(800);
  const cam0 = await page.evaluate(() => window.__hbCam && window.__hbCam());
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  const cam1 = await page.evaluate(() => window.__hbCam && window.__hbCam());
  check('прогулка: высота глаз 1,6 м', cam0 && Math.abs(cam0.y - 1.6) < 0.01, JSON.stringify(cam0));
  check('прогулка: W двигает камеру', cam0 && cam1 && Math.hypot(cam1.x - cam0.x, cam1.z - cam0.z) > 0.3, JSON.stringify(cam1));
  // идём в стену долго — коллизия не выпускает наружу
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(4000);
  await page.keyboard.up('KeyW');
  const cam2 = await page.evaluate(() => window.__hbCam && window.__hbCam());
  check('прогулка: стены непроходимы', cam2 && cam2.x > 0.06 && cam2.x < 5.94 && cam2.z > 0.06 && cam2.z < 3.94, JSON.stringify(cam2));
  await page.screenshot({ path: path.join(out, '04-walk.png') });
  await page.keyboard.press('KeyF');

  // экспорт
  for (const [kind, ext] of [['pdf', '.pdf'], ['dxf', '.dxf'], ['gltf', '.glb']]) {
    await page.click('[data-menu="export"]');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(`[data-export="${kind}"]`)]);
    const file = path.join(out, 'export' + ext);
    await dl.saveAs(file);
    const size = fs.statSync(file).size;
    const head = fs.readFileSync(file).subarray(0, 5).toString('latin1');
    const okHead = kind === 'pdf' ? head.startsWith('%PDF') : kind === 'gltf' ? head.startsWith('glTF') : head.includes('0');
    check(`экспорт ${kind.toUpperCase()}`, size > 1000 && okHead, `${size} байт`);
    await page.waitForTimeout(300);
  }

  // автосохранение и восстановление после перезагрузки
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.view3d canvas, .editor2d svg');
  await page.waitForTimeout(800);
  s = await state(page);
  check('проект восстановлен из IndexedDB после перезагрузки', s.walls === 5 && s.items === 1 && s.kind === 'apartment', JSON.stringify({ walls: s.walls, items: s.items }));

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
