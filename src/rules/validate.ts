// Проверки модели по справочнику норм → список нарушений с переходом к объекту.
import { underfloorCalc } from '../calc/underfloor';
import { WET_ROOMS } from '../catalog/finishes';
import { itemDef, num, routeDef, str } from '../catalog/registry';
import { itemSize } from '../draw2d/plan';
import { add, circlePolygon, closestOnSegment, cross, dist, distToPolygonEdge, eq, norm, pointInPolygon, polygonDistance, rectCorners, rotate, segmentIntersection, sub } from '../model/geometry';
import type { Item, Level, LS, Project, Room, Sel, Vec2 } from '../model/types';
import { detectRooms, wallDir, wallLength } from '../model/walls';
import { ruleValue } from './index';

export type Severity = 'error' | 'warn' | 'info';

export interface Issue {
  id: string;
  ruleId: string;
  severity: Severity;
  message: LS;
  sel?: Sel;
  point?: Vec2;
  levelId?: string;
}

const L = (uk: string, ru: string): LS => ({ uk, ru });
const m = (mm: number) => (mm / 1000).toFixed(2).replace('.', ',');

/** Точка объекта, сдвинутая «вперёд» от стены — для определения помещения. */
const frontPoint = (it: Item, by = 80): Vec2 => add({ x: it.x, y: it.y }, rotate({ x: 0, y: by }, it.rot));

const roomOf = (level: Level, it: Item): Room | undefined => level.rooms.find((r) => pointInPolygon(frontPoint(it), r.polygon) || pointInPolygon({ x: it.x, y: it.y }, r.polygon));

const footprint = (it: Item): Vec2[] => {
  const s = itemSize(it);
  return rectCorners({ x: it.x, y: it.y }, s.w, s.d, it.rot);
};

const WATER_KINDS = ['bathtub', 'shower-cabin', 'shower-walkin', 'vanity', 'sink-pedestal', 'k-sink'];

export function validateProject(p: Project): Issue[] {
  const out: Issue[] = [];
  const rv = (id: string, fb = 0) => ruleValue(p.ruleOverrides, id, fb);
  let n = 0;
  const push = (ruleId: string, severity: Severity, message: LS, extra: Partial<Issue> = {}) => out.push({ id: `${ruleId}-${n++}`, ruleId, severity, message, ...extra });

  // ── Перепланировка (квартира, есть зафиксированное исходное состояние) ──
  if (p.baseline) {
    let newWalls = 0;
    for (const lvl of p.levels) {
      const base = p.baseline.filter((b) => b.levelId === lvl.id);
      const baseIds = new Set(base.map((b) => b.id));
      for (const b of base) {
        const w = lvl.walls.find((x) => x.id === b.id);
        const at = { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
        if (!w) {
          push('apt.redevelopment', b.loadBearing ? 'error' : 'warn', b.loadBearing ? L('Знесено несучу стіну — це заборонено без проєкту підсилення та погодження', 'Снесена несущая стена — это запрещено без проекта усиления и согласования') : L('Знесено перегородку — перепланування потрібно узаконити (внести зміни до техпаспорта)', 'Снесена перегородка — перепланировку нужно узаконить (внести изменения в техпаспорт)'), { point: at, levelId: lvl.id });
          continue;
        }
        const sel: Sel = { type: 'wall', id: w.id, scope: lvl.id };
        const moved = !((eq(w.a, b.a, 2) && eq(w.b, b.b, 2)) || (eq(w.a, b.b, 2) && eq(w.b, b.a, 2)));
        if (moved || Math.abs(w.thickness - b.thickness) > 1) {
          push('apt.redevelopment', b.loadBearing ? 'error' : 'warn', b.loadBearing ? L('Змінено несучу стіну — потрібен проєкт і погодження', 'Изменена несущая стена — нужен проект и согласование') : L('Перенесено перегородку — перепланування потрібно узаконити', 'Перенесена перегородка — перепланировку нужно узаконить'), { sel, point: at, levelId: lvl.id });
        }
        if (b.loadBearing && !moved) {
          for (const o of lvl.openings.filter((x) => x.wallId === w.id)) {
            const known = b.openings.some((bo) => Math.abs(bo.pos - o.pos) < 60 && Math.abs(bo.width - o.width) < 60);
            if (!known) push('apt.redevelopment', 'error', L('Новий або змінений проріз у несучій стіні — потрібен проєкт підсилення та узаконення', 'Новый или изменённый проём в несущей стене — нужен проект усиления и узаконивание'), { sel: { type: 'opening', id: o.id, scope: lvl.id }, levelId: lvl.id });
          }
        }
        if (b.loadBearing && !w.loadBearing) push('apt.redevelopment', 'warn', L('Стіну з техпаспорта позначено як ненесучу — перевірте за проєктом будинку', 'Стена из техпаспорта помечена как ненесущая — проверьте по проекту дома'), { sel, levelId: lvl.id });
      }
      newWalls += lvl.walls.filter((w) => !baseIds.has(w.id)).length;
    }
    if (newWalls > 0) push('apt.redevelopment', 'info', L(`Додано нових стін: ${newWalls}. Зміни планування вносяться до техпаспорта`, `Добавлено новых стен: ${newWalls}. Изменения планировки вносятся в техпаспорт`));
  }

  for (const lvl of p.levels) {
    const scope = lvl.id;
    // ── Планировка ──
    const minH = rv('room.ceiling.minHeight', 2500);
    if (lvl.rooms.length && lvl.height < minH) push('room.ceiling.minHeight', 'warn', L(`${lvl.name}: висота стелі ${m(lvl.height)} м менша за ${m(minH)} м`, `${lvl.name}: высота потолка ${m(lvl.height)} м меньше ${m(minH)} м`), { levelId: scope });
    for (const r of lvl.rooms) {
      const sel: Sel = { type: 'room', id: r.id, scope };
      if (r.type === 'kitchen' && r.area < rv('room.kitchen.minArea', 7)) push('room.kitchen.minArea', 'warn', L(`${r.name}: площа ${r.area} м² менша за мінімальну ${rv('room.kitchen.minArea')} м²`, `${r.name}: площадь ${r.area} м² меньше минимальной ${rv('room.kitchen.minArea')} м²`), { sel, point: r.seed, levelId: scope });
      if ((r.type === 'living' || r.type === 'bedroom') && r.area < rv('room.living.minArea', 10)) push('room.living.minArea', 'warn', L(`${r.name}: площа ${r.area} м² менша за мінімальну ${rv('room.living.minArea')} м²`, `${r.name}: площадь ${r.area} м² меньше минимальной ${rv('room.living.minArea')} м²`), { sel, point: r.seed, levelId: scope });
    }
    for (const o of lvl.openings) {
      const w = lvl.walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const sel: Sel = { type: 'opening', id: o.id, scope };
      const Lw = wallLength(w);
      if (o.pos - o.width / 2 < -1 || o.pos + o.width / 2 > Lw + 1) push('geometry.opening', 'warn', L('Проріз виходить за межі стіни', 'Проём выходит за пределы стены'), { sel, levelId: scope });
      if (o.kind === 'door') {
        const min = o.style === 'entrance' ? rv('door.entrance.minWidth', 900) : rv('door.minWidth', 700);
        if (o.width < min) push(o.style === 'entrance' ? 'door.entrance.minWidth' : 'door.minWidth', 'warn', L(`Двері ${o.width} мм вужчі за мінімум ${min} мм`, `Дверь ${o.width} мм уже минимума ${min} мм`), { sel, levelId: scope });
      }
      for (const o2 of lvl.openings) {
        if (o2.id <= o.id || o2.wallId !== o.wallId) continue;
        if (Math.abs(o.pos - o2.pos) < (o.width + o2.width) / 2 && !(o.sill + o.height <= o2.sill || o2.sill + o2.height <= o.sill)) push('geometry.opening', 'warn', L('Прорізи перетинаються', 'Проёмы пересекаются'), { sel, levelId: scope });
      }
    }

    // ── Электрика во влажных помещениях ──
    const elPoints = lvl.items.filter((it) => it.kind === 'el-socket' || it.kind === 'el-switch' || it.kind === 'el-cooker');
    const water = lvl.items.filter((it) => WATER_KINDS.includes(it.kind));
    const minWater = rv('el.bath.socketDistance', 600);
    for (const it of elPoints) {
      const room = roomOf(lvl, it);
      const sel: Sel = { type: 'item', id: it.id, scope };
      if (room && WET_ROOMS.includes(room.type)) {
        if (it.kind === 'el-socket' && !it.params.ip44) push('el.bath.socketIp', 'warn', L(`${room.name}: розетка має бути вологозахищеною (IP44) і підключеною через ПЗВ`, `${room.name}: розетка должна быть влагозащищённой (IP44) и подключённой через УЗО`), { sel, point: it, levelId: scope });
        if (it.kind === 'el-switch') push('el.bath.socketIp', 'info', L(`${room.name}: вимикач у вологому приміщенні — краще винести назовні`, `${room.name}: выключатель во влажном помещении — лучше вынести наружу`), { sel, point: it, levelId: scope });
      }
      if (it.kind !== 'el-socket') continue;
      for (const wt of water) {
        if (room && roomOf(lvl, wt)?.id !== room.id) continue;
        const d = distToFootprint({ x: it.x, y: it.y }, footprint(wt));
        if (d < minWater) {
          push('el.bath.socketDistance', 'warn', L(`Розетка за ${Math.round(d)} мм від «${itemDef(wt.kind)?.name.uk}» — менше ${minWater} мм (заборонена зона)`, `Розетка в ${Math.round(d)} мм от «${itemDef(wt.kind)?.name.ru}» — меньше ${minWater} мм (запретная зона)`), { sel, point: it, levelId: scope });
          break;
        }
      }
    }
    // ── Электрика рядом с газом ──
    const gas = lvl.items.filter((it) => itemDef(it.kind)?.layer === 'gas');
    const minGas = rv('el.gas.socketDistance', 500);
    for (const it of lvl.items.filter((x) => itemDef(x.kind)?.layer === 'electrical' && x.kind !== 'el-light')) {
      for (const g of gas) {
        const d = dist(it, g);
        if (d < minGas) {
          push('el.gas.socketDistance', 'warn', L(`Електроточка за ${Math.round(d)} мм від газового обладнання — менше ${minGas} мм`, `Электроточка в ${Math.round(d)} мм от газового оборудования — меньше ${minGas} мм`), { sel: { type: 'item', id: it.id, scope }, point: it, levelId: scope });
          break;
        }
      }
    }
    if (gas.length) push('gas.disclaimer', 'info', L('Газ: точки показано лише для довідки. Проєктування і підключення виконує ліцензована організація (оператор ГРМ)', 'Газ: точки показаны только для справки. Проектирование и подключение выполняет лицензированная организация (оператор ГРМ)'), { sel: { type: 'item', id: gas[0].id, scope }, point: gas[0], levelId: scope });

    // ── Штробы ──
    const cables = lvl.routes.filter((r) => r.kind === 'el-cable' && r.params.chase);
    const pipes = lvl.routes.filter((r) => ['plumbing', 'heating'].includes(routeDef(r.kind)?.layer ?? ''));
    const clearance = rv('el.chase.pipeClearance', 100);
    for (const c of cables) {
      const cz = num(c.params, 'z', 0);
      let hit = false;
      for (const pp of pipes) {
        if (hit) break;
        const pz = num(pp.params, 'z', 0);
        if (Math.abs(cz - pz) > clearance + num(pp.params, 'dia', 20)) continue;
        for (let i = 1; i < c.points.length && !hit; i++) {
          for (let j = 1; j < pp.points.length; j++) {
            const x = segmentIntersection(c.points[i - 1], c.points[i], pp.points[j - 1], pp.points[j]);
            if (x) {
              push('el.chase.pipeClearance', 'warn', L(`Штроба з кабелем перетинає трубу «${routeDef(pp.kind)?.name.uk}» на тій самій висоті`, `Штроба с кабелем пересекает трубу «${routeDef(pp.kind)?.name.ru}» на той же высоте`), { sel: { type: 'route', id: c.id, scope }, point: x.point, levelId: scope });
              hit = true;
              break;
            }
          }
        }
      }
      // горизонтальные штробы в несущих стенах
      const maxLen = rv('el.chase.bearingMaxLength', 300);
      for (let i = 1; i < c.points.length; i++) {
        const a = c.points[i - 1];
        const b = c.points[i];
        const sl = dist(a, b);
        if (sl <= maxLen) continue;
        const sd = norm(sub(b, a));
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const w = lvl.walls.find((x) => x.loadBearing && Math.abs(cross(wallDir(x), sd)) < 0.05 && closestOnSegment(mid, x.a, x.b).dist <= x.thickness / 2 + 30);
        if (w) {
          push('el.chase.bearingMaxLength', 'warn', L(`Горизонтальна штроба ${m(sl)} м у несучій стіні — заборонена/обмежена, прокладіть трасу по стелі чи в підлозі`, `Горизонтальная штроба ${m(sl)} м в несущей стене — запрещена/ограничена, проложите трассу по потолку или в полу`), { sel: { type: 'route', id: c.id, scope }, point: mid, levelId: scope });
          break;
        }
      }
    }

    // ── Канализация: уклоны ──
    for (const r of lvl.routes.filter((x) => x.kind === 'pl-sewer')) {
      const dia = num(r.params, 'dia', 50);
      const slope = num(r.params, 'slope', 0);
      const min = rv(`pl.sewer.minSlope.${dia}`, 20);
      const max = rv('pl.sewer.maxSlope', 150);
      const sel: Sel = { type: 'route', id: r.id, scope };
      if (slope < min) push(`pl.sewer.minSlope.${dia}`, 'error', L(`Каналізація Ø${dia}: ухил ${slope} мм/м менший за мінімальний ${min} мм/м`, `Канализация Ø${dia}: уклон ${slope} мм/м меньше минимального ${min} мм/м`), { sel, point: r.points[0], levelId: scope });
      else if (slope > max) push('pl.sewer.maxSlope', 'warn', L(`Каналізація Ø${dia}: ухил ${slope} мм/м більший за максимальний ${max} мм/м`, `Канализация Ø${dia}: уклон ${slope} мм/м больше максимального ${max} мм/м`), { sel, point: r.points[0], levelId: scope });
    }

    // ── Тёплый пол ──
    for (const z of lvl.zones.filter((x) => x.kind === 'ht-floor')) {
      const dia = num(z.params, 'dia', 16);
      const max = rv(`ht.floor.maxLoop.${dia}`, 90);
      const res = underfloorCalc(z.points, num(z.params, 'pitch', 150), num(z.params, 'offset', 100), num(z.params, 'feed', 3000), max);
      if (res.loops > 1) push(`ht.floor.maxLoop.${dia}`, 'info', L(`Тепла підлога ${res.areaM2} м²: розділено на ${res.loops} контури по ${res.loopM} м (макс. ${max} м)`, `Тёплый пол ${res.areaM2} м²: разделён на ${res.loops} контура по ${res.loopM} м (макс. ${max} м)`), { sel: { type: 'zone', id: z.id, scope }, point: z.points[0], levelId: scope });
    }

    // ── Вентиляция ──
    if (rv('vt.wet.exhaustRequired', 1) > 0) {
      const vents = lvl.items.filter((it) => ['vt-exhaust', 'vt-fan', 'vt-shaft', 'k-hood'].includes(it.kind));
      const hasEng = lvl.items.some((it) => itemDef(it.kind)?.layer === 'ventilation');
      if (hasEng) {
        for (const r of lvl.rooms) {
          if (!WET_ROOMS.includes(r.type) && r.type !== 'kitchen') continue;
          if (!vents.some((v) => roomOf(lvl, v)?.id === r.id)) push('vt.wet.exhaustRequired', 'warn', L(`${r.name}: немає витяжки`, `${r.name}: нет вытяжки`), { sel: { type: 'room', id: r.id, scope }, point: r.seed, levelId: scope });
        }
      }
    }
  }

  // ── Участок ──
  const site = p.site;
  if (site && site.boundary.length >= 3) {
    const ground = p.levels[0];
    const outlines = ground ? detectRooms(ground.walls).outline : [];
    const toBoundary = (poly: Vec2[]) => Math.min(...poly.map((q) => distToPolygonEdge(q, site.boundary)));
    const outside = (poly: Vec2[]) => poly.some((q) => !pointInPolygon(q, site.boundary));
    const minHouse = rv('site.house.boundary', 1000);
    for (const o of outlines) {
      if (outside(o)) push('site.house.boundary', 'error', L('Будинок виходить за межі ділянки', 'Дом выходит за границы участка'), { point: o[0] });
      else if (toBoundary(o) < minHouse) push('site.house.boundary', 'warn', L(`Будинок за ${m(toBoundary(o))} м від межі ділянки — менше ${m(minHouse)} м`, `Дом в ${m(toBoundary(o))} м от границы участка — меньше ${m(minHouse)} м`), { point: o[0] });
    }
    const fp = (it: Item): Vec2[] => {
      const s = itemSize(it);
      return ['tree', 'bush', 'septic', 'well', 'borehole'].includes(it.kind) ? circlePolygon({ x: it.x, y: it.y }, it.kind === 'tree' || it.kind === 'bush' ? 100 : s.w / 2, 16) : rectCorners({ x: it.x, y: it.y }, s.w, s.d, it.rot);
    };
    const houseDist = (poly: Vec2[]) => (outlines.length ? Math.min(...outlines.map((o) => polygonDistance(poly, o))) : Infinity);
    const check = (it: Item, ruleId: string, d: number, what: [string, string], to: [string, string]) => {
      const min = rv(ruleId);
      if (d < min) push(ruleId, 'warn', L(`${what[0]} за ${m(d)} м ${to[0]} — менше ${m(min)} м`, `${what[1]} в ${m(d)} м ${to[1]} — меньше ${m(min)} м`), { sel: { type: 'item', id: it.id, scope: 'site' }, point: it });
    };
    const TO_B: [string, string] = ['від межі ділянки', 'от границы участка'];
    const TO_H: [string, string] = ['від будинку', 'от дома'];
    const wells = site.items.filter((x) => x.kind === 'well' || x.kind === 'borehole');
    for (const it of site.items) {
      const poly = fp(it);
      const sel: Sel = { type: 'item', id: it.id, scope: 'site' };
      if (outside(poly)) {
        push('site.outside', 'warn', L(`«${itemDef(it.kind)?.name.uk}» виходить за межі ділянки`, `«${itemDef(it.kind)?.name.ru}» выходит за границы участка`), { sel, point: it });
        continue;
      }
      const db = toBoundary(poly);
      if (it.kind === 'tree') {
        check(it, 'site.tree.boundary', db, ['Дерево', 'Дерево'], TO_B);
        check(it, 'site.tree.house', houseDist(poly), ['Дерево', 'Дерево'], TO_H);
      } else if (it.kind === 'bush') check(it, 'site.bush.boundary', db, ['Кущ', 'Куст'], TO_B);
      else if (it.kind === 'septic') {
        check(it, 'site.septic.boundary', db, ['Септик', 'Септик'], TO_B);
        check(it, 'site.septic.house', houseDist(poly), ['Септик', 'Септик'], TO_H);
        for (const w of wells) check(it, 'site.septic.well', Math.max(0, dist(it, w) - itemSize(it).w / 2 - itemSize(w).w / 2), ['Септик', 'Септик'], ['від колодязя/свердловини', 'от колодца/скважины']);
      } else if (it.kind === 'outbuilding' || it.kind === 'gazebo' || it.kind === 'carport') check(it, 'site.outbuilding.boundary', db, ['Споруда', 'Постройка'], TO_B);
    }
    for (const z of site.zones.filter((x) => x.kind === 'pool')) {
      const d = toBoundary(z.points);
      const min = rv('site.pool.boundary', 2000);
      if (d < min) push('site.pool.boundary', 'warn', L(`Басейн за ${m(d)} м від межі ділянки — менше ${m(min)} м`, `Бассейн в ${m(d)} м от границы участка — меньше ${m(min)} м`), { sel: { type: 'zone', id: z.id, scope: 'site' }, point: z.points[0] });
    }
    const maxFence = rv('site.fence.maxHeight', 2000);
    for (const r of site.routes.filter((x) => x.kind === 'fence')) {
      if (num(r.params, 'h', 0) > maxFence) push('site.fence.maxHeight', 'warn', L(`Паркан ${m(num(r.params, 'h'))} м вищий за ${m(maxFence)} м`, `Забор ${m(num(r.params, 'h'))} м выше ${m(maxFence)} м`), { sel: { type: 'route', id: r.id, scope: 'site' }, point: r.points[0] });
    }
  }
  void str;
  return out;
}

function distToFootprint(pt: Vec2, poly: Vec2[]): number {
  if (pointInPolygon(pt, poly)) return 0;
  return distToPolygonEdge(pt, poly);
}
