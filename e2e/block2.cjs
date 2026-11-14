// Блок 2 (итерация 2): материалы — библиотека CC0-текстур, параметры для расчёта, «товар из магазина»,
// смета по материалам. Сценарий приёмки: ламинат из библиотеки и обои по ссылке на товар с ценой
// кладутся в спальню и видны в 3D и в смете.
const { launch, clickWorld, state, check } = require('./helpers.cjs');
const path = require('path');
const fs = require('fs');

(async () => {
  const { browser, page, errors } = await launch();
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });
  const P = () => page.evaluate(() => window.__hb.useProject.getState().project);
  const SHOP = 'https://shop.example.com/shpalery/damask-12345';
  // приложение не должно обращаться к сайту магазина: только хранит ссылку
  const external = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });

  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('text=Відкрити демо-квартиру');
  await page.waitForTimeout(600);
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);
  await page.keyboard.press('Home');
  const h = await page.$('.hint-card button.primary');
  if (h) await h.click();

  // библиотека текстур раздаётся локально
  const texOk = await page.evaluate(async () => {
    const ids = ['wallpaper-damask', 'wood-walnut', 'linoleum-brown', 'stone-marble-grey', 'plaster-stucco'];
    const res = await Promise.all(ids.flatMap((id) => [fetch(`textures/${id}.jpg`), fetch(`textures/${id}_n.jpg`)]));
    return res.every((r) => r.ok && (r.headers.get('content-type') || '').includes('image'));
  });
  check('2.1 текстуры библиотеки лежат в репозитории и отдаются локально', texOk);

  // спальня
  let p = await P();
  const bed = p.levels[0].rooms.find((r) => r.type === 'bedroom');
  await clickWorld(page, bed.seed.x, bed.seed.y);
  let s = await state(page);
  check('спальня выделена', s.sel?.type === 'room' && s.sel.id === bed.id);
  await page.click('[data-action="materials"]');
  await page.waitForSelector('[data-dialog="materials"]');
  const nFin = await page.locator('[data-finish]').count();
  check('2.2 каталог материалов: обои нескольких стилей, ламинат разных пород, линолеум, керамогранит, камень', nFin >= 40 && (await page.locator('[data-finish^="wallpaper"]').count()) >= 5 && (await page.locator('[data-finish^="laminate"]').count()) >= 5 && (await page.locator('[data-finish^="linoleum"]').count()) >= 3 && (await page.locator('[data-finish^="porcelain"]').count()) >= 3, String(nFin));

  // ── ламинат из библиотеки → пол спальни ──
  await page.click('[data-finish="laminate-walnut"]');
  const lamTxt = await page.textContent('[data-edit="laminate-walnut"]');
  check('2.2 модель материала: размер доски, класс, толщина, упаковка, цена за единицу', /Довжина дошки/.test(lamTxt) && /Ширина дошки/.test(lamTxt) && /Клас/.test(lamTxt) && /Товщина/.test(lamTxt) && /В упаковці/.test(lamTxt) && /Ціна за одиницю/.test(lamTxt) && /Масштаб укладання/.test(lamTxt) && /Поворот укладання/.test(lamTxt));
  const price = page.locator('[data-edit] label.field', { hasText: 'Ціна за одиницю' }).locator('input');
  await price.fill('520');
  await price.press('Enter');
  await page.click('[data-apply="floor"]');
  p = await P();
  check('2 ламинат из библиотеки назначен полу спальни', p.levels[0].rooms.find((r) => r.id === bed.id).floorFinish === 'laminate-walnut');

  // ── обои: товар из магазина ──
  await page.selectOption('[data-shop-type]', 'wallpaper');
  await page.click('[data-action="add-shop"]');
  p = await P();
  const shopFin = p.finishes[p.finishes.length - 1];
  check('2.3 «товар из магазина» создаёт материал со ссылкой', shopFin.type === 'wallpaper' && shopFin.shopUrl === '');
  check('2.3 без ссылки кнопка «Відкрити в магазині» неактивна', await page.locator('button[data-action="open-shop"]').isDisabled());
  await page.fill('[data-field="shopUrl"]', SHOP);
  await page.fill('[data-field="name"]', 'Шпалери вінілові «Дамаск» (магазин)');
  const field = (label) => page.locator('[data-edit] label.field', { hasText: label }).locator('input');
  for (const [label, v] of [['Ширина рулону', '530'], ['Довжина рулону', '10050'], ['Рапорт малюнка', '640'], ['Ціна за одиницю', '850']]) {
    const f = field(label);
    await f.fill(v);
    await f.press('Enter');
  }
  await page.click('[data-texture="wallpaper-damask"]');
  const link = page.locator('a[data-action="open-shop"]');
  check('2.3 кнопка «Відкрити в магазині» ведёт на введённую ссылку в новой вкладке', (await link.getAttribute('href')) === SHOP && (await link.getAttribute('target')) === '_blank' && /noopener/.test(await link.getAttribute('rel')));
  await page.click('[data-apply="walls"]');
  p = await P();
  const fin = p.finishes.find((f) => f.id === shopFin.id);
  check('2.3 параметры и цена товара введены вручную и сохранены в материале', fin.shopUrl === SHOP && fin.rollW === 530 && fin.rollL === 10050 && fin.rapport === 640 && fin.price === 850 && fin.textureId === 'wallpaper-damask', JSON.stringify({ rollW: fin.rollW, rapport: fin.rapport, price: fin.price, tex: fin.textureId }));
  const lvl = p.levels[0];
  const bedWalls = lvl.walls.filter((w) => w.finishL === fin.id || w.finishR === fin.id).length;
  check('2 обои-товар назначены всем стенам спальни', bedWalls >= 4, String(bedWalls));
  await page.screenshot({ path: path.join(out, '30-materials-dialog.png') });
  // недопустимая ссылка не открывается
  await page.fill('[data-field="shopUrl"]', 'javascript:alert(1)');
  check('2.3 ссылка не http(s) не превращается в кнопку-ссылку', (await page.locator('a[data-action="open-shop"]').count()) === 0);
  await page.fill('[data-field="shopUrl"]', SHOP);
  await page.click('.dialog > header button');
  await page.waitForTimeout(200);

  // ── свойства помещения: расчёт ──
  await clickWorld(page, bed.seed.x, bed.seed.y);
  const rp = await page.textContent('.right-panel');
  const packs = await page.textContent('[data-calc="packs"]');
  const wp = await page.textContent('[data-calc="wallpaper"]');
  check('2.4 помещение: упаковки ламината с ценой', /уп\./.test(packs) && /Вартість/.test(packs), packs);
  // полотно: 2600 + 100 = 2700 → кратно раппорту 640 → 3200 мм; из рулона 10,05 м — 3 полотна
  check('2.4 помещение: рулоны обоев с учётом раппорта и высоты', /по 3,20? м/.test(wp) && /рапорт 640/.test(wp) && /з рулону — 3/.test(wp) && /рул\./.test(wp) && /Вартість/.test(wp), wp);
  check('свойства помещения показывают расчёт материалов', /Матеріали — розрахунок/.test(rp));

  // ── 3D: текстуры на полу и стенах спальни ──
  await page.click('[data-view="split"]');
  await page.waitForSelector('.view3d canvas');
  await page.waitForFunction(() => window.__hbMats && window.__hbMats().some((m) => m.finishId === 'laminate-walnut' && m.textured), null, { timeout: 20000 });
  await page.waitForFunction((id) => window.__hbMats().some((m) => m.finishId === id && m.textured && m.hasMap), fin.id, { timeout: 20000 });
  const mats = await page.evaluate(() => window.__hbMats());
  const floorMat = mats.find((m) => m.sel?.type === 'room' && m.sel.id === bed.id && m.finishId === 'laminate-walnut');
  check('2 в 3D пол спальни — ламинат с текстурой из библиотеки', !!floorMat && floorMat.textured && floorMat.hasMap && floorMat.textureId === 'wood-walnut', JSON.stringify(floorMat));
  const wallMats = mats.filter((m) => m.sel?.type === 'wall' && m.finishId === fin.id);
  check('2 в 3D стены спальни — обои-товар с текстурой', wallMats.length >= 4 && wallMats.every((m) => m.textured && m.hasMap), `${wallMats.length}`);
  await page.waitForFunction((id) => window.__hbMats().some((m) => m.finishId === id && m.hasNormal), fin.id, { timeout: 20000 });
  check('2.1 PBR: у текстуры есть карта нормалей', true);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, '31-materials-3d.png') });
  // прогулка в спальне — вид изнутри
  await page.click('[data-view="3d"]');
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, '32-materials-walk.png') });
  await page.keyboard.press('KeyF');
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);

  // ── смета ──
  await page.click('.topbar >> text=Кошторис');
  await page.waitForSelector('[data-table="estimate"]');
  const row = async (key) => {
    const tr = page.locator(`[data-table="estimate"] tr[data-line="${key}"]`);
    if (!(await tr.count())) return null;
    const tds = await tr.locator('td').allInnerTexts();
    return { tds, price: await tr.locator('input').inputValue(), src: await tr.locator('[data-price-src]').count(), link: await tr.locator('a[data-shop-link]').count(), href: (await tr.locator('a[data-shop-link]').count()) ? await tr.locator('a[data-shop-link]').getAttribute('href') : null };
  };
  const num = (t) => Number(String(t).replace(/\s/g, '').replace(',', '.'));
  const wr = await row(`wallpaper.${fin.id}`);
  check('2.4 смета: обои — в рулонах, цена из материала, ссылка на товар', !!wr && /рулон/.test(wr.tds[1]) && num(wr.price) === 850 && wr.src === 1 && wr.href === SHOP, JSON.stringify(wr));
  check('2.4 смета: примечание с раппортом и числом полотен из рулона', !!wr && /рапорт 640/.test(wr.tds[0]) && /3 полотен з рулону/.test(wr.tds[0]), wr && wr.tds[0]);
  check('2.4 смета: сумма по обоям = рулоны × цена', !!wr && num(wr.tds[5]) === num(wr.tds[3]) * 850 && num(wr.tds[3]) >= 4, wr && `${wr.tds[3]} × 850 = ${wr.tds[5]}`);
  const lr = await row('flooring.laminate-walnut.pack');
  check('2.4 смета: ламинат — в упаковках, цена упаковки = цена м² × площадь упаковки', !!lr && /уп\./.test(lr.tds[1]) && Math.abs(num(lr.price) - 520 * 1.73) < 0.01 && Number.isInteger(num(lr.tds[3])) && num(lr.tds[5]) > 0, JSON.stringify(lr));
  const total = num((await page.textContent('[data-total]')).replace(/[^\d,.\s]/g, ''));
  check('2.4 итог сметы включает материалы с ценами', total >= num(wr.tds[5]) + num(lr.tds[5]), String(total));
  await page.screenshot({ path: path.join(out, '33-materials-estimate.png') });
  await page.click('.dialog footer >> text=Закрити');

  // ── линолеум: метраж рулона ──
  const kitchen = p.levels[0].rooms.find((r) => r.type === 'kitchen');
  await clickWorld(page, kitchen.seed.x, kitchen.seed.y);
  await page.locator('.right-panel label.field', { hasText: 'Підлога' }).locator('select').selectOption('linoleum-brown');
  const lino = await page.textContent('[data-calc="linoleum"]');
  check('2.4 линолеум: полотна по ширине рулона и погонные метры', /Рулон 3 м/.test(lino) && /м\.п\./.test(lino) && /стиків/.test(lino), lino);
  await page.click('.topbar >> text=Кошторис');
  await page.waitForSelector('[data-table="estimate"]');
  const li = await row('flooring.linoleum-brown');
  check('2.4 смета: линолеум — погонные метры рулона', !!li && /погонні метри рулону 3 м/.test(li.tds[0]) && li.tds[1].trim() === 'м' && num(li.tds[3]) > 2, JSON.stringify(li && li.tds));
  await page.click('.dialog footer >> text=Закрити');

  // ── 2.5 конструктор: декоры ЛДСП как текстуры ──
  await page.click('.topbar >> text=Конструктор меблів');
  await page.waitForSelector('.dialog.full .cab canvas');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, '34-cabinet-decor.png') });
  await page.click('[data-cabtab="mat"]');
  const decorSel = page.locator('select[data-decor="ldsp18"]');
  check('2.5 каталог плит: у ЛДСП выбирается декор-текстура', (await decorSel.count()) === 1 && (await decorSel.inputValue()) === 'wood-oak-natural' && (await page.locator('select[data-decor]').count()) >= 8);
  await decorSel.selectOption('wood-walnut');
  const b18 = await page.evaluate(() => window.__hb.useProject.getState().project.cabinetCatalog.boards.find((b) => b.id === 'ldsp18'));
  check('2.5 смена декора меняет текстуру и цвет плиты, направление волокон включено', b18.textureId === 'wood-walnut' && b18.grain === true && b18.color === '#593413', JSON.stringify(b18));
  await page.click('[data-cabtab="preview"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(out, '35-cabinet-decor-walnut.png') });
  await page.click('.dialog.full footer >> text=Закрити');

  check('2.3 приложение не обращалось к сайту магазина и другим внешним адресам', external.length === 0, external.slice(0, 3).join(' | '));
  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
