// Итерация 3: сдвиг стен (проёмы на месте, мебель едет со стеной, коллизии) и остальные пункты.
import { describe, expect, it } from 'vitest';
import '../src/catalog';
import { finishInUse, isEmptyShopDraft, shopDraftProblem } from '../src/calc/materials';
import { count, countNoun, plural } from '../src/i18n';
import { convexOverlap, itemsFlushToWall, itemsInWalls, openingsOutOfWall, orphanItems } from '../src/model/checks';
import { createProject, createWall, roomDefaults } from '../src/model/defaults';
import { createDemoProject } from '../src/model/demo';
import { keepOpenings, makeItem, moveEntities, moveNode, removeEntity, translateWall, translateWalls } from '../src/model/ops';
import { migrateProject } from '../src/model/migrate';
import type { Finish, Level, Opening, Project, Sel } from '../src/model/types';
import { syncRooms } from '../src/model/walls';
import { validateProject } from '../src/rules/validate';

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
