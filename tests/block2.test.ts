// Блок 2 (итерация 2): материалы — библиотека CC0-текстур, модель материала, расчёты, смета, миграция.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../src/catalog';
import { buildEstimate } from '../src/calc/estimate';
import { finishPriceUnit, linoleumCalc, packCalc, safeShopUrl, wallpaperCalc, wallpaperStripLen } from '../src/calc/materials';
import { isTiled } from '../src/calc/tiles';
import { defaultFinishes } from '../src/catalog/finishes';
import { TEXTURES, textureDef } from '../src/catalog/textures';
import { SCHEMA_VERSION } from '../src/model/defaults';
import { createDemoProject } from '../src/model/demo';
import { migrateProject } from '../src/model/migrate';
import type { Finish, Project } from '../src/model/types';
import { roomSurfaces } from '../src/model/walls';

const ROOT = join(__dirname, '..');
const TEX_DIR = join(ROOT, 'public', 'textures');

describe('2.1 библиотека текстур: только CC0, локально, с лицензиями', () => {
  const md = readFileSync(join(ROOT, 'ASSETS_LICENSES.md'), 'utf8');
  it('у каждой текстуры есть карта цвета и нормалей в репозитории', () => {
    expect(TEXTURES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(TEXTURES.map((t) => t.id)).size).toBe(TEXTURES.length);
    for (const t of TEXTURES) {
      for (const f of [`${t.id}.jpg`, `${t.id}_n.jpg`]) {
        expect(existsSync(join(TEX_DIR, f)), f).toBe(true);
        expect(statSync(join(TEX_DIR, f)).size, f).toBeGreaterThan(500);
      }
    }
  });
  it('в папке текстур нет файлов, не описанных в библиотеке', () => {
    const known = new Set(TEXTURES.flatMap((t) => [`${t.id}.jpg`, `${t.id}_n.jpg`]));
    expect(readdirSync(TEX_DIR).filter((f) => !known.has(f))).toEqual([]);
  });
  it('источник каждой текстуры — ambientCG или Poly Haven, лицензия CC0 указана в ASSETS_LICENSES.md', () => {
    for (const t of TEXTURES) {
      expect(t.source, t.id).toMatch(/^(ambientCG|Poly Haven): \w+/);
      expect(t.url, t.id).toMatch(/^https:\/\/(ambientcg\.com|polyhaven\.com)\/a\//);
      const row = md.split('\n').find((l) => l.includes(`\`${t.id}.jpg\``));
      expect(row, `нет строки для ${t.id}`).toBeTruthy();
      expect(row).toContain('CC0 1.0');
      expect(row).toContain(t.url);
    }
    expect(md).toContain('CC0 1.0 Universal');
  });
  it('набор покрывает обои, ламинат/паркет, линолеум, камень/керамогранит, дерево, штукатурку', () => {
    const count = (c: string) => TEXTURES.filter((t) => t.category === c).length;
    expect(count('wallpaper')).toBeGreaterThanOrEqual(5);
    expect(count('wood')).toBeGreaterThanOrEqual(6);
    expect(count('parquet') + count('laminate')).toBeGreaterThanOrEqual(4);
    expect(count('linoleum')).toBeGreaterThanOrEqual(3);
    expect(count('stone')).toBeGreaterThanOrEqual(5);
    expect(count('plaster')).toBeGreaterThanOrEqual(3);
  });
  it('общий объём текстур остаётся небольшим (< 3 МБ)', () => {
    const total = readdirSync(TEX_DIR).reduce((s, f) => s + statSync(join(TEX_DIR, f)).size, 0);
    expect(total).toBeLessThan(3 * 1024 * 1024);
  });
});

describe('2.2 модель материала', () => {
  const fins = defaultFinishes();
  const by = (id: string) => fins.find((f) => f.id === id)!;
  it('стандартные материалы ссылаются на существующие текстуры', () => {
    for (const f of fins) if (f.textureId) expect(textureDef(f.textureId), `${f.id} → ${f.textureId}`).toBeTruthy();
    expect(new Set(fins.map((f) => f.id)).size).toBe(fins.length);
  });
  it('обои: рулон и раппорт; ламинат: доска, класс, толщина, упаковка; линолеум: ширина рулона; плитка: формат и шов', () => {
    const wp = fins.filter((f) => f.type === 'wallpaper');
    expect(wp.length).toBeGreaterThanOrEqual(5);
    for (const f of wp) expect(f.rollW! > 0 && f.rollL! > 0 && f.rapport !== undefined, f.id).toBe(true);
    expect(wp.some((f) => (f.rapport ?? 0) > 0)).toBe(true);
    const lam = fins.filter((f) => f.type === 'laminate');
    expect(lam.length).toBeGreaterThanOrEqual(5);
    for (const f of lam) expect(f.tileW! > 0 && f.tileH! > 0 && !!f.wearClass && f.thickness! > 0 && f.packArea! > 0, f.id).toBe(true);
    expect(new Set(lam.map((f) => f.textureId)).size).toBeGreaterThanOrEqual(5); // разные породы
    for (const f of fins.filter((x) => x.type === 'linoleum')) expect(f.rollW! >= 1500, f.id).toBe(true);
    expect(by('porcelain-marble')).toMatchObject({ tileW: 1200, tileH: 600, grout: 2, type: 'porcelain' });
    expect(isTiled(by('porcelain-marble'))).toBe(true);
    expect(isTiled(by('parquet-herringbone'))).toBe(false); // рисунок укладки — в самой текстуре
  });
  it('единица цены зависит от типа', () => {
    expect(finishPriceUnit({ type: 'wallpaper' })).toBe('roll');
    expect(finishPriceUnit({ type: 'laminate' })).toBe('m2');
    expect(finishPriceUnit({ type: 'linoleum' })).toBe('m2');
    expect(finishPriceUnit({ type: 'paint' })).toBe('l');
    expect(finishPriceUnit({ type: 'plaster' })).toBe('kg');
  });
});

describe('2.3 товар из магазина: только ссылка', () => {
  it('открывается только http(s)-ссылка', () => {
    expect(safeShopUrl('https://shop.example.com/item/1?x=2')).toBe('https://shop.example.com/item/1?x=2');
    expect(safeShopUrl(' http://example.com/a ')).toBe('http://example.com/a');
    expect(safeShopUrl('javascript:alert(1)')).toBeNull();
    expect(safeShopUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(safeShopUrl('example.com/item')).toBeNull();
    expect(safeShopUrl('')).toBeNull();
    expect(safeShopUrl(undefined)).toBeNull();
  });
  it('в коде приложения нет сетевых запросов к сайтам магазинов (fetch/XHR только для локальных данных)', () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    const offenders = walk(join(ROOT, 'src'))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket/.test(readFileSync(f, 'utf8')));
    // единственный fetch — загрузка встроенного шрифта для PDF (локальный ассет сборки)
    expect(offenders.map((f) => f.replace(ROOT, ''))).toEqual(['/src/drawings/pdf.ts']);
    expect(readFileSync(join(ROOT, 'src/drawings/pdf.ts'), 'utf8').match(/fetch\(/g)).toHaveLength(2);
  });
});

describe('2.4 расчёт: обои', () => {
  it('длина полотна: высота + подрезка, кратно раппорту', () => {
    expect(wallpaperStripLen(2600, 0)).toBe(2700);
    expect(wallpaperStripLen(2600, 640)).toBe(3200);
    expect(wallpaperStripLen(2600, 530)).toBe(3180);
    expect(wallpaperStripLen(2460, 640)).toBe(2560); // ровно 4 раппорта
  });
  it('рулон 0,53×10,05 м, стены 16 м, высота 2,6 м: без раппорта 11 рулонов, с раппортом 640 мм — тоже по 3 полотна', () => {
    const plain = wallpaperCalc([16000], 2600, { rollW: 530, rollL: 10050, rapport: 0 });
    expect(plain).toMatchObject({ stripLen: 2700, perRoll: 3, strips: 31, rolls: 11, tooShort: false });
    const rap = wallpaperCalc([16000], 2600, { rollW: 530, rollL: 10050, rapport: 640 });
    expect(rap).toMatchObject({ stripLen: 3200, perRoll: 3, strips: 31, rolls: 11 });
  });
  it('раппорт уменьшает число полотен из рулона и увеличивает число рулонов', () => {
    const a = wallpaperCalc([16000], 2400, { rollW: 530, rollL: 10050, rapport: 0 }); // 2,5 м → 4 полотна
    const b = wallpaperCalc([16000], 2400, { rollW: 530, rollL: 10050, rapport: 640 }); // 2,56 м → 3 полотна
    expect(a.perRoll).toBe(4);
    expect(b.perRoll).toBe(3);
    expect(a.rolls).toBe(8);
    expect(b.rolls).toBe(11);
  });
  it('метровые обои: вдвое меньше полотен; высокий потолок — меньше полотен из рулона', () => {
    expect(wallpaperCalc([16000], 2600, { rollW: 1060, rollL: 10050 }).strips).toBe(16);
    expect(wallpaperCalc([16000], 2600, { rollW: 1060, rollL: 10050 }).rolls).toBe(6);
    expect(wallpaperCalc([16000], 3300, { rollW: 530, rollL: 10050 }).perRoll).toBe(2);
    expect(wallpaperCalc([1000], 12000, { rollW: 530, rollL: 10050 }).tooShort).toBe(true);
  });
  it('помещения считаются отдельно: полотна округляются вверх в каждом', () => {
    expect(wallpaperCalc([1000, 1000], 2600, { rollW: 530, rollL: 10050 }).strips).toBe(4);
    expect(wallpaperCalc([2000], 2600, { rollW: 530, rollL: 10050 }).strips).toBe(4);
    expect(wallpaperCalc([600, 600], 2600, { rollW: 530, rollL: 10050 }).strips).toBe(4);
    expect(wallpaperCalc([1200], 2600, { rollW: 530, rollL: 10050 }).strips).toBe(3);
  });
});

describe('2.4 расчёт: ламинат и линолеум', () => {
  it('упаковки ламината: площадь с запасом → целые упаковки', () => {
    expect(packCalc(15.15, 1.73, 7)).toMatchObject({ packs: 10, buyM2: 17.3 });
    expect(packCalc(15.15, 2.13, 7).packs).toBe(8);
    expect(packCalc(2.13, 2.13, 0).packs).toBe(1);
    expect(packCalc(2.14, 2.13, 0).packs).toBe(2);
    expect(packCalc(10, 0, 10)).toMatchObject({ packs: 0, buyM2: 11 });
  });
  const rect = (w: number, h: number) => [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  it('линолеум: комната 3×4 м, рулон 3 м — одно полотно 4,1 м без стыков', () => {
    expect(linoleumCalc(rect(3000, 4000), 3000)).toMatchObject({ strips: 1, seams: 0, lengthM: 4.1, buyM2: 12.3, dir: 'y' });
  });
  it('линолеум: комната 3×4 м, рулон 2,5 м — два полотна, выбирается меньший метраж', () => {
    const c = linoleumCalc(rect(3000, 4000), 2500);
    expect(c.strips).toBe(2);
    expect(c.seams).toBe(1);
    expect(c.lengthM).toBe(6.2); // 2 × 3,1 м (раскатка поперёк длинной стороны)
    expect(c.buyM2).toBe(15.5);
  });
  it('линолеум: меньше стыков важнее метража', () => {
    const c = linoleumCalc(rect(3900, 6500), 4000); // вдоль 6,5 м — одно полотно; поперёк — два
    expect(c).toMatchObject({ strips: 1, seams: 0, lengthM: 6.6 });
  });
});

describe('2.4 смета по материалам', () => {
  const setup = (mutate?: (p: Project) => void) => {
    const p = createDemoProject();
    const l = p.levels[0];
    const bed = l.rooms.find((r) => r.type === 'bedroom')!;
    const shop: Finish = { id: 'shop-wp', name: { uk: 'Шпалери з магазину', ru: 'Обои из магазина' }, type: 'wallpaper', color: '#d8d4cc', target: ['wall'], textureId: 'wallpaper-damask', rollW: 530, rollL: 10050, rapport: 640, price: 850, shopUrl: 'https://shop.example.com/wp/1' };
    p.finishes.push(shop);
    bed.floorFinish = 'laminate-walnut';
    p.finishes.find((f) => f.id === 'laminate-walnut')!.price = 520;
    for (const s of roomSurfaces(l, bed)) {
      const w = l.walls.find((x) => x.id === s.wallId)!;
      w[s.side === 'L' ? 'finishL' : 'finishR'] = shop.id;
    }
    mutate?.(p);
    return { p, bed, l };
  };
  it('обои: рулоны с учётом раппорта и высоты, цена и ссылка — из материала', () => {
    const { p, bed, l } = setup();
    const lines = buildEstimate(p);
    const wl = lines.find((x) => x.key === 'wallpaper.shop-wp')!;
    expect(wl).toBeTruthy();
    expect(wl.category).toBe('wallpaper');
    expect(wl.unit.uk).toBe('рулон');
    // ожидаемое число: длина стен спальни без дверей → полотна → рулоны
    const run = roomSurfaces(l, bed).reduce((s, x) => s + x.length - x.openings.filter((o) => o.sill <= 0 && o.height >= 1900).reduce((a, o) => a + (o.to - o.from), 0), 0);
    const c = wallpaperCalc([run], l.height, { rollW: 530, rollL: 10050, rapport: 640 });
    expect(c.perRoll).toBe(3);
    expect(wl.total).toBe(Math.ceil((c.strips / 3) * 1.05 - 1e-9));
    expect(wl.price).toBe(850);
    expect(wl.priceFrom).toBe('material');
    expect(wl.url).toBe('https://shop.example.com/wp/1');
    expect(wl.sum).toBe(wl.total * 850);
    expect(wl.note?.uk).toContain('рапорт 640 мм');
    expect(wl.note?.uk).toContain('3 полотен з рулону');
  });
  it('ламинат: упаковки, цена упаковки = цена за м² × площадь упаковки', () => {
    const { p, bed } = setup();
    const ll = buildEstimate(p).find((x) => x.key === 'flooring.laminate-walnut.pack')!;
    expect(ll.unit.uk).toBe('уп.');
    expect(ll.total).toBe(Math.ceil((bed.area / 1.73) * 1.07 - 1e-9));
    expect(ll.price).toBe(899.6);
    expect(ll.sum).toBe(Math.round(ll.total * 899.6 * 100) / 100);
  });
  it('линолеум: погонные метры рулона, цена за погонный метр = цена за м² × ширина рулона', () => {
    const { p, l } = setup((q) => {
      const k = q.levels[0].rooms.find((r) => r.type === 'kitchen')!;
      k.floorFinish = 'linoleum-brown';
      q.finishes.find((f) => f.id === 'linoleum-brown')!.price = 300;
    });
    const kitchen = l.rooms.find((r) => r.type === 'kitchen')!;
    const li = buildEstimate(p).find((x) => x.key === 'flooring.linoleum-brown')!;
    const c = linoleumCalc(kitchen.polygon, 3000);
    expect(li.unit.uk).toBe('м');
    expect(li.qty).toBe(c.lengthM);
    expect(li.price).toBe(900);
    expect(li.name.uk).toContain('рулону 3 м');
  });
  it('цена, введённая в смете, важнее цены материала; без цены сумма нулевая', () => {
    const { p } = setup((q) => {
      q.prices['wallpaper.shop-wp'] = 1000;
    });
    const wl = buildEstimate(p).find((x) => x.key === 'wallpaper.shop-wp')!;
    expect(wl.price).toBe(1000);
    expect(wl.priceFrom).toBe('user');
    const noPrice = buildEstimate(createDemoProject()).filter((x) => x.category === 'flooring');
    expect(noPrice.length).toBeGreaterThan(0);
    expect(noPrice.every((x) => x.priceFrom === null && x.sum === 0)).toBe(true);
  });
});

describe('миграция схемы v3', () => {
  it('старый проект получает текстуры и новые материалы, свои правки сохраняются', () => {
    const p = createDemoProject();
    const old = JSON.parse(JSON.stringify(p)) as Project;
    old.schema = 2;
    old.finishes = [
      { id: 'laminate-oak', name: { uk: 'Мій ламінат', ru: 'Мой ламинат' }, type: 'laminate', color: '#c8a877', target: ['floor'], tileW: 1200, tileH: 190, grout: 0, pattern: 'brick', packArea: 2 },
      { id: 'wallpaper', name: { uk: 'Шпалери', ru: 'Обои' }, type: 'wallpaper', color: '#e8e0d4', target: ['wall'] },
      { id: 'my-own', name: { uk: 'Своє', ru: 'Своё' }, type: 'paint', color: '#123456', target: ['wall'] },
    ];
    const m = migrateProject(old);
    expect(m.schema).toBe(SCHEMA_VERSION);
    const lam = m.finishes.find((f) => f.id === 'laminate-oak')!;
    expect(lam.name.uk).toBe('Мій ламінат');
    expect(lam.tileW).toBe(1200);
    expect(lam.packArea).toBe(2);
    expect(lam.textureId).toBe('wood-oak-natural');
    expect(m.finishes.find((f) => f.id === 'wallpaper')!.rollW).toBe(1060);
    expect(m.finishes.find((f) => f.id === 'my-own')!.textureId).toBeUndefined();
    expect(m.finishes.some((f) => f.id === 'linoleum-brown')).toBe(true);
    expect(m.finishes.some((f) => f.id === 'porcelain-marble')).toBe(true);
    // повторная миграция ничего не меняет
    expect(migrateProject(m).finishes.length).toBe(m.finishes.length);
  });
});

describe('2.5 конструктор: декоры ЛДСП с направлением волокон', () => {
  it('стандартные плиты с текстурой ссылаются на библиотеку; есть несколько декоров', async () => {
    const { defaultCabinetCatalog } = await import('../src/cabinet/catalog');
    const boards = defaultCabinetCatalog().boards;
    const decors = boards.filter((b) => b.textureId);
    expect(decors.length).toBeGreaterThanOrEqual(5);
    for (const b of decors) {
      expect(textureDef(b.textureId), b.id).toBeTruthy();
      expect(b.grain, `${b.id}: у декора с текстурой есть направление`).toBe(true);
    }
    expect(new Set(decors.map((b) => b.textureId)).size).toBeGreaterThanOrEqual(4);
  });
  it('ось волокон детали: боковина — вертикально, полка — вдоль ширины, «поперёк» меняет ось', async () => {
    const { partGrainAxis, cabinetPartPrims } = await import('../src/view3d/build');
    const { generateCabinet } = await import('../src/cabinet/generate');
    const { BUILTIN_TEMPLATES } = await import('../src/cabinet/templates');
    const { defaultCabinetCatalog } = await import('../src/cabinet/catalog');
    const cat = defaultCabinetCatalog();
    const design = BUILTIN_TEMPLATES.find((t) => t.id === 'wardrobe-sliding')!.make();
    const res = generateCabinet(design, cat);
    const side = res.parts.find((p) => p.role === 'side' && p.box)!;
    const shelf = res.parts.find((p) => p.role === 'shelf' && p.box)!;
    const door = res.parts.find((p) => p.role === 'slidingDoor' && p.box)!;
    expect(partGrainAxis(side)).toBe('z');
    expect(partGrainAxis(shelf)).toBe('x');
    expect(partGrainAxis(door)).toBe('z');
    expect(partGrainAxis({ ...shelf, grain: 'width' })).toBe('y');
    expect(partGrainAxis({ ...side, grain: 'width' })).toBe('y');
    const { prims } = cabinetPartPrims(res.parts, design, cat);
    const boxes = prims.filter((p) => p.t === 'box');
    const textured = boxes.filter((p) => p.t === 'box' && p.tx);
    expect(textured.length).toBeGreaterThan(10);
    expect(boxes.every((p) => p.t === 'box' && !!p.key)).toBe(true);
    // профиль купе — металл без декора
    expect(boxes.filter((p) => p.t === 'box' && p.m === 'metal').every((p) => p.t === 'box' && !p.tx)).toBe(true);
  });
  it('миграция добавляет декоры в каталог плит старого проекта', () => {
    const old = JSON.parse(JSON.stringify(createDemoProject())) as Project;
    old.schema = 2;
    old.cabinetCatalog.boards = old.cabinetCatalog.boards.filter((b) => !b.id.startsWith('ldsp18-')).map((b) => ({ ...b, textureId: undefined }));
    const m = migrateProject(old);
    expect(m.cabinetCatalog.boards.find((b) => b.id === 'ldsp18')!.textureId).toBe('wood-oak-natural');
    expect(m.cabinetCatalog.boards.some((b) => b.id === 'ldsp18-walnut')).toBe(true);
  });
});
