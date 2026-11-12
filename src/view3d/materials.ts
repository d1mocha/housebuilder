// Материалы 3D: кеш, процедурные текстуры отделки (UV в метрах).
import * as THREE from 'three';
import type { Mat3 } from '../catalog/registry';
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

function patternTexture(f: Finish): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const tw = f.tileW ?? 0;
  const th = f.tileH ?? 0;
  if (!(tw > 0 && th > 0)) return null;
  const grout = f.grout ?? 0;
  const isPlank = f.type === 'laminate' || f.type === 'parquet' || f.type === 'panel';
  const rows = isPlank ? 4 : f.pattern === 'brick' ? 2 : 1;
  const bw = tw + grout;
  const bh = (th + grout) * rows;
  // пиксели: длинная сторона 512
  const scale = 512 / Math.max(bw, bh);
  const cw = Math.max(16, Math.round(bw * scale));
  const ch = Math.max(16, Math.round(bh * scale));
  const cv = document.createElement('canvas');
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext('2d');
  if (!g) return null;
  const rnd = rng(tw * 31 + th * 17 + rows);
  g.fillStyle = grout > 0 ? (f.groutColor ?? '#b0b4b8') : shade(f.color, 0.8);
  g.fillRect(0, 0, cw, ch);
  const gpx = Math.max(grout > 0 ? 1.5 : 1, grout * scale);
  const rowH = ch / rows;
  for (let r = 0; r < rows; r++) {
    const offset = rows > 1 ? (isPlank ? rnd() : r * 0.5) * cw : 0;
    for (const dx of [-cw, 0]) {
      g.fillStyle = shade(f.color, isPlank ? 0.9 + rnd() * 0.2 : 0.97 + rnd() * 0.06);
      g.fillRect(dx + offset + gpx / 2, r * rowH + gpx / 2, cw - gpx, rowH - gpx);
      if (isPlank) {
        // лёгкая «текстура» волокон
        g.strokeStyle = 'rgba(0,0,0,0.05)';
        for (let i = 0; i < 6; i++) {
          const y = r * rowH + gpx + rnd() * (rowH - 2 * gpx);
          g.beginPath();
          g.moveTo(dx + offset, y);
          g.lineTo(dx + offset + cw, y + (rnd() - 0.5) * 3);
          g.stroke();
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(1000 / bw, 1000 / bh);
  if (f.pattern === 'diagonal') tex.rotation = Math.PI / 4;
  return tex;
}

/** Материал отделки. UV геометрии должны быть в метрах. */
export function finishMaterial(f: Finish | undefined, usage: 'wall' | 'floor' | 'ceiling'): THREE.Material {
  if (!f) return partMaterial(usage === 'floor' ? '#c9c9c9' : '#f1efe9');
  const key = `${usage}|${JSON.stringify(f)}`;
  const hit = finishCache.get(key);
  if (hit) return hit;
  const tex = patternTexture(f);
  const rough = f.type === 'tile' ? 0.25 : f.type === 'laminate' || f.type === 'parquet' ? 0.5 : 0.9;
  const mat = new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : f.color, map: tex ?? undefined, roughness: rough, side: usage === 'ceiling' ? THREE.FrontSide : THREE.FrontSide });
  if (finishCache.size > 200) finishCache.clear();
  finishCache.set(key, mat);
  return mat;
}

export const selectionMaterial = new THREE.MeshBasicMaterial({ color: '#f97316', wireframe: true });
