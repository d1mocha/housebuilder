// SVG-бэкенд примитивов. k — мм модели на 1 мм бумаги.
import { memo } from 'react';
import type { Prim2, Style } from './prims';

function styleProps(s: Style | undefined, k: number, closed: boolean) {
  const stroke = s?.stroke ?? '#111827';
  return {
    stroke: stroke === 'none' ? 'none' : stroke,
    strokeWidth: (s?.w ?? 0.25) * k,
    fill: closed ? (s?.fill ?? 'none') : 'none',
    strokeDasharray: s?.dash ? s.dash.map((d) => d * k).join(' ') : undefined,
    opacity: s?.opacity,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

export function renderPrim(p: Prim2, key: number | string, k: number) {
  switch (p.t) {
    case 'line':
      return <line key={key} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} {...styleProps(p.s, k, false)} />;
    case 'poly': {
      const pts = p.pts.map((q) => `${f(q.x)},${f(q.y)}`).join(' ');
      return p.closed ? <polygon key={key} points={pts} {...styleProps(p.s, k, true)} /> : <polyline key={key} points={pts} {...styleProps(p.s, k, false)} />;
    }
    case 'path': {
      const d = p.rings.map((r) => `M${r.map((q) => `${f(q.x)} ${f(q.y)}`).join('L')}Z`).join('');
      return <path key={key} d={d} fillRule="evenodd" {...styleProps(p.s, k, true)} />;
    }
    case 'circle':
      return <circle key={key} cx={p.cx} cy={p.cy} r={p.r} {...styleProps(p.s, k, true)} />;
    case 'arc': {
      const n = Math.max(2, Math.ceil(Math.abs(p.a1 - p.a0) / 6));
      const pts: string[] = [];
      for (let i = 0; i <= n; i++) {
        const a = ((p.a0 + ((p.a1 - p.a0) * i) / n) * Math.PI) / 180;
        pts.push(`${f(p.cx + Math.cos(a) * p.r)},${f(p.cy + Math.sin(a) * p.r)}`);
      }
      return <polyline key={key} points={pts.join(' ')} {...styleProps(p.s, k, false)} />;
    }
    case 'text': {
      const size = p.size * k;
      return (
        <text
          key={key}
          x={p.x}
          y={p.y}
          fontSize={size}
          textAnchor={p.anchor ?? 'middle'}
          dominantBaseline="central"
          fill={p.color ?? '#111827'}
          fontWeight={p.bold ? 700 : 400}
          transform={p.rot ? `rotate(${p.rot} ${p.x} ${p.y})` : undefined}
          stroke={p.halo ? '#ffffff' : undefined}
          strokeWidth={p.halo ? size * 0.3 : undefined}
          paintOrder={p.halo ? 'stroke' : undefined}
          strokeLinejoin="round"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {p.text}
        </text>
      );
    }
  }
}

export const Prims = memo(function Prims({ prims, k }: { prims: Prim2[]; k: number }) {
  return <>{prims.map((p, i) => renderPrim(p, i, k))}</>;
});
