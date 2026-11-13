// Типы конструктора корпусной мебели. Размеры — мм.
import type { LS } from '../model/types';

export interface BoardMaterial {
  id: string;
  name: LS;
  kind: 'ldsp' | 'mdf' | 'hdf' | 'other';
  thickness: number;
  /** Размер листа. */
  sheetL: number;
  sheetW: number;
  /** Есть направление текстуры (детали нельзя поворачивать при раскрое). */
  grain: boolean;
  color: string;
}

export interface EdgeBand {
  id: string;
  name: LS;
  thickness: number;
  material: 'pvc' | 'abs';
  color: string;
}

export interface CabinetCatalog {
  boards: BoardMaterial[];
  bands: EdgeBand[];
  /** Ширина пропила, мм. */
  kerf: number;
  /** Обпил листа по периметру, мм. */
  trim: number;
  /** Кромка тоньше этого значения не уменьшает пильный размер (0 — учитывать любую). */
  edgeMinThickness: number;
}

/** Кромка по сторонам детали: l1/l2 — вдоль длины (длинные стороны), w1/w2 — вдоль ширины. */
export interface EdgeSides {
  l1: string | null;
  l2: string | null;
  w1: string | null;
  w2: string | null;
}

export type Grain = 'length' | 'width' | 'none';

export type PartRole =
  | 'side'
  | 'top'
  | 'bottom'
  | 'stretcher'
  | 'partition'
  | 'shelf'
  | 'back'
  | 'plinth'
  | 'facade'
  | 'drawerFront'
  | 'drawerSide'
  | 'drawerEnd'
  | 'drawerBottom'
  | 'slidingDoor'
  | 'slidingProfile'
  | 'manual';

export interface PartBox {
  /** Минимальный угол и размеры в системе корпуса: x — ширина, y — глубина (0 — задняя стенка), z — высота. */
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface Part {
  /** Стабильный ключ детали (для переопределений). */
  key: string;
  name: LS;
  role: PartRole;
  materialId: string;
  /** Готовые (чистовые) размеры. */
  length: number;
  width: number;
  thickness: number;
  edges: EdgeSides;
  qty: number;
  /** Направление текстуры: вдоль длины детали, поперёк (вдоль ширины) или без (деталь можно поворачивать). */
  grain: Grain;
  box?: PartBox;
  /** Только для 3D-превью, в деталировку не попадает (например, полотно купе в алюминиевом профиле). */
  virtual?: boolean;
}

export interface Column {
  id: string;
  /** Ширина секции в свету; null — авто (поровну). */
  width: number | null;
  shelves: number;
  drawers: number;
  /** Высота фасада ящика. */
  drawerHeight: number;
  rod: boolean;
  /** Кол-во распашных дверей на секцию (для facade.type = hinged). */
  doors: number;
}

export interface ManualPart {
  id: string;
  name: string;
  materialId: string;
  length: number;
  width: number;
  qty: number;
  edges: EdgeSides;
  grain: Grain;
}

export interface PartOverride {
  edges?: Partial<EdgeSides>;
  materialId?: string;
  grain?: Grain;
  skip?: boolean;
}

export type FacadeType = 'none' | 'hinged' | 'sliding' | 'drawers';

export interface CabinetDesign {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Глубина корпуса (боковины вместе с накладной задней стенкой), без накладных фасадов. */
  depth: number;
  bodyMaterialId: string;
  facadeMaterialId: string;
  backMaterialId: string;
  /** Кромка лицевых торцов корпуса. */
  edgeFront: string | null;
  /** Кромка остальных торцов корпуса. */
  edgeHidden: string | null;
  /** Кромка фасадов. */
  edgeFacade: string | null;
  /** Крышка: накладная на боковины / вкладная между боковинами / две планки. */
  topMode: 'overlay' | 'inset' | 'stretchers';
  bottomMode: 'overlay' | 'inset';
  /** Высота цоколя (боковины до пола, дно поднято). */
  plinth: number;
  /** Высота ножек (корпус поднят). */
  legs: number;
  back: {
    mode: 'groove' | 'overlay' | 'none';
    /** Глубина паза. */
    grooveDepth: number;
    /** Отступ паза от заднего торца. */
    grooveInset: number;
    /** Отступ накладной стенки от края корпуса. */
    overlayGap: number;
  };
  columns: Column[];
  shelfFixing: 'fixed' | 'support';
  facade: {
    type: FacadeType;
    /** Зазор между фасадами. */
    gap: number;
    /** Вкладные фасады (внутри проёма). */
    inset: boolean;
    slidingCount: number;
    /** Перехлёст дверей-купе. */
    slidingOverlap: number;
    /** Глубина зоны под систему купе. */
    slidingZone: number;
    /** Вычет высоты двери-купе от высоты проёма (зависит от системы профиля). */
    slidingHeightDeduct: number;
    /** Добавлять наполнение дверей-купе из плиты в деталировку. */
    slidingInfill: boolean;
    /** Ширина вертикального профиля двери-купе (видимая), мм. */
    slidingProfile?: number;
    /** Вычет ширины/высоты наполнения от размера двери (зависит от системы профиля), мм. */
    slidingInfillDeductW?: number;
    slidingInfillDeductH?: number;
    handles: boolean;
  };
  joint: 'confirmat' | 'eccentric';
  extraParts: ManualPart[];
  overrides: Record<string, PartOverride>;
  color?: string;
}

export interface HardwareLine {
  id: string;
  name: LS;
  qty: number;
  unit: LS;
  note?: LS;
}

export interface CabinetResult {
  parts: Part[];
  hardware: HardwareLine[];
  warnings: LS[];
  /** Габаритная глубина с фасадами. */
  overallDepth: number;
}
