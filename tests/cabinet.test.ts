import { describe, expect, it } from 'vitest';
import { defaultCabinetCatalog } from '../src/cabinet/catalog';
import { buildCutList, cutSize, edgeTotals, materialTotals } from '../src/cabinet/cutlist';
import { columnWidths, generateCabinet, hingeCount, slideLength } from '../src/cabinet/generate';
import { nest, nestCutList } from '../src/cabinet/nesting';
import type { NestResult } from '../src/cabinet/nesting';
import { BUILTIN_TEMPLATES } from '../src/cabinet/templates';

const cat = defaultCabinetCatalog();
const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!.make();

describe('пильный размер с учётом кромки', () => {
  it('кромка вдоль длины уменьшает ширину, вдоль ширины — длину', () => {
    const r = cutSize({ length: 1000, width: 500, edges: { l1: 'pvc2', l2: 'pvc04', w1: 'pvc2', w2: null } }, cat);
    expect(r.cutWidth).toBeCloseTo(500 - 2 - 0.4, 5);
    expect(r.cutLength).toBeCloseTo(1000 - 2, 5);
  });
  it('без кромки пильный размер равен готовому', () => {
    expect(cutSize({ length: 700, width: 300, edges: { l1: null, l2: null, w1: null, w2: null } }, cat)).toEqual({ cutLength: 700, cutWidth: 300 });
  });
  it('порог «учитывать кромку от»: 0,4 мм можно не вычитать', () => {
    const c2 = { ...cat, edgeMinThickness: 0.8 };
    const r = cutSize({ length: 1000, width: 500, edges: { l1: 'pvc2', l2: 'pvc04', w1: 'pvc04', w2: 'pvc04' } }, c2);
    expect(r).toEqual({ cutLength: 1000, cutWidth: 498 });
  });
});

describe('шкаф-купе 2400×2600×600, ЛДСП 18, кромка 2/0,4 (критерий MVP)', () => {
  const d = tpl('wardrobe-sliding');
  const res = generateCabinet(d, cat);
  const rows = buildCutList(res.parts, cat);
  const row = (name: string) => rows.filter((r) => r.name.ru === name);

  it('габариты шаблона', () => {
    expect([d.width, d.height, d.depth]).toEqual([2400, 2600, 600]);
    expect(d.bodyMaterialId).toBe('ldsp18');
    expect([d.edgeFront, d.edgeHidden]).toEqual(['pvc2', 'pvc04']);
  });

  it('боковины: 2 шт 2600×597, пильный 2599,2×594,6', () => {
    const sides = rows.filter((r) => r.name.ru === 'Боковина левая' || r.name.ru === 'Боковина правая');
    expect(sides.reduce((s, r) => s + r.qty, 0)).toBe(2);
    for (const s of sides) {
      expect([s.length, s.width, s.thickness]).toEqual([2600, 597, 18]);
      expect(s.cutLength).toBeCloseTo(2599.2, 5);
      expect(s.cutWidth).toBeCloseTo(594.6, 5);
      expect(s.edges).toEqual({ l1: 'pvc2', l2: 'pvc04', w1: 'pvc04', w2: 'pvc04' });
    }
  });

  it('крышка и дно — вкладные: 2364×597, торцы без кромки', () => {
    for (const name of ['Крышка', 'Дно']) {
      const [r] = row(name);
      expect(r.qty).toBe(1);
      expect([r.length, r.width]).toEqual([2364, 597]);
      expect(r.cutLength).toBe(2364);
      expect(r.cutWidth).toBeCloseTo(594.6, 5);
    }
  });

  it('перегородки: 2 шт, высота в свету 2494, глубина с учётом зоны купе', () => {
    const [r] = row('Перегородка');
    expect(r.qty).toBe(2);
    expect([r.length, r.width]).toEqual([2494, 497]);
    expect(r.cutWidth).toBe(495);
  });

  it('секции делятся поровну, полки по ширине секции', () => {
    expect(columnWidths(d, 18)).toEqual([776, 776, 776]);
    const shelves = row('Полка');
    expect(shelves.reduce((s, r) => s + r.qty, 0)).toBe(4 + 1 + 2);
    for (const s of shelves) expect([s.length, s.width]).toEqual([776, 497]);
  });

  it('задняя стенка ХДФ накладная, делится на 2 части (не помещается на лист)', () => {
    const [r] = row('Задняя стенка');
    expect(r.qty).toBe(2);
    expect(r.materialId).toBe('hdf3');
    expect([r.length, r.width]).toEqual([2526, 1198]);
    expect(res.warnings.some((w) => w.ru.includes('разделена'))).toBe(true);
  });

  it('цоколь, ящики, двери-купе и фурнитура', () => {
    expect(row('Цоколь передний')[0].width).toBe(70);
    expect(row('Фасад ящика').reduce((s, r) => s + r.qty, 0)).toBe(2);
    const hw = Object.fromEntries(res.hardware.map((h) => [h.id, h.qty]));
    expect(hw['sliding-door']).toBe(3);
    expect(hw['sliding-rollers']).toBe(3);
    expect(hw['sliding-track-top']).toBeCloseTo(2.4, 1);
    expect(hw['slide-450']).toBe(2);
    expect(hw['rod-holder']).toBe(4);
    expect(hw.confirmat).toBeGreaterThan(40);
  });

  it('все детали внутри габаритов изделия', () => {
    for (const p of res.parts) {
      if (!p.box) continue;
      expect(p.box.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.box.x + p.box.sx).toBeLessThanOrEqual(2400.01);
      expect(p.box.z).toBeGreaterThanOrEqual(-0.01);
      expect(p.box.z + p.box.sz).toBeLessThanOrEqual(2600.01);
      expect(p.box.y + p.box.sy).toBeLessThanOrEqual(600.01);
    }
  });

  it('итоги по кромке и материалам', () => {
    const et = edgeTotals(res.parts);
    const e2 = et.find((e) => e.bandId === 'pvc2')!;
    expect(e2.netM).toBeGreaterThan(20);
    expect(e2.grossM).toBeGreaterThan(e2.netM);
    const mt = materialTotals(rows);
    expect(mt.find((m) => m.materialId === 'ldsp18')!.areaM2).toBeGreaterThan(10);
  });

  it('раскрой: все детали размещены, без наложений, с пропилом 4 мм', () => {
    const nests = nestCutList(rows, cat);
    const ldsp = nests.find((n) => n.materialId === 'ldsp18')!;
    expect(ldsp.unplaced).toHaveLength(0);
    expect(ldsp.sheets.length).toBe(3);
    checkLayout(ldsp, 4, 10);
    const count = ldsp.sheets.reduce((s, sh) => s + sh.placements.length, 0);
    expect(count).toBe(rows.filter((r) => r.materialId === 'ldsp18').reduce((s, r) => s + r.qty, 0));
    // ЛДСП с текстурой: детали не поворачиваются
    expect(ldsp.sheets.every((sh) => sh.placements.every((p) => !p.rotated))).toBe(true);
  });
});

function checkLayout(n: NestResult, kerf: number, trim: number) {
  for (const sh of n.sheets) {
    for (const p of sh.placements) {
      expect(p.x).toBeGreaterThanOrEqual(trim - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(trim - 1e-6);
      expect(p.x + p.l).toBeLessThanOrEqual(n.sheetL - trim + 1e-6);
      expect(p.y + p.w).toBeLessThanOrEqual(n.sheetW - trim + 1e-6);
    }
    for (let i = 0; i < sh.placements.length; i++) {
      for (let j = i + 1; j < sh.placements.length; j++) {
        const a = sh.placements[i];
        const b = sh.placements[j];
        const sepX = a.x + a.l + kerf <= b.x + 1e-6 || b.x + b.l + kerf <= a.x + 1e-6;
        const sepY = a.y + a.w + kerf <= b.y + 1e-6 || b.y + b.w + kerf <= a.y + 1e-6;
        expect(sepX || sepY).toBe(true);
      }
    }
  }
}

describe('раскрой', () => {
  it('четыре детали 1385×1020 помещаются на один лист 2800×2070 с пропилом 4 и обпилом 10', () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, label: '', l: 1385, w: 1020, canRotate: false }));
    const r = nest(items, 2800, 2070, 4, 10);
    expect(r.sheets).toHaveLength(1);
    checkLayout(r, 4, 10);
  });
  it('на 1 мм больше — уже не помещаются', () => {
    const items = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, label: '', l: 1389, w: 1024, canRotate: false }));
    expect(nest(items, 2800, 2070, 4, 10).sheets.length).toBeGreaterThan(1);
  });
  it('поворот разрешён только без текстуры', () => {
    const it1 = [{ id: 'a', label: '', l: 2040, w: 2700, canRotate: false }];
    expect(nest(it1, 2800, 2070, 4, 10).unplaced).toHaveLength(1);
    const r = nest([{ ...it1[0], canRotate: true }], 2800, 2070, 4, 10);
    expect(r.unplaced).toHaveLength(0);
    expect(r.sheets[0].placements[0].rotated).toBe(true);
  });
  it('много мелких деталей: плотная укладка и корректность', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, label: '', l: 300 + (i % 7) * 90, w: 200 + (i % 5) * 70, canRotate: i % 2 === 0 }));
    const r = nest(items, 2800, 2070, 4, 10);
    checkLayout(r, 4, 10);
    expect(r.unplaced).toHaveLength(0);
    const area = items.reduce((s, x) => s + x.l * x.w, 0);
    expect(r.sheets.length).toBeLessThanOrEqual(Math.ceil(area / (2780 * 2050) / 0.7));
  });
});

describe('прочие изделия и фурнитура', () => {
  it('количество петель по высоте фасада и длина направляющих', () => {
    expect([hingeCount(700), hingeCount(1200), hingeCount(1900), hingeCount(2300)]).toEqual([2, 3, 4, 5]);
    expect([slideLength(497), slideLength(540), slideLength(200), slideLength(900)]).toEqual([450, 500, 250, 600]);
  });
  it('кухонная тумба: накладной фасад с зазором 2 мм, петли накладные', () => {
    const d = tpl('kitchen-base');
    const res = generateCabinet(d, cat);
    const f = res.parts.find((p) => p.role === 'facade')!;
    expect(f.width).toBe(598);
    expect(f.length).toBe(720 - 2);
    expect(res.hardware.find((h) => h.id === 'hinge-overlay')!.qty).toBe(2);
    expect(res.hardware.find((h) => h.id === 'leg')!.qty).toBe(4);
    expect(res.hardware.find((h) => h.id === 'shelf-pin')!.qty).toBe(4);
    // фасад ЛДСП 18 мм накладывается на корпус глубиной 560
    expect(res.overallDepth).toBe(560 + 18);
  });
  it('распашной шкаф на 2 секции: на общей перегородке — полунакладные петли', () => {
    const d = tpl('wardrobe-hinged');
    d.columns = [{ ...d.columns[0], doors: 1 }, { ...d.columns[0], id: 'c2', doors: 1 }];
    const res = generateCabinet(d, cat);
    const ids = res.hardware.map((h) => h.id);
    expect(ids).toContain('hinge-overlay');
    const doors = res.parts.filter((p) => p.role === 'facade');
    expect(doors).toHaveLength(2);
    expect(doors[0].width).toBeCloseTo(900 / 2 - 2, 5);
  });
  it('задняя стенка в паз шире проёма на глубину пазов', () => {
    const d = tpl('kitchen-wall');
    const res = generateCabinet(d, cat);
    const b = res.parts.find((p) => p.role === 'back')!;
    expect(b.width).toBe(600 - 32 + 16 - 2);
    expect(b.length).toBe(720 - 32 + 16 - 2);
  });
  it('комод: 4 ящика с накладными фасадами, 4 пары направляющих', () => {
    const res = generateCabinet(tpl('chest'), cat);
    const fronts = res.parts.filter((p) => p.role === 'drawerFront');
    expect(fronts).toHaveLength(4);
    expect(fronts[0].length).toBe(798);
    expect(res.hardware.filter((h) => h.id.startsWith('slide-')).reduce((s, h) => s + h.qty, 0)).toBe(4);
    expect(res.hardware.find((h) => h.id === 'handle')!.qty).toBe(4);
  });
  it('переопределение кромки и ручные детали', () => {
    const d = tpl('bookshelf');
    d.overrides['side-l'] = { edges: { l1: 'abs1' } };
    d.extraParts.push({ id: 'x', name: 'Планка', materialId: 'mdf16', length: 500, width: 80, qty: 3, edges: { l1: 'pvc04', l2: null, w1: null, w2: null }, grain: 'none' });
    const res = generateCabinet(d, cat);
    expect(res.parts.find((p) => p.key === 'side-l')!.edges.l1).toBe('abs1');
    const rows = buildCutList(res.parts, cat);
    const m = rows.find((r) => r.name.ru === 'Планка')!;
    expect(m.qty).toBe(3);
    expect(m.cutWidth).toBeCloseTo(79.6, 5);
  });
});
