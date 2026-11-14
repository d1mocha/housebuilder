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
  const lam = { tileH: 193, grout: 0, pattern: 'brick' as const };
  return [
    // ── краска и штукатурка ──
    { id: 'paint-white', name: { uk: 'Фарба біла', ru: 'Краска белая' }, type: 'paint', color: '#f4f2ec', target: ['wall', 'ceiling'], consumption: 0.25, textureId: 'paint-matte' },
    { id: 'paint-beige', name: { uk: 'Фарба бежева', ru: 'Краска бежевая' }, type: 'paint', color: '#e6dccb', target: ['wall'], consumption: 0.25, textureId: 'paint-matte' },
    { id: 'paint-grey', name: { uk: 'Фарба сіра', ru: 'Краска серая' }, type: 'paint', color: '#c9cdd2', target: ['wall'], consumption: 0.25, textureId: 'paint-matte' },
    { id: 'paint-olive', name: { uk: 'Фарба оливкова', ru: 'Краска оливковая' }, type: 'paint', color: '#aab39a', target: ['wall'], consumption: 0.25, textureId: 'paint-matte' },
    { id: 'paint-blue', name: { uk: 'Фарба блакитна', ru: 'Краска голубая' }, type: 'paint', color: '#b9cfe0', target: ['wall'], consumption: 0.25, textureId: 'paint-matte' },
    { id: 'plaster', name: { uk: 'Штукатурка гіпсова', ru: 'Штукатурка гипсовая' }, type: 'plaster', color: '#dedad2', target: ['wall', 'ceiling'], consumption: 9, thickness: 10 },
    { id: 'plaster-decor', name: { uk: 'Штукатурка декоративна фактурна', ru: 'Штукатурка декоративная фактурная' }, type: 'plaster', color: '#e7dfd0', target: ['wall'], consumption: 2.5, thickness: 2, textureId: 'plaster-stucco' },
    { id: 'plaster-venetian', name: { uk: 'Штукатурка венеціанська', ru: 'Штукатурка венецианская' }, type: 'plaster', color: '#e3d9c6', target: ['wall'], consumption: 1.5, thickness: 1, textureId: 'plaster-venetian' },
    { id: 'plaster-loft', name: { uk: 'Штукатурка декоративна «лофт»', ru: 'Штукатурка декоративная «лофт»' }, type: 'plaster', color: '#8e877a', target: ['wall'], consumption: 1.2, thickness: 1, textureId: 'plaster-loft' },
    { id: 'facade-plaster', name: { uk: 'Фасадна штукатурка', ru: 'Фасадная штукатурка' }, type: 'plaster', color: '#e9e2d3', target: ['wall'], consumption: 3, thickness: 3, textureId: 'plaster-stucco' },
    // ── обои ──
    { id: 'wallpaper', name: { uk: 'Шпалери під фарбування 1,06×25 м', ru: 'Обои под покраску 1,06×25 м' }, type: 'wallpaper', color: '#e8e0d4', target: ['wall'], textureId: 'wallpaper-woodchip', rollW: 1060, rollL: 25000, rapport: 0 },
    { id: 'wallpaper-smooth', name: { uk: 'Шпалери флізелінові гладкі 1,06×10,05 м', ru: 'Обои флизелиновые гладкие 1,06×10,05 м' }, type: 'wallpaper', color: '#dfe5e2', target: ['wall'], textureId: 'wallpaper-smooth', rollW: 1060, rollL: 10050, rapport: 0 },
    { id: 'wallpaper-linen', name: { uk: 'Шпалери текстильні «льон» 1,06×10,05 м', ru: 'Обои текстильные «лён» 1,06×10,05 м' }, type: 'wallpaper', color: '#d9d0bd', target: ['wall'], textureId: 'wallpaper-linen', rollW: 1060, rollL: 10050, rapport: 0 },
    { id: 'wallpaper-damask', name: { uk: 'Шпалери з візерунком «дамаск» 0,53×10,05 м', ru: 'Обои с узором «дамаск» 0,53×10,05 м' }, type: 'wallpaper', color: '#cfc3a8', target: ['wall'], textureId: 'wallpaper-damask', texScale: 0.8, rollW: 530, rollL: 10050, rapport: 640 },
    { id: 'wallpaper-check', name: { uk: 'Шпалери в клітинку 0,53×10,05 м', ru: 'Обои в клетку 0,53×10,05 м' }, type: 'wallpaper', color: '#8f9380', target: ['wall'], textureId: 'wallpaper-check', texScale: 1.5, rollW: 530, rollL: 10050, rapport: 320 },
    { id: 'wallpaper-hessian', name: { uk: 'Шпалери «рогожка» 1,06×10,05 м', ru: 'Обои «рогожка» 1,06×10,05 м' }, type: 'wallpaper', color: '#8c7859', target: ['wall'], textureId: 'wallpaper-hessian', rollW: 1060, rollL: 10050, rapport: 0 },
    // ── обшивка и панели ──
    { id: 'gkl', name: { uk: 'Гіпсокартон (обшивка)', ru: 'Гипсокартон (обшивка)' }, type: 'gkl', color: '#eeeeea', target: ['wall', 'ceiling'], thickness: 12.5 },
    { id: 'panel-wood', name: { uk: 'Панелі МДФ «дуб»', ru: 'Панели МДФ «дуб»' }, type: 'panel', color: '#a78364', target: ['wall'], tileW: 200, tileH: 2600, grout: 0, textureId: 'wood-oak-natural' },
    // ── плитка, керамогранит, камень ──
    { id: 'tile-wall-white', name: { uk: 'Плитка настінна 300×600 біла', ru: 'Плитка настенная 300×600 белая' }, type: 'tile', color: '#f2f3f1', target: ['wall'], tileW: 600, tileH: 300, grout: 2, groutColor: '#cfd3d6', pattern: 'grid', packArea: 1.44 },
    { id: 'tile-wall-metro', name: { uk: 'Плитка «кабанчик» 100×200', ru: 'Плитка «кабанчик» 100×200' }, type: 'tile', color: '#e9efe9', target: ['wall'], tileW: 200, tileH: 100, grout: 2, groutColor: '#9aa3a8', pattern: 'brick', packArea: 1.0 },
    { id: 'tile-floor-grey', name: { uk: 'Керамограніт 600×600 сірий «бетон»', ru: 'Керамогранит 600×600 серый «бетон»' }, type: 'porcelain', color: '#b8b8b8', target: ['floor', 'wall'], tileW: 600, tileH: 600, grout: 2, groutColor: '#8d9196', pattern: 'grid', packArea: 1.44, thickness: 9, textureId: 'stone-concrete' },
    { id: 'tile-floor-beige', name: { uk: 'Плитка підлогова 300×300 «травертин»', ru: 'Плитка напольная 300×300 «травертин»' }, type: 'tile', color: '#dfcbac', target: ['floor'], tileW: 300, tileH: 300, grout: 3, groutColor: '#a89c88', pattern: 'grid', packArea: 1.35, textureId: 'stone-travertine' },
    { id: 'porcelain-marble', name: { uk: 'Керамограніт 600×1200 «мармур сірий»', ru: 'Керамогранит 600×1200 «мрамор серый»' }, type: 'porcelain', color: '#acadb6', target: ['floor', 'wall'], tileW: 1200, tileH: 600, grout: 2, groutColor: '#9a9ca4', pattern: 'brick', packArea: 1.44, thickness: 9, textureId: 'stone-marble-grey' },
    { id: 'porcelain-black', name: { uk: 'Керамограніт 600×600 «мармур чорний»', ru: 'Керамогранит 600×600 «мрамор чёрный»' }, type: 'porcelain', color: '#3d3f3e', target: ['floor', 'wall'], tileW: 600, tileH: 600, grout: 2, groutColor: '#2b2c2c', pattern: 'grid', packArea: 1.44, thickness: 9, textureId: 'stone-marble-black' },
    { id: 'porcelain-terrazzo', name: { uk: 'Керамограніт 600×600 «терацо»', ru: 'Керамогранит 600×600 «терраццо»' }, type: 'porcelain', color: '#d1ccc7', target: ['floor', 'wall'], tileW: 600, tileH: 600, grout: 2, groutColor: '#b9b4ae', pattern: 'grid', packArea: 1.44, thickness: 9, textureId: 'stone-terrazzo' },
    { id: 'stone-travertine', name: { uk: 'Камінь: травертин, слеб 600×300', ru: 'Камень: травертин, слэб 600×300' }, type: 'stone', color: '#dfcbac', target: ['wall', 'floor'], tileW: 600, tileH: 300, grout: 1, groutColor: '#c9b594', pattern: 'brick', thickness: 20, textureId: 'stone-travertine' },
    { id: 'stone-masonry', name: { uk: 'Камінь дикий (кладка)', ru: 'Камень дикий (кладка)' }, type: 'stone', color: '#8d836e', target: ['wall'], thickness: 30, textureId: 'stone-masonry' },
    // ── ламинат и паркет ──
    { id: 'laminate-oak', name: { uk: 'Ламінат «дуб натуральний» 1380×193, 33 кл., 8 мм', ru: 'Ламинат «дуб натуральный» 1380×193, 33 кл., 8 мм' }, type: 'laminate', color: '#a78364', target: ['floor'], tileW: 1380, ...lam, packArea: 2.13, wearClass: '33', thickness: 8, textureId: 'wood-oak-natural' },
    { id: 'laminate-grey', name: { uk: 'Ламінат «дуб сірий» 1380×193, 32 кл., 8 мм', ru: 'Ламинат «дуб серый» 1380×193, 32 кл., 8 мм' }, type: 'laminate', color: '#7b634e', target: ['floor'], tileW: 1380, ...lam, packArea: 2.13, wearClass: '32', thickness: 8, textureId: 'wood-oak-grey' },
    { id: 'laminate-maple', name: { uk: 'Ламінат «клен світлий» 1380×193, 32 кл., 8 мм', ru: 'Ламинат «клён светлый» 1380×193, 32 кл., 8 мм' }, type: 'laminate', color: '#cd9c6f', target: ['floor'], tileW: 1380, ...lam, packArea: 2.13, wearClass: '32', thickness: 8, textureId: 'wood-maple' },
    { id: 'laminate-walnut', name: { uk: 'Ламінат «горіх» 1285×192, 33 кл., 10 мм', ru: 'Ламинат «орех» 1285×192, 33 кл., 10 мм' }, type: 'laminate', color: '#593413', target: ['floor'], tileW: 1285, tileH: 192, grout: 0, pattern: 'brick', packArea: 1.73, wearClass: '33', thickness: 10, textureId: 'wood-walnut' },
    { id: 'laminate-wenge', name: { uk: 'Ламінат «венге» 1380×193, 32 кл., 8 мм', ru: 'Ламинат «венге» 1380×193, 32 кл., 8 мм' }, type: 'laminate', color: '#41342e', target: ['floor'], tileW: 1380, ...lam, packArea: 2.13, wearClass: '32', thickness: 8, textureId: 'wood-wenge' },
    { id: 'parquet', name: { uk: 'Паркетна дошка «вільха» 2200×190, 14 мм', ru: 'Паркетная доска «ольха» 2200×190, 14 мм' }, type: 'parquet', color: '#b0733f', target: ['floor'], tileW: 2200, tileH: 190, grout: 0, pattern: 'brick', packArea: 2.5, thickness: 14, textureId: 'wood-alder' },
    { id: 'parquet-herringbone', name: { uk: 'Паркет «ялинка» (дуб)', ru: 'Паркет «ёлочка» (дуб)' }, type: 'parquet', color: '#93704d', target: ['floor'], packArea: 1.2, thickness: 15, textureId: 'parquet-herringbone' },
    { id: 'parquet-basket', name: { uk: 'Паркет «плетінка» (горіх)', ru: 'Паркет «плетёнка» (орех)' }, type: 'parquet', color: '#59360e', target: ['floor'], packArea: 1.2, thickness: 15, textureId: 'parquet-basket' },
    // ── линолеум, ковролин, стяжка ──
    { id: 'linoleum-brown', name: { uk: 'Лінолеум коричневий, рулон 3 м, 32 кл.', ru: 'Линолеум коричневый, рулон 3 м, 32 кл.' }, type: 'linoleum', color: '#997a59', target: ['floor'], rollW: 3000, wearClass: '32', thickness: 2.5, textureId: 'linoleum-brown' },
    { id: 'linoleum-grey', name: { uk: 'Лінолеум сірий, рулон 4 м, 33 кл.', ru: 'Линолеум серый, рулон 4 м, 33 кл.' }, type: 'linoleum', color: '#a3a8a6', target: ['floor'], rollW: 4000, wearClass: '33', thickness: 3, textureId: 'linoleum-speckle' },
    { id: 'linoleum-retro', name: { uk: 'Лінолеум з орнаментом, рулон 2,5 м', ru: 'Линолеум с орнаментом, рулон 2,5 м' }, type: 'linoleum', color: '#b0834f', target: ['floor'], rollW: 2500, wearClass: '23', thickness: 2, textureId: 'linoleum-retro' },
    { id: 'carpet', name: { uk: 'Ковролін петельний, рулон 4 м', ru: 'Ковролин петельный, рулон 4 м' }, type: 'carpet', color: '#b9b2a6', target: ['floor'], rollW: 4000, thickness: 6, textureId: 'carpet-loop' },
    { id: 'concrete-floor', name: { uk: 'Стяжка / бетон', ru: 'Стяжка / бетон' }, type: 'concrete', color: '#b8b8b8', target: ['floor'], textureId: 'stone-concrete' },
    // ── потолки ──
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
  linoleum: { uk: 'Лінолеум', ru: 'Линолеум' },
  porcelain: { uk: 'Керамограніт', ru: 'Керамогранит' },
  stone: { uk: 'Камінь', ru: 'Камень' },
  carpet: { uk: 'Ковролін', ru: 'Ковролин' },
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
