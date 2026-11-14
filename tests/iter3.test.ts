// Итерация 3: сдвиг стен (проёмы на месте, мебель едет со стеной, коллизии) и остальные пункты.
import { describe, expect, it } from 'vitest';
import '../src/catalog';
import { finishInUse, isEmptyShopDraft, shopDraftProblem } from '../src/calc/materials';
import { count, countNoun, plural } from '../src/i18n';
import { convexOverlap, itemsFlushToWall, itemsInWalls, openingsOutOfWall, orphanItems } from '../src/model/checks';
import { createProject, createWall, roomDefaults } from '../src/model/defaults';
import { createDemoProject } from '../src/model/demo';
import { MIN_HANGING_BOTTOM, keepOpenings, makeItem, moveEntities, moveNode, raiseHangingLamps, removeEntity, translateWall, translateWalls } from '../src/model/ops';
import { migrateProject } from '../src/model/migrate';
import type { Finish, Level, Opening, Project, Sel } from '../src/model/types';
import { syncRooms } from '../src/model/walls';
import { validateProject } from '../src/rules/validate';
import { openingMarkPos, openingMarks } from '../src/draw2d/plan';
import { primsBBox } from '../src/draw2d/prims';
import { boxesOverlap, layoutMarks, layoutRoomLabels, markBox, roomLabelBox } from '../src/drawings/labels';
import type { Box } from '../src/drawings/labels';
import { PLAN_AUTO_SCALES, autoScales, buildSheet } from '../src/drawings/sheet';
import { geomOf, wallDir } from '../src/model/walls';
import { EYE, START_RADIUS, START_VIEW, viewFree, walkObstacles, walkStart } from '../src/view3d/walk';
import { centroid, distToSegment, pointInPolygon } from '../src/model/geometry';
import { itemDef } from '../src/catalog/registry';

const absCenter = (l: Level, o: Opening) => {
  const w = l.walls.find((x) => x.id === o.wallId)!;
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  return { x: Math.round(w.a.x + ((w.b.x - w.a.x) * o.pos) / len), y: Math.round(w.a.y + ((w.b.y - w.a.y) * o.pos) / len) };
};
/** Перегородка Вітальня / Спальня в демо. */
const crossOf = (l: Level) => l.walls.find((w) => w.a.x === 4600 && w.a.y === 0 && w.b.x === 4600 && w.b.y === 3900)!;

describe('1. сдвиг стен: проёмы невыделенных стен остаются на месте', () => {
  it('демо в исходном виде: нет мебели в стенах и проёмов вне стен', () => {
    const l = createDemoProject().levels[0];
    expect(itemsInWalls(l)).toEqual([]);
    expect(openingsOutOfWall(l)).toEqual([]);
  });
  it('перегородка Вітальня/Спальня +400 мм: окна и двери соседних стен не смещаются', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const before = l.openings.map((o) => ({ id: o.id, ...absCenter(l, o) }));
    const cross = crossOf(l);
    translateWall(l, cross.id, { x: 400, y: 0 });
    syncRooms(l, roomDefaults());
    expect(cross.a).toEqual({ x: 5000, y: 0 });
    expect(l.openings.map((o) => ({ id: o.id, ...absCenter(l, o) }))).toEqual(before);
    // окно спальни стоит на стене, начало которой уехало вместе с перегородкой: его pos пересчитан
    const bedWin = l.openings.find((o) => o.kind === 'window' && absCenter(l, o).x === 6800)!;
    const topR = l.walls.find((w) => w.id === bedWin.wallId)!;
    expect(topR.a.x).toBe(5000);
    expect(bedWin.pos).toBe(1800);
    expect(openingsOutOfWall(l)).toEqual([]);
    expect(l.rooms).toHaveLength(6);
  });
  it('проёмы самой сдвигаемой стены едут вместе с ней', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const wet = l.walls.find((w) => w.a.x === 6900 && w.a.y === 3900 && w.b.y === 5700)!; // стена ванной с дверью
    const door = l.openings.find((o) => o.wallId === wet.id)!;
    const c0 = absCenter(l, door);
    translateWalls(l, [wet.id], { x: -300, y: 0 });
    expect(absCenter(l, door)).toEqual({ x: c0.x - 300, y: c0.y });
  });
  it('перенос узла: проём стены остаётся на месте, даже если её начало уехало вдоль оси', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const bedWin = l.openings.find((o) => o.kind === 'window' && absCenter(l, o).x === 6800)!;
    moveNode(l, { x: 4600, y: 0 }, { x: 4300, y: 0 });
    expect(absCenter(l, bedWin)).toEqual({ x: 6800, y: 0 });
  });
  it('проём, оказавшийся за пределами укороченной стены, даёт предупреждение', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    translateWall(l, crossOf(l).id, { x: -400, y: 0 });
    syncRooms(l, roomDefaults());
    const out = openingsOutOfWall(l);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('door');
    expect(absCenter(l, out[0])).toEqual({ x: 4000, y: 3900 }); // дверь не сдвинулась, хотя стена стала короче
    const issues = validateProject(p).filter((i) => i.ruleId === 'geom.opening.outOfWall');
    expect(issues).toHaveLength(1);
    expect(issues[0].sel).toEqual({ type: 'opening', id: out[0].id, scope: l.id });
  });
  it('keepOpenings не трогает проёмы стен, которые не менялись', () => {
    const l = createDemoProject().levels[0];
    const pos = l.openings.map((o) => o.pos);
    keepOpenings(l, [], () => undefined);
    expect(l.openings.map((o) => o.pos)).toEqual(pos);
  });
});

describe('1. сдвиг стен: мебель вплотную едет со стеной, коллизии', () => {
  it('у перегородки вплотную стоят шкаф (спальня) и ТВ-тумба (вітальня)', () => {
    const l = createDemoProject().levels[0];
    const kinds = itemsFlushToWall(l, crossOf(l)).map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['cabinet', 'tv-stand', 'tv']));
    expect(kinds).not.toContain('sofa');
    expect(kinds).not.toContain('bed-double');
  });
  it('перегородка +400 мм: шкаф и тумба сдвинулись вместе со стеной, в стене никого', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const cab = l.items.find((i) => i.kind === 'cabinet')!;
    const tv = l.items.find((i) => i.kind === 'tv-stand')!;
    const sofa = l.items.find((i) => i.kind === 'sofa')!;
    const [cx, tx, sx] = [cab.x, tv.x, sofa.x];
    translateWall(l, crossOf(l).id, { x: 400, y: 0 });
    expect(cab.x).toBe(cx + 400);
    expect(tv.x).toBe(tx + 400);
    expect(sofa.x).toBe(sx); // диван стоит у другой стены
    expect(itemsInWalls(l)).toEqual([]);
    expect(validateProject(p).filter((i) => i.ruleId.startsWith('geom.'))).toEqual([]);
  });
  it('стена наезжает на мебель, не стоявшую вплотную: коллизия и пункт в списке нарушений', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    translateWall(l, crossOf(l).id, { x: -400, y: 0 });
    const hits = itemsInWalls(l);
    expect(hits.map((h) => h.item.kind)).toEqual(['plant']);
    expect(hits[0].wallId).toBe(crossOf(l)?.id ?? l.walls.find((w) => w.a.x === 4200 && w.b.x === 4200)!.id);
    const issue = validateProject(p).find((i) => i.ruleId === 'geom.item.inWall')!;
    expect(issue.severity).toBe('warn');
    expect(issue.sel).toEqual({ type: 'item', id: hits[0].item.id, scope: l.id });
  });
  it('группа: объект, выделенный вместе со стеной, не сдвигается дважды', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const cab = l.items.find((i) => i.kind === 'cabinet')!;
    const tv = l.items.find((i) => i.kind === 'tv-stand')!;
    const [cx, tx] = [cab.x, tv.x];
    const sels: Sel[] = [
      { type: 'wall', id: crossOf(l).id, scope: l.id },
      { type: 'item', id: cab.id, scope: l.id },
    ];
    moveEntities(p, sels, { x: 300, y: 0 });
    expect(cab.x).toBe(cx + 300);
    expect(tv.x).toBe(tx + 300); // не выделена, но стоит вплотную — едет со стеной
  });
  it('пересечение выпуклых контуров', () => {
    const sq = (x: number, y: number, s: number) => [
      { x, y },
      { x: x + s, y },
      { x: x + s, y: y + s },
      { x, y: y + s },
    ];
    expect(convexOverlap(sq(0, 0, 100), sq(50, 50, 100))).toBe(true);
    expect(convexOverlap(sq(0, 0, 100), sq(100, 0, 100))).toBe(false); // касание — не пересечение
    expect(convexOverlap(sq(0, 0, 100), sq(150, 0, 100))).toBe(false);
  });
});

describe('2. объекты вне контура помещений и участка', () => {
  it('в демо таких объектов нет', () => {
    expect(orphanItems(createDemoProject())).toEqual([]);
  });
  it('объекты, оставшиеся снаружи, находятся и убираются', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const moved = l.items.slice(0, 3);
    moved.forEach((it, i) => {
      it.x = -4000 - i * 800;
      it.y = 1000;
    });
    const found = orphanItems(p);
    expect(found.map((s) => s.id).sort()).toEqual(moved.map((i) => i.id).sort());
    expect(found.every((s) => s.type === 'item' && s.scope === l.id)).toBe(true);
    const n0 = l.items.length;
    for (const s of found) removeEntity(p, s);
    expect(l.items.length).toBe(n0 - 3);
    expect(orphanItems(p)).toEqual([]);
  });
  it('этаж без помещений не проверяется (план ещё не замкнут)', () => {
    const p = createProject('apartment', 't');
    const l = p.levels[0];
    l.walls.push(createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { thickness: 120 }));
    l.items.push(makeItem('chair', { x: 9000, y: 9000 }, 0, l));
    expect(orphanItems(p)).toEqual([]);
  });
  it('дом с участком: мебель на террасе внутри границы — не «потерянная», объект участка за границей — потерянный', () => {
    const p = createProject('house', 't');
    const l = p.levels[0];
    const c = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 5000 },
      { x: 0, y: 5000 },
    ];
    for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 300 }));
    syncRooms(l, roomDefaults());
    expect(p.site).toBeTruthy();
    const b = p.site!.boundary;
    const inside = { x: (b[0].x + b[2].x) / 2, y: Math.max(...b.map((q) => q.y)) - 1500 };
    const far = { x: Math.max(...b.map((q) => q.x)) + 5000, y: 0 };
    const terrace = makeItem('chair', inside, 0, l);
    const lost = makeItem('chair', far, 0, l);
    l.items.push(terrace, lost);
    const tree = makeItem('tree', far, 0, l);
    p.site!.items.push(tree);
    const ids = orphanItems(p).map((s) => `${s.scope === 'site' ? 'site' : 'lvl'}:${s.id}`);
    expect(ids.sort()).toEqual([`lvl:${lost.id}`, `site:${tree.id}`].sort());
  });
});

describe('7. склонения в счётчиках', () => {
  const walls: [string, string, string] = ['стіна', 'стіни', 'стін'];
  it('правило: 1 / 2–4 / 5–20, с учётом 11–14 и десятков', () => {
    const forms = (ns: number[]) => ns.map((n) => plural(n, walls));
    expect(forms([1, 21, 31, 101, 1001])).toEqual(Array(5).fill('стіна'));
    expect(forms([2, 3, 4, 22, 23, 24, 102])).toEqual(Array(7).fill('стіни'));
    expect(forms([0, 5, 6, 10, 11, 12, 13, 14, 15, 19, 20, 25, 100, 111, 112, 114])).toEqual(Array(16).fill('стін'));
    expect(plural(1.5, ['метр', 'метра', 'метрів'])).toBe('метра');
  });
  it('счётчики на двух языках', () => {
    expect(count(1, walls)).toBe('1 стіна');
    expect(countNoun(2, 'wall', 'uk')).toBe('2 стіни');
    expect(countNoun(5, 'wall', 'uk')).toBe('5 стін');
    expect(countNoun(1, 'wall', 'ru')).toBe('1 стена');
    expect(countNoun(3, 'wall', 'ru')).toBe('3 стены');
    expect(countNoun(11, 'wall', 'ru')).toBe('11 стен');
    expect(countNoun(1, 'item', 'uk')).toBe('1 об’єкт');
    expect(countNoun(3, 'item', 'uk')).toBe('3 об’єкти');
    expect(countNoun(28, 'part', 'uk')).toBe('28 деталей');
    expect(countNoun(2, 'opening', 'ru')).toBe('2 проёма');
    expect(countNoun(21, 'room', 'uk')).toBe('21 приміщення');
  });
});

describe('3. товар из магазина: пустые черновики не сохраняются', () => {
  const draft = (over: Partial<Finish> = {}): Finish => ({ id: 'd1', name: { uk: 'Шпалери: товар з магазину', ru: 'Обои: товар из магазина' }, type: 'wallpaper', color: '#d8d4cc', target: ['wall'], shopUrl: '', ...over });
  it('пустой черновик определяется; ссылка, своё имя, цена или артикул делают его содержательным', () => {
    expect(isEmptyShopDraft(draft())).toBe(true);
    expect(shopDraftProblem(draft())).toBe('empty');
    expect(isEmptyShopDraft(draft({ shopUrl: 'https://shop.example.com/a' }))).toBe(false);
    expect(isEmptyShopDraft(draft({ name: { uk: 'Шпалери «Дамаск»', ru: 'Обои «Дамаск»' } }))).toBe(false);
    expect(isEmptyShopDraft(draft({ price: 850 }))).toBe(false);
    expect(isEmptyShopDraft(draft({ shopSku: 'A-17' }))).toBe(false);
    expect(isEmptyShopDraft({ ...draft(), shopUrl: undefined })).toBe(false); // обычный материал — не черновик товара
  });
  it('причины отказа в сохранении', () => {
    expect(shopDraftProblem(draft({ shopUrl: 'shop.example.com/a' }))).toBe('badUrl');
    expect(shopDraftProblem(draft({ shopUrl: 'javascript:alert(1)', price: 10 }))).toBe('badUrl');
    expect(shopDraftProblem(draft({ name: { uk: ' ', ru: '' }, price: 10 }))).toBe('noName');
    expect(shopDraftProblem(draft({ shopUrl: 'https://shop.example.com/a' }))).toBeNull();
    expect(shopDraftProblem(draft({ price: 100 }))).toBeNull();
  });
  it('при открытии проекта брошенные пустые черновики убираются, используемые — остаются', () => {
    const p = JSON.parse(JSON.stringify(createDemoProject())) as Project;
    p.finishes.push(draft({ id: 'empty-unused' }), draft({ id: 'empty-used' }), draft({ id: 'filled', shopUrl: 'https://shop.example.com/x' }));
    p.levels[0].rooms[0].floorFinish = 'empty-used';
    expect(finishInUse(p, 'empty-used')).toBe(true);
    expect(finishInUse(p, 'empty-unused')).toBe(false);
    const m = migrateProject(p);
    const ids = m.finishes.map((f) => f.id);
    expect(ids).not.toContain('empty-unused');
    expect(ids).toContain('empty-used');
    expect(ids).toContain('filled');
  });
});

describe('4. прогулка: старт в свободной точке, подвесные светильники не ниже 2,1 м', () => {
  const distToPoly = (p: { x: number; y: number }, poly: { x: number; y: number }[]) => (pointInPolygon(p, poly) ? 0 : Math.min(...poly.map((a, i) => distToSegment(p, a, poly[(i + 1) % poly.length]))));
  it('высота глаз 1,6 м', () => {
    expect(EYE).toBe(1600);
  });
  it('демо: в радиусе 0,6 м и в поле зрения на 1,5 м нет объектов, включая подвесы', () => {
    const l = createDemoProject().levels[0];
    const obs = walkObstacles(l);
    const st = walkStart(l, obs);
    expect(st.ok).toBe(true);
    const room = l.rooms.find((r) => pointInPolygon(st.pos, r.polygon))!;
    expect(room).toBeTruthy();
    expect(Math.min(...obs.map((o) => distToPoly(st.pos, o)))).toBeGreaterThanOrEqual(START_RADIUS);
    expect(st.clearance).toBeGreaterThanOrEqual(START_RADIUS);
    const v = viewFree(st.pos, st.yaw, obs, room.polygon);
    expect(v.objects).toBeGreaterThanOrEqual(START_VIEW);
    expect(st.viewFree).toBeGreaterThanOrEqual(START_VIEW);
    // самое большое помещение, в котором условия выполнимы
    expect(room.area).toBe(Math.max(...l.rooms.map((r) => r.area)));
  });
  it('подвесной светильник — препятствие для старта; ковёр и плафон у потолка — нет', () => {
    const l = createDemoProject().levels[0];
    const count = (kind: string) => l.items.filter((i) => i.kind === kind).length;
    const obs = walkObstacles(l);
    const has = (kind: string) => l.items.filter((i) => i.kind === kind).every((it) => obs.some((o) => pointInPolygon({ x: it.x, y: it.y }, o) && Math.abs(centroid(o).x - it.x) < 1 && Math.abs(centroid(o).y - it.y) < 1));
    expect(count('lamp-pendant')).toBeGreaterThan(0);
    expect(has('lamp-pendant')).toBe(true);
    expect(has('sofa')).toBe(true);
    // ковёр (плоский на полу) и плафоны у самого потолка в препятствия не входят
    const furn = l.items.filter((i) => (itemDef(i.kind)?.layer ?? 'furniture') === 'furniture');
    const skipped = furn.filter((i) => i.kind === 'rug' || i.kind === 'lamp-ceiling' || i.kind === 'lamp-spot' || i.kind === 'lamp-led');
    expect(skipped.length).toBeGreaterThanOrEqual(3);
    expect(obs.length).toBe(furn.length - skipped.length);
  });
  it('комната с люстрой в центре: старт не под люстрой и не лицом к ней вплотную', () => {
    const p = createProject('apartment', 't');
    const l = p.levels[0];
    const c = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 120 }));
    syncRooms(l, roomDefaults());
    const lamp = makeItem('lamp-pendant', { x: 2500, y: 2000 }, 0, l);
    l.items.push(lamp);
    const obs = walkObstacles(l);
    expect(obs).toHaveLength(1);
    const st = walkStart(l, obs);
    expect(st.ok).toBe(true);
    expect(distToPoly(st.pos, obs[0])).toBeGreaterThanOrEqual(START_RADIUS);
    expect(viewFree(st.pos, st.yaw, obs, l.rooms[0].polygon).objects).toBeGreaterThanOrEqual(START_VIEW);
  });
  it('тесная комната: условия невыполнимы — берётся лучший вариант, без падения', () => {
    const p = createProject('apartment', 't');
    const l = p.levels[0];
    const c = [
      { x: 0, y: 0 },
      { x: 1200, y: 0 },
      { x: 1200, y: 1500 },
      { x: 0, y: 1500 },
    ];
    for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 120 }));
    syncRooms(l, roomDefaults());
    const st = walkStart(l, []);
    expect(st.ok).toBe(false);
    expect(pointInPolygon(st.pos, l.rooms[0].polygon)).toBe(true);
  });
  it('новый подвес: низ не ниже 2,1 м, длина подвеса подстраивается под потолок', () => {
    const l = createDemoProject().levels[0];
    const a = makeItem('lamp-pendant', { x: 0, y: 0 }, 0, l);
    expect(l.height).toBe(2600);
    expect([a.z, a.params.h]).toEqual([2100, 500]);
    const low = makeItem('lamp-pendant', { x: 0, y: 0 }, 0, { ...l, height: 2500 });
    expect([low.z, low.params.h]).toEqual([2100, 400]);
    const high = makeItem('lamp-pendant', { x: 0, y: 0 }, 0, { ...l, height: 3000 });
    expect([high.z, high.params.h]).toEqual([2500, 500]);
    // явно заданная длина подвеса уважается
    const own = makeItem('lamp-pendant', { x: 0, y: 0 }, 0, l, { h: 900 });
    expect([own.z, own.params.h]).toEqual([1700, 900]);
    expect(itemDef('lamp-pendant')!.z).toBe(MIN_HANGING_BOTTOM);
    // все подвесы демо — не ниже 2,1 м
    expect(l.items.filter((i) => i.kind === 'lamp-pendant').every((i) => i.z >= MIN_HANGING_BOTTOM)).toBe(true);
  });
  it('миграция v4 поднимает подвесы старых проектов, остальное не трогает', () => {
    const old = JSON.parse(JSON.stringify(createDemoProject())) as Project;
    old.schema = 3;
    const l = old.levels[0];
    const lamps = l.items.filter((i) => i.kind === 'lamp-pendant');
    for (const it of lamps) {
      it.z = 1900;
      it.params.h = 700;
    }
    const sofaZ = l.items.find((i) => i.kind === 'sofa')!.z;
    const m = migrateProject(old);
    const ml = m.levels[0];
    expect(ml.items.filter((i) => i.kind === 'lamp-pendant').map((i) => [i.z, i.params.h])).toEqual(lamps.map(() => [2100, 500]));
    expect(ml.items.find((i) => i.kind === 'sofa')!.z).toBe(sofaZ);
    // подвес, намеренно опущенный не от потолка (z + h ≠ высота), и повторная миграция — без изменений
    const again = migrateProject(m);
    expect(again.levels[0].items.filter((i) => i.kind === 'lamp-pendant').map((i) => i.z)).toEqual(lamps.map(() => 2100));
    const lvl = { ...ml, items: [{ ...ml.items.find((i) => i.kind === 'lamp-pendant')!, z: 1500, params: { w: 380, d: 380, h: 300 } }] };
    expect(raiseHangingLamps(lvl)).toBe(0);
  });
});

describe('5. чертежи: марки проёмов и подписи помещений не перекрываются', () => {
  /** Раскладка подписей обмерного плана так же, как её делает лист. */
  const layout = (l: Level, N: number) => {
    const gm = geomOf(l);
    const marks = openingMarks(l.openings);
    const pts = gm.walls.flatMap((w) => [w.a, w.b]);
    const c = { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
    const list = gm.openings.flatMap((o) => {
      const w = gm.walls.find((x) => x.id === o.wallId);
      return w && marks.byId.get(o.id) ? [{ id: o.id, p: openingMarkPos(o, w, N, c), dir: wallDir(w) }] : [];
    });
    const placed = layoutMarks(list, N);
    const markBoxes = list.map((m) => markBox(placed.get(m.id)!, N));
    const naive = list.map((m) => markBox(m.p, N));
    const at = layoutRoomLabels(l.rooms, N, markBoxes);
    const labelBoxes = l.rooms.map((r) => roomLabelBox(r, N, at.get(r.id)!));
    const naiveLabels = l.rooms.map((r) => roomLabelBox(r, N, r.seed));
    return { markBoxes, labelBoxes, naive, naiveLabels, at };
  };
  const overlaps = (a: Box[], b: Box[], same = false) => {
    let n = 0;
    for (let i = 0; i < a.length; i++) for (let j = same ? i + 1 : 0; j < b.length; j++) if (boxesOverlap(a[i], b[j])) n++;
    return n;
  };
  it('демо, масштабы 1:50, 1:75, 1:100: ни одна подпись не задевает марку или другую подпись', () => {
    const l = createDemoProject().levels[0];
    for (const N of [50, 75, 100]) {
      const r = layout(l, N);
      expect(r.markBoxes.length).toBe(l.openings.length);
      expect(overlaps(r.labelBoxes, r.markBoxes), `подписи × марки, 1:${N}`).toBe(0);
      expect(overlaps(r.labelBoxes, r.labelBoxes, true), `подписи × подписи, 1:${N}`).toBe(0);
      expect(overlaps(r.markBoxes, r.markBoxes, true), `марки × марки, 1:${N}`).toBe(0);
    }
  });
  it('подпись, на которую попадает марка двери, сдвигается внутри своего помещения', () => {
    const p = createProject('apartment', 't');
    const l = p.levels[0];
    const c = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 2400 },
      { x: 0, y: 2400 },
    ];
    for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 120 }));
    syncRooms(l, roomDefaults());
    const room = l.rooms[0];
    const N = 100;
    // марка стоит прямо на точке привязки подписи
    const obstacle = markBox(room.seed, N);
    expect(boxesOverlap(roomLabelBox(room, N, room.seed), obstacle)).toBe(true);
    const at = layoutRoomLabels(l.rooms, N, [obstacle]).get(room.id)!;
    expect(at).not.toEqual(room.seed);
    const box = roomLabelBox(room, N, at);
    expect(boxesOverlap(box, obstacle)).toBe(false);
    for (const q of [
      { x: box.minX, y: box.minY },
      { x: box.maxX, y: box.maxY },
    ])
      expect(pointInPolygon(q, room.polygon)).toBe(true);
    // без помех подпись остаётся в точке привязки
    expect(layoutRoomLabels(l.rooms, N, []).get(room.id)).toEqual(room.seed);
  });
  it('две марки в одной точке разводятся вдоль стены', () => {
    const N = 100;
    const placed = layoutMarks(
      [
        { id: 'a', p: { x: 1000, y: 0 }, dir: { x: 1, y: 0 } },
        { id: 'b', p: { x: 1100, y: 0 }, dir: { x: 1, y: 0 } },
      ],
      N,
    );
    expect(placed.get('a')).toEqual({ x: 1000, y: 0 });
    expect(placed.get('b')!.y).toBe(0);
    expect(boxesOverlap(markBox(placed.get('a')!, N), markBox(placed.get('b')!, N))).toBe(false);
  });
  it('на листе подписи помещений стоят там, где их поставила раскладка', () => {
    const p = createDemoProject();
    const l = p.levels[0];
    const sheet = buildSheet(p, { kind: 'measure', levelId: l.id, paper: 'A3', landscape: true, scale: 100 });
    const names = sheet.prims.filter((q) => q.t === 'text' && l.rooms.some((r) => r.name === q.text));
    expect(names).toHaveLength(l.rooms.length);
  });
});

describe('5. чертежи: масштаб «Авто» — наибольший из 1:50, 1:75, 1:100, при котором план помещается', () => {
  const box = (w: number, d: number) => {
    const p = createProject('apartment', 't');
    const l = p.levels[0];
    const c = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ];
    for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 200 }));
    syncRooms(l, roomDefaults());
    return p;
  };
  const auto = (p: Project, paper: 'A4' | 'A3', kind: 'measure' | 'furniture' = 'measure') => buildSheet(p, { kind, levelId: p.levels[0].id, paper, landscape: true, scale: 0 });
  it('кандидаты для планов: 1:50, 1:75, 1:100, затем мельче; для развёрток доступны и крупные масштабы', () => {
    expect(PLAN_AUTO_SCALES).toEqual([50, 75, 100]);
    expect(autoScales('measure').slice(0, 4)).toEqual([50, 75, 100, 150]);
    expect(autoScales('furniture')[0]).toBe(50);
    expect(autoScales('elevations')[0]).toBe(10);
  });
  it('демо-квартира 9×6,8 м: A3 — 1:50; маленькая комната не чертится крупнее 1:50', () => {
    expect(auto(createDemoProject(), 'A3').scale).toBe(50);
    expect(auto(box(3000, 2500), 'A3').scale).toBe(50);
    expect(auto(box(3000, 2500), 'A4').scale).toBe(50);
  });
  it('чем больше план, тем мельче масштаб: 1:50 → 1:75 → 1:100 → 1:150', () => {
    const scales = [9000, 20000, 30000, 40000].map((w) => auto(box(w, w * 0.6), 'A3', 'furniture').scale);
    expect(scales).toEqual([50, 75, 100, 150]);
  });
  it('выбранный масштаб действительно самый крупный из подходящих: план помещается, а на шаг крупнее — уже нет', () => {
    const p = box(20000, 12000);
    const s = auto(p, 'A3', 'furniture');
    expect(s.scale).toBe(75);
    const area = { w: s.w - 35 - 16, h: s.h - 20 - 16 };
    const content = (N: number) => {
      const sh = buildSheet(p, { kind: 'furniture', levelId: p.levels[0].id, paper: 'A3', landscape: true, scale: N });
      // содержимое плана — всё, что нарисовано стенами (тёмная заливка), в мм бумаги
      const bb = primsBBox(sh.prims.filter((q) => q.t === 'path'));
      return { w: bb.maxX - bb.minX, h: bb.maxY - bb.minY };
    };
    expect(content(75).w).toBeLessThanOrEqual(area.w);
    expect(content(50).w).toBeGreaterThan(area.w);
  });
  it('заданный вручную масштаб не меняется', () => {
    const p = createDemoProject();
    expect(buildSheet(p, { kind: 'measure', levelId: p.levels[0].id, paper: 'A3', landscape: true, scale: 100 }).scale).toBe(100);
    expect(buildSheet(p, { kind: 'measure', levelId: p.levels[0].id, paper: 'A3', landscape: true, scale: 200 }).scale).toBe(200);
  });
});
