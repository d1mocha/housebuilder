// Проверки целостности модели: объекты вне помещений.
import { itemDef } from '../catalog/registry';
import { add, pointInPolygon, rotate } from './geometry';
import type { Item, Level } from './types';

/**
 * Объекты этажа, не попадающие ни в одно помещение.
 * Объект считается «внутри», если в помещении лежит его центр либо точка перед ним
 * (настенные объекты стоят центром на грани стены).
 */
export function itemsOutsideRooms(level: Level): Item[] {
  return level.items.filter((it) => {
    const def = itemDef(it.kind);
    const d = def ? def.size(it.params).d : typeof it.params.d === 'number' ? it.params.d : 600;
    const front = add({ x: it.x, y: it.y }, rotate({ x: 0, y: Math.min(d / 2 + 60, 200) }, it.rot));
    const center = { x: it.x, y: it.y };
    return !level.rooms.some((r) => pointInPolygon(center, r.polygon) || pointInPolygon(front, r.polygon));
  });
}
