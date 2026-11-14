// Локализация: инлайн-пары «укр/рус» и локализованные строки каталогов.
import type { Lang, LS } from '../model/types';
import { useUi } from '../store/uiStore';

export type TFn = (uk: string, ru?: string) => string;

export const makeT =
  (lang: Lang): TFn =>
  (uk, ru) =>
    lang === 'ru' && ru !== undefined ? ru : uk;

export const pick = (ls: LS | string | undefined, lang: Lang): string => {
  if (!ls) return '';
  if (typeof ls === 'string') return ls;
  return ls[lang] ?? ls.uk;
};

/** Хук перевода: t('укр', 'рус'), ls({uk, ru}). */
export function useT(): { t: TFn; ls: (s: LS | string | undefined) => string; lang: Lang } {
  const lang = useUi((s) => s.lang);
  return { t: makeT(lang), ls: (s) => pick(s, lang), lang };
}

/** Число с запятой и заданной точностью. */
export const fmt = (n: number, digits = 2): string => {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m)).replace('.', ',');
};

/** Длина в метрах из мм. */
export const fmtM = (mm: number, digits = 2): string => fmt(mm / 1000, digits);

/** Формы существительного для числительных: [1 стіна, 2 стіни, 5 стін]. */
export type Forms = [one: string, few: string, many: string];

/**
 * Склонение по числу для украинского и русского (правило одно):
 * 1, 21, 101 — one; 2–4, 22–24 — few; 0, 5–20, 25–30, 11–14 — many. Дробные числа — few («1,5 метра»).
 */
export function plural(n: number, forms: Forms): string {
  const abs = Math.abs(n);
  if (!Number.isInteger(abs)) return forms[1];
  const d10 = abs % 10;
  const d100 = abs % 100;
  if (d10 === 1 && d100 !== 11) return forms[0];
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return forms[1];
  return forms[2];
}

/** «5 стін»: число и существительное в нужной форме. */
export const count = (n: number, forms: Forms): string => `${n} ${plural(n, forms)}`;

/** Словарь счётных существительных интерфейса (uk / ru). */
export const NOUNS = {
  wall: { uk: ['стіна', 'стіни', 'стін'], ru: ['стена', 'стены', 'стен'] },
  opening: { uk: ['проріз', 'прорізи', 'прорізів'], ru: ['проём', 'проёма', 'проёмов'] },
  room: { uk: ['приміщення', 'приміщення', 'приміщень'], ru: ['помещение', 'помещения', 'помещений'] },
  item: { uk: ['об’єкт', 'об’єкти', 'об’єктів'], ru: ['объект', 'объекта', 'объектов'] },
  route: { uk: ['траса', 'траси', 'трас'], ru: ['трасса', 'трассы', 'трасс'] },
  zone: { uk: ['зона', 'зони', 'зон'], ru: ['зона', 'зоны', 'зон'] },
  dim: { uk: ['розмір', 'розміри', 'розмірів'], ru: ['размер', 'размера', 'размеров'] },
  site: { uk: ['ділянка', 'ділянки', 'ділянок'], ru: ['участок', 'участка', 'участков'] },
  underlay: { uk: ['підкладка', 'підкладки', 'підкладок'], ru: ['подложка', 'подложки', 'подложек'] },
  part: { uk: ['деталь', 'деталі', 'деталей'], ru: ['деталь', 'детали', 'деталей'] },
  sheet: { uk: ['лист', 'листи', 'листів'], ru: ['лист', 'листа', 'листов'] },
  issue: { uk: ['порушення', 'порушення', 'порушень'], ru: ['нарушение', 'нарушения', 'нарушений'] },
  record: { uk: ['запис', 'записи', 'записів'], ru: ['запись', 'записи', 'записей'] },
  strip: { uk: ['полотно', 'полотна', 'полотен'], ru: ['полотно', 'полотна', 'полотен'] },
  roll: { uk: ['рулон', 'рулони', 'рулонів'], ru: ['рулон', 'рулона', 'рулонов'] },
  pack: { uk: ['упаковка', 'упаковки', 'упаковок'], ru: ['упаковка', 'упаковки', 'упаковок'] },
  seam: { uk: ['стик', 'стики', 'стиків'], ru: ['стык', 'стыка', 'стыков'] },
  price: { uk: ['ціна', 'ціни', 'цін'], ru: ['цена', 'цены', 'цен'] },
  position: { uk: ['позиція', 'позиції', 'позицій'], ru: ['позиция', 'позиции', 'позиций'] },
  piece: { uk: ['штука', 'штуки', 'штук'], ru: ['штука', 'штуки', 'штук'] },
  card: { uk: ['картка', 'картки', 'карток'], ru: ['карточка', 'карточки', 'карточек'] },
  thumb: { uk: ['мініатюра', 'мініатюри', 'мініатюр'], ru: ['миниатюра', 'миниатюры', 'миниатюр'] },
} satisfies Record<string, { uk: Forms; ru: Forms }>;

export type Noun = keyof typeof NOUNS;

/** «3 стіни» / «3 стены» на языке интерфейса. */
export const countNoun = (n: number, noun: Noun, lang: Lang): string => count(n, NOUNS[noun][lang] ?? NOUNS[noun].uk);
