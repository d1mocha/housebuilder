// Материалы 3D: кеш, процедурные текстуры отделки (UV в метрах).
import * as THREE from 'three';
import { isPlankType, isTileType, isTiled } from '../calc/tiles';
import type { Mat3 } from '../catalog/registry';
import { textureDef, textureUrl } from '../catalog/textures';
import type { Finish } from '../model/types';

const partCache = new Map<string, THREE.Material>();
const finishCache = new Map<string, THREE.Material>();

export function partMaterial(color: string, m: Mat3 = 'matte'): THREE.Material {
  const key = `${color}|${m}`;
  const hit = partCache.get(key);
  if (hit) return hit;
  let mat: THREE.Material;
  switch (m) {
    case 'metal':
      mat = new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.35 });
      break;
    case 'glass':
      mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1 });
      break;
    case 'mirror':
      mat = new THREE.MeshStandardMaterial({ color, metalness: 0.95, roughness: 0.08 });
      break;
    case 'light':
      mat = new THREE.MeshStandardMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.9, roughness: 0.6 });
      break;
    case 'water':
      mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.75, roughness: 0.1 });
      break;
    case 'ceramic':
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.05 });
      break;
    case 'fabric':
    case 'leaf':
      mat = new THREE.MeshStandardMaterial({ color, roughness: 1 });
      break;
    case 'wood':
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
      break;
    default:
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  }
  partCache.set(key, mat);
  return mat;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0xcccccc;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const shade = (hex: string, f: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
};

/** Детерминированный псевдослучайный генератор. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// ───────── Изображения текстур (библиотека CC0 и фото пользователя) ─────────

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(`texture ${url.slice(0, 60)}`));
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

/** Попросить 3D-виды перерисоваться (текстура догрузилась). */
function requestRedraw() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('hb-invalidate'));
}

export interface TexSource {
  url: string;
  normalUrl?: string;
  /** Физическая ширина изображения, мм (высота — по пропорциям изображения, если не задана). */
  w: number;
  h?: number;
  layout: 'seamless' | 'pattern';
  tint: boolean;
  rough?: number;
}

/** Источник изображения для отделки: своё фото или текстура библиотеки. */
export function finishTexSource(f: Finish): TexSource | null {
  if (f.photo) return { url: f.photo, w: f.photoW && f.photoW > 0 ? f.photoW : 1000, layout: 'seamless', tint: false };
  const d = textureDef(f.textureId);
  if (!d) return null;
  return { url: textureUrl(d.id), normalUrl: textureUrl(d.id, 'normal'), w: d.w, h: d.h, layout: d.layout, tint: !!d.tint, rough: d.rough };
}

interface PatternSpec {
  cv: HTMLCanvasElement;
  /** Размер блока раскладки, мм. */
  bw: number;
  bh: number;
}

/**
 * Блок раскладки досок/плитки на canvas. Без изображения — заливка цветом с лёгкой вариацией;
 * с изображением — каждая доска/плитка вырезается из своего случайного фрагмента текстуры
 * (формат элемента — из материала, рисунок — из текстуры; волокна идут вдоль длинной стороны).
 */
function drawPattern(f: Finish, cv: HTMLCanvasElement | null, img?: HTMLImageElement, src?: TexSource): PatternSpec | null {
  if (typeof document === 'undefined') return null;
  const tw = f.tileW ?? 0;
  const th = f.tileH ?? 0;
  if (!(tw > 0 && th > 0)) return null;
  const grout = f.grout ?? 0;
  const isPlank = isPlankType(f.type);
  const cols = isPlank ? 1 : 2;
  const rows = isPlank ? 4 : 2;
  const cellW = tw + grout;
  const cellH = th + grout;
  const bw = cellW * cols;
  const bh = cellH * rows;
  const scale = (img ? 1024 : 512) / Math.max(bw, bh);
  const cw = Math.max(16, Math.round(bw * scale));
  const ch = Math.max(16, Math.round(bh * scale));
  const canvas = cv ?? document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const rnd = rng(tw * 31 + th * 17 + rows);
  g.fillStyle = grout > 0 ? (f.groutColor ?? '#b0b4b8') : shade(f.color, 0.8);
  g.fillRect(0, 0, cw, ch);
  const gpx = Math.max(grout > 0 ? 1.5 : 1, grout * scale);
  const cwPx = cw / cols;
  const rowH = ch / rows;
  // масштаб изображения: пикселей изображения на мм поверхности
  const pxPerMm = img && src ? img.width / (src.w * (f.texScale && f.texScale > 0 ? f.texScale : 1)) : 0;
  const along = tw >= th; // волокна вдоль X блока
  for (let r = 0; r < rows; r++) {
    const offset = isPlank ? rnd() * cw : f.pattern === 'brick' ? (r % 2) * 0.5 * cwPx : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * cwPx + offset + gpx / 2;
      const y = r * rowH + gpx / 2;
      const w = cwPx - gpx;
      const h = rowH - gpx;
      if (x + w < 0 || x > cw) {
        rnd();
        continue;
      }
      // ячейка, уехавшая за правый край, рисуется тем же фрагментом, что и её продолжение слева
      const seed = rng(((c + cols) % cols) * 7919 + r * 104729 + tw + th * 3);
      if (img && pxPerMm > 0) {
        // фрагмент текстуры под элемент; если элемент больше изображения — фрагмент растягивается
        const longMm = along ? tw : th;
        const shortMm = along ? th : tw;
        const sw = Math.min(img.width, longMm * pxPerMm);
        const sh = Math.min(img.height, shortMm * pxPerMm);
        const sx = seed() * (img.width - sw);
        const sy = seed() * (img.height - sh);
        g.save();
        g.beginPath();
        g.rect(x, y, w, h);
        g.clip();
        if (along) g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
        else {
          g.translate(x + w, y);
          g.rotate(Math.PI / 2);
          g.drawImage(img, sx, sy, sw, sh, 0, 0, h, w);
        }
        g.restore();
        if (src?.tint) {
          g.globalCompositeOperation = 'multiply';
          g.fillStyle = f.color;
          g.fillRect(x, y, w, h);
          g.globalCompositeOperation = 'source-over';
        }
        // лёгкая разнотонность досок
        if (isPlank) {
          g.fillStyle = `rgba(0,0,0,${(seed() * 0.07).toFixed(3)})`;
          g.fillRect(x, y, w, h);
        }
      } else {
        g.fillStyle = shade(f.color, isPlank ? 0.9 + seed() * 0.2 : 0.97 + seed() * 0.06);
        g.fillRect(x, y, w, h);
        if (isPlank) {
          g.strokeStyle = 'rgba(0,0,0,0.05)';
          for (let i = 0; i < 6; i++) {
            const yy = y + seed() * h;
            g.beginPath();
            g.moveTo(x, yy);
            g.lineTo(x + w, yy + (seed() - 0.5) * 3);
            g.stroke();
          }
        }
      }
    }
  }
  return { cv: canvas, bw, bh };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function setupTexture(tex: THREE.Texture, repeatX: number, repeatY: number, rotDeg: number, color = true) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(repeatX, repeatY);
  tex.rotation = rad(rotDeg);
  tex.needsUpdate = true;
}

/** Ключ кеша материала: поля отделки без тяжёлого фото. */
const finishKey = (f: Finish, usage: string) => `${usage}|${JSON.stringify({ ...f, name: undefined, photo: f.photo ? `${f.photo.length}:${f.photo.slice(-24)}` : undefined })}`;

/** Материал отделки. UV геометрии должны быть в метрах. */
export function finishMaterial(f: Finish | undefined, usage: 'wall' | 'floor' | 'ceiling'): THREE.Material {
  if (!f) return partMaterial(usage === 'floor' ? '#c9c9c9' : '#f1efe9');
  const key = finishKey(f, usage);
  const hit = finishCache.get(key);
  if (hit) return hit;
  const src = finishTexSource(f);
  const tiled = isTiled(f);
  const rot = (f.texRot ?? 0) + (f.pattern === 'diagonal' ? 45 : 0);
  const baseRough = isTileType(f.type) ? 0.25 : f.type === 'laminate' || f.type === 'parquet' ? 0.5 : f.type === 'linoleum' ? 0.55 : 0.9;
  const mat = new THREE.MeshStandardMaterial({ color: f.color, roughness: src?.rough !== undefined && !tiled ? Math.max(0.2, src.rough) : baseRough });
  mat.userData.finishId = f.id;
  mat.userData.textureId = f.photo ? 'photo' : (f.textureId ?? null);
  mat.userData.textured = false;
  if (tiled && (!src || src.layout === 'seamless')) {
    // раскладка досок/плитки заданного формата; рисунок элемента — из текстуры
    const spec = drawPattern(f, null);
    if (spec) {
      const tex = new THREE.CanvasTexture(spec.cv);
      setupTexture(tex, 1000 / spec.bw, 1000 / spec.bh, rot);
      mat.map = tex;
      mat.color.set('#ffffff');
      if (src) {
        loadImage(src.url)
          .then((img) => {
            drawPattern(f, spec.cv, img, src);
            tex.needsUpdate = true;
            mat.userData.textured = true;
            requestRedraw();
          })
          .catch(() => undefined);
      }
    }
  } else if (src && typeof document !== 'undefined') {
    // текстура кладётся как есть: масштаб и поворот укладки — из материала
    const k = f.texScale && f.texScale > 0 ? f.texScale : 1;
    loadImage(src.url)
      .then((img) => {
        const wMm = src.w * k;
        const hMm = (src.h ?? (src.w * img.height) / img.width) * k;
        const tex = new THREE.Texture(img);
        setupTexture(tex, 1000 / wMm, 1000 / hMm, rot);
        mat.map = tex;
        mat.color.set(src.tint ? f.color : '#ffffff');
        mat.userData.textured = true;
        mat.needsUpdate = true;
        requestRedraw();
        if (src.normalUrl) {
          loadImage(src.normalUrl)
            .then((nimg) => {
              const nt = new THREE.Texture(nimg);
              setupTexture(nt, 1000 / wMm, 1000 / hMm, rot, false);
              mat.normalMap = nt;
              mat.normalScale.set(0.7, 0.7);
              mat.needsUpdate = true;
              requestRedraw();
            })
            .catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }
  if (finishCache.size > 200) finishCache.clear();
  finishCache.set(key, mat);
  return mat;
}

const decorCache = new Map<string, THREE.Material>();

/** Материал декора плиты (ЛДСП): текстура из библиотеки, UV геометрии — в метрах, U вдоль волокон. */
export function decorMaterial(textureId: string, color: string): THREE.Material {
  const d = textureDef(textureId);
  if (!d) return partMaterial(color, 'wood');
  const key = `${textureId}|${d.tint ? color : ''}`;
  const hit = decorCache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: Math.max(0.35, d.rough) });
  mat.userData.textureId = textureId;
  mat.userData.textured = false;
  if (typeof document !== 'undefined') {
    loadImage(textureUrl(textureId))
      .then((img) => {
        const tex = new THREE.Texture(img);
        setupTexture(tex, 1000 / d.w, 1000 / d.h, 0);
        mat.map = tex;
        mat.color.set(d.tint ? color : '#ffffff');
        mat.userData.textured = true;
        mat.needsUpdate = true;
        requestRedraw();
      })
      .catch(() => undefined);
  }
  decorCache.set(key, mat);
  return mat;
}

export const selectionMaterial = new THREE.MeshBasicMaterial({ color: '#f97316', wireframe: true });
