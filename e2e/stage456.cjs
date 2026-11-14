// Этапы 4–6: инженерные слои и проверки, участок и ландшафт, чертежи и смета, переключение языка.
const { launch, clickWorld, moveWorld, state, check } = require('./helpers.cjs');
const fs = require('fs');
const path = require('path');

const issues = (page) => page.evaluate(() => [...document.querySelectorAll('.issues .issue')].map((e) => ({ cls: e.className, text: e.innerText.trim(), rule: e.title })));

(async () => {
  const { browser, page, errors } = await launch();
  const out = path.join(__dirname, '..', 'e2e-out');
  fs.mkdirSync(out, { recursive: true });
  const dismissHint = async () => { const h = await page.$('.hint-card button'); if (h) await h.click(); };
  const pickKind = async (name) => { await page.click(`.left-panel .lib-item:has-text("${name}")`); await dismissHint(); };

  // ───── Этап 4: демо-квартира ─────
  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('text=Відкрити демо-квартиру');
  await page.waitForTimeout(600);
  await page.click('[data-view="2d"]');
  await page.waitForTimeout(300);
  await dismissHint();
  await page.click('.right-panel [data-tab="issues"]');
  const base = await issues(page);
  check('демо без ошибок норм (только предупреждения/справки)', base.every((i) => !i.cls.includes('error')), `${base.length} записей`);

  await page.click('.left-panel [data-tab="electrical"]');
  // розетка в ванной у ванны (верхняя стена ванной y=4000, ванна x 7055..8755)
  await pickKind('Розетка');
  await clickWorld(page, 7400, 4030);
  await page.click('.right-panel [data-tab="issues"]');
  let list = await issues(page);
  check('розетка в запретной зоне ванной → предупреждения', list.some((i) => i.rule === 'el.bath.socketDistance') && list.some((i) => i.rule === 'el.bath.socketIp'), list.filter((i) => i.rule.startsWith('el.bath')).map((i) => i.text).join(' | ').slice(0, 160));
  // переход к объекту
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.click('.issues .issue[title="el.bath.socketDistance"]');
  let s = await state(page);
  check('клик по нарушению выделяет объект', s.sel?.type === 'item');
  await page.keyboard.press('Home'); // вернуть общий вид после перехода к объекту
  await page.waitForTimeout(200);

  // кабельная трасса
  await page.click('.left-panel [data-tab="electrical"]');
  await pickKind('Кабельна траса');
  const r0 = (await state(page)).routes;
  await clickWorld(page, 600, 600);
  await clickWorld(page, 600, 2600);
  await clickWorld(page, 2600, 2600);
  await page.keyboard.press('Enter');
  s = await state(page);
  check('кабельная трасса нарисована и выделена', s.routes === r0 + 1 && s.sel?.type === 'route');
  await page.click('.right-panel nav.tabs button:first-child');
  let props = await page.textContent('.right-panel');
  check('в свойствах трассы — длина и штроба', /Довжина в плані\s*4 м/.test(props.replace(/ /g, ' ')) && /Штроба/.test(props), (props.match(/Довжина в плані[^Ш]{0,12}/) || [''])[0]);

  // канализация с малым уклоном
  await page.click('.left-panel [data-tab="water"]');
  await pickKind('Каналізаційна труба');
  await clickWorld(page, 7300, 4800);
  await clickWorld(page, 8300, 4800);
  await page.keyboard.press('Enter');
  const slope = page.locator('.right-panel label.field', { hasText: 'Ухил' }).locator('input');
  await slope.fill('10');
  await slope.press('Enter');
  await page.click('.right-panel [data-tab="issues"]');
  list = await issues(page);
  check('уклон канализации меньше нормы → ошибка', list.some((i) => i.rule === 'pl.sewer.minSlope.50' && i.cls.includes('error')));

  // газ
  await page.click('.left-panel [data-tab="heating"]');
  const gasWarn = await page.textContent('.left-panel');
  check('газ: явное предупреждение об операторе ГРМ в палитре', /оператор ГРМ/.test(gasWarn));
  await pickKind('Точка підключення газового приладу');
  await clickWorld(page, 2450, 6600);
  await page.click('.right-panel [data-tab="issues"]');
  list = await issues(page);
  check('газ: предупреждение в панели норм и дистанция до электроточки', list.some((i) => i.rule === 'gas.disclaimer') && list.some((i) => i.rule === 'el.gas.socketDistance'));

  // тёплый пол
  await page.click('.left-panel [data-tab="heating"]');
  await pickKind('Тепла підлога');
  for (const [x, y] of [[4800, 300], [8700, 300], [8700, 3700], [4800, 3700]]) await clickWorld(page, x, y);
  await page.keyboard.press('Enter');
  s = await state(page);
  await page.click('.right-panel nav.tabs button:first-child');
  props = await page.textContent('.right-panel');
  check('тёплый пол: зона, длина трубы и контуры', s.zones === 1 && /Контурів/.test(props) && /Труба разом/.test(props), (props.match(/Труба разом[^К]*Контурів[^м]*м/) || [''])[0]);
  await page.screenshot({ path: path.join(out, '11-engineering.png') });

  // слои
  await page.click('.left-panel [data-tab="furniture"]');
  await page.click('.right-panel [data-tab="layers"]');
  const cnt = () => page.evaluate(() => document.querySelectorAll('.editor2d [data-t="item"]').length);
  const n1 = await cnt();
  await page.click('[data-layer="electrical"] button:first-child');
  const n2 = await cnt();
  check('слой «Электрика» скрывается', n2 < n1, `${n1} → ${n2}`);
  await page.click('[data-layer="electrical"] button:first-child');
  await page.click('[data-layer="furniture"] button:nth-child(2)');
  await page.keyboard.press('Escape');
  await clickWorld(page, 3040, 6325); // холодильник
  s = await state(page);
  check('заблокированный слой «Мебель» не выделяется', s.sel === null, JSON.stringify(s.sel));
  await page.click('.right-panel [data-tab="layers"]');
  await page.click('[data-layer="furniture"] button:nth-child(2)');
  await clickWorld(page, 3040, 6325);
  s = await state(page);
  check('после разблокировки слоя объект выделяется', s.sel?.type === 'item');

  // ───── Этап 6 на демо: чертежи и смета ─────
  await page.click('.topbar >> text=Креслення');
  await page.waitForSelector('[data-sheet-preview]');
  const sheetCount = await page.locator('.sheets-list [data-sheet]').count();
  const kinds = await page.$$eval('.sheets-list [data-sheet]', (els) => [...new Set(els.map((e) => e.dataset.sheet))]);
  check('набор листов: обмерный, мебель, электрика, сантехника, отопление, развёртки, разрезы', ['measure', 'furniture', 'electrical', 'plumbing', 'heating', 'elevations', 'section'].every((k) => kinds.includes(k)), `${sheetCount} листов: ${kinds.join(',')}`);
  for (const k of ['electrical', 'elevations', 'section']) {
    await page.click(`.sheets-list [data-sheet="${k}"] >> nth=0`);
    await page.waitForTimeout(250);
    const els = await page.$$eval('[data-sheet-preview] *', (e) => e.length);
    check(`предпросмотр листа «${k}»`, els > 35, `${els} элементов`);
    await page.screenshot({ path: path.join(out, `12-sheet-${k}.png`) });
  }
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('[data-action="pdf-all"]')]);
  const pdf = path.join(out, 'all-sheets.pdf');
  await dl.saveAs(pdf);
  const pdfBytes = fs.readFileSync(pdf);
  const pages = (pdfBytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('PDF со всеми листами', pdfBytes.subarray(0, 4).toString() === '%PDF' && pages === sheetCount, `${pages} стр., ${Math.round(pdfBytes.length / 1024)} КБ`);
  await page.click('.dialog footer >> text=Закрити');

  await page.click('.topbar >> text=Кошторис');
  await page.waitForSelector('[data-table="estimate"]');
  const lineCount = await page.locator('[data-table="estimate"] tr[data-line]').count();
  check('смета: позиции рассчитаны из модели', lineCount > 25, `${lineCount} позиций`);
  const price = page.locator('tr[data-line="cable.3×2,5"] input');
  await price.fill('42,5');
  await price.press('Enter');
  await page.waitForTimeout(200);
  const total = await page.textContent('[data-total]');
  const cableRow = await page.$eval('tr[data-line="cable.3×2,5"]', (tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim()));
  const expSum = Number(cableRow[3].replace(',', '.')) * 42.5;
  check('смета: цена пользователя × количество с запасом = сумма', Math.abs(Number(cableRow[5].replace(',', '.').replace(/\s/g, '')) - expSum) < 0.01 && /грн/.test(total), `${cableRow[3]} × 42,5 = ${cableRow[5]}; ${total}`);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="csv-estimate"]')]);
  const csvFile = path.join(out, 'estimate.csv');
  await dl2.saveAs(csvFile);
  const csv = fs.readFileSync(csvFile, 'utf8');
  check('смета: экспорт CSV', /Кабель ВВГнг 3×2,5 мм²;м;/.test(csv) && /Разом/.test(csv));
  await page.screenshot({ path: path.join(out, '13-estimate.png') });
  await page.click('.dialog footer >> text=Закрити');

  // ───── Этап 5: дом с участком ─────
  await page.click('[data-menu="file"]');
  await page.click('text=Новий проєкт…');
  await page.click('[data-kind="house"]');
  await page.click('[data-action="create"]');
  await page.waitForTimeout(500);
  s = await state(page);
  check('проект-дом создан с участком', s.kind === 'house' && !!s.site);
  // коробка дома 8×6 м
  await page.keyboard.press('KeyR');
  await dismissHint();
  await page.click('.preset-row >> text=Зовнішня 400');
  await clickWorld(page, 0, 0);
  await clickWorld(page, 8000, 6000);
  s = await state(page);
  check('дом: коробка из 4 наружных стен, помещение найдено', s.walls === 4 && s.rooms.length === 1, JSON.stringify(s.rooms));

  await page.click('.left-panel [data-tab="site"]');
  await pickKind('Дерево');
  await clickWorld(page, -5000, 12000); // 1 м от границы
  await pickKind('Септик');
  await clickWorld(page, 10500, 3000); // ~1,5 м от дома
  await pickKind('Колодязь');
  await clickWorld(page, 11000, 14000);
  await pickKind('Паркан');
  for (const [x, y] of [[-6000, -9000], [14000, -9000], [14000, 21000]]) await clickWorld(page, x, y);
  await page.keyboard.press('Enter');
  await pickKind('Газон');
  for (const [x, y] of [[-4000, 9000], [6000, 9000], [6000, 19000], [-4000, 19000]]) await clickWorld(page, x, y);
  await page.keyboard.press('Enter');
  await pickKind('Доріжка');
  for (const [x, y] of [[4000, 6400], [4000, 9000], [9000, 9000]]) await clickWorld(page, x, y);
  await page.keyboard.press('Enter');
  await pickKind('Басейн');
  for (const [x, y] of [[8000, 12000], [12000, 12000], [12000, 18000], [8000, 18000]]) await clickWorld(page, x, y);
  await page.keyboard.press('Enter');
  s = await state(page);
  check('участок: дерево, септик, колодец, забор, газон, дорожка, бассейн', s.site.items === 3 && s.site.routes === 2 && s.site.zones === 2, JSON.stringify(s.site));
  await page.click('.right-panel [data-tab="issues"]');
  list = await issues(page);
  const rules = list.map((i) => i.rule);
  check('участок: предупреждения о минимальных расстояниях', ['site.tree.boundary', 'site.septic.house', 'site.septic.well'].every((r) => rules.includes(r)), rules.filter((r) => r.startsWith('site')).join(','));

  // участок: свойства, север, тень
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.click('.left-panel >> text=Межі, рельєф, сторони світу…');
  await page.click('.right-panel nav.tabs button:first-child');
  props = await page.textContent('.right-panel');
  check('участок: площадь в сотках, север, рельеф, солнце', /6 соток/.test(props) && /Азимут/.test(props) && /Позначки вершин/.test(props) && /Сонце і тінь/.test(props));
  const paths0 = await page.$$eval('.editor2d svg path', (e) => e.length);
  await page.click('.right-panel >> text=Показувати тінь');
  await page.waitForTimeout(300);
  const paths1 = await page.$$eval('.editor2d svg path', (e) => e.length);
  check('тень от солнца на плане', paths1 > paths0, `${paths0} → ${paths1} контуров`);
  // рельеф
  const elev = page.locator('.right-panel label.field', { hasText: 'Вершина 3' }).locator('input');
  await elev.fill('1500');
  await elev.press('Enter');
  const el = await page.evaluate(() => window.__hb.useProject.getState().project.site.elevations);
  check('рельеф: отметка вершины границы задаётся', el[2] === 1500, JSON.stringify(el));
  await page.screenshot({ path: path.join(out, '14-site-2d.png') });

  // второй этаж и 3D с крышей
  await page.keyboard.press('Escape'); // выйти из поля ввода
  await page.keyboard.press('Escape'); // снять выделение
  await page.click('.right-panel >> text=+ Поверх вище');
  s = await page.evaluate(() => window.__hb.useProject.getState().project.levels.map((l) => ({ e: l.elevation, w: l.walls.length })));
  check('дом: добавлен второй этаж с несущими стенами', s.length === 2 && s[1].e === 3000 && s[1].w === 4, JSON.stringify(s));
  await page.click('[data-view="3d"]');
  await page.waitForSelector('.view3d canvas');
  await page.click('.view3d-bar >> text=Дах і всі поверхи');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, '15-site-3d.png') });

  // чертежи дома: фасады и участок
  await page.click('.topbar >> text=Креслення');
  await page.waitForSelector('[data-sheet-preview]');
  const hk = await page.$$eval('.sheets-list [data-sheet]', (els) => [...new Set(els.map((e) => e.dataset.sheet))]);
  check('дом: листы фасадов и плана участка', hk.includes('facades') && hk.includes('site'));
  await page.click('.sheets-list [data-sheet="facades"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '16-sheet-facades.png') });
  await page.click('.sheets-list [data-sheet="site"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, '17-sheet-site.png') });
  await page.click('.dialog footer >> text=Закрити');

  // язык
  await page.click('.topbar >> text=РУС');
  const ru = await page.textContent('.topbar');
  check('переключение интерфейса на русский', /Чертежи/.test(ru) && /Смета/.test(ru));
  await page.click('.topbar >> text=УКР');

  check('нет ошибок в консоли', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
})().catch((e) => {
  console.error('E2E CRASH', e);
  process.exit(1);
});
