import { describe, expect, it } from 'vitest';
import { cableAmpacity, networkSummary, routeLengthWithDrops, sewerDrop } from '../src/calc/networks';
import { planDir, shadowVector, sunPosition } from '../src/calc/sun';
import { siteShadowPrims } from '../src/calc/shadow2d';
import { snakePath, underfloorCalc } from '../src/calc/underfloor';
import '../src/catalog';
import { createOpening, createProject, createWall } from '../src/model/defaults';
import { createDemoProject, snapshotBaseline } from '../src/model/demo';
import { makeItem } from '../src/model/ops';
import type { Project } from '../src/model/types';
import { syncRooms } from '../src/model/walls';
import { roomDefaults } from '../src/model/defaults';
import { BASE_RULES, effectiveRules, ruleValue } from '../src/rules';
import { validateProject } from '../src/rules/validate';

const ids = (p: Project) => validateProject(p).map((i) => i.ruleId);

function bathProject(): Project {
  const p = createProject('apartment', 't');
  const l = p.levels[0];
  const c = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 2000 }, { x: 0, y: 2000 }];
  for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 100 }));
  syncRooms(l, roomDefaults());
  l.rooms[0].type = 'bathroom';
  l.rooms[0].name = 'Ванна';
  return p;
}

describe('справочник норм', () => {
  it('у каждого правила есть id, описание, значение, источник; verified=false по умолчанию', () => {
    expect(BASE_RULES.length).toBeGreaterThan(20);
    const seen = new Set<string>();
    for (const r of BASE_RULES) {
      expect(r.id && r.title.uk && r.title.ru && r.source, r.id).toBeTruthy();
      expect(typeof r.value).toBe('number');
      expect(r.verified, r.id).toBe(false);
      expect(seen.has(r.id)).toBe(false);
      seen.add(r.id);
    }
  });
  it('переопределения проекта меняют значение и отметку проверки', () => {
    const ov = { 'pl.sewer.minSlope.50': { value: 25, verified: true } };
    expect(ruleValue(ov, 'pl.sewer.minSlope.50')).toBe(25);
    expect(ruleValue({}, 'pl.sewer.minSlope.50')).toBe(30);
    expect(effectiveRules(ov).find((r) => r.id === 'pl.sewer.minSlope.50')!.verified).toBe(true);
  });
});

describe('проверки коллизий и норм', () => {
  it('розетка во влажном помещении: без IP44 и ближе 600 мм к ванне — предупреждения', () => {
    const p = bathProject();
    const l = p.levels[0];
    l.items.push(makeItem('bathtub', { x: 900, y: 400 }, 0, l));
    l.items.push(makeItem('el-socket', { x: 2000, y: 50 }, 0, l));
    let r = ids(p);
    expect(r).toContain('el.bath.socketIp');
    expect(r).toContain('el.bath.socketDistance');
    // переносим дальше и делаем влагозащищённой
    l.items[1].x = 2500;
    l.items[1].y = 1950;
    l.items[1].rot = 180;
    l.items[1].params.ip44 = true;
    r = ids(p);
    expect(r).not.toContain('el.bath.socketIp');
    expect(r).not.toContain('el.bath.socketDistance');
  });

  it('уклон канализации проверяется по диаметру', () => {
    const p = bathProject();
    const l = p.levels[0];
    l.routes.push({ id: 'r1', kind: 'pl-sewer', points: [{ x: 100, y: 100 }, { x: 2100, y: 100 }], params: { dia: 50, slope: 20, z: 100 } });
    expect(ids(p)).toContain('pl.sewer.minSlope.50');
    l.routes[0].params.slope = 30;
    expect(ids(p)).not.toContain('pl.sewer.minSlope.50');
    l.routes[0].params.dia = 110;
    l.routes[0].params.slope = 20;
    expect(ids(p)).not.toContain('pl.sewer.minSlope.110');
    l.routes[0].params.slope = 200;
    expect(ids(p)).toContain('pl.sewer.maxSlope');
    expect(sewerDrop({ ...l.routes[0], params: { slope: 30 } })).toBe(60);
  });

  it('штроба с кабелем пересекает трубу на той же высоте', () => {
    const p = bathProject();
    const l = p.levels[0];
    l.routes.push({ id: 'c', kind: 'el-cable', points: [{ x: 500, y: 100 }, { x: 500, y: 1900 }], params: { section: 2.5, cores: 3, z: 300, chase: true, chaseDepth: 20, chaseWidth: 20 } });
    l.routes.push({ id: 'w', kind: 'pl-pipe-cold', points: [{ x: 100, y: 1000 }, { x: 2900, y: 1000 }], params: { dia: 20, z: 300 } });
    expect(ids(p)).toContain('el.chase.pipeClearance');
    l.routes[0].params.z = 2500; // кабель под потолком — пересечения нет
    expect(ids(p)).not.toContain('el.chase.pipeClearance');
  });

  it('горизонтальная штроба в несущей стене', () => {
    const p = bathProject();
    const l = p.levels[0];
    l.walls[0].loadBearing = true;
    l.routes.push({ id: 'c', kind: 'el-cable', points: [{ x: 300, y: 50 }, { x: 2500, y: 50 }], params: { section: 2.5, cores: 3, z: 300, chase: true, chaseDepth: 20, chaseWidth: 20 } });
    expect(ids(p)).toContain('el.chase.bearingMaxLength');
    l.routes[0].params.chase = false;
    expect(ids(p)).not.toContain('el.chase.bearingMaxLength');
  });

  it('газ: предупреждение-дисклеймер и расстояние до электроточек', () => {
    const p = bathProject();
    const l = p.levels[0];
    l.items.push(makeItem('gas-point', { x: 1000, y: 50 }, 0, l));
    l.items.push(makeItem('el-socket', { x: 1300, y: 50 }, 0, l, { ip44: true }));
    const r = ids(p);
    expect(r).toContain('gas.disclaimer');
    expect(r).toContain('el.gas.socketDistance');
  });

  it('перепланировка: снос и изменение несущей стены, новый проём, перенос перегородки', () => {
    const p = createDemoProject();
    expect(ids(p)).not.toContain('apt.redevelopment');
    const l = p.levels[0];
    const bearing = l.walls.find((w) => w.loadBearing && !w.exterior)!;
    const part = l.walls.find((w) => !w.loadBearing)!;
    // новый проём в несущей
    const p2: Project = JSON.parse(JSON.stringify(p));
    p2.levels[0].openings.push(createOpening(bearing.id, 'portal', 1500, { width: 900 }));
    const i2 = validateProject(p2).filter((i) => i.ruleId === 'apt.redevelopment');
    expect(i2.some((i) => i.severity === 'error' && i.sel?.type === 'opening')).toBe(true);
    // снос несущей
    const p3: Project = JSON.parse(JSON.stringify(p));
    p3.levels[0].walls = p3.levels[0].walls.filter((w) => w.id !== bearing.id);
    expect(validateProject(p3).some((i) => i.ruleId === 'apt.redevelopment' && i.severity === 'error')).toBe(true);
    // перенос перегородки — предупреждение, не ошибка
    const p4: Project = JSON.parse(JSON.stringify(p));
    const w4 = p4.levels[0].walls.find((w) => w.id === part.id)!;
    w4.a.x += 300;
    w4.b.x += 300;
    const i4 = validateProject(p4).filter((i) => i.ruleId === 'apt.redevelopment');
    expect(i4.some((i) => i.severity === 'warn')).toBe(true);
    expect(i4.some((i) => i.severity === 'error')).toBe(false);
    // после повторной фиксации исходного состояния предупреждений нет
    p4.baseline = snapshotBaseline(p4);
    expect(ids(p4)).not.toContain('apt.redevelopment');
  });

  it('участок: минимальные расстояния', () => {
    const p = createProject('house', 't');
    const l = p.levels[0];
    const c = [{ x: 0, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 6000 }, { x: 0, y: 6000 }];
    for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 400, exterior: true }));
    const site = p.site!;
    expect(ids(p).filter((x) => x.startsWith('site.'))).toHaveLength(0);
    site.items.push(makeItem('septic', { x: 10000, y: 3000 }, 0)); // 2 м от дома
    site.items.push(makeItem('well', { x: 12500, y: 15000 }, 0)); // ~12 м от септика
    site.items.push(makeItem('tree', { x: -5000, y: 10000 }, 0)); // 1 м от границы
    site.routes.push({ id: 'f', kind: 'fence', points: [{ x: -6000, y: -9000 }, { x: 14000, y: -9000 }], params: { h: 2500 } });
    const r = ids(p);
    expect(r).toContain('site.septic.house');
    expect(r).toContain('site.septic.well');
    expect(r).toContain('site.tree.boundary');
    expect(r).toContain('site.fence.maxHeight');
    // дом за границей участка
    site.boundary = site.boundary.map((q) => ({ x: q.x + 9000, y: q.y }));
    expect(validateProject(p).some((i) => i.ruleId === 'site.house.boundary' && i.severity === 'error')).toBe(true);
  });
});

describe('сети', () => {
  it('длина кабеля = план + опуски к приборам; сводка по сечениям и группам', () => {
    const p = bathProject();
    const l = p.levels[0];
    const sock = makeItem('el-socket', { x: 2000, y: 50 }, 0, l, { group: 'g-sockets', power: 2000 });
    sock.z = 300;
    const panel = makeItem('el-panel', { x: 100, y: 50 }, 0, l);
    panel.z = 1400;
    l.items.push(sock, panel);
    const route = { id: 'c', kind: 'el-cable', points: [{ x: 100, y: 50 }, { x: 2000, y: 50 }], params: { group: 'g-sockets', section: 2.5, cores: 3, z: 2500, chase: true, chaseDepth: 20, chaseWidth: 20 } };
    l.routes.push(route);
    const r = routeLengthWithDrops(route, l.items, 'electrical');
    expect(r.plan).toBe(1900);
    expect(r.drops).toBe(2200 + 1100);
    const s = networkSummary(p, 10);
    expect(s.cables).toHaveLength(1);
    expect(s.cables[0].key).toBe('3×2,5');
    expect(s.cables[0].netM).toBeCloseTo(5.2, 5);
    expect(s.cables[0].grossM).toBe(6);
    expect(s.chases[0]).toEqual({ key: '20×20', lengthM: 5.2 });
    const g = s.groups.find((x) => x.id === 'g-sockets')!;
    expect(g.points).toBe(1);
    expect(g.currentA).toBeCloseTo(8.7, 1);
    expect(cableAmpacity(2.5)).toBe(25);
  });
  it('перегрузка группы даёт предупреждение', () => {
    const p = bathProject();
    const l = p.levels[0];
    l.items.push(makeItem('el-cooker', { x: 500, y: 1950 }, 180, l, { group: 'g-light', power: 7000 }));
    expect(ids(p)).toContain('el.group.overload');
  });
  it('тёплый пол: длина трубы и разбиение на контуры', () => {
    const poly = [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 0, y: 4000 }];
    const r = underfloorCalc(poly, 150, 100, 3000, 90);
    // нетто 4,8×3,8 = 18,24 м² → 121,6 м трубы → 2 контура по 60,8 + 6 м подводок
    expect(r.areaM2).toBeCloseTo(18.24, 2);
    expect(r.loops).toBe(2);
    expect(r.loopM).toBeCloseTo(66.8, 1);
    expect(r.pipeM).toBeCloseTo(133.6, 1);
    expect(underfloorCalc(poly, 300, 100, 3000, 90).loops).toBe(1);
    const path = snakePath(poly, 150, 100);
    expect(path.length).toBeGreaterThan(40);
    expect(path.every((q) => q.x >= 100 && q.x <= 4900 && q.y >= 100 && q.y <= 3900)).toBe(true);
  });
});

describe('солнце и тень', () => {
  it('Киев, 21 июня, полдень: высота ≈ 63°, азимут 180°', () => {
    const s = sunPosition(50.45, 6, 21, 12);
    expect(s.elevation).toBeCloseTo(90 - 50.45 + 23.44, 0);
    expect(s.azimuth).toBeCloseTo(180, 0);
  });
  it('зимой солнце ниже, утром — на востоке, вечером — на западе', () => {
    expect(sunPosition(50.45, 12, 21, 12).elevation).toBeLessThan(18);
    expect(sunPosition(50.45, 6, 21, 8).azimuth).toBeLessThan(120);
    expect(sunPosition(50.45, 6, 21, 17).azimuth).toBeGreaterThan(240);
    expect(sunPosition(50.45, 12, 21, 3).elevation).toBeLessThan(0);
  });
  it('тень направлена от солнца; при севере вверху в полдень — на север (вверх плана)', () => {
    const s = sunPosition(50.45, 6, 21, 12);
    const v = shadowVector(s, 0, 3000)!;
    expect(Math.abs(v.x)).toBeLessThan(5);
    expect(v.y).toBeLessThan(0);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(3000 / Math.tan((s.elevation * Math.PI) / 180), 0);
    expect(shadowVector({ elevation: -5, azimuth: 0 }, 0, 3000)).toBeNull();
    const d = planDir(90, 90); // восток при «верхе плана = восток»
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(-1);
  });
  it('тени на плане участка строятся от дома и деревьев', () => {
    const p = createProject('house', 't');
    const l = p.levels[0];
    const c = [{ x: 0, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 6000 }, { x: 0, y: 6000 }];
    for (let i = 0; i < 4; i++) l.walls.push(createWall(c[i], c[(i + 1) % 4], { thickness: 400 }));
    p.site!.items.push(makeItem('tree', { x: 12000, y: 12000 }, 0));
    p.sun = { month: 6, day: 21, hour: 15, enabled: true };
    expect(siteShadowPrims(p).length).toBeGreaterThanOrEqual(2);
    p.sun.hour = 2;
    expect(siteShadowPrims(p)).toHaveLength(0);
  });
});
