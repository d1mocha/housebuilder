// Встроенные шаблоны изделий (параметрические: меняются габариты — структура сохраняется).
import { newId } from '../model/ids';
import type { LS } from '../model/types';
import type { CabinetDesign, Column } from './types';

const col = (o: Partial<Column> = {}): Column => ({ id: newId('col'), width: null, shelves: 0, drawers: 0, drawerHeight: 180, rod: false, doors: 0, ...o });

export function baseDesign(name: string, width: number, height: number, depth: number): CabinetDesign {
  return {
    id: newId('cab'),
    name,
    width,
    height,
    depth,
    bodyMaterialId: 'ldsp18',
    facadeMaterialId: 'ldsp18',
    backMaterialId: 'hdf3',
    edgeFront: 'pvc2',
    edgeHidden: 'pvc04',
    edgeFacade: 'pvc2',
    topMode: 'inset',
    bottomMode: 'inset',
    plinth: 0,
    legs: 0,
    back: { mode: 'overlay', grooveDepth: 8, grooveInset: 16, overlayGap: 2 },
    columns: [col()],
    shelfFixing: 'fixed',
    facade: { type: 'none', gap: 2, inset: false, slidingCount: 2, slidingOverlap: 26, slidingZone: 100, slidingHeightDeduct: 40, slidingInfill: false, slidingProfile: 26, slidingInfillDeductW: 36, slidingInfillDeductH: 60, handles: true },
    joint: 'confirmat',
    extraParts: [],
    overrides: {},
  };
}

export interface TemplateDef {
  id: string;
  name: LS;
  make: () => CabinetDesign;
}

export const BUILTIN_TEMPLATES: TemplateDef[] = [
  {
    id: 'wardrobe-sliding',
    name: { uk: 'Шафа-купе 2400×2600×600', ru: 'Шкаф-купе 2400×2600×600' },
    make: () => ({
      ...baseDesign('Шафа-купе', 2400, 2600, 600),
      plinth: 70,
      // полиці | штанга з антресоллю | штанга, полиці та дві шухляди
      columns: [col({ shelves: 4 }), col({ shelves: 1, rod: true }), col({ shelves: 2, drawers: 2, drawerHeight: 180, rod: true })],
      facadeMaterialId: 'ldsp10',
      facade: { type: 'sliding', gap: 2, inset: false, slidingCount: 3, slidingOverlap: 26, slidingZone: 100, slidingHeightDeduct: 40, slidingInfill: true, slidingProfile: 26, slidingInfillDeductW: 36, slidingInfillDeductH: 60, handles: false },
    }),
  },
  {
    id: 'wardrobe-hinged',
    name: { uk: 'Шафа розпашна 900×2100×520', ru: 'Шкаф распашной 900×2100×520' },
    make: () => ({
      ...baseDesign('Шафа розпашна', 900, 2100, 520),
      plinth: 70,
      columns: [col({ shelves: 1, rod: true, doors: 2 })],
      facade: { ...baseDesign('', 1, 1, 1).facade, type: 'hinged' },
    }),
  },
  {
    id: 'kitchen-base',
    name: { uk: 'Кухонна тумба 600×720×560', ru: 'Кухонная тумба 600×720×560' },
    make: () => ({
      ...baseDesign('Кухонна тумба', 600, 820, 560),
      bodyMaterialId: 'ldsp16',
      topMode: 'stretchers',
      bottomMode: 'overlay',
      legs: 100,
      shelfFixing: 'support',
      columns: [col({ shelves: 1, doors: 1 })],
      facade: { ...baseDesign('', 1, 1, 1).facade, type: 'hinged' },
    }),
  },
  {
    id: 'kitchen-drawers',
    name: { uk: 'Кухонна тумба з шухлядами 600', ru: 'Кухонная тумба с ящиками 600' },
    make: () => ({
      ...baseDesign('Тумба з шухлядами', 600, 820, 560),
      bodyMaterialId: 'ldsp16',
      topMode: 'stretchers',
      bottomMode: 'overlay',
      legs: 100,
      columns: [col({ drawers: 3 })],
      facade: { ...baseDesign('', 1, 1, 1).facade, type: 'drawers' },
    }),
  },
  {
    id: 'kitchen-wall',
    name: { uk: 'Навісна шафа 600×720×300', ru: 'Навесной шкаф 600×720×300' },
    make: () => ({
      ...baseDesign('Навісна шафа', 600, 720, 300),
      bodyMaterialId: 'ldsp16',
      topMode: 'overlay',
      bottomMode: 'overlay',
      shelfFixing: 'support',
      back: { mode: 'groove', grooveDepth: 8, grooveInset: 16, overlayGap: 2 },
      columns: [col({ shelves: 1, doors: 1 })],
      facade: { ...baseDesign('', 1, 1, 1).facade, type: 'hinged' },
    }),
  },
  {
    id: 'chest',
    name: { uk: 'Комод 800×850×450', ru: 'Комод 800×850×450' },
    make: () => ({
      ...baseDesign('Комод', 800, 850, 450),
      bodyMaterialId: 'ldsp16',
      topMode: 'overlay',
      legs: 50,
      bottomMode: 'inset',
      columns: [col({ drawers: 4 })],
      facade: { ...baseDesign('', 1, 1, 1).facade, type: 'drawers' },
    }),
  },
  {
    id: 'bookshelf',
    name: { uk: 'Стелаж 800×2000×300', ru: 'Стеллаж 800×2000×300' },
    make: () => ({
      ...baseDesign('Стелаж', 800, 2000, 300),
      bodyMaterialId: 'ldsp16',
      plinth: 60,
      columns: [col({ shelves: 4 })],
    }),
  },
  {
    id: 'nightstand',
    name: { uk: 'Тумба приліжкова 450×500×400', ru: 'Тумба прикроватная 450×500×400' },
    make: () => ({
      ...baseDesign('Тумба приліжкова', 450, 500, 400),
      bodyMaterialId: 'ldsp16',
      topMode: 'overlay',
      legs: 60,
      columns: [col({ drawers: 2 })],
      facade: { ...baseDesign('', 1, 1, 1).facade, type: 'drawers' },
    }),
  },
];

export const newColumn = col;

/** Разумное число ящиков для фасада «ящики» по высоте фасадной зоны (фасад ≈ 200 мм, не выше 400). */
export function autoDrawerCount(d: CabinetDesign): number {
  const zone = d.height - d.legs - (d.bottomMode === 'overlay' ? 0 : d.plinth);
  return Math.max(1, Math.min(10, Math.round(zone / 200)));
}

/** Копия изделия с новыми идентификаторами (создание из шаблона). */
export function cloneDesign(d: CabinetDesign, name?: string): CabinetDesign {
  const c: CabinetDesign = JSON.parse(JSON.stringify(d));
  c.id = newId('cab');
  if (name) c.name = name;
  c.columns = c.columns.map((x) => ({ ...x, id: newId('col') }));
  return c;
}
