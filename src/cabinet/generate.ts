// Генерация деталей и фурнитуры корпусного изделия из параметрического описания.
import type { LS } from '../model/types';
import type { BoardMaterial, CabinetCatalog, CabinetDesign, CabinetResult, EdgeSides, HardwareLine, Part, PartBox, PartRole } from './types';

const L = (uk: string, ru: string): LS => ({ uk, ru });
const PCS = L('шт', 'шт');
const PAIR = L('пара', 'пара');
const METER = L('м', 'м');
const SET = L('компл.', 'компл.');

const NO_EDGES: EdgeSides = { l1: null, l2: null, w1: null, w2: null };

export const HINGE_NAMES = {
  overlay: L('Петля накладна', 'Петля накладная'),
  half: L('Петля напівнакладна', 'Петля полунакладная'),
  inset: L('Петля вкладна', 'Петля вкладная'),
};

/** Кол-во петель по высоте фасада. */
export function hingeCount(doorHeight: number): number {
  if (doorHeight <= 900) return 2;
  if (doorHeight <= 1600) return 3;
  if (doorHeight <= 2000) return 4;
  if (doorHeight <= 2400) return 5;
  return 6;
}

/** Стандартная длина направляющих под внутреннюю глубину. */
export function slideLength(innerDepth: number): number {
  const l = Math.floor((innerDepth - 10) / 50) * 50;
  return Math.max(250, Math.min(600, l));
}

/** Ширины секций в свету. */
export function columnWidths(d: CabinetDesign, T: number): number[] {
  const n = Math.max(1, d.columns.length);
  const avail = d.width - 2 * T - (n - 1) * T;
  const fixed = d.columns.reduce((s, c) => s + (c.width ?? 0), 0);
  const autos = d.columns.filter((c) => c.width == null).length;
  const autoW = autos > 0 ? (avail - fixed) / autos : 0;
  const ws = d.columns.map((c) => c.width ?? autoW);
  if (autos === 0 && ws.length) {
    // все ширины заданы — остаток отдаём последней секции
    ws[ws.length - 1] += avail - fixed;
  }
  return ws;
}

export function generateCabinet(d: CabinetDesign, cat: CabinetCatalog): CabinetResult {
  const board = (id: string): BoardMaterial | undefined => cat.boards.find((b) => b.id === id);
  const body = board(d.bodyMaterialId);
  const fac = board(d.facadeMaterialId) ?? body;
  const back = board(d.backMaterialId);
  const T = body?.thickness ?? 18;
  const TF = fac?.thickness ?? 18;
  const TB = back?.thickness ?? 3;
  const W = d.width;
  const H = d.height;
  const D = d.depth;
  const parts: Part[] = [];
  const warnings: LS[] = [];
  const hw = new Map<string, HardwareLine>();
  const addHw = (id: string, name: LS, qty: number, unit: LS = PCS, note?: LS) => {
    if (qty <= 0) return;
    const e = hw.get(id);
    if (e) e.qty += qty;
    else hw.set(id, { id, name, qty, unit, note });
  };

  const F = d.edgeFront;
  const Hd = d.edgeHidden;
  const FE = d.edgeFacade;

  const add = (key: string, name: LS, role: PartRole, materialId: string, thickness: number, length: number, width: number, edges: EdgeSides, box: PartBox, grain: 'length' | 'none' = 'length', virtual = false) => {
    if (length <= 0 || width <= 0) return;
    const p: Part & { virtual?: boolean } = { key, name, role, materialId, length: r1(length), width: r1(width), thickness, edges, qty: 1, grain, box };
    if (virtual) p.virtual = true;
    parts.push(p);
  };

  const z0 = Math.max(0, d.legs);
  const backOverlay = d.back.mode === 'overlay';
  const yB = backOverlay ? TB : 0;
  const sideDepth = D - yB;
  const bottomOverlay = d.bottomMode === 'overlay';
  const plinth = bottomOverlay ? 0 : Math.max(0, d.plinth);
  const topOverlay = d.topMode === 'overlay';
  const jointFasteners = sideDepth > 450 ? 3 : 2;
  let joints = 0;

  // ── Боковины ──
  const sideZ0 = z0 + (bottomOverlay ? T : 0);
  const sideH = H - (topOverlay ? T : 0) - sideZ0;
  const sideEdges: EdgeSides = { l1: F, l2: Hd, w1: Hd, w2: Hd };
  add('side-l', L('Боковина ліва', 'Боковина левая'), 'side', d.bodyMaterialId, T, sideH, sideDepth, sideEdges, { x: 0, y: yB, z: sideZ0, sx: T, sy: sideDepth, sz: sideH });
  add('side-r', L('Боковина права', 'Боковина правая'), 'side', d.bodyMaterialId, T, sideH, sideDepth, sideEdges, { x: W - T, y: yB, z: sideZ0, sx: T, sy: sideDepth, sz: sideH });

  // ── Крышка ──
  const innerW = W - 2 * T;
  if (d.topMode === 'overlay') {
    add('top', L('Кришка', 'Крышка'), 'top', d.bodyMaterialId, T, W, sideDepth, { l1: F, l2: Hd, w1: F, w2: F }, { x: 0, y: yB, z: H - T, sx: W, sy: sideDepth, sz: T });
    joints += 2;
  } else if (d.topMode === 'inset') {
    add('top', L('Кришка', 'Крышка'), 'top', d.bodyMaterialId, T, innerW, sideDepth, { l1: F, l2: Hd, w1: null, w2: null }, { x: T, y: yB, z: H - T, sx: innerW, sy: sideDepth, sz: T });
    joints += 2;
  } else {
    const sw = 100;
    add('stretcher-f', L('Планка передня', 'Планка передняя'), 'stretcher', d.bodyMaterialId, T, innerW, sw, { l1: F, l2: null, w1: null, w2: null }, { x: T, y: yB + sideDepth - sw, z: H - T, sx: innerW, sy: sw, sz: T });
    add('stretcher-b', L('Планка задня', 'Планка задняя'), 'stretcher', d.bodyMaterialId, T, innerW, sw, { l1: Hd, l2: null, w1: null, w2: null }, { x: T, y: yB, z: H - T, sx: innerW, sy: sw, sz: T });
    joints += 4;
  }

  // ── Дно ──
  if (bottomOverlay) {
    add('bottom', L('Дно', 'Дно'), 'bottom', d.bodyMaterialId, T, W, sideDepth, { l1: F, l2: Hd, w1: F, w2: F }, { x: 0, y: yB, z: z0, sx: W, sy: sideDepth, sz: T });
  } else {
    add('bottom', L('Дно', 'Дно'), 'bottom', d.bodyMaterialId, T, innerW, sideDepth, { l1: F, l2: Hd, w1: null, w2: null }, { x: T, y: yB, z: z0 + plinth, sx: innerW, sy: sideDepth, sz: T });
  }
  joints += 2;

  const innerZ0 = z0 + (bottomOverlay ? T : plinth + T);
  const innerZ1 = H - T;
  const innerH = innerZ1 - innerZ0;

  // ── Цоколь ──
  if (plinth > 0) {
    const pe: EdgeSides = { l1: Hd, l2: null, w1: null, w2: null };
    add('plinth-f', L('Цоколь передній', 'Цоколь передний'), 'plinth', d.bodyMaterialId, T, innerW, plinth, pe, { x: T, y: yB + sideDepth - T - 20, z: z0, sx: innerW, sy: T, sz: plinth });
    add('plinth-b', L('Цоколь задній', 'Цоколь задний'), 'plinth', d.bodyMaterialId, T, innerW, plinth, pe, { x: T, y: yB + 20, z: z0, sx: innerW, sy: T, sz: plinth });
    joints += 4;
  }

  // ── Внутренняя зона по глубине ──
  const groove = d.back.mode === 'groove';
  const backSpace = groove ? d.back.grooveInset + TB : 0;
  const ft = d.facade.type;
  const frontRecess = ft === 'sliding' ? d.facade.slidingZone : ft === 'hinged' && d.facade.inset ? TF + 2 : 0;
  const innerY0 = yB + backSpace;
  const innerY1 = yB + sideDepth - frontRecess;
  const innerDepth = innerY1 - innerY0;
  if (innerDepth < 100) warnings.push(L('Замала внутрішня глибина корпусу', 'Слишком малая внутренняя глубина корпуса'));

  // ── Секции и перегородки ──
  const cols = d.columns.length ? d.columns : [{ id: 'c0', width: null, shelves: 0, drawers: 0, drawerHeight: 180, rod: false, doors: 0 }];
  const widths = columnWidths({ ...d, columns: cols }, T);
  const colX: number[] = [];
  let x = T;
  widths.forEach((cw, i) => {
    colX.push(x);
    if (cw < 100) warnings.push(L(`Секція ${i + 1} вужча за 100 мм`, `Секция ${i + 1} уже 100 мм`));
    x += cw;
    if (i < widths.length - 1) {
      add(`partition-${i + 1}`, L('Перегородка', 'Перегородка'), 'partition', d.bodyMaterialId, T, innerH, innerDepth, { l1: F, l2: null, w1: null, w2: null }, { x, y: innerY0, z: innerZ0, sx: T, sy: innerDepth, sz: innerH });
      joints += 2;
      x += T;
    }
  });

  const gap = d.facade.gap;
  const zoneZ0 = z0 + plinth;
  const zoneH = H - zoneZ0;
  const frontY = yB + sideDepth;
  const hinges = { overlay: 0, half: 0, inset: 0 };
  let handles = 0;
  const slides = new Map<number, number>();

  const addDrawer = (ci: number, di: number, cw: number, cx: number, frontZ: number, frontH: number, frontW: number, frontX: number, frontYpos: number, depthAvail: number) => {
    const sl = slideLength(depthAvail);
    if (depthAvail < 270) warnings.push(L(`Секція ${ci + 1}: недостатня глибина для шухляд`, `Секция ${ci + 1}: недостаточная глубина для ящиков`));
    const boxH = Math.max(60, frontH - 50);
    const boxW = cw - 26;
    const key = `c${ci + 1}-d${di + 1}`;
    const bz = frontZ + 20;
    const by = frontYpos - sl;
    add(`drawer-front-${key}`, L('Фасад шухляди', 'Фасад ящика'), 'drawerFront', d.facadeMaterialId, TF, frontW, frontH, { l1: FE, l2: FE, w1: FE, w2: FE }, { x: frontX, y: frontYpos, z: frontZ, sx: frontW, sy: TF, sz: frontH });
    const se: EdgeSides = { l1: Hd, l2: null, w1: null, w2: null };
    add(`drawer-side-l-${key}`, L('Бік шухляди', 'Боковина ящика'), 'drawerSide', d.bodyMaterialId, T, sl, boxH, se, { x: cx + 13, y: by, z: bz, sx: T, sy: sl, sz: boxH });
    add(`drawer-side-r-${key}`, L('Бік шухляди', 'Боковина ящика'), 'drawerSide', d.bodyMaterialId, T, sl, boxH, se, { x: cx + 13 + boxW - T, y: by, z: bz, sx: T, sy: sl, sz: boxH });
    add(`drawer-end-f-${key}`, L('Передня/задня стінка шухляди', 'Передняя/задняя стенка ящика'), 'drawerEnd', d.bodyMaterialId, T, boxW - 2 * T, boxH, se, { x: cx + 13 + T, y: by + sl - T, z: bz, sx: boxW - 2 * T, sy: T, sz: boxH });
    add(`drawer-end-b-${key}`, L('Передня/задня стінка шухляди', 'Передняя/задняя стенка ящика'), 'drawerEnd', d.bodyMaterialId, T, boxW - 2 * T, boxH, se, { x: cx + 13 + T, y: by, z: bz, sx: boxW - 2 * T, sy: T, sz: boxH });
    add(`drawer-bottom-${key}`, L('Дно шухляди', 'Дно ящика'), 'drawerBottom', d.backMaterialId, TB, sl, boxW, NO_EDGES, { x: cx + 13, y: by, z: bz - TB, sx: boxW, sy: sl, sz: TB }, 'none');
    slides.set(sl, (slides.get(sl) ?? 0) + 1);
    if (d.facade.handles) handles += 1;
    // сборка ящика: 4 угла × 2 крепежа
    addHw('confirmat', L('Конфірмат 7×50', 'Конфирмат 7×50'), 8);
  };

  cols.forEach((col, ci) => {
    const cw = widths[ci];
    const cx = colX[ci];
    const spanX0 = ci === 0 ? 0 : cx - T / 2;
    const spanX1 = ci === cols.length - 1 ? W : cx + cw + T / 2;
    const span = spanX1 - spanX0;

    // ящики
    let drawerBlock = 0;
    const nd = Math.max(0, Math.round(col.drawers));
    if (nd > 0) {
      if (ft === 'drawers') {
        const fh = (zoneH - nd * gap) / nd;
        for (let i = 0; i < nd; i++) {
          addDrawer(ci, i, cw, cx, zoneZ0 + gap / 2 + i * (fh + gap), fh, span - gap, spanX0 + gap / 2, frontY, innerDepth);
        }
        drawerBlock = innerH; // вся секция занята ящиками
      } else {
        const fh = col.drawerHeight;
        for (let i = 0; i < nd; i++) {
          addDrawer(ci, i, cw, cx, innerZ0 + gap + i * (fh + gap), fh, cw - 2 * gap, cx + gap, innerY1 - TF, innerDepth - TF);
        }
        drawerBlock = Math.min(innerH, nd * (fh + gap) + gap);
      }
    }

    // полки
    const ns = Math.max(0, Math.round(col.shelves));
    if (ns > 0 && drawerBlock < innerH - 50) {
      const support = d.shelfFixing === 'support';
      const sl = cw - (support ? 2 : 0);
      const edges: EdgeSides = support ? { l1: F, l2: Hd, w1: Hd, w2: Hd } : { l1: F, l2: Hd, w1: null, w2: null };
      const zs0 = innerZ0 + drawerBlock;
      const zs: number[] = [];
      let free = ns;
      let zStart = zs0;
      if (nd > 0 && ft !== 'drawers') {
        zs.push(zs0);
        free -= 1;
        zStart = zs0 + T;
      }
      const zoneFree = innerZ1 - zStart;
      const g = (zoneFree - free * T) / (free + 1);
      for (let i = 1; i <= free; i++) zs.push(zStart + i * g + (i - 1) * T);
      zs.forEach((z, i) => {
        add(`shelf-c${ci + 1}-${i + 1}`, L('Полиця', 'Полка'), 'shelf', d.bodyMaterialId, T, sl, innerDepth, edges, { x: cx + (cw - sl) / 2, y: innerY0, z, sx: sl, sy: innerDepth, sz: T });
        const coverShelf = nd > 0 && ft !== 'drawers' && i === 0;
        if (support && !coverShelf) addHw('shelf-pin', L('Полицетримач', 'Полкодержатель'), 4);
        else joints += 2;
      });
      if (cw > 900) warnings.push(L(`Секція ${ci + 1}: проліт полиці понад 900 мм — можливе провисання`, `Секция ${ci + 1}: пролёт полки более 900 мм — возможен прогиб`));
    }

    if (col.rod) {
      addHw('rod', L('Штанга для одягу', 'Штанга для одежды'), r1((cw - 4) / 1000), METER);
      addHw('rod-holder', L('Штанготримач', 'Штангодержатель'), 2);
    }

    // распашные фасады
    if (ft === 'hinged' && col.doors > 0) {
      const kd = Math.round(col.doors);
      const inset = d.facade.inset;
      const dw = inset ? (cw - (kd + 1) * gap) / kd : (span - kd * gap) / kd;
      const dh = inset ? innerH - 2 * gap : zoneH - gap;
      const dz = inset ? innerZ0 + gap : zoneZ0 + gap / 2;
      const dy = inset ? frontY - TF : frontY;
      if (dw > 600) warnings.push(L(`Секція ${ci + 1}: фасад ширший за 600 мм — краще розділити на два`, `Секция ${ci + 1}: фасад шире 600 мм — лучше разделить на два`));
      for (let j = 0; j < kd; j++) {
        const dx = inset ? cx + gap + j * (dw + gap) : spanX0 + gap / 2 + j * (dw + gap);
        add(`facade-c${ci + 1}-${j + 1}`, L('Фасад', 'Фасад'), 'facade', d.facadeMaterialId, TF, dh, dw, { l1: FE, l2: FE, w1: FE, w2: FE }, { x: dx, y: dy, z: dz, sx: dw, sy: TF, sz: dh });
        // сторона навески: крайний левый фасад — слева, крайний правый — справа
        const hingeLeft = kd === 1 ? ci < cols.length - 1 || cols.length === 1 : j < kd / 2;
        const outer = hingeLeft ? ci === 0 : ci === cols.length - 1;
        const type = inset ? 'inset' : outer ? 'overlay' : 'half';
        hinges[type] += hingeCount(dh);
        if (d.facade.handles) handles += 1;
      }
      if (kd > 2) warnings.push(L(`Секція ${ci + 1}: більше двох дверей на секцію — середні ніде навісити`, `Секция ${ci + 1}: более двух дверей на секцию — средние негде навесить`));
    }
  });

  // ── Двери-купе ──
  if (ft === 'sliding') {
    const n = Math.max(2, Math.round(d.facade.slidingCount));
    const openW = innerW;
    const openH = innerH;
    const ov = d.facade.slidingOverlap;
    const doorW = (openW + ov * (n - 1)) / n;
    const doorH = openH - d.facade.slidingHeightDeduct;
    for (let i = 0; i < n; i++) {
      const dy = frontY - d.facade.slidingZone + 15 + (i % 2) * 40;
      add(
        `sliding-${i + 1}`,
        L('Наповнення дверей-купе', 'Наполнение двери-купе'),
        'slidingDoor',
        d.facadeMaterialId,
        TF,
        doorH,
        doorW,
        NO_EDGES,
        { x: T + i * (doorW - ov), y: dy, z: innerZ0 + d.facade.slidingHeightDeduct / 2, sx: doorW, sy: TF, sz: doorH },
        'length',
        !d.facade.slidingInfill,
      );
    }
    addHw('sliding-door', L(`Двері-купе ${Math.round(doorW)}×${Math.round(doorH)} мм`, `Дверь-купе ${Math.round(doorW)}×${Math.round(doorH)} мм`), n, PCS, L('розмір полотна з профілем; уточнити за таблицею системи', 'размер полотна с профилем; уточнить по таблице системы'));
    addHw('sliding-track-top', L('Напрямна верхня для купе', 'Направляющая верхняя для купе'), r1(openW / 1000), METER);
    addHw('sliding-track-bottom', L('Напрямна нижня для купе', 'Направляющая нижняя для купе'), r1(openW / 1000), METER);
    addHw('sliding-rollers', L('Комплект роликів на двері', 'Комплект роликов на дверь'), n, SET);
    if (doorW > 1200) warnings.push(L('Двері-купе ширші за 1200 мм — збільште кількість дверей', 'Двери-купе шире 1200 мм — увеличьте количество дверей'));
    if (doorW < 500) warnings.push(L('Двері-купе вужчі за 500 мм — зменште кількість дверей', 'Двери-купе уже 500 мм — уменьшите количество дверей'));
  }

  // ── Задняя стенка ──
  if (d.back.mode !== 'none' && back) {
    let bw: number;
    let bh: number;
    let bx: number;
    let bz: number;
    let by: number;
    if (groove) {
      const gd = d.back.grooveDepth;
      bw = innerW + 2 * gd - 2;
      bh = innerH + 2 * gd - 2;
      bx = T - gd + 1;
      bz = innerZ0 - gd + 1;
      by = d.back.grooveInset;
    } else {
      const og = d.back.overlayGap;
      const zb0 = z0 + plinth;
      bw = W - 2 * og;
      bh = H - zb0 - 2 * og;
      bx = og;
      bz = zb0 + og;
      by = 0;
    }
    const SL = back.sheetL - 2 * cat.trim;
    const SW = back.sheetW - 2 * cat.trim;
    const fits = (w: number, h: number) => (w <= SL && h <= SW) || (w <= SW && h <= SL);
    let k = 1;
    while (k < 8 && !fits(bw / k, bh)) k += 1;
    if (!fits(bw / k, bh)) warnings.push(L('Задня стінка не вміщується на лист навіть частинами', 'Задняя стенка не помещается на лист даже частями'));
    else if (k > 1) warnings.push(L(`Задню стінку розділено на ${k} частини (не вміщується на лист)`, `Задняя стенка разделена на ${k} части (не помещается на лист)`));
    const pw = bw / k;
    for (let i = 0; i < k; i++) {
      add(k > 1 ? `back-${i + 1}` : 'back', L('Задня стінка', 'Задняя стенка'), 'back', d.backMaterialId, TB, bh, pw, NO_EDGES, { x: bx + i * pw, y: by, z: bz, sx: pw, sy: TB, sz: bh }, 'none');
    }
    if (!groove) addHw('back-screw', L('Шуруп 3×16 (задня стінка)', 'Шуруп 3×16 (задняя стенка)'), Math.ceil((2 * (bw + bh) + (k - 1) * bh) / 150));
  }

  // ── Фурнитура ──
  if (d.joint === 'confirmat') addHw('confirmat', L('Конфірмат 7×50', 'Конфирмат 7×50'), joints * jointFasteners);
  else {
    addHw('eccentric', L('Ексцентрикова стяжка (мініфікс)', 'Эксцентриковая стяжка (минификс)'), joints * jointFasteners);
    addHw('dowel', L('Шкант 8×30', 'Шкант 8×30'), joints * jointFasteners);
  }
  if (hinges.overlay) addHw('hinge-overlay', HINGE_NAMES.overlay, hinges.overlay);
  if (hinges.half) addHw('hinge-half', HINGE_NAMES.half, hinges.half);
  if (hinges.inset) addHw('hinge-inset', HINGE_NAMES.inset, hinges.inset);
  for (const [len, qty] of [...slides.entries()].sort((a, b) => a[0] - b[0])) {
    addHw(`slide-${len}`, L(`Напрямні кулькові ${len} мм`, `Направляющие шариковые ${len} мм`), qty, PAIR);
  }
  if (handles) addHw('handle', L('Ручка', 'Ручка'), handles);
  if (d.legs > 0) addHw('leg', L(`Ніжка регульована ${d.legs} мм`, `Ножка регулируемая ${d.legs} мм`), 2 * (Math.ceil(W / 800) + 1));

  // ── Переопределения и ручные детали ──
  const out: Part[] = [];
  for (const p of parts) {
    const ov = d.overrides[p.key];
    if (ov?.skip) continue;
    let q = p;
    if (ov?.edges) q = { ...q, edges: { ...q.edges, ...ov.edges } };
    if (ov?.materialId) {
      const b = board(ov.materialId);
      if (b) q = { ...q, materialId: b.id, thickness: b.thickness };
    }
    out.push(q);
  }
  for (const m of d.extraParts) {
    const b = board(m.materialId);
    out.push({ key: `manual-${m.id}`, name: L(m.name, m.name), role: 'manual', materialId: m.materialId, length: m.length, width: m.width, thickness: b?.thickness ?? 0, edges: m.edges, qty: Math.max(1, Math.round(m.qty)), grain: m.grain });
  }

  const facadeAdd = ft === 'hinged' && !d.facade.inset ? TF : ft === 'drawers' ? TF : 0;
  return { parts: out, hardware: [...hw.values()].map((h) => ({ ...h, qty: r1(h.qty) })), warnings, overallDepth: D + facadeAdd };
}

function r1(x: number): number {
  return Math.round(x * 10) / 10;
}
