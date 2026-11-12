import { describe, expect, it } from 'vitest';
import '../src/catalog';
import { FURNITURE_COUNT } from '../src/catalog/furniture';
import { allItemDefs, allRouteDefs, allZoneDefs } from '../src/catalog/registry';
import { itemLocalPrims } from '../src/draw2d/plan';
import { createProject } from '../src/model/defaults';
import { makeItem } from '../src/model/ops';
import { buildItemObject } from '../src/view3d/build';

describe('библиотека объектов', () => {
  it('не меньше 40 параметрических объектов мебели', () => {
    expect(FURNITURE_COUNT).toBeGreaterThanOrEqual(40);
    const groups = new Set(allItemDefs().filter((d) => d.layer === 'furniture').map((d) => d.group));
    for (const g of ['kitchen', 'appliance', 'storage', 'bed', 'sofa', 'table', 'sanitary', 'light']) expect(groups.has(g)).toBe(true);
  });
  it('у каждого объекта есть габариты, 2D-символ и 3D-геометрия', () => {
    const p = createProject('house', 't');
    for (const def of allItemDefs()) {
      if (def.hidden) continue;
      const it = makeItem(def.kind, { x: 0, y: 0 }, 0, p.levels[0]);
      const s = def.size(it.params);
      expect(s.w, def.kind).toBeGreaterThan(0);
      expect(s.d, def.kind).toBeGreaterThan(0);
      expect(s.h, def.kind).toBeGreaterThan(0);
      expect(itemLocalPrims(it).length, def.kind).toBeGreaterThan(0);
      const obj = buildItemObject(p, it);
      expect(obj?.children.length, def.kind).toBeGreaterThan(0);
      expect(def.name.uk && def.name.ru, def.kind).toBeTruthy();
    }
  });
  it('параметры меняют геометрию', () => {
    const p = createProject('apartment', 't');
    const a = makeItem('wardrobe-sliding', { x: 0, y: 0 }, 0, p.levels[0]);
    const b = makeItem('wardrobe-sliding', { x: 0, y: 0 }, 0, p.levels[0], { w: 2700, doors: 3 });
    const count = (it: typeof a) => allItemDefs().find((d) => d.kind === it.kind)!.parts!(it.params, allItemDefs().find((d) => d.kind === it.kind)!.size(it.params)).length;
    expect(count(b)).toBeGreaterThan(count(a));
  });
  it('потолочные объекты ставятся под потолок этажа', () => {
    const p = createProject('apartment', 't');
    p.levels[0].height = 2700;
    const lamp = makeItem('lamp-ceiling', { x: 0, y: 0 }, 0, p.levels[0]);
    expect(lamp.z).toBe(2600);
  });
  it('инженерные и ландшафтные виды зарегистрированы', () => {
    const layers = new Set([...allItemDefs(), ...allRouteDefs(), ...allZoneDefs()].map((d) => d.layer));
    for (const l of ['electrical', 'plumbing', 'heating', 'gas', 'ventilation', 'landscape']) expect(layers.has(l as never)).toBe(true);
  });
});
