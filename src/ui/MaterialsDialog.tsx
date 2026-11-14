// Каталог материалов отделки: текстура (библиотека CC0 или своё фото), масштаб и поворот укладки,
// параметры для расчёта, цена, «товар из магазина» (только ссылка и введённые вручную данные).
import { useMemo, useState } from 'react';
import { PRICE_UNIT_NAMES, finishPriceUnit, safeShopUrl } from '../calc/materials';
import { isPlankType, isTileType } from '../calc/tiles';
import { FINISH_TYPE_NAMES } from '../catalog/finishes';
import { TEXTURES, TEXTURE_CATEGORY_NAMES, textureDef, textureUrl } from '../catalog/textures';
import type { TextureCategory } from '../catalog/textures';
import { useT } from '../i18n';
import { newId } from '../model/ids';
import { getLevel } from '../model/ops';
import type { Finish, FinishType } from '../model/types';
import { roomSurfaces } from '../model/walls';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import { Dialog } from './Dialog';
import { Color, Num, Row, Select, Text } from './fields';

/** Типы, которые можно создать кнопкой «+». */
const ADD_TYPES: FinishType[] = ['paint', 'plaster', 'wallpaper', 'tile', 'porcelain', 'stone', 'laminate', 'parquet', 'linoleum', 'carpet', 'panel', 'gkl'];

/** Категории библиотеки текстур, подходящие типу материала (первые — самые уместные). */
const TEX_FOR_TYPE: Record<FinishType, TextureCategory[]> = {
  paint: ['plaster'],
  plaster: ['plaster', 'stone'],
  wallpaper: ['wallpaper'],
  tile: ['stone', 'plaster'],
  porcelain: ['stone', 'wood'],
  stone: ['stone'],
  laminate: ['wood', 'laminate', 'parquet'],
  parquet: ['wood', 'parquet', 'laminate'],
  panel: ['wood', 'stone'],
  linoleum: ['linoleum', 'stone', 'wood'],
  carpet: ['carpet'],
  gkl: ['plaster'],
  concrete: ['stone', 'plaster'],
  stretch: ['plaster'],
};

/** Заготовка нового материала заданного типа. */
export function newFinish(type: FinishType, shop = false): Finish {
  const base: Finish = {
    id: newId('fin'),
    name: shop ? { uk: `${FINISH_TYPE_NAMES[type].uk}: товар з магазину`, ru: `${FINISH_TYPE_NAMES[type].ru}: товар из магазина` } : { uk: `${FINISH_TYPE_NAMES[type].uk} (нове)`, ru: `${FINISH_TYPE_NAMES[type].ru} (новое)` },
    type,
    color: '#d8d4cc',
    target: ['wall'],
  };
  if (shop) base.shopUrl = '';
  switch (type) {
    case 'paint':
      return { ...base, target: ['wall', 'ceiling'], consumption: 0.25, textureId: 'paint-matte' };
    case 'plaster':
      return { ...base, target: ['wall', 'ceiling'], consumption: 9, thickness: 10 };
    case 'wallpaper':
      return { ...base, textureId: 'wallpaper-smooth', rollW: 530, rollL: 10050, rapport: 0 };
    case 'tile':
      return { ...base, target: ['wall', 'floor'], tileW: 600, tileH: 300, grout: 2, groutColor: '#b0b4b8', pattern: 'grid', packArea: 1.44 };
    case 'porcelain':
      return { ...base, target: ['floor', 'wall'], color: '#b8b8b8', tileW: 600, tileH: 600, grout: 2, groutColor: '#8d9196', pattern: 'grid', packArea: 1.44, thickness: 9, textureId: 'stone-concrete' };
    case 'stone':
      return { ...base, target: ['wall', 'floor'], color: '#dfcbac', tileW: 600, tileH: 300, grout: 1, groutColor: '#c9b594', pattern: 'brick', thickness: 20, textureId: 'stone-travertine' };
    case 'laminate':
      return { ...base, target: ['floor'], color: '#a78364', tileW: 1380, tileH: 193, grout: 0, pattern: 'brick', packArea: 2.13, wearClass: '32', thickness: 8, textureId: 'wood-oak-natural' };
    case 'parquet':
      return { ...base, target: ['floor'], color: '#b0733f', tileW: 2200, tileH: 190, grout: 0, pattern: 'brick', packArea: 2.5, thickness: 14, textureId: 'wood-alder' };
    case 'linoleum':
      return { ...base, target: ['floor'], color: '#997a59', rollW: 3000, wearClass: '32', thickness: 2.5, textureId: 'linoleum-brown' };
    case 'carpet':
      return { ...base, target: ['floor'], color: '#b9b2a6', rollW: 4000, thickness: 6, textureId: 'carpet-loop' };
    case 'panel':
      return { ...base, color: '#a78364', tileW: 200, tileH: 2600, grout: 0, textureId: 'wood-oak-natural' };
    case 'gkl':
      return { ...base, target: ['wall', 'ceiling'], thickness: 12.5 };
    default:
      return base;
  }
}

/** Миниатюра материала: текстура (с тонированием цветом) или просто цвет. */
export function FinishSwatch({ f, size = 34 }: { f: Finish; size?: number }) {
  const d = textureDef(f.textureId);
  const img = f.photo ? f.photo : d ? textureUrl(d.id) : null;
  return (
    <span
      className="tex-thumb"
      style={{
        width: size,
        height: size,
        backgroundColor: f.color,
        backgroundImage: img ? `url("${img}")` : undefined,
        backgroundBlendMode: !f.photo && d?.tint ? 'multiply' : 'normal',
      }}
    />
  );
}

/** Уменьшить загруженное фото, чтобы файл проекта не разрастался. */
async function readPhoto(file: File, max = 640): Promise<string> {
  const url = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = url;
  });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(img.width * k));
  cv.height = Math.max(1, Math.round(img.height * k));
  cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.85);
}

export function MaterialsDialog({ onClose }: { onClose: () => void }) {
  const { t, ls, lang } = useT();
  const project = useProject((s) => s.project);
  const finishes = project.finishes;
  const selection = useUi((s) => s.selection);
  const [curId, setCurId] = useState<string>(() => {
    // открытие из свойств помещения — сразу показать его покрытие пола
    const sel = useUi.getState().selection;
    const room = sel?.type === 'room' ? getLevel(useProject.getState().project, sel.scope)?.rooms.find((r) => r.id === sel.id) : undefined;
    return room?.floorFinish ?? useProject.getState().project.finishes[0]?.id ?? '';
  });
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<FinishType | ''>('');
  const [shopType, setShopType] = useState<FinishType>('wallpaper');
  const [allTex, setAllTex] = useState(false);
  const cur = finishes.find((f) => f.id === curId);
  const upd = useProject.getState().update;
  const mut = (fn: (f: Finish) => void) =>
    upd((d) => {
      const f = d.finishes.find((x) => x.id === curId);
      if (f) fn(f);
    });
  const add = (type: FinishType, shop = false) => {
    const f = newFinish(type, shop);
    upd((d) => void d.finishes.push(f));
    setCurId(f.id);
    setTypeFilter('');
    setQ('');
  };
  const list = useMemo(() => finishes.filter((f) => (!typeFilter || f.type === typeFilter) && (!q || `${f.name.uk} ${f.name.ru} ${f.shopTitle ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [finishes, typeFilter, q]);
  const types = useMemo(() => [...new Set(finishes.map((f) => f.type))], [finishes]);
  const room = selection?.type === 'room' ? getLevel(project, selection.scope)?.rooms.find((r) => r.id === selection.id) : undefined;

  /** Назначить материал выделенному помещению. */
  const apply = (where: 'floor' | 'walls' | 'ceiling') => {
    if (!cur || !room || !selection) return;
    upd((d) => {
      const l = getLevel(d, selection.scope);
      const r = l?.rooms.find((x) => x.id === selection.id);
      if (!l || !r) return;
      if (where === 'floor') r.floorFinish = cur.id;
      else if (where === 'ceiling') r.ceilingFinish = cur.id;
      else
        for (const s of roomSurfaces(l, r)) {
          const w = l.walls.find((x) => x.id === s.wallId);
          if (w) w[s.side === 'L' ? 'finishL' : 'finishR'] = cur.id;
        }
    });
    useUi.getState().notify(t('Матеріал призначено приміщенню', 'Материал назначен помещению') + `: ${room.name}`);
  };

  const texCats = cur ? TEX_FOR_TYPE[cur.type] : [];
  const texList = cur ? (allTex ? TEXTURES : TEXTURES.filter((x) => texCats.includes(x.category))) : [];
  const curTex = textureDef(cur?.textureId);
  const unit = cur ? ls(PRICE_UNIT_NAMES[finishPriceUnit(cur)]) : '';
  const shopHref = safeShopUrl(cur?.shopUrl);
  const tiled = cur ? isTileType(cur.type) || isPlankType(cur.type) : false;

  return (
    <Dialog
      title={t('Матеріали оздоблення', 'Материалы отделки')}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="primary" data-action="add-shop" onClick={() => add(shopType, true)}>
            🛒 {t('+ Товар з магазину', '+ Товар из магазина')}
          </button>
          <select value={shopType} onChange={(e) => setShopType(e.target.value as FinishType)} data-shop-type title={t('Тип товару', 'Тип товара')}>
            {ADD_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {ls(FINISH_TYPE_NAMES[ty])}
              </option>
            ))}
          </select>
          <span className="grow" />
          <span className="muted">{t('Додати:', 'Добавить:')}</span>
          {ADD_TYPES.map((ty) => (
            <button key={ty} className="chip" onClick={() => add(ty)} data-add={ty}>
              + {ls(FINISH_TYPE_NAMES[ty])}
            </button>
          ))}
        </>
      }
    >
      <div className="mat-layout" data-dialog="materials">
        <div className="mat-list">
          <input className="mat-search" placeholder={t('Пошук матеріалу…', 'Поиск материала…')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="preset-row">
            <button className={`chip ${typeFilter === '' ? 'active' : ''}`} onClick={() => setTypeFilter('')}>
              {t('Усі', 'Все')} · {finishes.length}
            </button>
            {types.map((ty) => (
              <button key={ty} className={`chip ${typeFilter === ty ? 'active' : ''}`} onClick={() => setTypeFilter(ty)} data-type-filter={ty}>
                {ls(FINISH_TYPE_NAMES[ty])}
              </button>
            ))}
          </div>
          <div className="mat-items">
            {list.map((f) => (
              <button key={f.id} className={`mat-item ${f.id === curId ? 'active' : ''}`} onClick={() => setCurId(f.id)} data-finish={f.id}>
                <FinishSwatch f={f} />
                <span className="mat-item-text">
                  <b>{ls(f.name)}</b>
                  <small>
                    {ls(FINISH_TYPE_NAMES[f.type])}
                    {f.price ? ` · ${f.price} ${ls(PRICE_UNIT_NAMES[finishPriceUnit(f)])}` : ''}
                    {f.shopUrl !== undefined ? ' · 🛒' : ''}
                  </small>
                </span>
              </button>
            ))}
            {list.length === 0 && <p className="hint">{t('Нічого не знайдено', 'Ничего не найдено')}</p>}
          </div>
        </div>
        {cur ? (
          <div className="mat-edit" data-edit={cur.id}>
            <div className="mat-head">
              <FinishSwatch f={cur} size={72} />
              <div className="grow">
                <label className="field wide">
                  <span>{t('Назва', 'Название')}</span>
                  <input type="text" value={cur.name[lang]} data-field="name" onChange={(e) => mut((x) => (x.name = lang === 'uk' ? { uk: e.target.value, ru: x.name.ru === x.name.uk ? e.target.value : x.name.ru } : { ...x.name, ru: e.target.value }))} />
                </label>
                <div className="grid2">
                  <Select label={t('Тип', 'Тип')} value={cur.type} options={(Object.keys(FINISH_TYPE_NAMES) as FinishType[]).map((ty) => ({ value: ty, label: ls(FINISH_TYPE_NAMES[ty]) }))} onChange={(v) => mut((x) => (x.type = v as FinishType))} />
                  <Row label={t('Застосування', 'Применение')}>
                    <span className="nowrap">
                      {(['wall', 'floor', 'ceiling'] as const).map((tg) => (
                        <label key={tg} className="mini-check">
                          <input type="checkbox" checked={cur.target.includes(tg)} onChange={(e) => mut((x) => (x.target = e.target.checked ? [...x.target, tg] : x.target.filter((v) => v !== tg)))} />
                          {tg === 'wall' ? t('стіни', 'стены') : tg === 'floor' ? t('підлога', 'пол') : t('стеля', 'потолок')}
                        </label>
                      ))}
                    </span>
                  </Row>
                </div>
              </div>
            </div>

            {room && (
              <div className="mat-apply" data-apply-room={room.id}>
                <span>
                  {t('Призначити приміщенню', 'Назначить помещению')} «{room.name}»:
                </span>
                {cur.target.includes('floor') && (
                  <button data-apply="floor" onClick={() => apply('floor')}>
                    {t('підлога', 'пол')}
                  </button>
                )}
                {cur.target.includes('wall') && (
                  <button data-apply="walls" onClick={() => apply('walls')}>
                    {t('усі стіни', 'все стены')}
                  </button>
                )}
                {cur.target.includes('ceiling') && (
                  <button data-apply="ceiling" onClick={() => apply('ceiling')}>
                    {t('стеля', 'потолок')}
                  </button>
                )}
              </div>
            )}

            <h4>{t('Вигляд', 'Внешний вид')}</h4>
            <div className="grid2">
              <Color label={curTex && !curTex.tint && !cur.photo ? t('Колір на плані', 'Цвет на плане') : t('Колір', 'Цвет')} value={cur.color} onChange={(v) => mut((x) => (x.color = v))} />
              <Num label={t('Масштаб укладання', 'Масштаб укладки')} value={cur.texScale ?? 1} min={0.1} max={10} step={0.1} digits={2} unit="×" onChange={(v) => mut((x) => (x.texScale = v))} />
              <Num label={t('Поворот укладання', 'Поворот укладки')} value={cur.texRot ?? 0} min={-180} max={180} step={15} digits={0} unit="°" onChange={(v) => mut((x) => (x.texRot = v))} />
              {cur.photo && <Num label={t('Ширина фрагмента на фото', 'Ширина фрагмента на фото')} value={cur.photoW ?? 1000} min={50} max={10000} step={50} digits={0} unit="мм" onChange={(v) => mut((x) => (x.photoW = v))} />}
            </div>
            <div className="tex-grid" data-textures>
              <button className={`tex-cell ${!cur.textureId && !cur.photo ? 'active' : ''}`} onClick={() => mut((x) => (delete x.textureId, delete x.photo))} data-texture="none" title={t('Без текстури — лише колір', 'Без текстуры — только цвет')}>
                <span className="tex-thumb" style={{ width: 54, height: 54, backgroundColor: cur.color }} />
                <small>{t('Лише колір', 'Только цвет')}</small>
              </button>
              {cur.photo && (
                <button className="tex-cell active" data-texture="photo" title={t('Своє фото', 'Своё фото')}>
                  <span className="tex-thumb" style={{ width: 54, height: 54, backgroundImage: `url("${cur.photo}")` }} />
                  <small>{t('Своє фото', 'Своё фото')}</small>
                </button>
              )}
              {texList.map((x) => (
                <button
                  key={x.id}
                  className={`tex-cell ${cur.textureId === x.id && !cur.photo ? 'active' : ''}`}
                  data-texture={x.id}
                  title={`${ls(x.name)} — ${x.source} (CC0)`}
                  onClick={() =>
                    mut((f) => {
                      f.textureId = x.id;
                      delete f.photo;
                      // у нетонируемой текстуры цвет на плане — средний цвет изображения
                      if (!x.tint) f.color = x.avg;
                      if (f.type === 'wallpaper' && x.rapport && !f.rapport) f.rapport = x.rapport;
                    })
                  }
                >
                  <span className="tex-thumb" style={{ width: 54, height: 54, backgroundImage: `url("${textureUrl(x.id)}")`, backgroundColor: x.tint ? cur.color : undefined, backgroundBlendMode: x.tint ? 'multiply' : 'normal' }} />
                  <small>{ls(x.name)}</small>
                </button>
              ))}
            </div>
            <div className="row">
              <label className="mini-check">
                <input type="checkbox" checked={allTex} onChange={(e) => setAllTex(e.target.checked)} />
                {t('Показати всю бібліотеку', 'Показать всю библиотеку')} ({TEXTURES.length})
              </label>
              <label className="file-btn inline">
                {t('Своє фото поверхні…', 'Своё фото поверхности…')}
                <input
                  type="file"
                  accept="image/*"
                  data-field="photo"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const data = await readPhoto(file);
                      mut((x) => {
                        x.photo = data;
                        x.photoW = x.photoW ?? 1000;
                      });
                    } catch {
                      useUi.getState().notify(t('Не вдалося прочитати зображення', 'Не удалось прочитать изображение'));
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              {curTex && !cur.photo && (
                <span className="muted">
                  {t('Текстура', 'Текстура')}: {TEXTURE_CATEGORY_NAMES[curTex.category][lang]} · {curTex.source} · CC0
                </span>
              )}
            </div>

            <h4>{t('Параметри для розрахунку', 'Параметры для расчёта')}</h4>
            <div className="grid2">
              {cur.type === 'wallpaper' && (
                <>
                  <Num label={t('Ширина рулону', 'Ширина рулона')} value={cur.rollW ?? 530} min={300} max={3000} step={10} digits={0} unit="мм" onChange={(v) => mut((x) => (x.rollW = v))} />
                  <Num label={t('Довжина рулону', 'Длина рулона')} value={cur.rollL ?? 10050} min={1000} max={100000} step={50} digits={0} unit="мм" onChange={(v) => mut((x) => (x.rollL = v))} />
                  <Num label={t('Рапорт малюнка', 'Раппорт рисунка')} value={cur.rapport ?? 0} min={0} max={2000} step={10} digits={0} unit="мм" title={t('0 — без підгонки малюнка', '0 — без подгонки рисунка')} onChange={(v) => mut((x) => (x.rapport = v))} />
                </>
              )}
              {(cur.type === 'linoleum' || cur.type === 'carpet') && <Num label={t('Ширина рулону', 'Ширина рулона')} value={cur.rollW ?? 3000} min={500} max={6000} step={100} digits={0} unit="мм" onChange={(v) => mut((x) => (x.rollW = v))} />}
              {tiled && (
                <>
                  <Num label={isPlankType(cur.type) ? t('Довжина дошки', 'Длина доски') : t('Ширина плитки', 'Ширина плитки')} value={cur.tileW ?? 0} min={0} max={6000} step={10} digits={0} unit="мм" onChange={(v) => mut((x) => (x.tileW = v))} />
                  <Num label={isPlankType(cur.type) ? t('Ширина дошки', 'Ширина доски') : t('Висота плитки', 'Высота плитки')} value={cur.tileH ?? 0} min={0} max={6000} step={10} digits={0} unit="мм" onChange={(v) => mut((x) => (x.tileH = v))} />
                  {isTileType(cur.type) && <Num label={t('Шов', 'Шов')} value={cur.grout ?? 0} min={0} max={20} step={0.5} unit="мм" onChange={(v) => mut((x) => (x.grout = v))} />}
                  {isTileType(cur.type) && <Color label={t('Колір шва', 'Цвет шва')} value={cur.groutColor ?? '#b0b4b8'} onChange={(v) => mut((x) => (x.groutColor = v))} />}
                  <Select
                    label={t('Розкладка', 'Раскладка')}
                    value={cur.pattern ?? 'grid'}
                    options={[
                      { value: 'grid', label: t('Шов у шов', 'Шов в шов') },
                      { value: 'brick', label: t('Урозбіжку', 'Вразбежку') },
                      { value: 'diagonal', label: t('Діагональ', 'Диагональ') },
                    ]}
                    onChange={(v) => mut((x) => (x.pattern = v as Finish['pattern']))}
                  />
                  <Num label={t('В упаковці', 'В упаковке')} value={cur.packArea ?? 0} min={0} max={50} step={0.01} digits={2} unit="м²" onChange={(v) => mut((x) => (x.packArea = v))} />
                </>
              )}
              {(cur.type === 'laminate' || cur.type === 'parquet' || cur.type === 'linoleum' || cur.type === 'porcelain') && <Text label={t('Клас', 'Класс')} value={cur.wearClass ?? ''} placeholder="32" onChange={(v) => mut((x) => (x.wearClass = v))} />}
              {cur.type !== 'paint' && cur.type !== 'wallpaper' && cur.type !== 'stretch' && <Num label={t('Товщина', 'Толщина')} value={cur.thickness ?? 0} min={0} max={100} step={0.5} unit="мм" onChange={(v) => mut((x) => (x.thickness = v))} />}
              {(cur.type === 'paint' || cur.type === 'plaster') && (
                <Num label={cur.type === 'paint' ? t('Витрата на шар', 'Расход на слой') : t('Витрата на 10 мм', 'Расход на 10 мм')} value={cur.consumption ?? 0} min={0} max={50} step={0.05} digits={2} unit={cur.type === 'paint' ? 'л/м²' : 'кг/м²'} onChange={(v) => mut((x) => (x.consumption = v))} />
              )}
              <Num label={t('Ціна за одиницю', 'Цена за единицу')} value={cur.price ?? 0} min={0} max={1e7} step={10} digits={2} unit={unit} onChange={(v) => mut((x) => (x.price = v))} />
            </div>
            {tiled && (!cur.tileW || !cur.tileH) && <p className="hint">{t('Без розмірів елемента матеріал рахується за площею, текстура кладеться як є.', 'Без размеров элемента материал считается по площади, текстура кладётся как есть.')}</p>}

            <h4>🛒 {t('Товар з магазину', 'Товар из магазина')}</h4>
            {cur.shopUrl === undefined ? (
              <div className="row">
                <button data-action="make-shop" onClick={() => mut((x) => (x.shopUrl = ''))}>
                  {t('Прив’язати посилання на товар…', 'Привязать ссылку на товар…')}
                </button>
              </div>
            ) : (
              <div className="shop-box" data-shop>
                <label className="field wide">
                  <span>{t('Посилання на товар', 'Ссылка на товар')}</span>
                  <input type="url" placeholder="https://…" value={cur.shopUrl} data-field="shopUrl" onChange={(e) => mut((x) => (x.shopUrl = e.target.value))} />
                </label>
                <div className="grid2">
                  <Text label={t('Назва в магазині', 'Название в магазине')} value={cur.shopTitle ?? ''} onChange={(v) => mut((x) => (x.shopTitle = v))} />
                  <Text label={t('Артикул', 'Артикул')} value={cur.shopSku ?? ''} onChange={(v) => mut((x) => (x.shopSku = v))} />
                </div>
                <div className="row">
                  {shopHref ? (
                    <a className="btn primary" href={shopHref} target="_blank" rel="noopener noreferrer" data-action="open-shop">
                      {t('Відкрити в магазині', 'Открыть в магазине')} ↗
                    </a>
                  ) : (
                    <button disabled data-action="open-shop">
                      {t('Відкрити в магазині', 'Открыть в магазине')} ↗
                    </button>
                  )}
                  <button onClick={() => mut((x) => (delete x.shopUrl, delete x.shopTitle, delete x.shopSku))}>{t('Відв’язати', 'Отвязать')}</button>
                </div>
                <p className="hint">
                  {t(
                    'Застосунок не читає сайт магазину: він зберігає лише посилання. Параметри (розмір рулону, рапорт, формат, площу в упаковці) і ціну введіть вручну з картки товару; вигляд — оберіть схожу текстуру з бібліотеки або додайте своє фото.',
                    'Приложение не читает сайт магазина: оно хранит только ссылку. Параметры (размер рулона, раппорт, формат, площадь в упаковке) и цену введите вручную из карточки товара; внешний вид — выберите похожую текстуру из библиотеки или добавьте своё фото.',
                  )}
                </p>
              </div>
            )}

            <div className="row actions">
              <button
                onClick={() => {
                  const copy: Finish = { ...cur, id: newId('fin'), name: { uk: `${cur.name.uk} (копія)`, ru: `${cur.name.ru} (копия)` }, target: [...cur.target] };
                  upd((d) => void d.finishes.push(copy));
                  setCurId(copy.id);
                }}
              >
                {t('Дублювати', 'Дублировать')}
              </button>
              <button
                className="danger"
                data-action="delete-finish"
                onClick={() => {
                  upd((d) => void (d.finishes = d.finishes.filter((x) => x.id !== cur.id)));
                  setCurId(finishes.find((x) => x.id !== cur.id)?.id ?? '');
                }}
              >
                {t('Видалити матеріал', 'Удалить материал')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mat-edit">
            <p className="hint">{t('Оберіть матеріал зі списку або додайте новий.', 'Выберите материал из списка или добавьте новый.')}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
