// Смета материалов: стены, утеплитель, отделка, плитка, покрытия, кабель, трубы, приборы, плиты для мебели.
// Количество считается из модели; запас (%) задаётся по категории; цены вводит пользователь.
import { buildCutList, edgeTotals } from '../cabinet/cutlist';
import { generateCabinet } from '../cabinet/generate';
import { nestCutList } from '../cabinet/nesting';
import { wallMaterial } from '../catalog/finishes';
import { itemDef, num, routeDef } from '../catalog/registry';
import type { Finish, Level, LS, Project } from '../model/types';
import { roomSurfaces, surfaceNetArea, wallLen } from '../model/walls';
import { ruleValue } from '../rules';
import { LINOLEUM_ROLL_W, WALLPAPER_ROLL_L, WALLPAPER_ROLL_W, linoleumCalc, wallpaperCalc } from './materials';
import { networkSummary } from './networks';
import { isTileType, isTiled, tileLayout, tileLayoutRect } from './tiles';
import { underfloorCalc } from './underfloor';

export type EstimateCategory = 'demolition' | 'walls' | 'insulation' | 'plaster' | 'gkl' | 'paint' | 'wallpaper' | 'tile' | 'flooring' | 'ceiling' | 'cable' | 'pipes' | 'devices' | 'furniture';

export const CATEGORY_NAMES: Record<EstimateCategory, LS> = {
  demolition: { uk: 'Демонтаж', ru: 'Демонтаж' },
  walls: { uk: 'Стіни та перегородки', ru: 'Стены и перегородки' },
  insulation: { uk: 'Утеплення', ru: 'Утепление' },
  plaster: { uk: 'Штукатурка', ru: 'Штукатурка' },
  gkl: { uk: 'Гіпсокартон і профіль', ru: 'Гипсокартон и профиль' },
  paint: { uk: 'Фарбування', ru: 'Покраска' },
  wallpaper: { uk: 'Шпалери', ru: 'Обои' },
  tile: { uk: 'Плитка та панелі', ru: 'Плитка и панели' },
  flooring: { uk: 'Підлогові покриття', ru: 'Напольные покрытия' },
  ceiling: { uk: 'Стелі', ru: 'Потолки' },
  cable: { uk: 'Кабель і штроби', ru: 'Кабель и штробы' },
  pipes: { uk: 'Труби', ru: 'Трубы' },
  devices: { uk: 'Прилади та обладнання', ru: 'Приборы и оборудование' },
  furniture: { uk: 'Матеріали для корпусних меблів', ru: 'Материалы для корпусной мебели' },
};

export const DEFAULT_RESERVE: Record<EstimateCategory, number> = {
  demolition: 0,
  walls: 5,
  insulation: 5,
  plaster: 10,
  gkl: 10,
  paint: 10,
  wallpaper: 5,
  tile: 10,
  flooring: 7,
  ceiling: 5,
  cable: 10,
  pipes: 10,
  devices: 0,
  furniture: 0,
};

export interface EstimateLine {
  key: string;
  category: EstimateCategory;
  name: LS;
  unit: LS;
  /** Чистое количество. */
  qty: number;
  reservePct: number;
  /** К закупке (с запасом, округлено вверх до разумной единицы). */
  total: number;
  price: number;
  /** Откуда цена: введена в смете, взята из материала или не задана. */
  priceFrom: 'user' | 'material' | null;
  /** Ссылка на товар в магазине (из материала). */
  url?: string;
  sum: number;
  note?: LS;
}

const L = (uk: string, ru: string): LS => ({ uk, ru });
const U = {
  pcs: L('шт', 'шт'),
  m: L('м', 'м'),
  m2: L('м²', 'м²'),
  m3: L('м³', 'м³'),
  kg: L('кг', 'кг'),
  l: L('л', 'л'),
  sheet: L('лист', 'лист'),
  pack: L('уп.', 'уп.'),
  roll: L('рулон', 'рулон'),
};

/** Утеплитель наружных стен по умолчанию, мм. */
export const INSULATION_THICKNESS = 100;
const GKL_SHEET_M2 = 3; // 1200×2500
const BRICKS_PER_M3 = 394; // одинарный кирпич с растворными швами — ориентировочно
const MORTAR_PER_M3 = 0.23; // м³ раствора на м³ кладки — ориентировочно
const AERATED_GLUE_KG_PER_M3 = 25; // ориентировочно

interface Acc {
  category: EstimateCategory;
  name: LS;
  unit: LS;
  qty: number;
  /** Округление итога: 'int' — вверх до целого, 'dec' — до 0,1. */
  round: 'int' | 'dec';
  note?: LS;
  /** Цена из материала (если пользователь не задал свою в смете). */
  price?: number;
  /** Ссылка на товар в магазине. */
  url?: string;
}

/** Площадь стены нетто (за вычетом проёмов), мм². */
export function wallNetArea(level: Level, wallId: string): number {
  const w = level.walls.find((x) => x.id === wallId);
  if (!w) return 0;
  const H = w.height ?? level.height;
  let a = wallLen(w) * H;
  for (const o of level.openings) {
    if (o.wallId !== wallId) continue;
    a -= o.width * Math.max(0, Math.min(H, o.sill + o.height) - o.sill);
  }
  return Math.max(0, a);
}

export function buildEstimate(p: Project): EstimateLine[] {
  const acc = new Map<string, Acc>();
  const add = (key: string, category: EstimateCategory, name: LS, unit: LS, qty: number, round: 'int' | 'dec' = 'dec', note?: LS, mat?: { price?: number; url?: string }) => {
    if (!(qty > 0)) return;
    const e = acc.get(key);
    if (e) e.qty += qty;
    else acc.set(key, { category, name, unit, qty, round, note, price: mat?.price, url: mat?.url });
  };
  /** Цена и ссылка материала; k — пересчёт цены за единицу материала в цену за единицу строки. */
  const matOf = (f: Finish, k = 1) => ({ price: f.price && f.price > 0 ? Math.round(f.price * k * 100) / 100 : undefined, url: f.shopUrl || undefined });
  const m3 = (v: number) => String(Math.round(v) / 1000).replace('.', ',');
  const fin = (id: string | null | undefined): Finish | undefined => p.finishes.find((f) => f.id === id);
  const ROUGH = L('орієнтовна норма витрати', 'ориентировочная норма расхода');

  for (const lvl of p.levels) {
    // ── Стены ──
    for (const w of lvl.walls) {
      const areaM2 = wallNetArea(lvl, w.id) / 1e6;
      const volM3 = areaM2 * (w.thickness / 1000);
      const mat = wallMaterial(w.material);
      const tk = w.thickness;
      const status = w.status ?? 'new';
      if (status === 'demolish') {
        // демонтаж — отдельный раздел: площадь по материалу и объём строительного мусора
        add(`demo.wall.${mat.id}.${tk}`, 'demolition', L(`Демонтаж стін: ${mat.name.uk}, ${tk} мм`, `Демонтаж стен: ${mat.name.ru}, ${tk} мм`), U.m2, areaM2, 'dec');
        add('demo.waste', 'demolition', L('Будівельне сміття від демонтажу стін', 'Строительный мусор от демонтажа стен'), U.m3, volM3 * 1.3, 'dec', L('з коефіцієнтом розпушення 1,3', 'с коэффициентом разрыхления 1,3'));
        continue;
      }
      // материалы кладки считаются только для новых стен
      if (status === 'existing') continue;
      switch (mat.estimate) {
        case 'aerated': {
          const blockVol = 0.6 * 0.2 * (tk / 1000);
          add(`wall.aerated.${tk}`, 'walls', L(`Газоблок ${tk}×200×600`, `Газоблок ${tk}×200×600`), U.pcs, volM3 / blockVol, 'int');
          add('wall.aerated.glue', 'walls', L('Клей для газоблоку', 'Клей для газоблока'), U.kg, volM3 * AERATED_GLUE_KG_PER_M3, 'int', ROUGH);
          break;
        }
        case 'ceramic': {
          const b = mat.block ?? { l: 248, h: 238 };
          add(`wall.ceramic.${tk}`, 'walls', L(`Керамоблок, стіна ${tk} мм`, `Керамоблок, стена ${tk} мм`), U.pcs, areaM2 / (((b.l + 2) * (b.h + 12)) / 1e6), 'int');
          add('wall.mortar', 'walls', L('Розчин кладковий', 'Раствор кладочный'), U.m3, volM3 * 0.1, 'dec', ROUGH);
          break;
        }
        case 'brick':
          add('wall.brick', 'walls', L('Цегла рядова 250×120×65', 'Кирпич рядовой 250×120×65'), U.pcs, volM3 * BRICKS_PER_M3, 'int', ROUGH);
          add('wall.mortar', 'walls', L('Розчин кладковий', 'Раствор кладочный'), U.m3, volM3 * MORTAR_PER_M3, 'dec', ROUGH);
          break;
        case 'concrete':
          add('wall.concrete', 'walls', L('Бетон (залізобетонні стіни)', 'Бетон (железобетонные стены)'), U.m3, volM3, 'dec');
          break;
        case 'gkl': {
          const lenM = wallLen(w) / 1000;
          const hM = (w.height ?? lvl.height) / 1000;
          add('gkl.sheet', 'gkl', L('Гіпсокартон 12,5 мм 1200×2500', 'Гипсокартон 12,5 мм 1200×2500'), U.sheet, (areaM2 * 2) / GKL_SHEET_M2, 'int');
          add('gkl.cw', 'gkl', L('Профіль стійковий CW', 'Профиль стоечный CW'), U.m, (Math.ceil(lenM / 0.6) + 1) * hM, 'int');
          add('gkl.uw', 'gkl', L('Профіль напрямний UW', 'Профиль направляющий UW'), U.m, lenM * 2, 'int');
          add('gkl.wool', 'gkl', L('Мінвата в перегородку', 'Минвата в перегородку'), U.m2, areaM2, 'dec');
          break;
        }
        default:
          add(`wall.other.${tk}`, 'walls', L(`Стіна, інший матеріал ${tk} мм`, `Стена, другой материал ${tk} мм`), U.m3, volM3, 'dec');
      }
      if (w.exterior && p.kind === 'house') {
        add('insulation.facade', 'insulation', L(`Утеплювач фасадний ${INSULATION_THICKNESS} мм`, `Утеплитель фасадный ${INSULATION_THICKNESS} мм`), U.m2, areaM2, 'dec');
      }
    }

    // ── Отделка стен, полов, потолков по помещениям ──
    for (const r of lvl.rooms) {
      /** Обои: длины оклеиваемых участков помещения по видам обоев (дверные проёмы вычтены). */
      const paperRuns = new Map<string, number>();
      for (const s of roomSurfaces(lvl, r)) {
        const f = fin(s.finishId);
        if (!f) continue;
        const areaM2 = surfaceNetArea(s, lvl.height) / 1e6;
        if (isTiled(f)) {
          const res = tileLayoutRect(s.length, lvl.height, s.openings.map((o) => ({ minX: o.from, maxX: o.to, minY: lvl.height - o.sill - o.height, maxY: lvl.height - o.sill })), f, 0);
          add(`tile.${f.id}`, 'tile', L(`${f.name.uk} (стіни)`, `${f.name.ru} (стены)`), U.pcs, res.total, 'int');
          add(`tile.${f.id}.m2`, 'tile', L(`${f.name.uk} — площа`, `${f.name.ru} — площадь`), U.m2, areaM2, 'dec', f.packArea ? L(`упаковка ${f.packArea} м²`, `упаковка ${f.packArea} м²`) : undefined, matOf(f));
        } else if (f.type === 'plaster') {
          add(`plaster.${f.id}`, 'plaster', f.name, U.m2, areaM2, 'dec');
          add(`plaster.${f.id}.kg`, 'plaster', L(`${f.name.uk} — суміш`, `${f.name.ru} — смесь`), U.kg, areaM2 * (f.consumption ?? 9) * ((f.thickness ?? 10) / 10), 'int', ROUGH, matOf(f));
        } else if (f.type === 'paint') {
          add(`paint.${f.id}`, 'paint', L(`${f.name.uk} (2 шари)`, `${f.name.ru} (2 слоя)`), U.l, areaM2 * (f.consumption ?? 0.25) * 2, 'dec', ROUGH, matOf(f));
          add('paint.area', 'paint', L('Площа фарбування стін', 'Площадь покраски стен'), U.m2, areaM2, 'dec');
        } else if (f.type === 'wallpaper') {
          // полотна не нужны там, где дверь или проём от пола на всю высоту полотна
          const doors = s.openings.filter((o) => o.sill <= 0 && o.height >= 1900).reduce((a, o) => a + (o.to - o.from), 0);
          paperRuns.set(f.id, (paperRuns.get(f.id) ?? 0) + Math.max(0, s.length - doors));
          add(`wallpaper.${f.id}.m2`, 'wallpaper', L(`${f.name.uk} — площа обклеювання`, `${f.name.ru} — площадь оклейки`), U.m2, areaM2, 'dec');
        } else if (f.type === 'gkl') {
          add('gkl.sheet', 'gkl', L('Гіпсокартон 12,5 мм 1200×2500', 'Гипсокартон 12,5 мм 1200×2500'), U.sheet, areaM2 / GKL_SHEET_M2, 'int');
          add('gkl.cd', 'gkl', L('Профіль CD (обшивка)', 'Профиль CD (обшивка)'), U.m, (Math.ceil(s.length / 600) + 1) * (lvl.height / 1000), 'int');
        } else {
          add(`finish.${f.id}`, 'tile', L(`${f.name.uk} (стіни)`, `${f.name.ru} (стены)`), U.m2, areaM2, 'dec', undefined, matOf(f));
        }
      }
      for (const [id, run] of paperRuns) {
        const f = fin(id)!;
        const c = wallpaperCalc([run], lvl.height, f);
        const rollW = f.rollW ?? WALLPAPER_ROLL_W;
        const rollL = f.rollL ?? WALLPAPER_ROLL_L;
        // количество — в долях рулона (полотна / полотен в рулоне): остатки рулона идут в соседнее помещение
        add(
          `wallpaper.${f.id}`,
          'wallpaper',
          f.name,
          U.roll,
          c.strips / c.perRoll,
          'int',
          L(
            `рулон ${m3(rollW)}×${m3(rollL)} м; полотно ${m3(c.stripLen)} м${f.rapport ? `, рапорт ${f.rapport} мм` : ''}; ${c.perRoll} полотен з рулону${c.tooShort ? ' — рулон коротший за полотно!' : ''}`,
            `рулон ${m3(rollW)}×${m3(rollL)} м; полотно ${m3(c.stripLen)} м${f.rapport ? `, раппорт ${f.rapport} мм` : ''}; ${c.perRoll} полотен из рулона${c.tooShort ? ' — рулон короче полотна!' : ''}`,
          ),
          matOf(f),
        );
      }
      const floor = fin(r.floorFinish);
      if (floor) {
        const plank = floor.type === 'laminate' || floor.type === 'parquet';
        if (floor.type === 'linoleum' || floor.type === 'carpet') {
          const rollW = floor.rollW ?? LINOLEUM_ROLL_W;
          const c = linoleumCalc(r.polygon, rollW);
          add(
            `flooring.${floor.id}`,
            'flooring',
            L(`${floor.name.uk} — погонні метри рулону ${m3(rollW)} м`, `${floor.name.ru} — погонные метры рулона ${m3(rollW)} м`),
            U.m,
            c.lengthM,
            'dec',
            L('полотна на всю довжину приміщення + 100 мм на підрізку', 'полотна на всю длину помещения + 100 мм на подрезку'),
            matOf(floor, rollW / 1000),
          );
          add(`flooring.${floor.id}.m2`, 'flooring', L(`${floor.name.uk} — площа підлоги`, `${floor.name.ru} — площадь пола`), U.m2, r.area, 'dec');
        } else if (plank && (floor.packArea ?? 0) > 0) {
          add(
            `flooring.${floor.id}.pack`,
            'flooring',
            L(`${floor.name.uk} — упаковки по ${String(floor.packArea).replace('.', ',')} м²`, `${floor.name.ru} — упаковки по ${String(floor.packArea).replace('.', ',')} м²`),
            U.pack,
            r.area / floor.packArea!,
            'int',
            undefined,
            matOf(floor, floor.packArea),
          );
          add(`flooring.${floor.id}.m2`, 'flooring', L(`${floor.name.uk} — площа підлоги`, `${floor.name.ru} — площадь пола`), U.m2, r.area, 'dec');
        } else if (isTiled(floor)) {
          const res = tileLayout(r.polygon, [], floor.tileW!, floor.tileH!, floor.grout ?? 0, floor.pattern, 0);
          const cat: EstimateCategory = isTileType(floor.type) ? 'tile' : 'flooring';
          if (isTileType(floor.type)) add(`tile.${floor.id}`, cat, L(`${floor.name.uk} (підлога)`, `${floor.name.ru} (пол)`), U.pcs, res.total, 'int');
          add(`${cat}.${floor.id}.m2`, cat, L(`${floor.name.uk} — площа`, `${floor.name.ru} — площадь`), U.m2, r.area, 'dec', floor.packArea ? L(`упаковка ${floor.packArea} м²`, `упаковка ${floor.packArea} м²`) : undefined, matOf(floor));
        } else add(`flooring.${floor.id}`, 'flooring', floor.name, U.m2, r.area, 'dec', undefined, matOf(floor));
      }
      const ceil = fin(r.ceilingFinish);
      if (ceil) {
        if (ceil.type === 'paint') add(`ceiling.${ceil.id}`, 'ceiling', L(`${ceil.name.uk} (2 шари)`, `${ceil.name.ru} (2 слоя)`), U.l, r.area * (ceil.consumption ?? 0.25) * 2, 'dec', ROUGH, matOf(ceil));
        add(`ceiling.${ceil.id}.m2`, 'ceiling', L(`${ceil.name.uk} — площа`, `${ceil.name.ru} — площадь`), U.m2, r.area, 'dec', undefined, ceil.type === 'paint' ? undefined : matOf(ceil));
      }
    }

    // ── Приборы ──
    for (const it of lvl.items) {
      const def = itemDef(it.kind);
      if (!def || def.layer === 'landscape' || def.layer === 'gas') continue;
      if (it.status === 'demolish') {
        add(`demo.item.${it.kind}`, 'demolition', L(`Демонтаж: ${def.name.uk}`, `Демонтаж: ${def.name.ru}`), U.pcs, 1, 'int');
        continue;
      }
      // существующие приборы не закупаются; мебель в смету материалов не входит
      if (def.layer === 'furniture' || it.status === 'existing') continue;
      if (it.kind === 'ht-radiator') add('dev.radiator.sections', 'devices', L('Радіатор, секцій', 'Радиатор, секций'), U.pcs, num(it.params, 'sections', 8), 'int');
      const n = it.kind === 'el-socket' ? Math.max(1, num(it.params, 'count', 1)) : 1;
      add(`dev.${it.kind}`, 'devices', def.name, U.pcs, n, 'int');
    }
    for (const z of lvl.zones) {
      if (z.kind !== 'ht-floor') continue;
      const dia = num(z.params, 'dia', 16);
      const res = underfloorCalc(z.points, num(z.params, 'pitch', 150), num(z.params, 'offset', 100), num(z.params, 'feed', 3000), ruleValue(p.ruleOverrides, `ht.floor.maxLoop.${dia}`, 90));
      add(`pipe.floor.${dia}`, 'pipes', L(`Труба теплої підлоги Ø${dia}`, `Труба тёплого пола Ø${dia}`), U.m, res.pipeM, 'int');
    }
  }

  // ── Сети ──
  const net = networkSummary(p, 0);
  for (const c of net.cables) add(`cable.${c.key}`, 'cable', L(`Кабель ВВГнг ${c.key} мм²`, `Кабель ВВГнг ${c.key} мм²`), U.m, c.netM, 'int');
  for (const c of net.chases) add(`chase.${c.key}`, 'cable', L(`Штроба ${c.key} мм`, `Штроба ${c.key} мм`), U.m, c.lengthM, 'dec');
  for (const pp of net.pipes) {
    const def = routeDef(pp.kind);
    add(`pipe.${pp.key}`, 'pipes', L(`${def?.name.uk ?? pp.kind} Ø${pp.dia}`, `${def?.name.ru ?? pp.kind} Ø${pp.dia}`), U.m, pp.lengthM, 'int');
  }

  // ── Корпусная мебель: листы и кромка по изделиям, стоящим на плане (или всем, если ни одно не стоит) ──
  const placed = new Map<string, number>();
  for (const lvl of p.levels) for (const it of lvl.items) if (it.kind === 'cabinet') placed.set(String(it.params.designId), (placed.get(String(it.params.designId)) ?? 0) + 1);
  for (const d of p.cabinets) {
    const count = placed.get(d.id) ?? 0;
    if (count === 0) continue;
    const res = generateCabinet(d, p.cabinetCatalog);
    const rows = buildCutList(res.parts, p.cabinetCatalog);
    for (const n of nestCutList(rows, p.cabinetCatalog)) {
      const b = p.cabinetCatalog.boards.find((x) => x.id === n.materialId);
      if (b) add(`furn.board.${b.id}`, 'furniture', L(`${b.name.uk}, лист ${b.sheetL}×${b.sheetW}`, `${b.name.ru}, лист ${b.sheetL}×${b.sheetW}`), U.sheet, n.sheets.length * count, 'int');
    }
    for (const e of edgeTotals(res.parts)) {
      const band = p.cabinetCatalog.bands.find((x) => x.id === e.bandId);
      if (band) add(`furn.band.${band.id}`, 'furniture', band.name, U.m, e.grossM * count, 'int');
    }
  }

  const lines: EstimateLine[] = [];
  for (const [key, a] of acc) {
    const reservePct = p.reserves[a.category] ?? DEFAULT_RESERVE[a.category];
    const raw = a.qty * (1 + reservePct / 100);
    const total = a.round === 'int' ? Math.ceil(raw - 1e-9) : Math.ceil(raw * 10 - 1e-9) / 10;
    const own = p.prices[key];
    const price = own ?? a.price ?? 0;
    lines.push({
      key,
      category: a.category,
      name: a.name,
      unit: a.unit,
      qty: Math.round(a.qty * 100) / 100,
      reservePct,
      total,
      price,
      priceFrom: own !== undefined ? 'user' : a.price ? 'material' : null,
      url: a.url,
      sum: Math.round(total * price * 100) / 100,
      note: a.note,
    });
  }
  const order = Object.keys(CATEGORY_NAMES);
  lines.sort((x, y) => order.indexOf(x.category) - order.indexOf(y.category) || x.key.localeCompare(y.key));
  return lines;
}

export const estimateTotal = (lines: EstimateLine[]): number => Math.round(lines.reduce((s, l) => s + l.sum, 0) * 100) / 100;
