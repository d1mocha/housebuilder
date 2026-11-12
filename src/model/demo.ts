// Демо-проект: двухкомнатная квартира ~55 м² с мебелью и инженерными точками.
import { BUILTIN_TEMPLATES } from '../cabinet/templates';
import '../catalog';
import { createOpening, createProject, createWall, roomDefaults } from './defaults';
import { newId } from './ids';
import { makeItem } from './ops';
import type { BaselineWall, Item, Level, Params, Project, RoomType, Vec2, Wall } from './types';
import { roomSurfaces, syncRooms } from './walls';
import { itemsOutsideRooms } from './checks';

/** Зафиксировать текущее состояние стен как «существующее» (для проверки перепланировки). */
export function snapshotBaseline(p: Project): BaselineWall[] {
  const out: BaselineWall[] = [];
  for (const l of p.levels) {
    for (const w of l.walls) {
      out.push({
        id: w.id,
        a: { ...w.a },
        b: { ...w.b },
        thickness: w.thickness,
        loadBearing: w.loadBearing,
        levelId: l.id,
        openings: l.openings.filter((o) => o.wallId === w.id).map((o) => ({ pos: o.pos, width: o.width })),
      });
    }
  }
  return out;
}

export function createDemoProject(): Project {
  const p = createProject('apartment', 'Демо: двокімнатна квартира ≈53 м²');
  const lvl: Level = p.levels[0];
  lvl.height = 2600;
  const W: Record<string, Wall> = {};
  const wall = (key: string, a: [number, number], b: [number, number], kind: 'ext' | 'bear' | 'part', thickness?: number) => {
    const w = createWall({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, {
      material: kind === 'part' ? 'brick' : 'concrete',
      thickness: thickness ?? (kind === 'ext' ? 300 : kind === 'bear' ? 200 : 120),
      loadBearing: kind !== 'part',
      exterior: kind === 'ext',
    });
    W[key] = w;
    lvl.walls.push(w);
  };
  // наружные
  wall('topL', [0, 0], [4600, 0], 'ext');
  wall('topR', [4600, 0], [9000, 0], 'ext');
  wall('rightT', [9000, 0], [9000, 3900], 'ext');
  wall('rightM', [9000, 3900], [9000, 5700], 'ext');
  wall('rightB', [9000, 5700], [9000, 6800], 'ext');
  wall('botR', [9000, 6800], [6900, 6800], 'ext');
  wall('botM', [6900, 6800], [3400, 6800], 'ext');
  wall('botL', [3400, 6800], [0, 6800], 'ext');
  wall('leftB', [0, 6800], [0, 3900], 'ext');
  wall('leftT', [0, 3900], [0, 0], 'ext');
  // внутренние несущие
  wall('midA', [0, 3900], [3400, 3900], 'bear');
  wall('midB', [3400, 3900], [4600, 3900], 'bear');
  wall('midC', [4600, 3900], [6900, 3900], 'bear');
  wall('midD', [6900, 3900], [9000, 3900], 'bear');
  wall('cross', [4600, 0], [4600, 3900], 'bear');
  // перегородки
  wall('kit', [3400, 3900], [3400, 6800], 'part');
  wall('wet', [6900, 3900], [6900, 5700], 'part');
  wall('wet2', [6900, 5700], [6900, 6800], 'part');
  wall('wc', [6900, 5700], [9000, 5700], 'part', 100);

  const op = (key: string, kind: 'door' | 'window' | 'portal', pos: number, o: Partial<ReturnType<typeof createOpening>> = {}) => {
    lvl.openings.push(createOpening(W[key].id, kind, pos, o));
  };
  op('topL', 'window', 2300, { width: 1800, height: 1500, sill: 800, sashes: 3 });
  op('topR', 'window', 2200, { width: 1500, height: 1500, sill: 800, sashes: 2 });
  op('leftB', 'window', 1450, { width: 1300, height: 1500, sill: 800, sashes: 2 });
  op('botM', 'door', 1750, { width: 900, height: 2050, style: 'entrance', swing: 'R', hinge: 'a' });
  op('midB', 'door', 600, { width: 800, swing: 'R', hinge: 'b' });
  op('midC', 'door', 1000, { width: 800, swing: 'R', hinge: 'a' });
  op('kit', 'portal', 800, { width: 900, height: 2100 });
  op('wet', 'door', 800, { width: 700, swing: 'L', hinge: 'a' });
  op('wet2', 'door', 550, { width: 700, swing: 'L', hinge: 'b' });

  syncRooms(lvl, roomDefaults());
  const setRoom = (pt: Vec2, name: string, type: RoomType, floor: string) => {
    const r = lvl.rooms.find((x) => x.polygon.length && inside(pt, x.polygon));
    if (r) Object.assign(r, { name, type, floorFinish: floor, named: true });
  };
  setRoom({ x: 2300, y: 1900 }, 'Вітальня', 'living', 'laminate-oak');
  setRoom({ x: 6800, y: 1900 }, 'Спальня', 'bedroom', 'laminate-oak');
  setRoom({ x: 1700, y: 5300 }, 'Кухня', 'kitchen', 'tile-floor-grey');
  setRoom({ x: 5100, y: 5300 }, 'Передпокій', 'hall', 'laminate-grey');
  setRoom({ x: 7900, y: 4800 }, 'Ванна кімната', 'bathroom', 'tile-floor-beige');
  setRoom({ x: 7900, y: 6200 }, 'Санвузол', 'toilet', 'tile-floor-beige');

  // отделка стен по помещениям
  const paint: Record<string, string> = { living: 'paint-beige', bedroom: 'paint-olive', kitchen: 'paint-white', hall: 'paint-grey', bathroom: 'tile-wall-white', toilet: 'tile-wall-metro' };
  for (const r of lvl.rooms) {
    const f = paint[r.type];
    if (!f) continue;
    for (const s of roomSurfaces(lvl, r)) {
      const w = lvl.walls.find((x) => x.id === s.wallId);
      if (w) w[s.side === 'L' ? 'finishL' : 'finishR'] = f;
    }
  }
  for (const w of lvl.walls) {
    if (!w.exterior) continue;
    // наружная сторона наружных стен
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
    const n = { x: -(w.b.y - w.a.y), y: w.b.x - w.a.x };
    const lOutside = (mid.x + Math.sign(n.x) * 200 < 0 || mid.x + Math.sign(n.x) * 200 > 9000 || mid.y + Math.sign(n.y) * 200 < 0 || mid.y + Math.sign(n.y) * 200 > 6800);
    w[lOutside ? 'finishL' : 'finishR'] = 'facade-plaster';
  }

  // изделие из конструктора — шкаф-купе в спальне
  const tpl = BUILTIN_TEMPLATES.find((t) => t.id === 'wardrobe-sliding')!.make();
  tpl.width = 1800;
  tpl.height = 2400;
  tpl.name = 'Шафа-купе (спальня)';
  tpl.columns = tpl.columns.slice(0, 2);
  tpl.facade.slidingCount = 2;
  p.cabinets.push(tpl);

  const put = (kind: string, x: number, y: number, rot = 0, params: Params = {}, z?: number): Item => {
    const it = makeItem(kind, { x, y }, rot, lvl, params);
    if (z !== undefined) it.z = z;
    lvl.items.push(it);
    return it;
  };

  // Вітальня
  put('rug', 2300, 2000, 90);
  put('sofa', 625, 2000, 270);
  put('table-coffee', 2000, 2000, 90);
  put('tv-stand', 4300, 2000, 90);
  put('tv', 4470, 2000, 90);
  put('armchair', 1300, 650, 0);
  put('bookshelf', 1000, 3650, 180);
  put('lamp-floor', 420, 3450, 0);
  put('plant', 4150, 480, 0);
  put('curtain', 2300, 230, 0, { w: 2300 });
  put('lamp-pendant', 2300, 2000, 0);
  // Спальня
  put('rug', 6400, 2000, 0, { w: 1800, d: 1300, color: '#a9b6a0' });
  put('bed-double', 7800, 1900, 90);
  put('nightstand', 8650, 800, 90);
  put('nightstand', 8650, 3000, 90);
  lvl.items.push({ id: newId('it'), kind: 'cabinet', x: 5000, y: 1400, rot: 270, z: 0, params: { designId: tpl.id, w: tpl.width, d: tpl.depth, h: tpl.height }, name: tpl.name });
  put('desk', 6000, 450, 0);
  put('chair-office', 6000, 1150, 180);
  put('chest', 7500, 3575, 180);
  put('curtain', 6800, 230, 0, { w: 2000 });
  put('lamp-ceiling', 6700, 1900, 0);
  put('lamp-sconce', 8790, 1050, 90);
  put('lamp-sconce', 8790, 2750, 90);
  // Кухня
  put('k-base', 450, 6350, 180);
  put('k-sink', 1150, 6350, 180);
  put('k-drawers', 1850, 6350, 180);
  put('k-hob', 2450, 6350, 180);
  put('fridge', 3040, 6325, 180);
  put('k-wall', 450, 6490, 180);
  put('k-wall', 1150, 6490, 180, { w: 800, doors: 2 });
  put('k-wall', 1850, 6490, 180);
  put('k-hood', 2450, 6410, 180);
  put('table-dining', 1300, 4600, 0, { w: 1100, d: 700 });
  put('chair', 1000, 5200, 180);
  put('chair', 1600, 5200, 180);
  put('chair', 470, 4600, 270);
  put('chair', 2130, 4600, 90);
  put('lamp-pendant', 1300, 4600, 0, { w: 300, d: 300 });
  put('lamp-ceiling', 1900, 5700, 0, { w: 300, d: 300 });
  // Передпокій
  put('hallway', 3635, 5850, 270);
  put('shoe-cabinet', 4050, 6500, 180);
  put('mirror', 4800, 4012, 0);
  put('lamp-spot', 4300, 5300, 0);
  put('lamp-spot', 5200, 5300, 0);
  put('lamp-spot', 6100, 5300, 0);
  // Ванна
  put('bathtub', 7905, 4350, 0);
  put('vanity', 8520, 5420, 180);
  put('washer', 7800, 5425, 180);
  put('towel-warmer', 8800, 4950, 90);
  put('lamp-ceiling', 7900, 4850, 0, { w: 300, d: 300 });
  // Санвузол
  put('toilet', 8525, 6200, 90);
  put('boiler', 7500, 6415, 180);
  put('lamp-spot', 7900, 6200, 0);

  // Отопление
  put('ht-radiator', 2300, 195, 0, { sections: 12 });
  put('ht-radiator', 6800, 195, 0, { sections: 10 });
  put('ht-radiator', 195, 5350, 270, { sections: 7 });
  // Электрика
  put('el-panel', 6300, 6650, 180);
  put('el-socket', 150, 1200, 270, { count: 2 });
  put('el-socket', 4500, 1500, 90, { count: 3 });
  put('el-socket', 8850, 500, 90, { count: 2 });
  put('el-socket', 8850, 3300, 90, { count: 2 });
  put('el-socket', 5400, 150, 0, { count: 2 });
  put('el-socket', 2160, 6650, 180, { count: 2, group: 'g-kitchen' }, 1100);
  put('el-socket', 2850, 6650, 180, { count: 2, group: 'g-kitchen' }, 1100);
  put('el-cooker', 2450, 6650, 180);
  put('el-socket', 8200, 5650, 180, { count: 1, ip44: true }, 1000);
  put('el-switch', 4480, 3800, 180);
  put('el-switch', 5120, 3800, 180);
  put('el-switch', 3340, 4150, 90);
  put('el-switch', 6840, 5200, 90, { gangs: 2 });
  put('el-light', 2300, 2000, 0);
  put('el-light', 6700, 1900, 0);
  put('el-light', 1300, 4600, 0);
  put('el-light', 5200, 5300, 0);
  put('el-light', 7900, 4850, 0);
  put('el-light', 7900, 6200, 0);
  lvl.routes.push({ id: newId('rt'), kind: 'el-cable', points: [{ x: 6300, y: 6650 }, { x: 6300, y: 4000 }, { x: 4500, y: 4000 }, { x: 4500, y: 1500 }], params: { group: 'g-sockets', section: 2.5, cores: 3, z: 2500, chase: true, chaseDepth: 20, chaseWidth: 20 } });
  lvl.routes.push({ id: newId('rt'), kind: 'el-cable', points: [{ x: 6300, y: 6650 }, { x: 5200, y: 6650 }, { x: 5200, y: 5300 }, { x: 5200, y: 4000 }, { x: 2300, y: 4000 }, { x: 2300, y: 2000 }], params: { group: 'g-light', section: 1.5, cores: 3, z: 2550, chase: true, chaseDepth: 20, chaseWidth: 20 } });
  lvl.routes.push({ id: newId('rt'), kind: 'el-cable', points: [{ x: 6300, y: 6650 }, { x: 3460, y: 6650 }, { x: 2850, y: 6650 }, { x: 2160, y: 6650 }], params: { group: 'g-kitchen', section: 2.5, cores: 3, z: 300, chase: true, chaseDepth: 20, chaseWidth: 20 } });
  // Сантехника
  put('pl-riser', 7100, 6520, 0, { type: 'sewer' });
  put('pl-riser', 7100, 6300, 0, { type: 'cold' });
  put('pl-cold', 8520, 5650, 180);
  put('pl-hot', 8400, 5650, 180);
  put('pl-drain', 8640, 5650, 180, { dia: 50 });
  put('pl-drain', 8850, 6200, 90, { dia: 110 });
  lvl.routes.push({ id: newId('rt'), kind: 'pl-sewer', points: [{ x: 8640, y: 5600 }, { x: 7200, y: 5600 }, { x: 7200, y: 6450 }], params: { dia: 50, slope: 30, z: 200 } });
  lvl.routes.push({ id: newId('rt'), kind: 'pl-pipe-cold', points: [{ x: 7100, y: 6300 }, { x: 7100, y: 5620 }, { x: 8520, y: 5620 }], params: { dia: 20, z: 350, chase: true, chaseDepth: 40 } });
  put('vt-exhaust', 8850, 4200, 90);
  put('vt-exhaust', 8850, 6500, 90);

  syncRooms(lvl, roomDefaults());
  // страховка: в демо не должно остаться объектов вне помещений
  const outside = new Set(itemsOutsideRooms(lvl).map((it) => it.id));
  if (outside.size) lvl.items = lvl.items.filter((it) => !outside.has(it.id));
  p.baseline = snapshotBaseline(p);
  p.stamp = { object: 'Квартира двокімнатна', address: 'м. Київ', author: '', customer: '' };
  return p;
}

function inside(p: Vec2, poly: Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
