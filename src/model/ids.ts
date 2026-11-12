let counter = 0;

/** Короткий уникальный идентификатор. */
export function newId(prefix = 'id'): string {
  counter += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rnd}`;
}
