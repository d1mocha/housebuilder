// Импорт цен в смету из CSV: «позиція; ціна». Подходит и файл, выгруженный кнопкой «Експорт CSV».
import type { EstimateLine } from './estimate';

export interface PriceRow {
  name: string;
  price: number;
}

/** Разбор строки CSV с кавычками. */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Число из «1 234,50», «1234.5», «850 грн». NaN — не число. */
export function parsePrice(s: string): number {
  const t = s.replace(/[\s  ]/g, '').replace(/(грн|uah|₴)\.?$/i, '');
  if (!t) return NaN;
  // запятая — десятичный разделитель, если точки нет; иначе запятые — разделители тысяч
  const norm = t.includes('.') ? t.replace(/,/g, '') : t.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(norm) ? Number(norm) : NaN;
}

const PRICE_HEAD = /^(ціна|цена|price)/i;
const NAME_HEAD = /^(позиція|позиция|назва|название|найменування|наименование|name|item)/i;

/**
 * Разобрать CSV с ценами. Разделитель — «;», табуляция или «,» (определяется по первой строке).
 * Если есть строка заголовков — берутся столбцы «Позиція» и «Ціна»; иначе первый столбец — позиция,
 * второй — цена. Строки без названия или без числа в цене пропускаются.
 */
export function parsePriceCsv(text: string): PriceRow[] {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lines.length) return [];
  const first = lines[0];
  const sep = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const rows = lines.map((l) => splitCsvLine(l, sep));
  let nameCol = 0;
  let priceCol = 1;
  let start = 0;
  const head = rows[0];
  const pc = head.findIndex((c) => PRICE_HEAD.test(c));
  const nc = head.findIndex((c) => NAME_HEAD.test(c));
  if (pc >= 0 || nc >= 0) {
    start = 1;
    if (nc >= 0) nameCol = nc;
    if (pc >= 0) priceCol = pc;
    else priceCol = nameCol === 0 ? 1 : 0;
  }
  const out: PriceRow[] = [];
  for (const r of rows.slice(start)) {
    const name = (r[nameCol] ?? '').trim();
    const price = parsePrice(r[priceCol] ?? '');
    if (!name || !Number.isFinite(price) || price < 0) continue;
    out.push({ name, price });
  }
  return out;
}

/** Название позиции для сравнения: без регистра, лишних пробелов и хвоста-примечания. */
export const normName = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[«»"'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export interface PriceMatch {
  /** Цены по ключам строк сметы. */
  prices: Record<string, number>;
  /** Позиции файла, которым не нашлось строки в смете. */
  unmatched: string[];
}

/**
 * Сопоставить строки файла со строками сметы: по ключу строки, по названию на украинском или русском
 * (точное совпадение после нормализации). Нулевая цена в файле пропускается — она не «обнуляет» цену в смете.
 */
export function matchPrices(lines: Pick<EstimateLine, 'key' | 'name'>[], rows: PriceRow[]): PriceMatch {
  const byName = new Map<string, string>();
  for (const l of lines) {
    for (const n of [l.key, l.name.uk, l.name.ru]) {
      const k = normName(n);
      if (k && !byName.has(k)) byName.set(k, l.key);
    }
  }
  const prices: Record<string, number> = {};
  const unmatched: string[] = [];
  for (const r of rows) {
    const key = byName.get(normName(r.name));
    if (!key) {
      unmatched.push(r.name);
      continue;
    }
    if (r.price > 0) prices[key] = Math.round(r.price * 100) / 100;
  }
  return { prices, unmatched };
}
