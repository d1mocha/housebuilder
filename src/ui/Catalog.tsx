// Карточки каталога: миниатюра (рендер параметрической модели или условное обозначение), избранное,
// перетаскивание на план и в 3D.
import { useEffect, useMemo, useState } from 'react';
import type { CabinetDesign } from '../cabinet/types';
import type { ItemDef, RouteDef, ZoneDef } from '../catalog/registry';
import { Prims } from '../draw2d/Svg';
import { itemLocalPrims, itemSize } from '../draw2d/plan';
import { useT } from '../i18n';
import type { Item, Params } from '../model/types';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';

/** MIME-типы перетаскивания объекта каталога. */
export const DND_KIND = 'application/x-hb-kind';
export const DND_PARAMS = 'application/x-hb-params';

const memThumbs = new Map<string, string | null>();

/** Миниатюра 3D-модели объекта (лениво, модуль рендера грузится отдельно от основного кода). */
function useThumb(kind: string, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(() => memThumbs.get(kind) ?? null);
  useEffect(() => {
    if (!enabled || memThumbs.has(kind)) return;
    let alive = true;
    import('../view3d/thumbs')
      .then((m) => m.itemThumb(kind))
      .then((u) => {
        memThumbs.set(kind, u);
        if (alive) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [kind, enabled]);
  return url;
}

/** Миниатюра изделия конструктора. */
function useCabinetThumb(design: CabinetDesign | undefined): string | null {
  const catalog = useProject((s) => s.project.cabinetCatalog);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!design) return;
    let alive = true;
    const tm = setTimeout(() => {
      Promise.all([import('../view3d/thumbs'), import('../view3d/build'), import('../cabinet/generate')])
        .then(([th, b, g]) => {
          const res = g.generateCabinet(design, catalog);
          const { prims, depth } = b.cabinetPartPrims(res.parts, design, catalog);
          if (alive) setUrl(th.renderPrims(prims, { w: design.width, d: depth }));
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      alive = false;
      clearTimeout(tm);
    };
  }, [design, catalog]);
  return url;
}

/** Условное обозначение объекта как миниатюра (инженерные точки). */
function SymbolThumb({ kind, params }: { kind: string; params: Params }) {
  const { prims, vb, k } = useMemo(() => {
    const it: Item = { id: 'thumb', kind, x: 0, y: 0, rot: 0, z: 0, params };
    const s = itemSize(it);
    // условные обозначения заданы в мм бумаги: масштаб подбирается так, чтобы знак (≈ 8 мм) и габарит объекта помещались
    const k = Math.max(60, Math.max(s.w, s.d) / 9);
    const span = 15 * k;
    return { prims: itemLocalPrims(it), vb: `${-span / 2} ${-span / 2} ${span} ${span}`, k };
  }, [kind, params]);
  return (
    <svg viewBox={vb} className="card-thumb-svg">
      <Prims prims={prims} k={k} />
    </svg>
  );
}

function Star({ kind }: { kind: string }) {
  const { t } = useT();
  const fav = useUi((s) => s.favorites.includes(kind));
  return (
    <button
      className={`card-star ${fav ? 'on' : ''}`}
      title={fav ? t('Прибрати з обраного', 'Убрать из избранного') : t('Додати в обране', 'Добавить в избранное')}
      data-fav={kind}
      onClick={(e) => {
        e.stopPropagation();
        useUi.getState().toggleFavorite(kind);
      }}
    >
      {fav ? '★' : '☆'}
    </button>
  );
}

/** Карточка объекта: клик — инструмент постановки, перетаскивание — на план или в 3D. */
export function ItemCard({ def, label, params, cabinet, favKey, onPick, active }: { def: ItemDef | undefined; label: string; params?: Params; cabinet?: CabinetDesign; favKey?: string; onPick: () => void; active: boolean }) {
  const { t } = useT();
  const kind = def?.kind ?? (cabinet ? 'cabinet' : 'model');
  const use3d = !!def?.parts && (def.layer === 'furniture' || def.layer === 'landscape') && !cabinet;
  const thumb = useThumb(kind, use3d);
  const cabThumb = useCabinetThumb(cabinet);
  const img = cabinet ? cabThumb : thumb;
  return (
    <div
      className={`lib-item lib-card ${active ? 'active' : ''}`}
      role="button"
      tabIndex={0}
      title={`${label}\n${t('Клік — поставити на план; перетягніть на план або в 3D', 'Клик — поставить на план; перетащите на план или в 3D')}`}
      data-kind={kind}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_KIND, kind);
        e.dataTransfer.setData(DND_PARAMS, JSON.stringify(params ?? {}));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={onPick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick()}
    >
      <span className="card-thumb" data-thumb={img ? '3d' : def && !use3d ? '2d' : 'none'}>
        {img ? <img src={img} alt="" draggable={false} /> : def && (!use3d || !def.parts) ? <SymbolThumb kind={def.kind} params={{ ...def.defaults, ...(params ?? {}) }} /> : <span className="card-thumb-wait" />}
      </span>
      <span className="card-name">{label}</span>
      {favKey && <Star kind={favKey} />}
    </div>
  );
}

/** Карточка трассы или зоны: образец линии / заливки. */
export function KindCard({ def, type, label, onPick, active }: { def: RouteDef | ZoneDef; type: 'route' | 'zone'; label: string; onPick: () => void; active: boolean }) {
  const color = type === 'route' ? (typeof (def as RouteDef).color === 'function' ? ((def as RouteDef).color as (p: Params) => string)(def.defaults) : ((def as RouteDef).color as string)) : (def as ZoneDef).color;
  return (
    <div className={`lib-item lib-card ${active ? 'active' : ''}`} role="button" tabIndex={0} title={label} data-kind={def.kind} onClick={onPick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick()}>
      <span className="card-thumb" data-thumb="line">
        <svg viewBox="0 0 64 48" className="card-thumb-svg">
          {type === 'route' ? (
            <>
              <polyline points="6,38 22,38 22,14 58,14" fill="none" stroke={color} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={6} cy={38} r={3.5} fill={color} />
              <circle cx={58} cy={14} r={3.5} fill={color} />
            </>
          ) : (
            <polygon points="8,10 56,6 58,40 30,44 6,36" fill={color} fillOpacity={0.35} stroke={color} strokeWidth={2} strokeLinejoin="round" />
          )}
        </svg>
      </span>
      <span className="card-name">{label}</span>
      <Star kind={def.kind} />
    </div>
  );
}

/** Поле поиска по каталогу. */
export function CatalogSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  return (
    <div className="search">
      <input placeholder={t('Пошук у каталозі…', 'Поиск в каталоге…')} value={value} onChange={(e) => onChange(e.target.value)} data-catalog-search />
      {value && (
        <button className="icon-btn" onClick={() => onChange('')} title={t('Очистити', 'Очистить')}>
          ✕
        </button>
      )}
    </div>
  );
}

export const matches = (name: string, q: string) => !q || name.toLowerCase().includes(q.trim().toLowerCase());
