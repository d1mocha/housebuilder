// Этап 3 (критерий MVP): шкаф-купе 2400×2600×600 из ЛДСП 18 с кромкой 2/0,4 → деталировка, раскрой, CSV, шаблон, план.
const { launch, clickWorld, state, check } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

(async () => {
  const { browser, page, errors } = await launch();
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });
  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('text=Відкрити демо-квартиру');
  await page.waitForTimeout(600);
  const hint = await page.$('.hint-card button');
  if (hint) await hint.click();

  await page.click('.topbar >> text=Конструктор меблів');
  await page.waitForSelector('.dialog.full');
  await page.selectOption('[data-select="design"]', '');
  await page.click('[data-template="wardrobe-sliding"]');
  await page.waitForSelector('.cab');
  const d = await page.evaluate(() => { const p = window.__hb.useProject.getState().project; const c = p.cabinets[p.cabinets.length - 1]; return { w: c.width, h: c.height, d: c.depth, body: c.bodyMaterialId, ef: c.edgeFront, eh: c.edgeHidden }; });
  check('шкаф-купе 2400×2600×600, ЛДСП 18, кромка 2/0,4', d.w === 2400 && d.h === 2600 && d.d === 600 && d.body === 'ldsp18' && d.ef === 'pvc2' && d.eh === 'pvc04', JSON.stringify(d));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, '07-cabinet-3d.png') });

  // деталировка
  await page.click('[data-cabtab="cut"]');
  const rows = await page.$$eval('[data-table="cutlist"] tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())));
  const side = rows.find((r) => r[1] === 'Боковина ліва');
  check('деталировка: боковина 2600×597 → пильный 2599,2×594,6', side && side[3] === '2600 × 597' && side[4] === '2599,2 × 594,6', side && side.slice(3, 5).join(' | '));
  const top = rows.find((r) => r[1] === 'Кришка');
  check('деталировка: крышка 2364×597 → пильный 2364×594,6', top && top[3] === '2364 × 597' && top[4] === '2364 × 594,6', top && top.slice(3, 5).join(' | '));
  await page.screenshot({ path: path.join(out, '08-cabinet-cutlist.png') });

  // правка кромки одной стороны детали меняет пильный размер
  const sideRow = page.locator('[data-table="cutlist"] tbody tr', { hasText: 'Боковина ліва' });
  await sideRow.locator('td.edge-sel select').nth(0).selectOption('pvc04');
  await page.waitForTimeout(200);
  const rows2 = await page.$$eval('[data-table="cutlist"] tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())));
  const side2 = rows2.find((r) => r[1] === 'Боковина ліва');
  check('кромка по сторонам детали: 2 мм → 0,4 мм на L1 даёт ширину 596,2', side2 && side2[4] === '2599,2 × 596,2', side2 && side2[4]);

  // CSV деталировки
  const dl = async (action, file) => {
    const [d2] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(`[data-action="${action}"]`)]);
    const f = path.join(out, file);
    await d2.saveAs(f);
    return fs.readFileSync(f, 'utf8');
  };
  const csv = await dl('csv-cutlist', 'cutlist.csv');
  check('CSV деталировки: BOM, разделитель «;», боковина с пильным размером', csv.charCodeAt(0) === 0xfeff && /Боковина права;ЛДСП 18 мм;18;2600;597;2599,2;594,6;1;2;0,4;0,4;0,4/.test(csv), csv.split('\r\n')[1]);

  // раскрой
  await page.click('[data-cabtab="nest"]');
  await page.waitForSelector('.sheet-card svg');
  const sheets = await page.$$eval('[data-nest="ldsp18"] .sheet-card', (els) => els.length);
  const rects = await page.$$eval('[data-nest="ldsp18"] .sheet-card svg g rect', (els) => els.length);
  check('карта раскроя ЛДСП 18 на листы 2800×2070', sheets >= 3 && sheets <= 5 && rects > 20, `${sheets} листов, ${rects} деталей`);
  await page.screenshot({ path: path.join(out, '09-cabinet-nesting.png') });
  const csvN = await dl('csv-nesting', 'nesting.csv');
  check('CSV раскроя', csvN.split('\r\n').length > 20 && /ЛДСП 18 мм;1;/.test(csvN));

  // фурнитура
  await page.click('[data-cabtab="hw"]');
  const hw = await page.$$eval('[data-table="hardware"] tbody tr', (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ')));
  check('спецификация фурнитуры: купе, направляющие, конфирматы', hw.some((r) => /Двері-купе/.test(r)) && hw.some((r) => /Напрямні кулькові 450/.test(r)) && hw.some((r) => /Конфірмат/.test(r)), hw.join(' | ').slice(0, 200));
  const csvH = await dl('csv-hardware', 'hardware.csv');
  check('CSV фурнитуры', /Конфірмат 7×50;/.test(csvH));

  // параметричность: меняем ширину → пересчёт
  const wInput = page.locator('.cab-side label.field', { hasText: 'Ширина' }).first().locator('input');
  await wInput.fill('2000');
  await wInput.press('Enter');
  await page.click('[data-cabtab="cut"]');
  const rows3 = await page.$$eval('[data-table="cutlist"] tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())));
  const top3 = rows3.find((r) => r[1] === 'Кришка');
  check('параметрическое изменение ширины пересчитывает детали', top3 && top3[3] === '1964 × 597', top3 && top3[3]);

  // шаблон
  await page.click('[data-action="save-template"]');
  await page.waitForTimeout(500);
  await page.selectOption('[data-select="design"]', '');
  const hasTpl = await page.$('[data-user-template]');
  check('изделие сохранено как пользовательский шаблон', !!hasTpl);
  await page.click('[data-user-template] button.primary');
  await page.waitForSelector('.cab');
  const cabCount = await page.evaluate(() => window.__hb.useProject.getState().project.cabinets.length);
  check('из шаблона создано новое изделие', cabCount === 3, String(cabCount));

  // на план
  await page.click('[data-action="place"]');
  await page.waitForTimeout(300);
  let s = await state(page);
  check('инструмент размещения изделия активен', s.tool === 'item');
  const before = s.items;
  await clickWorld(page, 2300, 3300);
  s = await state(page);
  const placed = await page.evaluate(() => { const l = window.__hb.useProject.getState().project.levels[0]; return l.items[l.items.length - 1]; });
  check('изделие поставлено на план спинкой к стене', s.items === before + 1 && placed.kind === 'cabinet' && placed.params.w === 2000 && placed.rot === 180, JSON.stringify({ rot: placed.rot, y: placed.y, w: placed.params.w }));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(out, '10-cabinet-on-plan.png') });

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
