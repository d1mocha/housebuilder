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
