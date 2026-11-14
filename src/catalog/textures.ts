// Библиотека текстур отделки. Все изображения — CC0 (ambientCG, Poly Haven), лежат в public/textures.
// Список сгенерирован при подготовке ассетов; источники и лицензии — в ASSETS_LICENSES.md.
import type { LS } from '../model/types';

export type TextureCategory = 'wallpaper' | 'wood' | 'parquet' | 'laminate' | 'linoleum' | 'stone' | 'plaster' | 'carpet';

export interface TextureDef {
  id: string;
  name: LS;
  category: TextureCategory;
  /**
   * seamless — однородная поверхность (ею заполняются доски и плитки заданного формата);
   * pattern — рисунок укладки уже есть в изображении (паркет «ёлочка», доска), кладётся как есть.
   */
  layout: 'seamless' | 'pattern';
  /** Физический размер изображения, мм. */
  w: number;
  h: number;
  /** Средний цвет (для плана, чертежей и до загрузки изображения). */
  avg: string;
  /** Средняя шероховатость PBR. */
  rough: number;
  /** Источник (CC0). */
  source: string;
  url: string;
  /** Изображение обесцвечено и нормировано — цвет задаёт материал (обои под покраску и т. п.). */
  tint?: boolean;
  /** Раппорт рисунка, мм (для обоев с узором). */
  rapport?: number;
}

export const TEXTURES: TextureDef[] = [
  { id: 'wallpaper-woodchip', name: { uk: 'Шпалери під фарбування (рауфазер)', ru: 'Обои под покраску (рауфазер)' }, category: 'wallpaper', layout: 'seamless', w: 1000, h: 1000, avg: '#ebebeb', rough: 0.66, source: 'ambientCG: Wallpaper001A', url: 'https://ambientcg.com/a/Wallpaper001A', tint: true },
  { id: 'wallpaper-smooth', name: { uk: 'Шпалери гладкі флізелінові', ru: 'Обои гладкие флизелиновые' }, category: 'wallpaper', layout: 'seamless', w: 1000, h: 1000, avg: '#ebebeb', rough: 0.65, source: 'ambientCG: Wallpaper002A', url: 'https://ambientcg.com/a/Wallpaper002A', tint: true },
  { id: 'wallpaper-linen', name: { uk: 'Шпалери текстильні (льон)', ru: 'Обои текстильные (лён)' }, category: 'wallpaper', layout: 'seamless', w: 300, h: 301, avg: '#dbdbdb', rough: 0.72, source: 'Poly Haven: rough_linen', url: 'https://polyhaven.com/a/rough_linen', tint: true },
  { id: 'wallpaper-damask', name: { uk: 'Шпалери з візерунком (дамаск)', ru: 'Обои с узором (дамаск)' }, category: 'wallpaper', layout: 'seamless', w: 530, h: 804, avg: '#b3b3b3', rough: 0.72, source: 'Poly Haven: floral_jacquard', url: 'https://polyhaven.com/a/floral_jacquard', tint: true, rapport: 804 },
  { id: 'wallpaper-check', name: { uk: 'Шпалери в клітинку', ru: 'Обои в клетку' }, category: 'wallpaper', layout: 'seamless', w: 640, h: 640, avg: '#8f9380', rough: 0.82, source: 'Poly Haven: fabric_pattern_05', url: 'https://polyhaven.com/a/fabric_pattern_05', rapport: 640 },
  { id: 'wallpaper-hessian', name: { uk: 'Шпалери «рогожка»', ru: 'Обои «рогожка»' }, category: 'wallpaper', layout: 'seamless', w: 270, h: 268, avg: '#8c7859', rough: 0.58, source: 'Poly Haven: hessian_230', url: 'https://polyhaven.com/a/hessian_230' },
  { id: 'wood-maple', name: { uk: 'Клен світлий', ru: 'Клён светлый' }, category: 'wood', layout: 'seamless', w: 1000, h: 500, avg: '#cd9c6f', rough: 0.57, source: 'ambientCG: Wood095', url: 'https://ambientcg.com/a/Wood095' },
  { id: 'wood-oak-natural', name: { uk: 'Дуб натуральний', ru: 'Дуб натуральный' }, category: 'wood', layout: 'seamless', w: 800, h: 800, avg: '#a78364', rough: 0.49, source: 'ambientCG: Wood094', url: 'https://ambientcg.com/a/Wood094' },
  { id: 'wood-alder', name: { uk: 'Вільха медова', ru: 'Ольха медовая' }, category: 'wood', layout: 'seamless', w: 800, h: 800, avg: '#b0733f', rough: 0.48, source: 'ambientCG: Wood092', url: 'https://ambientcg.com/a/Wood092' },
  { id: 'wood-oak-grey', name: { uk: 'Дуб сіро-коричневий', ru: 'Дуб серо-коричневый' }, category: 'wood', layout: 'seamless', w: 800, h: 800, avg: '#7b634e', rough: 0.5, source: 'ambientCG: Wood049', url: 'https://ambientcg.com/a/Wood049' },
  { id: 'wood-walnut', name: { uk: 'Горіх', ru: 'Орех' }, category: 'wood', layout: 'seamless', w: 800, h: 800, avg: '#593413', rough: 0.33, source: 'ambientCG: Wood066', url: 'https://ambientcg.com/a/Wood066' },
  { id: 'wood-wenge', name: { uk: 'Венге', ru: 'Венге' }, category: 'wood', layout: 'seamless', w: 800, h: 800, avg: '#41342e', rough: 0.54, source: 'ambientCG: Wood051', url: 'https://ambientcg.com/a/Wood051' },
  { id: 'wood-mahogany', name: { uk: 'Махагон темний', ru: 'Махагон тёмный' }, category: 'wood', layout: 'seamless', w: 800, h: 800, avg: '#3f220f', rough: 0.49, source: 'ambientCG: Wood027', url: 'https://ambientcg.com/a/Wood027' },
  { id: 'parquet-strip', name: { uk: 'Паркет штучний «палуба»', ru: 'Паркет штучный «палуба»' }, category: 'parquet', layout: 'pattern', w: 1800, h: 1800, avg: '#9b7b5d', rough: 0.35, source: 'ambientCG: WoodFloor051', url: 'https://ambientcg.com/a/WoodFloor051' },
  { id: 'parquet-basket', name: { uk: 'Паркет «плетінка»', ru: 'Паркет «плетёнка»' }, category: 'parquet', layout: 'pattern', w: 1200, h: 1200, avg: '#59360e', rough: 0.32, source: 'ambientCG: WoodFloor070', url: 'https://ambientcg.com/a/WoodFloor070' },
  { id: 'parquet-herringbone', name: { uk: 'Паркет «ялинка»', ru: 'Паркет «ёлочка»' }, category: 'parquet', layout: 'pattern', w: 3400, h: 3400, avg: '#93704d', rough: 0.2, source: 'Poly Haven: herringbone_parquet', url: 'https://polyhaven.com/a/herringbone_parquet' },
  { id: 'laminate-planks-grey', name: { uk: 'Ламінат дуб сірий (дошка)', ru: 'Ламинат дуб серый (доска)' }, category: 'laminate', layout: 'pattern', w: 1700, h: 1700, avg: '#9b8063', rough: 0.38, source: 'Poly Haven: laminate_floor_02', url: 'https://polyhaven.com/a/laminate_floor_02' },
  { id: 'laminate-planks-brown', name: { uk: 'Ламінат дуб коричневий (дошка)', ru: 'Ламинат дуб коричневый (доска)' }, category: 'laminate', layout: 'pattern', w: 1700, h: 1700, avg: '#806042', rough: 0.47, source: 'Poly Haven: wood_floor', url: 'https://polyhaven.com/a/wood_floor' },
  { id: 'linoleum-brown', name: { uk: 'Лінолеум коричневий (крихта)', ru: 'Линолеум коричневый (крошка)' }, category: 'linoleum', layout: 'seamless', w: 2000, h: 2000, avg: '#997a59', rough: 0.65, source: 'Poly Haven: linoleum_brown', url: 'https://polyhaven.com/a/linoleum_brown' },
  { id: 'linoleum-speckle', name: { uk: 'Лінолеум однотонний (колір на вибір)', ru: 'Линолеум однотонный (цвет на выбор)' }, category: 'linoleum', layout: 'seamless', w: 2000, h: 2000, avg: '#dfdfdf', rough: 0.65, source: 'Poly Haven: linoleum_brown', url: 'https://polyhaven.com/a/linoleum_brown', tint: true },
  { id: 'linoleum-retro', name: { uk: 'Лінолеум з орнаментом', ru: 'Линолеум с орнаментом' }, category: 'linoleum', layout: 'seamless', w: 1990, h: 1990, avg: '#b0834f', rough: 0.31, source: 'Poly Haven: old_linoleum_flooring_01', url: 'https://polyhaven.com/a/old_linoleum_flooring_01' },
  { id: 'stone-marble-grey', name: { uk: 'Мармур сірий', ru: 'Мрамор серый' }, category: 'stone', layout: 'seamless', w: 2000, h: 2000, avg: '#acadb6', rough: 0.2, source: 'ambientCG: Marble012', url: 'https://ambientcg.com/a/Marble012' },
  { id: 'stone-marble-black', name: { uk: 'Мармур чорний', ru: 'Мрамор чёрный' }, category: 'stone', layout: 'seamless', w: 2000, h: 2000, avg: '#3d3f3e', rough: 0.2, source: 'ambientCG: Marble016', url: 'https://ambientcg.com/a/Marble016' },
  { id: 'stone-travertine', name: { uk: 'Травертин бежевий', ru: 'Травертин бежевый' }, category: 'stone', layout: 'seamless', w: 1200, h: 1200, avg: '#dfcbac', rough: 0.2, source: 'ambientCG: Travertine009', url: 'https://ambientcg.com/a/Travertine009' },
  { id: 'stone-terrazzo', name: { uk: 'Терацо', ru: 'Терраццо' }, category: 'stone', layout: 'seamless', w: 1000, h: 1000, avg: '#d1ccc7', rough: 0.22, source: 'ambientCG: Terrazzo013', url: 'https://ambientcg.com/a/Terrazzo013' },
  { id: 'stone-concrete', name: { uk: 'Бетон світлий', ru: 'Бетон светлый' }, category: 'stone', layout: 'seamless', w: 2200, h: 1100, avg: '#b8b8b8', rough: 0.52, source: 'ambientCG: Concrete034', url: 'https://ambientcg.com/a/Concrete034' },
  { id: 'stone-masonry', name: { uk: 'Камінь дикий (кладка)', ru: 'Камень дикий (кладка)' }, category: 'stone', layout: 'pattern', w: 2000, h: 1000, avg: '#8d836e', rough: 0.6, source: 'ambientCG: Bricks075A', url: 'https://ambientcg.com/a/Bricks075A' },
  { id: 'plaster-stucco', name: { uk: 'Штукатурка фактурна', ru: 'Штукатурка фактурная' }, category: 'plaster', layout: 'seamless', w: 1500, h: 1500, avg: '#e6e6e6', rough: 0.79, source: 'ambientCG: Plaster001', url: 'https://ambientcg.com/a/Plaster001', tint: true },
  { id: 'paint-matte', name: { uk: 'Фарбована поверхня матова', ru: 'Окрашенная поверхность матовая' }, category: 'plaster', layout: 'seamless', w: 1000, h: 1000, avg: '#ebebeb', rough: 0.65, source: 'ambientCG: Wallpaper002A', url: 'https://ambientcg.com/a/Wallpaper002A', tint: true },
  { id: 'plaster-venetian', name: { uk: 'Штукатурка венеціанська', ru: 'Штукатурка венецианская' }, category: 'plaster', layout: 'seamless', w: 1500, h: 1500, avg: '#d5d5d5', rough: 0.84, source: 'ambientCG: Plaster003', url: 'https://ambientcg.com/a/Plaster003', tint: true },
  { id: 'plaster-loft', name: { uk: 'Штукатурка декоративна «лофт»', ru: 'Штукатурка декоративная «лофт»' }, category: 'plaster', layout: 'seamless', w: 1500, h: 1500, avg: '#8e877a', rough: 0.91, source: 'Poly Haven: white_plaster_02', url: 'https://polyhaven.com/a/white_plaster_02' },
  { id: 'carpet-loop', name: { uk: 'Ковролін петельний', ru: 'Ковролин петельный' }, category: 'carpet', layout: 'seamless', w: 1700, h: 1700, avg: '#e3e3e3', rough: 0.65, source: 'ambientCG: Carpet016', url: 'https://ambientcg.com/a/Carpet016', tint: true },
];

export const TEXTURE_CATEGORY_NAMES: Record<TextureCategory, LS> = {
  wallpaper: { uk: 'Шпалери', ru: 'Обои' },
  wood: { uk: 'Дерево', ru: 'Дерево' },
  parquet: { uk: 'Паркет', ru: 'Паркет' },
  laminate: { uk: 'Ламінат', ru: 'Ламинат' },
  linoleum: { uk: 'Лінолеум', ru: 'Линолеум' },
  stone: { uk: 'Камінь, керамограніт', ru: 'Камень, керамогранит' },
  plaster: { uk: 'Штукатурка', ru: 'Штукатурка' },
  carpet: { uk: 'Ковролін', ru: 'Ковролин' },
};

export const textureDef = (id: string | undefined | null): TextureDef | undefined => (id ? TEXTURES.find((t) => t.id === id) : undefined);

/** Адрес изображения текстуры с учётом base (GitHub Pages). */
export function textureUrl(id: string, map: 'color' | 'normal' = 'color'): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}textures/${id}${map === 'normal' ? '_n' : ''}.jpg`;
}
