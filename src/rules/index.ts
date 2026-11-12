// Справочник норм: значения берутся из rules.json с учётом правок пользователя в проекте.
import type { LS, Project } from '../model/types';
import data from './rules.json';

export interface Rule {
  id: string;
  category: string;
  title: LS;
  value: number;
  unit: string;
  source: string;
  verified: boolean;
  note?: string;
}

export const BASE_RULES: Rule[] = (data as { rules: Rule[] }).rules;

export type RuleOverrides = Project['ruleOverrides'];

/** Правила с применёнными переопределениями проекта. */
export function effectiveRules(overrides: RuleOverrides = {}): Rule[] {
  return BASE_RULES.map((r) => {
    const o = overrides[r.id];
    return o ? { ...r, value: o.value ?? r.value, verified: o.verified ?? r.verified } : r;
  });
}

export function ruleValue(overrides: RuleOverrides | undefined, id: string, fallback = 0): number {
  const o = overrides?.[id];
  if (o?.value !== undefined) return o.value;
  return BASE_RULES.find((r) => r.id === id)?.value ?? fallback;
}

export const ruleById = (id: string): Rule | undefined => BASE_RULES.find((r) => r.id === id);

export const RULE_CATEGORIES: Record<string, LS> = {
  general: { uk: 'Загальне', ru: 'Общее' },
  planning: { uk: 'Планування', ru: 'Планировка' },
  electrical: { uk: 'Електрика', ru: 'Электрика' },
  plumbing: { uk: 'Водопровід і каналізація', ru: 'Водопровод и канализация' },
  heating: { uk: 'Опалення', ru: 'Отопление' },
  gas: { uk: 'Газ', ru: 'Газ' },
  ventilation: { uk: 'Вентиляція', ru: 'Вентиляция' },
  site: { uk: 'Ділянка', ru: 'Участок' },
};

export const DISCLAIMER: LS = {
  uk: 'Застосунок не замінює проєкт сертифікованого фахівця. Нормативні значення не перевірені — звіряйте з чинними ДБН/ДСТУ/ПУЕ.',
  ru: 'Приложение не заменяет проект сертифицированного специалиста. Нормативные значения не проверены — сверяйте с действующими ДБН/ДСТУ/ПУЭ.',
};
