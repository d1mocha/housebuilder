// Положение солнца (упрощённая астрономическая модель, истинное солнечное время).
import type { Vec2 } from '../model/types';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function dayOfYear(month: number, day: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let n = day;
  for (let i = 0; i < month - 1; i++) n += days[i];
  return n;
}

export interface SunPos {
  /** Высота над горизонтом, градусы. */
  elevation: number;
  /** Азимут от севера по часовой стрелке, градусы. */
  azimuth: number;
}

export function sunPosition(latitude: number, month: number, day: number, hour: number): SunPos {
  const n = dayOfYear(month, day);
  const decl = rad(23.44) * Math.sin(rad((360 / 365) * (284 + n)));
  const lat = rad(latitude);
  const H = rad(15 * (hour - 12));
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const elevation = deg(Math.asin(Math.max(-1, Math.min(1, sinEl))));
  const az = deg(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat))) + 180;
  return { elevation, azimuth: ((az % 360) + 360) % 360 };
}

/** Единичный вектор на плане для компасного азимута; north — азимут «верха» плана. */
export function planDir(azimuth: number, north: number): Vec2 {
  const t = rad(azimuth - north);
  return { x: Math.sin(t), y: -Math.cos(t) };
}

/** Вектор тени на плане для объекта высотой h (мм). null — солнце под горизонтом. */
export function shadowVector(sun: SunPos, north: number, h: number): Vec2 | null {
  if (sun.elevation <= 2) return null;
  const len = Math.min(h / Math.tan(rad(sun.elevation)), h * 12);
  const d = planDir(sun.azimuth, north);
  return { x: -d.x * len, y: -d.y * len };
}
