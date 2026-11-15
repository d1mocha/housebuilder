// Текст счётчика выделения со склонением: «1 стіна», «2 стіни», «5 стін», для разнотипных — «5 об’єктів».
import { countNoun } from '../i18n';
import type { Noun } from '../i18n';
import type { Lang, Sel } from '../model/types';

const NOUN_OF: Record<Sel['type'], Noun> = { wall: 'wall', opening: 'opening', room: 'room', item: 'item', route: 'route', zone: 'zone', dim: 'dim', site: 'site', underlay: 'underlay' };

/** total — общий счётчик; parts — разбивка по типам (пустая, если тип один). */
export function selectionText(sels: Sel[], lang: Lang): { total: string; parts: string[] } {
  const counts = new Map<Sel['type'], number>();
  for (const s of sels) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  const parts = [...counts.entries()].map(([type, n]) => countNoun(n, NOUN_OF[type], lang));
  if (counts.size === 1) return { total: parts[0], parts: [] };
  return { total: countNoun(sels.length, 'item', lang), parts };
}
