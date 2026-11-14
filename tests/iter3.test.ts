// Итерация 3: сдвиг стен (проёмы на месте, мебель едет со стеной, коллизии) и остальные пункты.
import { describe, expect, it } from 'vitest';
import '../src/catalog';
import { convexOverlap, itemsFlushToWall, itemsInWalls, openingsOutOfWall } from '../src/model/checks';
import { roomDefaults } from '../src/model/defaults';
import { createDemoProject } from '../src/model/demo';
import { keepOpenings, moveEntities, moveNode, translateWall, translateWalls } from '../src/model/ops';
import type { Level, Opening, Sel } from '../src/model/types';
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
