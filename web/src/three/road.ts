import * as THREE from "three";
import { gradeColour } from "../grade";

/* Geometry shared by the hero and the hill pages: a road ribbon coloured by how steep each stretch is,
   a translucent curtain under it, and a wire terrain. Colours match the grade legend in the UI. */

const tmp = new THREE.Color();
function rgb(hex: string): [number, number, number] { tmp.set(hex); return [tmp.r, tmp.g, tmp.b]; }

/** Points shifted sideways by `d` (positive = right of the direction of travel), staying level. */
export function offset(pts: THREE.Vector3[], d: number): THREE.Vector3[] {
  const n = pts.length, up = new THREE.Vector3(0, 1, 0), tan = new THREE.Vector3(), side = new THREE.Vector3();
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    tan.subVectors(b, a); tan.y = 0; if (tan.lengthSq() < 1e-9) tan.set(0, 0, -1); tan.normalize();
    side.crossVectors(tan, up).multiplyScalar(d);
    return new THREE.Vector3(p.x + side.x, p.y, p.z + side.z);
  });
}

/** A flat strip along `pts`, `width` wide, with a colour per point from `colourAt`. */
export function strip(pts: THREE.Vector3[], width: number, colourAt?: (i: number) => [number, number, number]): THREE.BufferGeometry {
  const n = pts.length, pos = new Float32Array(n * 6), col = colourAt ? new Float32Array(n * 6) : null, idx: number[] = [];
  const l = offset(pts, -width / 2), r = offset(pts, width / 2);
  for (let i = 0; i < n; i++) {
    pos.set([l[i].x, l[i].y, l[i].z, r[i].x, r[i].y, r[i].z], i * 6);
    if (col) { const c = colourAt!(i); col.set([...c, ...c], i * 6); }
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (col) g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** A road ribbon coloured by `grades[i]` (downhill %). */
export const ribbon = (pts: THREE.Vector3[], grades: number[], width: number) =>
  strip(pts, width, (i) => rgb(gradeColour(grades[Math.min(i, grades.length - 1)])));

/** A vertical curtain from the road down to `floor`, coloured like the road and fading out towards the floor. */
export function curtain(pts: THREE.Vector3[], grades: number[], floor: number): THREE.BufferGeometry {
  const n = pts.length, pos = new Float32Array(n * 6), col = new Float32Array(n * 8), idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    pos.set([p.x, p.y, p.z, p.x, floor, p.z], i * 6);
    const c = rgb(gradeColour(grades[Math.min(i, grades.length - 1)]));
    col.set([...c, 0.35, ...c, 0.0], i * 8);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

/** Grid lines over a height field: `nx` by `nz` cells from x0..x1, z0..z1, height from `h(x, z)`. */
export function wireTerrain(x0: number, x1: number, z0: number, z1: number, nx: number, nz: number, h: (x: number, z: number) => number): THREE.BufferGeometry {
  const pts: number[] = [];
  const X = (i: number) => x0 + ((x1 - x0) * i) / nx, Z = (j: number) => z0 + ((z1 - z0) * j) / nz;
  for (let j = 0; j <= nz; j++) for (let i = 0; i < nx; i++) { const a = X(i), b = X(i + 1), z = Z(j); pts.push(a, h(a, z), z, b, h(b, z), z); }
  for (let i = 0; i <= nx; i++) for (let j = 0; j < nz; j++) { const x = X(i), a = Z(j), b = Z(j + 1); pts.push(x, h(x, a), a, x, h(x, b), b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
  return g;
}

/* Smooth 2-D value noise, enough for a mountainside. */
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (t: number) => t * t * (3 - 2 * t);
export function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
}
export const fbm = (x: number, y: number) => noise(x, y) * 0.6 + noise(x * 2.1 + 7, y * 2.1 + 3) * 0.3 + noise(x * 4.3 + 1, y * 4.3 + 9) * 0.1;

/** Downhill grade in percent of the segment from a to b (positive = descending). */
export const gradeOf = (a: THREE.Vector3, b: THREE.Vector3) => {
  const run = Math.hypot(b.x - a.x, b.z - a.z);
  return run < 1e-6 ? 0 : ((a.y - b.y) / run) * 100;
};
