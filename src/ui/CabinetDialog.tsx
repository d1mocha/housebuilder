// Конструктор корпусной мебели: параметры изделия, 3D-превью, деталировка, раскрой, фурнитура, материалы.
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { buildCutList, cutSize, edgeLabel, edgeTotals, materialTotals } from '../cabinet/cutlist';
import type { CutRow } from '../cabinet/cutlist';
import { generateCabinet } from '../cabinet/generate';
import { nestCutList } from '../cabinet/nesting';
import type { MaterialNest } from '../cabinet/nesting';
import { BUILTIN_TEMPLATES, cloneDesign, newColumn } from '../cabinet/templates';
import type { CabinetCatalog, CabinetDesign, CabinetResult, EdgeSides, Part } from '../cabinet/types';
import type { Prim3 } from '../catalog/registry';
import { download, safeName, toCsv } from '../export/csv';
import { fmt, useT } from '../i18n';
import { newId } from '../model/ids';
import type { Project } from '../model/types';
import { deleteTemplate, listTemplates, saveTemplate } from '../store/persistence';
import { useProject } from '../store/projectStore';
import { useUi } from '../store/uiStore';
import { primsToGroup } from '../view3d/build';
import { Dialog } from './Dialog';
import { Check, Num, NumInput, Section, Select, Text } from './fields';

/** Изменить изделие и синхронизировать габариты его экземпляров на плане. */
export function updateDesign(id: string, fn: (d: CabinetDesign) => void): void {
  useProject.getState().update((p) => {
    const d = p.cabinets.find((c) => c.id === id);
    if (!d) return;
    fn(d);
    syncCabinetItems(p, d);
  });
}

export function syncCabinetItems(p: Project, d: CabinetDesign): void {
  const res = generateCabinet(d, p.cabinetCatalog);
  const apply = (items: Project['levels'][number]['items']) => {
    for (const it of items) {
      if (it.kind === 'cabinet' && it.params.designId === d.id) {
        it.params.w = d.width;
        it.params.h = d.height;
        it.params.d = res.overallDepth;
        it.name = d.name;
      }
    }
  };
  p.levels.forEach((l) => apply(l.items));
}

function Preview({ parts, design, showFacades }: { parts: Part[]; design: CabinetDesign; showFacades: boolean }) {
  const catalog = useProject((s) => s.project.cabinetCatalog);
  const group = useMemo(() => {
    const prims: Prim3[] = [];
    let depth = design.depth;
    for (const p of parts) {
      if (!p.box) continue;
      const isFacade = p.role === 'facade' || p.role === 'drawerFront' || p.role === 'slidingDoor';
      if (isFacade && !showFacades) continue;
      depth = Math.max(depth, p.box.y + p.box.sy);
      const board = catalog.boards.find((b) => b.id === p.materialId);
      prims.push({ t: 'box', x: p.box.x, y: p.box.y, z: p.box.z, w: p.box.sx, d: p.box.sy, h: p.box.sz, c: isFacade ? (design.color ?? shade(board?.color ?? '#cdb58a')) : (board?.color ?? '#cdb58a'), m: 'wood' });
    }
    return primsToGroup(prims, { w: design.width, d: depth });
  }, [parts, design.width, design.depth, design.color, showFacades, catalog.boards]);
  useEffect(
    () => () =>
      group.traverse((c) => {
        const m = c as { geometry?: { dispose: () => void } };
        m.geometry?.dispose();
      }),
    [group],
  );
  const size = Math.max(design.width, design.height) / 1000;
  return (
    <Canvas camera={{ position: [size * 0.9, design.height / 1000 / 2 + size * 0.35, size * 1.6], fov: 40, near: 0.05, far: 100 }} frameloop="demand" dpr={[1, 1.75]} gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={['#eef1f4']} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[3, 5, 4]} intensity={1.1} />
      <directionalLight position={[-4, 3, -2]} intensity={0.4} />
      <primitive object={group} />
      <gridHelper args={[8, 16, '#c5ccd6', '#dde2e8']} />
      <OrbitControls target={[0, design.height / 2000, 0]} makeDefault />
    </Canvas>
  );
}

function shade(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = (v: number) => Math.round(v * 0.93);
  return `#${((1 << 24) | (c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).slice(1)}`;
}

function EdgeSelect({ value, onChange, catalog }: { value: string | null; onChange: (v: string | null) => void; catalog: CabinetCatalog }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">—</option>
      {catalog.bands.map((b) => (
        <option key={b.id} value={b.id}>
          {String(b.thickness).replace('.', ',')} {b.material.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

function CutListTab({ design, rows, result, catalog }: { design: CabinetDesign; rows: CutRow[]; result: CabinetResult; catalog: CabinetCatalog }) {
  const { t, ls } = useT();
  const board = (id: string) => catalog.boards.find((b) => b.id === id);
  const setEdge = (row: CutRow, side: keyof EdgeSides, v: string | null) =>
    updateDesign(design.id, (d) => {
      for (const key of row.partKeys) {
        if (key.startsWith('manual-')) {
          const m = d.extraParts.find((x) => `manual-${x.id}` === key);
          if (m) m.edges[side] = v;
        } else d.overrides[key] = { ...d.overrides[key], edges: { ...d.overrides[key]?.edges, [side]: v } };
      }
    });
  const setMaterial = (row: CutRow, v: string) =>
    updateDesign(design.id, (d) => {
      for (const key of row.partKeys) {
        if (key.startsWith('manual-')) {
          const m = d.extraParts.find((x) => `manual-${x.id}` === key);
          if (m) m.materialId = v;
        } else d.overrides[key] = { ...d.overrides[key], materialId: v };
      }
    });
  const edges = edgeTotals(result.parts);
  const mats = materialTotals(rows);
  const exportCsv = () => {
    const head = ['№', t('Деталь', 'Деталь'), t('Матеріал', 'Материал'), t('Товщина', 'Толщина'), t('Довжина', 'Длина'), t('Ширина', 'Ширина'), t('Пильна довжина', 'Пильная длина'), t('Пильна ширина', 'Пильная ширина'), t('К-сть', 'Кол-во'), t('Крайка L1', 'Кромка L1'), t('Крайка L2', 'Кромка L2'), t('Крайка W1', 'Кромка W1'), t('Крайка W2', 'Кромка W2'), t('Текстура', 'Текстура')];
    const body = rows.map((r, i) => [i + 1, ls(r.name), ls(board(r.materialId)?.name), r.thickness, r.length, r.width, r.cutLength, r.cutWidth, r.qty, edgeLabel(catalog, r.edges.l1), edgeLabel(catalog, r.edges.l2), edgeLabel(catalog, r.edges.w1), edgeLabel(catalog, r.edges.w2), r.grain === 'length' ? t('уздовж', 'вдоль') : '—']);
    const tail: (string | number)[][] = [[], [t('Крайка', 'Кромка'), t('Чиста, м', 'Чистая, м'), t('Із запасом, м', 'С запасом, м')], ...edges.map((e) => [ls(catalog.bands.find((b) => b.id === e.bandId)?.name), e.netM, e.grossM])];
    download(`${safeName(design.name)}_detali.csv`, toCsv([head, ...body, ...tail]), 'text/csv;charset=utf-8');
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="primary" onClick={exportCsv} data-action="csv-cutlist">
          {t('Експорт деталювання CSV', 'Экспорт деталировки CSV')}
        </button>
        <button onClick={() => updateDesign(design.id, (d) => void d.extraParts.push({ id: newId('mp'), name: t('Додаткова деталь', 'Дополнительная деталь'), materialId: d.bodyMaterialId, length: 600, width: 100, qty: 1, edges: { l1: d.edgeHidden, l2: null, w1: null, w2: null }, grain: 'length' }))}>+ {t('Своя деталь', 'Своя деталь')}</button>
        <span className="hint">{t('Крайка: L1/L2 — уздовж довжини, W1/W2 — уздовж ширини. Пильний розмір = готовий − товщина крайок.', 'Кромка: L1/L2 — вдоль длины, W1/W2 — вдоль ширины. Пильный размер = готовый − толщина кромок.')}</span>
      </div>
      <table className="data" data-table="cutlist">
        <thead>
          <tr>
            <th>№</th>
            <th>{t('Деталь', 'Деталь')}</th>
            <th>{t('Матеріал', 'Материал')}</th>
            <th>{t('Готовий Д×Ш', 'Готовый Д×Ш')}</th>
            <th>{t('Пильний Д×Ш', 'Пильный Д×Ш')}</th>
            <th>L1</th>
            <th>L2</th>
            <th>W1</th>
            <th>W2</th>
            <th>{t('К-сть', 'Кол-во')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const manual = r.partKeys[0].startsWith('manual-') ? design.extraParts.find((x) => `manual-${x.id}` === r.partKeys[0]) : undefined;
            const mutManual = (fn: (m: CabinetDesign['extraParts'][number]) => void) =>
              updateDesign(design.id, (d) => {
                const m = d.extraParts.find((x) => x.id === manual?.id);
                if (m) fn(m);
              });
            return (
              <tr key={r.key}>
                <td className="center">{i + 1}</td>
                <td>{manual ? <input type="text" value={manual.name} onChange={(e) => mutManual((m) => (m.name = e.target.value))} /> : ls(r.name)}</td>
                <td>
                  <select value={r.materialId} onChange={(e) => setMaterial(r, e.target.value)}>
                    {catalog.boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {ls(b.name)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="nowrap">
                  {manual ? (
                    <>
                      <NumInput value={manual.length} min={10} max={2800} onChange={(v) => mutManual((m) => (m.length = v))} /> × <NumInput value={manual.width} min={10} max={2070} onChange={(v) => mutManual((m) => (m.width = v))} />
                    </>
                  ) : (
                    `${fmt(r.length, 1)} × ${fmt(r.width, 1)}`
                  )}
                </td>
                <td className="nowrap">
                  <b>
                    {fmt(r.cutLength, 1)} × {fmt(r.cutWidth, 1)}
                  </b>
                </td>
                {(['l1', 'l2', 'w1', 'w2'] as const).map((side) => (
                  <td key={side} className="edge-sel">
                    <EdgeSelect value={r.edges[side]} catalog={catalog} onChange={(v) => setEdge(r, side, v)} />
                  </td>
                ))}
                <td className="center">{manual ? <NumInput value={manual.qty} min={1} max={500} digits={0} onChange={(v) => mutManual((m) => (m.qty = Math.round(v)))} /> : r.qty}</td>
                <td>
                  {manual && (
                    <button className="icon-btn danger" onClick={() => updateDesign(design.id, (d) => void (d.extraParts = d.extraParts.filter((x) => x.id !== manual.id)))}>
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          <tr className="total">
            <td colSpan={9}>{t('Разом деталей', 'Всего деталей')}</td>
            <td className="center">{rows.reduce((s, r) => s + r.qty, 0)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      <div className="grid2" style={{ marginTop: 12, alignItems: 'start' }}>
        <div>
          <h4>{t('Крайка', 'Кромка')}</h4>
          <table className="data">
            <tbody>
              {edges.map((e) => (
                <tr key={e.bandId}>
                  <td>{ls(catalog.bands.find((b) => b.id === e.bandId)?.name)}</td>
                  <td>
                    {fmt(e.netM)} м → {t('із запасом 10%', 'с запасом 10%')}: <b>{fmt(e.grossM, 1)} м</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>{t('Плитні матеріали (площа деталей)', 'Плитные материалы (площадь деталей)')}</h4>
          <table className="data">
            <tbody>
              {mats.map((m) => (
                <tr key={m.materialId}>
                  <td>{ls(board(m.materialId)?.name)}</td>
                  <td>
                    {m.count} {t('шт', 'шт')} · <b>{fmt(m.areaM2)} м²</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const SHEET_COLORS = ['#f6d7a8', '#c9e4c5', '#c5d9f1', '#f3c6c6', '#e0d0f0', '#f9e7a0', '#bfe6e2', '#f0cfe3'];

function NestingTab({ design, nests, catalog }: { design: CabinetDesign; nests: MaterialNest[]; catalog: CabinetCatalog }) {
  const { t, ls } = useT();
  const exportCsv = () => {
    const rows: (string | number)[][] = [[t('Матеріал', 'Материал'), t('Лист №', 'Лист №'), t('Деталь (пильний розмір)', 'Деталь (пильный размер)'), 'X', 'Y', t('Уздовж листа', 'Вдоль листа'), t('Упоперек', 'Поперёк'), t('Повернуто', 'Повёрнуто')]];
    for (const n of nests) {
      const name = ls(catalog.boards.find((b) => b.id === n.materialId)?.name);
      n.sheets.forEach((sh, si) => sh.placements.forEach((p) => rows.push([name, si + 1, p.label, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.l, p.w, p.rotated ? t('так', 'да') : ''])));
    }
    download(`${safeName(design.name)}_rozkrij.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="primary" onClick={exportCsv} data-action="csv-nesting">
          {t('Експорт карти розкрою CSV', 'Экспорт карты раскроя CSV')}
        </button>
        <span className="hint">
          {t('Пропил', 'Пропил')} {catalog.kerf} мм · {t('обпил листа', 'обпил листа')} {catalog.trim} мм · {t('розміри листа та пропил — на вкладці «Матеріали»', 'размеры листа и пропил — на вкладке «Материалы»')}
        </span>
      </div>
      {nests.map((n) => {
        const b = catalog.boards.find((x) => x.id === n.materialId);
        const colorOf = new Map<string, string>();
        return (
          <div key={n.materialId} data-nest={n.materialId}>
            <h4>
              {ls(b?.name)} — {t('листів', 'листов')}: <b>{n.sheets.length}</b> ({n.sheetL}×{n.sheetW} мм) · {t('відходи', 'отходы')}: {fmt(n.waste * 100, 1)}%
            </h4>
            {n.unplaced.length > 0 && (
              <div className="warn-box">
                {t('Не вміщуються на лист', 'Не помещаются на лист')}: {n.unplaced.map((u) => u.label).join(', ')}
              </div>
            )}
            <div className="sheet-grid">
            {n.sheets.map((sh, si) => (
              <div className="sheet-card" key={si}>
                <div className="row">
                  <b>
                    {t('Лист', 'Лист')} {si + 1}
                  </b>
                  <span className="muted">
                    {t('використано', 'использовано')} {fmt(sh.usage * 100, 1)}% · {sh.placements.length} {t('дет.', 'дет.')}
                  </span>
                </div>
                <svg viewBox={`0 0 ${n.sheetL} ${n.sheetW}`} preserveAspectRatio="xMidYMid meet">
                  <rect x={0} y={0} width={n.sheetL} height={n.sheetW} fill="#efe9dc" stroke="#6b7280" strokeWidth={4} />
                  <rect x={catalog.trim} y={catalog.trim} width={n.sheetL - 2 * catalog.trim} height={n.sheetW - 2 * catalog.trim} fill="none" stroke="#b45309" strokeWidth={2} strokeDasharray="20 12" />
                  {sh.placements.map((p) => {
                    if (!colorOf.has(p.label)) colorOf.set(p.label, SHEET_COLORS[colorOf.size % SHEET_COLORS.length]);
                    const fs = Math.max(22, Math.min(60, Math.min(p.l / 7, p.w / 2.2)));
                    return (
                      <g key={p.id}>
                        <rect x={p.x} y={p.y} width={p.l} height={p.w} fill={colorOf.get(p.label)} stroke="#374151" strokeWidth={3} />
                        {p.w > 50 && p.l > 150 && (
                          <text x={p.x + p.l / 2} y={p.y + p.w / 2} fontSize={fs} textAnchor="middle" dominantBaseline="central" fill="#111827">
                            {p.label}
                            {p.rotated ? ' ↻' : ''}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function HardwareTab({ design, result }: { design: CabinetDesign; result: CabinetResult }) {
  const { t, ls } = useT();
  const exportCsv = () => {
    const rows: (string | number)[][] = [[t('Найменування', 'Наименование'), t('К-сть', 'Кол-во'), t('Од.', 'Ед.'), t('Примітка', 'Примечание')], ...result.hardware.map((h) => [ls(h.name), h.qty, ls(h.unit), ls(h.note)])];
    download(`${safeName(design.name)}_furnitura.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <button className="primary" onClick={exportCsv} data-action="csv-hardware">
          {t('Експорт фурнітури CSV', 'Экспорт фурнитуры CSV')}
        </button>
      </div>
      <table className="data" data-table="hardware">
        <thead>
          <tr>
            <th>{t('Найменування', 'Наименование')}</th>
            <th>{t('К-сть', 'Кол-во')}</th>
            <th>{t('Од.', 'Ед.')}</th>
            <th>{t('Примітка', 'Примечание')}</th>
          </tr>
        </thead>
        <tbody>
          {result.hardware.map((h) => (
            <tr key={h.id}>
              <td>{ls(h.name)}</td>
              <td className="center">
                <b>{fmt(h.qty, 1)}</b>
              </td>
              <td>{ls(h.unit)}</td>
              <td className="small">{ls(h.note)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{t('Кількість кріплення розрахована за з’єднаннями: 2 на стик (3 при глибині понад 450 мм). Петлі — за висотою фасаду; тип — за положенням дверей (накладна на крайній боковині, напівнакладна на спільній перегородці, вкладна — для вкладних фасадів).', 'Количество крепежа рассчитано по соединениям: 2 на стык (3 при глубине более 450 мм). Петли — по высоте фасада; тип — по положению двери (накладная на крайней боковине, полунакладная на общей перегородке, вкладная — для вкладных фасадов).')}</p>
    </>
  );
}

function MaterialsTab({ catalog }: { catalog: CabinetCatalog }) {
  const { t, lang } = useT();
  const mut = (fn: (c: CabinetCatalog) => void) =>
    useProject.getState().update((p) => {
      fn(p.cabinetCatalog);
      p.cabinets.forEach((d) => syncCabinetItems(p, d));
    });
  return (
    <>
      <div className="grid2">
        <Num label={t('Ширина пропилу', 'Ширина пропила')} value={catalog.kerf} min={0} max={10} step={0.5} unit="мм" onChange={(v) => mut((c) => (c.kerf = v))} />
        <Num label={t('Обпил листа по периметру', 'Обпил листа по периметру')} value={catalog.trim} min={0} max={50} unit="мм" onChange={(v) => mut((c) => (c.trim = v))} />
        <Num label={t('Враховувати крайку від товщини', 'Учитывать кромку от толщины')} value={catalog.edgeMinThickness} min={0} max={2} step={0.1} unit="мм" title={t('Крайка, тонша за це значення, не зменшує пильний розмір', 'Кромка тоньше этого значения не уменьшает пильный размер')} onChange={(v) => mut((c) => (c.edgeMinThickness = v))} />
      </div>
      <h4>{t('Плитні матеріали', 'Плитные материалы')}</h4>
      <table className="data">
        <thead>
          <tr>
            <th>{t('Назва', 'Название')}</th>
            <th>{t('Товщина', 'Толщина')}</th>
            <th>{t('Лист Д×Ш', 'Лист Д×Ш')}</th>
            <th>{t('Текстура', 'Текстура')}</th>
            <th>{t('Колір', 'Цвет')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {catalog.boards.map((b, i) => (
            <tr key={b.id}>
              <td>
                <input type="text" value={b.name[lang]} onChange={(e) => mut((c) => (c.boards[i].name = { ...c.boards[i].name, [lang]: e.target.value }))} />
              </td>
              <td>
                <NumInput value={b.thickness} min={2} max={60} unit="мм" onChange={(v) => mut((c) => (c.boards[i].thickness = v))} />
              </td>
              <td className="nowrap">
                <NumInput value={b.sheetL} min={500} max={6000} onChange={(v) => mut((c) => (c.boards[i].sheetL = v))} /> × <NumInput value={b.sheetW} min={300} max={3000} onChange={(v) => mut((c) => (c.boards[i].sheetW = v))} />
              </td>
              <td className="center">
                <input type="checkbox" checked={b.grain} onChange={(e) => mut((c) => (c.boards[i].grain = e.target.checked))} />
              </td>
              <td>
                <input type="color" value={b.color} onChange={(e) => mut((c) => (c.boards[i].color = e.target.value))} />
              </td>
              <td>
                <button className="icon-btn danger" onClick={() => mut((c) => void c.boards.splice(i, 1))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => mut((c) => void c.boards.push({ id: newId('brd'), name: { uk: 'Нова плита', ru: 'Новая плита' }, kind: 'other', thickness: 18, sheetL: 2800, sheetW: 2070, grain: false, color: '#d8d4cc' }))}>+ {t('Матеріал', 'Материал')}</button>
      <h4>{t('Крайка', 'Кромка')}</h4>
      <table className="data">
        <thead>
          <tr>
            <th>{t('Назва', 'Название')}</th>
            <th>{t('Товщина', 'Толщина')}</th>
            <th>{t('Тип', 'Тип')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {catalog.bands.map((b, i) => (
            <tr key={b.id}>
              <td>
                <input type="text" value={b.name[lang]} onChange={(e) => mut((c) => (c.bands[i].name = { ...c.bands[i].name, [lang]: e.target.value }))} />
              </td>
              <td>
                <NumInput value={b.thickness} min={0.1} max={5} step={0.1} digits={2} unit="мм" onChange={(v) => mut((c) => (c.bands[i].thickness = v))} />
              </td>
              <td>
                <select value={b.material} onChange={(e) => mut((c) => (c.bands[i].material = e.target.value as 'pvc' | 'abs'))}>
                  <option value="pvc">ПВХ</option>
                  <option value="abs">ABS</option>
                </select>
              </td>
              <td>
                <button className="icon-btn danger" onClick={() => mut((c) => void c.bands.splice(i, 1))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => mut((c) => void c.bands.push({ id: newId('bnd'), name: { uk: 'Нова крайка', ru: 'Новая кромка' }, thickness: 1, material: 'pvc', color: '#cdb58a' }))}>+ {t('Крайка', 'Кромка')}</button>
    </>
  );
}

function DesignForm({ design, catalog }: { design: CabinetDesign; catalog: CabinetCatalog }) {
  const { t, ls } = useT();
  const mut = (fn: (d: CabinetDesign) => void) => updateDesign(design.id, fn);
  const boards = catalog.boards.map((b) => ({ value: b.id, label: ls(b.name) }));
  const bands = [{ value: '', label: t('без крайки', 'без кромки') }, ...catalog.bands.map((b) => ({ value: b.id, label: ls(b.name) }))];
  const f = design.facade;
  return (
    <>
      <Section title={t('Виріб', 'Изделие')}>
        <Text label={t('Назва', 'Название')} value={design.name} onChange={(v) => mut((d) => (d.name = v))} />
        <Num label={t('Ширина', 'Ширина')} value={design.width} min={150} max={6000} step={50} unit="мм" onChange={(v) => mut((d) => (d.width = v))} />
        <Num label={t('Висота', 'Высота')} value={design.height} min={150} max={3500} step={50} unit="мм" onChange={(v) => mut((d) => (d.height = v))} />
        <Num label={t('Глибина корпусу', 'Глубина корпуса')} value={design.depth} min={100} max={1200} step={10} unit="мм" onChange={(v) => mut((d) => (d.depth = v))} />
      </Section>
      <Section title={t('Матеріали та крайка', 'Материалы и кромка')}>
        <Select label={t('Корпус', 'Корпус')} value={design.bodyMaterialId} options={boards} onChange={(v) => mut((d) => (d.bodyMaterialId = v))} />
        <Select label={t('Фасади', 'Фасады')} value={design.facadeMaterialId} options={boards} onChange={(v) => mut((d) => (d.facadeMaterialId = v))} />
        <Select label={t('Задня стінка', 'Задняя стенка')} value={design.backMaterialId} options={boards} onChange={(v) => mut((d) => (d.backMaterialId = v))} />
        <Select label={t('Крайка лицьових торців', 'Кромка лицевых торцов')} value={design.edgeFront ?? ''} options={bands} onChange={(v) => mut((d) => (d.edgeFront = v || null))} />
        <Select label={t('Крайка інших торців', 'Кромка остальных торцов')} value={design.edgeHidden ?? ''} options={bands} onChange={(v) => mut((d) => (d.edgeHidden = v || null))} />
        <Select label={t('Крайка фасадів', 'Кромка фасадов')} value={design.edgeFacade ?? ''} options={bands} onChange={(v) => mut((d) => (d.edgeFacade = v || null))} />
        <p className="hint">{t('Крайку окремої деталі можна змінити по кожній стороні у вкладці «Деталювання».', 'Кромку отдельной детали можно изменить по каждой стороне во вкладке «Деталировка».')}</p>
      </Section>
      <Section title={t('Корпус', 'Корпус')}>
        <Select
          label={t('Кришка', 'Крышка')}
          value={design.topMode}
          options={[
            { value: 'inset', label: t('Вкладна (між боковинами)', 'Вкладная (между боковинами)') },
            { value: 'overlay', label: t('Накладна (на боковини)', 'Накладная (на боковины)') },
            { value: 'stretchers', label: t('Дві планки', 'Две планки') },
          ]}
          onChange={(v) => mut((d) => (d.topMode = v as CabinetDesign['topMode']))}
        />
        <Select
          label={t('Дно', 'Дно')}
          value={design.bottomMode}
          options={[
            { value: 'inset', label: t('Вкладне', 'Вкладное') },
            { value: 'overlay', label: t('Накладне (боковини на дні)', 'Накладное (боковины на дне)') },
          ]}
          onChange={(v) => mut((d) => (d.bottomMode = v as CabinetDesign['bottomMode']))}
        />
        <Num label={t('Цоколь', 'Цоколь')} value={design.plinth} min={0} max={300} step={10} unit="мм" onChange={(v) => mut((d) => (d.plinth = v))} />
        <Num label={t('Ніжки', 'Ножки')} value={design.legs} min={0} max={300} step={10} unit="мм" onChange={(v) => mut((d) => (d.legs = v))} />
        <Select
          label={t('Задня стінка', 'Задняя стенка')}
          value={design.back.mode}
          options={[
            { value: 'overlay', label: t('Накладна', 'Накладная') },
            { value: 'groove', label: t('У паз', 'В паз') },
            { value: 'none', label: t('Без стінки', 'Без стенки') },
          ]}
          onChange={(v) => mut((d) => (d.back.mode = v as CabinetDesign['back']['mode']))}
        />
        {design.back.mode === 'groove' && (
          <>
            <Num label={t('Глибина паза', 'Глубина паза')} value={design.back.grooveDepth} min={3} max={12} unit="мм" onChange={(v) => mut((d) => (d.back.grooveDepth = v))} />
            <Num label={t('Відступ паза від торця', 'Отступ паза от торца')} value={design.back.grooveInset} min={5} max={50} unit="мм" onChange={(v) => mut((d) => (d.back.grooveInset = v))} />
          </>
        )}
        <Select label={t('Полиці', 'Полки')} value={design.shelfFixing} options={[{ value: 'fixed', label: t('Жорсткі (стяжка)', 'Жёсткие (стяжка)') }, { value: 'support', label: t('Знімні (полицетримачі)', 'Съёмные (полкодержатели)') }]} onChange={(v) => mut((d) => (d.shelfFixing = v as CabinetDesign['shelfFixing']))} />
        <Select label={t('Кріплення', 'Крепёж')} value={design.joint} options={[{ value: 'confirmat', label: t('Конфірмати', 'Конфирматы') }, { value: 'eccentric', label: t('Ексцентрики + шканти', 'Эксцентрики + шканты') }]} onChange={(v) => mut((d) => (d.joint = v as CabinetDesign['joint']))} />
      </Section>
      <Section title={t('Фасади', 'Фасады')}>
        <Select
          label={t('Тип', 'Тип')}
          value={f.type}
          options={[
            { value: 'none', label: t('Без фасадів', 'Без фасадов') },
            { value: 'hinged', label: t('Розпашні', 'Распашные') },
            { value: 'sliding', label: t('Купе', 'Купе') },
            { value: 'drawers', label: t('Шухляди', 'Ящики') },
          ]}
          onChange={(v) =>
            mut((d) => {
              d.facade.type = v as CabinetDesign['facade']['type'];
              if (v === 'hinged') d.columns.forEach((c) => c.doors === 0 && (c.doors = 1));
              if (v === 'drawers') d.columns.forEach((c) => c.drawers === 0 && (c.drawers = 3));
            })
          }
        />
        {f.type !== 'none' && <Num label={t('Зазор між фасадами', 'Зазор между фасадами')} value={f.gap} min={0} max={10} step={0.5} unit="мм" onChange={(v) => mut((d) => (d.facade.gap = v))} />}
        {f.type === 'hinged' && <Check label={t('Вкладні фасади', 'Вкладные фасады')} value={f.inset} onChange={(v) => mut((d) => (d.facade.inset = v))} />}
        {f.type === 'sliding' && (
          <>
            <Num label={t('Кількість дверей', 'Количество дверей')} value={f.slidingCount} min={2} max={6} digits={0} onChange={(v) => mut((d) => (d.facade.slidingCount = Math.round(v)))} />
            <Num label={t('Перехлест', 'Перехлёст')} value={f.slidingOverlap} min={0} max={80} unit="мм" onChange={(v) => mut((d) => (d.facade.slidingOverlap = v))} />
            <Num label={t('Зона під систему купе', 'Зона под систему купе')} value={f.slidingZone} min={60} max={150} unit="мм" onChange={(v) => mut((d) => (d.facade.slidingZone = v))} />
            <Num label={t('Вирахування висоти дверей', 'Вычет высоты двери')} value={f.slidingHeightDeduct} min={0} max={100} unit="мм" onChange={(v) => mut((d) => (d.facade.slidingHeightDeduct = v))} />
            <Check label={t('Полотна з плити — у деталювання', 'Полотна из плиты — в деталировку')} value={f.slidingInfill} onChange={(v) => mut((d) => (d.facade.slidingInfill = v))} />
          </>
        )}
        {(f.type === 'hinged' || f.type === 'drawers') && <Check label={t('Ручки', 'Ручки')} value={f.handles} onChange={(v) => mut((d) => (d.facade.handles = v))} />}
      </Section>
      <Section
        title={`${t('Секції', 'Секции')} · ${design.columns.length}`}
        right={
          <button className="link" onClick={() => mut((d) => void d.columns.push(newColumn({ doors: d.facade.type === 'hinged' ? 1 : 0 })))} data-action="add-column">
            + {t('секція', 'секция')}
          </button>
        }
      >
        {design.columns.map((c, i) => {
          const mc = (fn: (x: CabinetDesign['columns'][number]) => void) => mut((d) => fn(d.columns[i]));
          return (
            <div className="col-card" key={c.id}>
              <header>
                <span>
                  {t('Секція', 'Секция')} {i + 1}
                </span>
                {design.columns.length > 1 && (
                  <button className="icon-btn danger" onClick={() => mut((d) => void d.columns.splice(i, 1))}>
                    ✕
                  </button>
                )}
              </header>
              <Num label={t('Ширина у світлі (0 — авто)', 'Ширина в свету (0 — авто)')} value={c.width ?? 0} min={0} max={3000} step={10} unit="мм" onChange={(v) => mc((x) => (x.width = v > 0 ? v : null))} />
              <Num label={t('Полиць', 'Полок')} value={c.shelves} min={0} max={20} digits={0} onChange={(v) => mc((x) => (x.shelves = Math.round(v)))} />
              <Num label={t('Шухляд', 'Ящиков')} value={c.drawers} min={0} max={10} digits={0} onChange={(v) => mc((x) => (x.drawers = Math.round(v)))} />
              {c.drawers > 0 && f.type !== 'drawers' && <Num label={t('Висота фасаду шухляди', 'Высота фасада ящика')} value={c.drawerHeight} min={80} max={500} step={10} unit="мм" onChange={(v) => mc((x) => (x.drawerHeight = v))} />}
              {f.type === 'hinged' && <Num label={t('Дверей', 'Дверей')} value={c.doors} min={0} max={3} digits={0} onChange={(v) => mc((x) => (x.doors = Math.round(v)))} />}
              <Check label={t('Штанга для одягу', 'Штанга для одежды')} value={c.rod} onChange={(v) => mc((x) => (x.rod = v))} />
            </div>
          );
        })}
      </Section>
    </>
  );
}

export function CabinetDialog() {
  const { t, ls } = useT();
  const project = useProject((s) => s.project);
  const editId = useUi((s) => s.cabinetEditId);
  const [tab, setTab] = useState<'preview' | 'cut' | 'nest' | 'hw' | 'mat'>('preview');
  const [showFacades, setShowFacades] = useState(true);
  const [userTemplates, setUserTemplates] = useState<CabinetDesign[]>([]);
  const design = project.cabinets.find((c) => c.id === editId) ?? null;
  const catalog = project.cabinetCatalog;
  const close = () => useUi.getState().setDialog(null);
  const refreshTemplates = () => listTemplates().then(setUserTemplates).catch(() => setUserTemplates([]));
  useEffect(() => {
    refreshTemplates();
  }, []);
  useEffect(() => {
    if (!design && project.cabinets.length && editId !== '__new') useUi.getState().setDialog('cabinet', project.cabinets[0].id);
  }, [design, project.cabinets, editId]);

  const result = useMemo(() => (design ? generateCabinet(design, catalog) : null), [design, catalog]);
  const rows = useMemo(() => (result ? buildCutList(result.parts, catalog) : []), [result, catalog]);
  const nests = useMemo(() => (tab === 'nest' || tab === 'preview' ? nestCutList(rows, catalog) : []), [rows, catalog, tab]);

  const createFrom = (d: CabinetDesign) => {
    const copy = cloneDesign(d);
    useProject.getState().update((p) => void p.cabinets.push(copy));
    useUi.getState().setDialog('cabinet', copy.id);
    setTab('preview');
  };

  const footer = design && result && (
    <>
      <button
        className="primary"
        data-action="place"
        onClick={() => {
          useUi.getState().setTool('item', 'cabinet', { designId: design.id, w: design.width, d: result.overallDepth, h: design.height });
          const ui = useUi.getState();
          if (ui.viewMode === '3d') ui.setViewMode('split');
          close();
        }}
      >
        {t('Поставити на план', 'Поставить на план')}
      </button>
      <button
        data-action="save-template"
        onClick={async () => {
          await saveTemplate({ ...cloneDesign(design), name: design.name });
          refreshTemplates();
          useUi.getState().notify(t('Виріб збережено як шаблон', 'Изделие сохранено как шаблон'));
        }}
      >
        {t('Зберегти як шаблон', 'Сохранить как шаблон')}
      </button>
      <button onClick={() => createFrom(design)}>{t('Дублювати', 'Дублировать')}</button>
      <button
        className="danger"
        onClick={() => {
          if (!window.confirm(t('Видалити виріб і всі його екземпляри на плані?', 'Удалить изделие и все его экземпляры на плане?'))) return;
          useProject.getState().update((p) => {
            p.cabinets = p.cabinets.filter((c) => c.id !== design.id);
            for (const l of p.levels) l.items = l.items.filter((it) => !(it.kind === 'cabinet' && it.params.designId === design.id));
          });
          useUi.getState().setDialog('cabinet', null);
        }}
      >
        {t('Видалити', 'Удалить')}
      </button>
      <span className="grow" />
      <span className="muted">
        {t('Габарит з фасадами', 'Габарит с фасадами')}: {design.width}×{design.height}×{fmt(result.overallDepth, 0)} мм · {t('деталей', 'деталей')}: {rows.reduce((s, r) => s + r.qty, 0)}
      </span>
      <button onClick={close}>{t('Закрити', 'Закрыть')}</button>
    </>
  );

  return (
    <div className="dialog-backdrop">
      <div className="dialog full" role="dialog">
        <header>
          <h3>{t('Конструктор корпусних меблів', 'Конструктор корпусной мебели')}</h3>
          <div className="row">
            <select value={design?.id ?? ''} onChange={(e) => useUi.getState().setDialog('cabinet', e.target.value || '__new')} data-select="design">
              {project.cabinets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.width}×{c.height}×{c.depth}
                </option>
              ))}
              <option value="">{t('+ Новий виріб із шаблону…', '+ Новое изделие из шаблона…')}</option>
            </select>
            <button className="icon-btn" onClick={close} aria-label="close">
              ✕
            </button>
          </div>
        </header>
        <div className="dialog-body">
          {!design || !result ? (
            <div>
              <h4>{t('Оберіть шаблон', 'Выберите шаблон')}</h4>
              <div className="kind-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                {BUILTIN_TEMPLATES.map((tp) => (
                  <button key={tp.id} className="kind-card" data-template={tp.id} onClick={() => createFrom(tp.make())}>
                    <span className="big">🗄</span>
                    <b>{ls(tp.name)}</b>
                  </button>
                ))}
              </div>
              {userTemplates.length > 0 && <h4>{t('Мої шаблони', 'Мои шаблоны')}</h4>}
              <div className="kind-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
                {userTemplates.map((tp) => (
                  <div key={tp.id} className="kind-card" style={{ border: '1px solid var(--line)', borderRadius: 6 }} data-user-template={tp.name}>
                    <b>{tp.name}</b>
                    <small>
                      {tp.width}×{tp.height}×{tp.depth} мм
                    </small>
                    <div className="row">
                      <button className="primary" onClick={() => createFrom(tp)}>
                        {t('Створити', 'Создать')}
                      </button>
                      <button
                        className="danger"
                        onClick={async () => {
                          await deleteTemplate(tp.id);
                          refreshTemplates();
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="hint">{t('Шаблон параметричний: після створення змініть габарити — деталі, фурнітура та розкрій перерахуються.', 'Шаблон параметрический: после создания измените габариты — детали, фурнитура и раскрой пересчитаются.')}</p>
            </div>
          ) : (
            <div className="cab">
              <div className="cab-side">
                <DesignForm design={design} catalog={catalog} />
              </div>
              <div className="cab-main">
                <div className="cab-tabs">
                  {(
                    [
                      ['preview', t('3D-вигляд', '3D-вид')],
                      ['cut', `${t('Деталювання', 'Деталировка')} (${rows.reduce((s, r) => s + r.qty, 0)})`],
                      ['nest', t('Розкрій', 'Раскрой')],
                      ['hw', t('Фурнітура', 'Фурнитура')],
                      ['mat', t('Матеріали', 'Материалы')],
                    ] as const
                  ).map(([id, name]) => (
                    <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} data-cabtab={id}>
                      {name}
                    </button>
                  ))}
                  {tab === 'preview' && (
                    <label className="mini-check" style={{ marginLeft: 12, alignSelf: 'center' }}>
                      <input type="checkbox" checked={showFacades} onChange={(e) => setShowFacades(e.target.checked)} /> {t('показувати фасади', 'показывать фасады')}
                    </label>
                  )}
                </div>
                {result.warnings.length > 0 && (
                  <div className="warn-box">
                    {result.warnings.map((w, i) => (
                      <div key={i}>⚠ {ls(w)}</div>
                    ))}
                  </div>
                )}
                <div className="cab-content">
                  {tab === 'preview' && (
                    <div className="cab-preview">
                      <Preview parts={result.parts} design={design} showFacades={showFacades} />
                    </div>
                  )}
                  {tab === 'cut' && <CutListTab design={design} rows={rows} result={result} catalog={catalog} />}
                  {tab === 'nest' && <NestingTab design={design} nests={nests} catalog={catalog} />}
                  {tab === 'hw' && <HardwareTab design={design} result={result} />}
                  {tab === 'mat' && <MaterialsTab catalog={catalog} />}
                </div>
              </div>
            </div>
          )}
        </div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export { cutSize, Dialog };
