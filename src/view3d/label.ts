// Текстовая подпись в 3D: спрайт постоянного экранного размера (без DOM-слоя поверх canvas).
import * as THREE from 'three';

export interface LabelStyle {
  color?: string;
  bg?: string;
  border?: string;
  /** Высота подписи в долях высоты окна (примерно). */
  size?: number;
}

export function textSprite(text: string, st: LabelStyle = {}): THREE.Sprite {
  const pad = 14;
  const fontPx = 44;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d')!;
  const font = `600 ${fontPx}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  const h = fontPx + pad * 2;
  cv.width = w;
  cv.height = h;
  g.font = font;
  g.fillStyle = st.bg ?? 'rgba(255,255,255,0.94)';
  g.strokeStyle = st.border ?? '#93c5fd';
  g.lineWidth = 4;
  const r = 12;
  g.beginPath();
  g.moveTo(r, 2);
  g.arcTo(w - 2, 2, w - 2, h - 2, r);
  g.arcTo(w - 2, h - 2, 2, h - 2, r);
  g.arcTo(2, h - 2, 2, 2, r);
  g.arcTo(2, 2, w - 2, 2, r);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = st.color ?? '#1e40af';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true }));
  const sy = st.size ?? 0.036;
  sprite.scale.set((sy * w) / h, sy, 1);
  sprite.renderOrder = 20;
  sprite.userData.label = text;
  return sprite;
}

export function disposeSprite(s: THREE.Sprite): void {
  s.material.map?.dispose();
  s.material.dispose();
}
