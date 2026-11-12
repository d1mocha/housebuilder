// Минимальный писатель ASCII DXF (R12): LINE, CIRCLE, TEXT по слоям. Кириллица — через \U+XXXX.
import type { Prim2 } from '../draw2d/prims';
import { arcPoints } from '../draw2d/prims';

export interface DxfLayer {
  name: string;
  /** Индекс цвета AutoCAD (ACI). */
  color: number;
  prims: Prim2[];
}

const esc = (s: string): string =>
  Array.from(s)
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      return c > 126 ? `\\U+${c.toString(16).toUpperCase().padStart(4, '0')}` : ch;
    })
    .join('');

const n = (x: number) => (Math.round(x * 1000) / 1000).toString();

/**
 * @param layers слои с примитивами в мм модели (Y вниз — переворачивается в Y вверх)
 * @param k мм модели на 1 мм бумаги — для высоты текста
 */
export function toDxf(layers: DxfLayer[], k: number): string {
  const out: string[] = [];
  const w = (...a: (string | number)[]) => out.push(...a.map(String));
  w(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.length);
  for (const l of layers) w(0, 'LAYER', 2, l.name, 70, 0, 62, l.color, 6, 'CONTINUOUS');
  w(0, 'ENDTAB', 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'ENTITIES');
  const lineEnt = (layer: string, x1: number, y1: number, x2: number, y2: number) => w(0, 'LINE', 8, layer, 10, n(x1), 20, n(-y1), 30, 0, 11, n(x2), 21, n(-y2), 31, 0);
  for (const l of layers) {
    for (const p of l.prims) {
      switch (p.t) {
        case 'line':
          lineEnt(l.name, p.x1, p.y1, p.x2, p.y2);
          break;
        case 'poly': {
          const m = p.closed ? p.pts.length : p.pts.length - 1;
          for (let i = 0; i < m; i++) {
            const a = p.pts[i];
            const b = p.pts[(i + 1) % p.pts.length];
            lineEnt(l.name, a.x, a.y, b.x, b.y);
          }
          break;
        }
        case 'path':
          for (const r of p.rings) {
            for (let i = 0; i < r.length; i++) {
              const a = r[i];
              const b = r[(i + 1) % r.length];
              lineEnt(l.name, a.x, a.y, b.x, b.y);
            }
          }
          break;
        case 'circle':
          w(0, 'CIRCLE', 8, l.name, 10, n(p.cx), 20, n(-p.cy), 30, 0, 40, n(p.r));
          break;
        case 'arc': {
          const pts = arcPoints(p.cx, p.cy, p.r, p.a0, p.a1);
          for (let i = 1; i < pts.length; i++) lineEnt(l.name, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
          break;
        }
        case 'text': {
          const h = p.size * k;
          const align = p.anchor === 'start' ? 0 : p.anchor === 'end' ? 2 : 1;
          w(0, 'TEXT', 8, l.name, 10, n(p.x), 20, n(-p.y), 30, 0, 40, n(h), 1, esc(p.text), 50, n(-(p.rot ?? 0)), 72, align, 73, 2, 11, n(p.x), 21, n(-p.y), 31, 0);
          break;
        }
      }
    }
  }
  w(0, 'ENDSEC', 0, 'EOF');
  return out.join('\n');
}
