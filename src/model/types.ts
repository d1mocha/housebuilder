// Единая модель данных проекта. Все линейные размеры — в миллиметрах, углы — в градусах.
import type { CabinetCatalog, CabinetDesign } from '../cabinet/types';

export type Id = string;
export type Lang = 'uk' | 'ru';
/** Локализованная строка. */
export interface LS {
  uk: string;
  ru: string;
}
export interface Vec2 {
  x: number;
  y: number;
}

export type ProjectKind = 'apartment' | 'house';

export type LayerId =
  | 'walls'
  | 'rooms'
  | 'furniture'
  | 'electrical'
  | 'plumbing'
  | 'heating'
  | 'gas'
  | 'ventilation'
  | 'landscape'
  | 'dimensions'
  | 'underlay';

export type ParamValue = number | string | boolean;
export type Params = Record<string, ParamValue>;

/** Статус элемента при ремонте: существующий, под демонтаж, новый. */
export type ElementStatus = 'existing' | 'demolish' | 'new';

/** Сторона стены: L — слева от направления a→b (нормаль (-dy, dx)), R — справа. */
export type WallSide = 'L' | 'R';

export interface Wall {
  id: Id;
  a: Vec2;
  b: Vec2;
  thickness: number;
  /** Высота; если не задана — высота этажа. */
  height?: number;
  /** id из каталога материалов стен (brick, aerated, ceramic, concrete, gkl...). */
  material: string;
  loadBearing: boolean;
  /** Наружная стена (для сметы утеплителя и фасадов). */
  exterior?: boolean;
  /** Отделка сторон — id из project.finishes. */
  finishL: string;
  finishR: string;
  /** Статус: существующая / демонтаж / новая. Нет значения — «новая». */
  status?: ElementStatus;
  /** Дуговая стена: стрела дуги, мм (со знаком: + выгиб в сторону L). Нет/0 — прямая. */
  arc?: number;
}

export type OpeningKind = 'door' | 'window' | 'portal';
export type DoorStyle = 'single' | 'double' | 'sliding' | 'entrance';

export interface Opening {
  id: Id;
  wallId: Id;
  kind: OpeningKind;
  /** Расстояние от точки a стены до центра проёма вдоль оси. */
  pos: number;
  width: number;
  height: number;
  /** Высота подоконника / низа проёма от пола. */
  sill: number;
  /** У какого конца стены петли двери. */
  hinge: 'a' | 'b';
  /** В какую сторону стены открывается дверь. */
  swing: WallSide;
  style: DoorStyle;
  /** Количество створок окна. */
  sashes: number;
}

export type RoomType =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'toilet'
  | 'hall'
  | 'corridor'
  | 'balcony'
  | 'storage'
  | 'boiler'
  | 'garage'
  | 'other';

export interface Room {
  id: Id;
  name: string;
  type: RoomType;
  /** Точка внутри помещения — по ней метаданные находят свой контур после правки стен. */
  seed: Vec2;
  /** Производное: внутренний контур (мм). */
  polygon: Vec2[];
  /** Производное: площадь, м². */
  area: number;
  /** Производное: периметр, м. */
  perimeter: number;
  floorFinish: string;
  ceilingFinish: string;
  /** true, если имя/тип заданы пользователем. */
  named?: boolean;
}

/** Точечный объект: мебель, корпус, инженерная точка, объект участка. */
export interface Item {
  id: Id;
  kind: string;
  x: number;
  y: number;
  /** Поворот, градусы по часовой стрелке на плане. */
  rot: number;
  /** Высота низа над полом. */
  z: number;
  params: Params;
  name?: string;
  /** Статус: существующий / демонтаж / новый. Нет значения — «новый». */
  status?: ElementStatus;
}

/** Полилиния: кабель, труба, воздуховод, дорожка, забор. */
export interface Route {
  id: Id;
  kind: string;
  points: Vec2[];
  params: Params;
}

/** Полигон: тёплый пол, газон, мощение, терраса, бассейн. */
export interface Zone {
  id: Id;
  kind: string;
  points: Vec2[];
  params: Params;
}

export interface Dim {
  id: Id;
  a: Vec2;
  b: Vec2;
  /** Вынос размерной линии от измеряемого отрезка (со знаком). */
  offset: number;
}

export interface Underlay {
  dataUrl: string;
  /** Размер изображения в пикселях. */
  pxW: number;
  pxH: number;
  /** Положение левого верхнего угла, мм. */
  x: number;
  y: number;
  /** мм на пиксель. */
  scale: number;
  opacity: number;
  visible: boolean;
}

export interface Level {
  id: Id;
  name: string;
  /** Отметка чистого пола, мм. */
  elevation: number;
  /** Высота потолка (пол–потолок), мм. */
  height: number;
  /** Толщина перекрытия над этажом, мм. */
  slab: number;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  items: Item[];
  routes: Route[];
  zones: Zone[];
  dims: Dim[];
  underlay: Underlay | null;
}

export interface Site {
  /** Граница участка (полигон). */
  boundary: Vec2[];
  /** Отметки вершин границы, мм (упрощённый рельеф). */
  elevations: number[];
  /** Азимут «верха» плана: 0 — север вверху, по часовой стрелке, градусы. */
  north: number;
  latitude: number;
  items: Item[];
  routes: Route[];
  zones: Zone[];
}

export type FinishType =
  | 'plaster'
  | 'paint'
  | 'wallpaper'
  | 'tile'
  | 'laminate'
  | 'parquet'
  | 'panel'
  | 'gkl'
  | 'concrete'
  | 'stretch'
  | 'linoleum'
  | 'porcelain'
  | 'stone'
  | 'carpet';

export interface Finish {
  id: Id;
  name: LS;
  type: FinishType;
  color: string;
  /** Где применимо. */
  target: ('wall' | 'floor' | 'ceiling')[];
  /** Плитка / доска: размеры элемента, мм. */
  tileW?: number;
  tileH?: number;
  /** Шов, мм. */
  grout?: number;
  groutColor?: string;
  /** Раскладка. */
  pattern?: 'grid' | 'brick' | 'diagonal';
  /** м² в упаковке (ламинат, плитка). */
  packArea?: number;
  /** Расход на м² (штукатурка — кг/м² на 10 мм, краска — л/м²). */
  consumption?: number;
  /** Толщина слоя / покрытия, мм. */
  thickness?: number;
  /** Текстура из библиотеки CC0 (src/catalog/textures.ts). */
  textureId?: string;
  /** Своё фото поверхности (data URL, хранится в проекте) — вместо библиотечной текстуры. */
  photo?: string;
  /** Физическая ширина фрагмента на фото, мм. */
  photoW?: number;
  /** Масштаб укладки текстуры (1 — натуральный размер). */
  texScale?: number;
  /** Поворот укладки, °. */
  texRot?: number;
  /** Рулон: ширина и длина, мм (обои; для линолеума — только ширина). */
  rollW?: number;
  rollL?: number;
  /** Раппорт рисунка обоев, мм (0 — без подгонки). */
  rapport?: number;
  /** Класс износостойкости (ламинат, линолеум, керамогранит). */
  wearClass?: string;
  /** Цена за единицу, грн (единица зависит от типа: рулон, м², л, кг). */
  price?: number;
  /** Товар из магазина: ссылка и данные, введённые вручную (сайт магазина приложение не читает). */
  shopUrl?: string;
  shopTitle?: string;
  shopSku?: string;
}

export interface CustomModel {
  id: Id;
  name: string;
  format: 'gltf' | 'glb' | 'obj';
  dataUrl: string;
  /** Габариты исходной модели в её единицах. */
  bbox: { w: number; d: number; h: number };
}

export interface ElGroup {
  id: Id;
  name: string;
  /** Номинал автомата, А. */
  breaker: number;
  /** Сечение кабеля, мм². */
  section: number;
  /** Кол-во жил. */
  cores: number;
  rcd: boolean;
  color: string;
}

export interface BaselineWall {
  id: Id;
  a: Vec2;
  b: Vec2;
  thickness: number;
  loadBearing: boolean;
  levelId: Id;
  openings: { pos: number; width: number }[];
}

export interface Roof {
  type: 'none' | 'flat' | 'gable' | 'hip';
  /** Уклон, градусы. */
  pitch: number;
  overhang: number;
}

export interface Stamp {
  object: string;
  address: string;
  author: string;
  customer: string;
}

export interface SunSettings {
  month: number;
  day: number;
  hour: number;
  enabled: boolean;
}

export interface Project {
  schema: number;
  id: Id;
  name: string;
  kind: ProjectKind;
  createdAt: number;
  updatedAt: number;
  levels: Level[];
  site: Site | null;
  finishes: Finish[];
  cabinets: CabinetDesign[];
  cabinetCatalog: CabinetCatalog;
  models: CustomModel[];
  electrical: { groups: ElGroup[] };
  baseline: BaselineWall[] | null;
  ruleOverrides: Record<string, { value?: number; verified?: boolean }>;
  /** Цены по ключу позиции сметы. */
  prices: Record<string, number>;
  /** Запас в % по категории сметы. */
  reserves: Record<string, number>;
  roof: Roof;
  sun: SunSettings;
  stamp: Stamp;
  gridStep: number;
}

/** Ссылка на выделенный объект. */
export type EntityType = 'wall' | 'opening' | 'room' | 'item' | 'route' | 'zone' | 'dim' | 'site' | 'underlay';
export interface Sel {
  type: EntityType;
  id: Id;
  /** 'site' — объект лежит в project.site, иначе id этажа. */
  scope: Id | 'site';
}
