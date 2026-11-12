import type { Finish, LS } from '../model/types';

export interface WallMaterialDef {
  id: string;
  name: LS;
  /** Цвет штриховки/заливки на плане. */
  color: string;
  /** Типовая толщина по умолчанию. */
  thickness: number;
  /** Размер блока (Д×В×Ш кладки), мм — для сметы. */
  block?: { l: number; h: number };
  /** Позиция сметы. */
  estimate: 'aerated' | 'ceramic' | 'brick' | 'concrete' | 'gkl' | 'other';
}

export const WALL_MATERIALS: WallMaterialDef[] = [
  { id: 'brick', name: { uk: 'Цегла', ru: 'Кирпич' }, color: '#b5651d', thickness: 250, block: { l: 250, h: 65 }, estimate: 'brick' },
  { id: 'aerated', name: { uk: 'Газоблок', ru: 'Газоблок' }, color: '#9aa7b1', thickness: 300, block: { l: 600, h: 200 }, estimate: 'aerated' },
  { id: 'ceramic', name: { uk: 'Керамоблок', ru: 'Керамоблок' }, color: '#c97b4a', thickness: 380, block: { l: 248, h: 238 }, estimate: 'ceramic' },
  { id: 'concrete', name: { uk: 'Залізобетон', ru: 'Железобетон' }, color: '#6b7280', thickness: 200, estimate: 'concrete' },
  { id: 'gkl', name: { uk: 'Гіпсокартон на каркасі', ru: 'Гипсокартон на каркасе' }, color: '#cbd5e1', thickness: 100, estimate: 'gkl' },
  { id: 'other', name: { uk: 'Інше', ru: 'Другое' }, color: '#94a3b8', thickness: 150, estimate: 'other' },
];

export const wallMaterial = (id: string): WallMaterialDef => WALL_MATERIALS.find((m) => m.id === id) ?? WALL_MATERIALS[WALL_MATERIALS.length - 1];

export const DEFAULT_WALL_FINISH = 'paint-white';
export const DEFAULT_FLOOR_FINISH = 'laminate-oak';
export const DEFAULT_CEILING_FINISH = 'ceiling-white';
export const EXTERIOR_FINISH = 'facade-plaster';

/** Стартовый каталог отделки (копируется в проект и редактируется пользователем). */
export function defaultFinishes(): Finish[] {
  return [
    { id: 'paint-white', name: { uk: 'Фарба біла', ru: 'Краска белая' }, type: 'paint', color: '#f4f2ec', target: ['wall', 'ceiling'], consumption: 0.25 },
    { id: 'paint-beige', name: { uk: 'Фарба бежева', ru: 'Краска бежевая' }, type: 'paint', color: '#e6dccb', target: ['wall'], consumption: 0.25 },
    { id: 'paint-grey', name: { uk: 'Фарба сіра', ru: 'Краска серая' }, type: 'paint', color: '#c9cdd2', target: ['wall'], consumption: 0.25 },
    { id: 'paint-olive', name: { uk: 'Фарба оливкова', ru: 'Краска оливковая' }, type: 'paint', color: '#aab39a', target: ['wall'], consumption: 0.25 },
    { id: 'paint-blue', name: { uk: 'Фарба блакитна', ru: 'Краска голубая' }, type: 'paint', color: '#b9cfe0', target: ['wall'], consumption: 0.25 },
    { id: 'plaster', name: { uk: 'Штукатурка гіпсова', ru: 'Штукатурка гипсовая' }, type: 'plaster', color: '#dedad2', target: ['wall', 'ceiling'], consumption: 9, thickness: 10 },
    { id: 'facade-plaster', name: { uk: 'Фасадна штукатурка', ru: 'Фасадная штукатурка' }, type: 'plaster', color: '#e9e2d3', target: ['wall'], consumption: 3, thickness: 3 },
    { id: 'wallpaper', name: { uk: 'Шпалери', ru: 'Обои' }, type: 'wallpaper', color: '#e8e0d4', target: ['wall'] },
    { id: 'gkl', name: { uk: 'Гіпсокартон (обшивка)', ru: 'Гипсокартон (обшивка)' }, type: 'gkl', color: '#eeeeea', target: ['wall', 'ceiling'], thickness: 12.5 },
    { id: 'panel-wood', name: { uk: 'Панелі МДФ', ru: 'Панели МДФ' }, type: 'panel', color: '#b08a62', target: ['wall'], tileW: 200, tileH: 2600, grout: 0 },
    { id: 'tile-wall-white', name: { uk: 'Плитка настінна 300×600 біла', ru: 'Плитка настенная 300×600 белая' }, type: 'tile', color: '#f2f3f1', target: ['wall'], tileW: 600, tileH: 300, grout: 2, groutColor: '#cfd3d6', pattern: 'grid', packArea: 1.44 },
    { id: 'tile-wall-metro', name: { uk: 'Плитка «кабанчик» 100×200', ru: 'Плитка «кабанчик» 100×200' }, type: 'tile', color: '#e9efe9', target: ['wall'], tileW: 200, tileH: 100, grout: 2, groutColor: '#9aa3a8', pattern: 'brick', packArea: 1.0 },
    { id: 'tile-floor-grey', name: { uk: 'Керамограніт 600×600 сірий', ru: 'Керамогранит 600×600 серый' }, type: 'tile', color: '#b9bcc0', target: ['floor'], tileW: 600, tileH: 600, grout: 2, groutColor: '#8d9196', pattern: 'grid', packArea: 1.44 },
    { id: 'tile-floor-beige', name: { uk: 'Плитка підлогова 300×300 бежева', ru: 'Плитка напольная 300×300 бежевая' }, type: 'tile', color: '#d9cdb8', target: ['floor'], tileW: 300, tileH: 300, grout: 3, groutColor: '#a89c88', pattern: 'grid', packArea: 1.35 },
    { id: 'laminate-oak', name: { uk: 'Ламінат дуб 1380×193', ru: 'Ламинат дуб 1380×193' }, type: 'laminate', color: '#c8a877', target: ['floor'], tileW: 1380, tileH: 193, grout: 0, pattern: 'brick', packArea: 2.13 },
    { id: 'laminate-grey', name: { uk: 'Ламінат сірий 1380×193', ru: 'Ламинат серый 1380×193' }, type: 'laminate', color: '#a9a39b', target: ['floor'], tileW: 1380, tileH: 193, grout: 0, pattern: 'brick', packArea: 2.13 },
    { id: 'parquet', name: { uk: 'Паркетна дошка', ru: 'Паркетная доска' }, type: 'parquet', color: '#a8774a', target: ['floor'], tileW: 2200, tileH: 190, grout: 0, pattern: 'brick', packArea: 2.5 },
    { id: 'concrete-floor', name: { uk: 'Стяжка / бетон', ru: 'Стяжка / бетон' }, type: 'concrete', color: '#a3a5a8', target: ['floor'] },
    { id: 'ceiling-white', name: { uk: 'Стеля біла (фарба)', ru: 'Потолок белый (краска)' }, type: 'paint', color: '#fbfbf8', target: ['ceiling'], consumption: 0.25 },
    { id: 'ceiling-stretch', name: { uk: 'Натяжна стеля', ru: 'Натяжной потолок' }, type: 'stretch', color: '#ffffff', target: ['ceiling'] },
  ];
}

export const FINISH_TYPE_NAMES: Record<Finish['type'], LS> = {
  plaster: { uk: 'Штукатурка', ru: 'Штукатурка' },
  paint: { uk: 'Фарбування', ru: 'Покраска' },
  wallpaper: { uk: 'Шпалери', ru: 'Обои' },
  tile: { uk: 'Плитка', ru: 'Плитка' },
  laminate: { uk: 'Ламінат', ru: 'Ламинат' },
  parquet: { uk: 'Паркет', ru: 'Паркет' },
  panel: { uk: 'Панелі', ru: 'Панели' },
  gkl: { uk: 'Гіпсокартон', ru: 'Гипсокартон' },
  concrete: { uk: 'Бетон / стяжка', ru: 'Бетон / стяжка' },
  stretch: { uk: 'Натяжна стеля', ru: 'Натяжной потолок' },
};

export const ROOM_TYPE_NAMES: Record<string, LS> = {
  living: { uk: 'Вітальня', ru: 'Гостиная' },
  bedroom: { uk: 'Спальня', ru: 'Спальня' },
  kitchen: { uk: 'Кухня', ru: 'Кухня' },
  bathroom: { uk: 'Ванна кімната', ru: 'Ванная' },
  toilet: { uk: 'Санвузол', ru: 'Санузел' },
  hall: { uk: 'Передпокій', ru: 'Прихожая' },
  corridor: { uk: 'Коридор', ru: 'Коридор' },
  balcony: { uk: 'Балкон / лоджія', ru: 'Балкон / лоджия' },
  storage: { uk: 'Комора', ru: 'Кладовая' },
  boiler: { uk: 'Топкова', ru: 'Топочная' },
  garage: { uk: 'Гараж', ru: 'Гараж' },
  other: { uk: 'Приміщення', ru: 'Помещение' },
};

/** «Мокрые» типы помещений. */
export const WET_ROOMS = ['bathroom', 'toilet'];
