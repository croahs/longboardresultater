import * as THREE from "three";
import { contours, dashes, fbm, heights, offset, sheet, solidTerrain, strip } from "./road";
import { reducedMotion, useScene } from "./scene";

/* The front page: a mountain road drawn on the paper, like a relief map with its contour lines, and the camera
   rides down it. Scrolling the page rides faster, the mouse leans into the bends. Which road is picked by the
   day, not by the Norge | Verden switch: building one blocks the page for a moment, so it is built once a visit.
     Norge   Stalheimskleiva: a narrow road stacked down a steep valley side in short legs and tight hairpins,
             dashed white edge lines and no centre line, a low stone wall on the downhill edge, trees and
             boulders on the slope.
     Verden  a wide road sweeping over rolling golden hills, double yellow centre line, white edge lines,
             delineator posts, and pines in clusters further out. */

const STEP = 1; // distance between road points
const PAPER = 0xf3efe6;
const INK = 0x17150f;

interface Kit {
  width: number;                           // the road, edge line to edge line
  path: () => THREE.Vector3[];             // the centre line's waypoints, descending along -z
  base: (x: number, z: number) => number;  // the land before the road is cut into it
  carve: number;                           // how far from the road the land is levelled into a road bed
  bend: number;                            // how far the hillside is bent to carry the road, so no bank is a cliff
  grade: number;                           // the drop per unit of road: this is a downhill track
  terrain: number; shoulder: number; asphalt: number;
  fog: number;
  eye: [number, number];                   // camera height above the road, and distance behind the point it rides
  edge: "dashed" | "solid";               // the white edge lines: dashed on a narrow road, solid on a wide one
  centre: "none" | "double";              // a narrow Norwegian road has edge lines only; the wide one a double yellow
  wall?: boolean; boulders?: boolean; posts?: boolean; pines?: boolean;
}

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; // the same scene every visit
const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

const NORGE: Kit = {
  width: 5.2,
  path() {
    // Short legs across the valley side, each ending in a hairpin drawn as a true half circle (radius R, wider than
    // anything laid beside the road, so nothing folds), stacked close so the next leg is right below you, then a
    // run out along the valley floor.
    const R = 7.5;
    const w: THREE.Vector3[] = [new THREE.Vector3(8, 0, 30), new THREE.Vector3(2, 0, 0)];
    let z = 0;
    const ends = [34, -40];
    for (let k = 0; k < 9; k++) {
      const xe = ends[k % 2] + (rnd() - 0.5) * 10, dir = k % 2 === 0 ? 1 : -1;
      const L = 34 + rnd() * 30;
      w.push(new THREE.Vector3((xe + w[w.length - 1].x) / 2 + (rnd() - 0.5) * 8, 0, z - L / 2));
      z -= L;
      for (let a = 90; a >= -90; a -= 30) w.push(new THREE.Vector3(xe + dir * Math.cos((a * Math.PI) / 180) * R, 0, z - R + Math.sin((a * Math.PI) / 180) * R));
      z -= 2 * R;
    }
    w.push(new THREE.Vector3(-4, 0, z - 70), new THREE.Vector3(14, 0, z - 150), new THREE.Vector3(-8, 0, z - 240));
    return w;
  },
  base: (x, z) => z * 0.3 + Math.max(0, x - 42) * 0.55 + Math.max(0, -x - 58) * 0.5 + fbm(x * 0.02, z * 0.02) * 8 + fbm(x * 0.07, z * 0.07) * 1.4,
  carve: 9, bend: 70, grade: 0.18,
  terrain: 0xc6c8b1, shoulder: 0xcdc9b5, asphalt: 0x746f64,
  fog: 0.0068,
  eye: [3.4, 12],
  edge: "dashed", centre: "none",
  wall: true, boulders: true, pines: true,
};

const VERDEN: Kit = {
  width: 8,
  path() {
    // Long sweeps side to side, two of them tight enough to be loops.
    const w: THREE.Vector3[] = [new THREE.Vector3(0, 0, 30)];
    let z = 0, side = 1;
    for (let k = 0; k < 11; k++) {
      const tight = k === 3 || k === 7;
      const L = tight ? 46 : 80 + rnd() * 40, x = side * (tight ? 30 : 42 + rnd() * 14);
      w.push(new THREE.Vector3(x, 0, z - L * 0.5), new THREE.Vector3(x * (tight ? 1.25 : 0.9), 0, z - L * (tight ? 0.8 : 0.85)));
      z -= L; side = -side;
    }
    w.push(new THREE.Vector3(0, 0, z - 120));
    return w;
  },
  base: (x, z) => z * 0.19 + fbm(x * 0.011, z * 0.011) * 17 + fbm(x * 0.035, z * 0.035) * 2.6,
  carve: 16, bend: 90, grade: 0.14,
  terrain: 0xe2d8bc, shoulder: 0xcfc4a8, asphalt: 0x6e6960,
  fog: 0.0082,
  eye: [4.5, 16],
  edge: "solid", centre: "double",
  posts: true, pines: true,
};

// Norge or Verden, at random but the same all day (UTC).
const TODAY = (() => { const s = Math.sin(Math.floor(Date.now() / 864e5) * 12.9898) * 43758.5453; return s - Math.floor(s) < 0.5 ? NORGE : VERDEN; })();

export default function HeroScene({ className }: { className?: string }) {
  const ref = useScene(({ scene, camera, el }) => {
    const kit = TODAY;
    const still = reducedMotion();
    seed = 7;
    scene.fog = new THREE.FogExp2(PAPER, kit.fog);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(-0.6, 1, 0.45); scene.add(sun);
    const W = kit.width;

    // The road: waypoints to an evenly spaced centre line that drops at the kit's grade the whole way, at a
    // constant grade: any undulation borrowed from the land reads as a washboard. The land is then cut and
    // filled to meet it.
    const curve = new THREE.CatmullRomCurve3(kit.path(), false, "centripetal", 0.5);
    const length = curve.getLength(), n = Math.floor(length / STEP);
    const pts = curve.getSpacedPoints(n);
    const top = kit.base(pts[0].x, pts[0].z) + 0.25;
    for (let i = 0; i < pts.length; i++) pts[i].y = top - i * STEP * kit.grade;
    // Road points by a coarse grid, for shaping the land around the road and keeping things off the tarmac.
    const CELL = 8, cells = new Map<number, number[]>();
    const key = (cx: number, cz: number) => cx * 65536 + cz; // cell indices stay well inside ±32768
    pts.forEach((p, i) => { const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)); (cells.get(k) || cells.set(k, []).get(k)!).push(i); });
    const near = (x: number, z: number, r: number, f: (i: number, d: number) => void) => {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), c = Math.ceil(r / CELL);
      for (let a = -c; a <= c; a++) for (let b = -c; b <= c; b++) {
        const list = cells.get(key(cx + a, cz + b)); if (!list) continue;
        for (const i of list) { const dx = pts[i].x - x, dz = pts[i].z - z, d2 = dx * dx + dz * dz; if (d2 < r * r) f(i, Math.sqrt(d2)); }
      }
    };
    const nearest = (x: number, z: number): [number, number] => {
      let best = Infinity, bi = -1;
      near(x, z, kit.carve + CELL, (i, d) => { if (d < best) { best = d; bi = i; } });
      return [best, bi];
    };
    // The road is laid at its own grade, so it ends up above or below the land it crosses. Rather than cut a
    // shelf with a cliff on either side, the hillside is bent to carry it: every point of land is lifted or
    // lowered by the road's offset from the land, averaged over the road points within `bend` and weighted
    // sharply towards the nearest (so a stacked leg above does not pull the one below). That average is the slow
    // part and changes slowly, so it is worked out on a coarse grid and interpolated. The bed itself is then
    // levelled out to `carve`.
    const x0 = -150, x1 = 130, z0 = 50, z1 = -length - 100;
    // Every third road point is plenty for the average; they get their own coarser cells, sized to the reach.
    const LC = kit.bend / 4, lifts = new Map<number, [number, number, number][]>();
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i], k = key(Math.floor(p.x / LC), Math.floor(p.z / LC));
      (lifts.get(k) || lifts.set(k, []).get(k)!).push([p.x, p.z, p.y - 0.25 - kit.base(p.x, p.z)]);
    }
    const bendAt = (x: number, z: number) => {
      const cx = Math.floor(x / LC), cz = Math.floor(z / LC), r2 = kit.bend * kit.bend;
      let sw = 0, sl = 0;
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
        for (const [px, pz, l] of lifts.get(key(cx + a, cz + b)) || []) {
          const dx = px - x, dz = pz - z, d2 = dx * dx + dz * dz;
          if (d2 < r2) { const w = (1 - Math.sqrt(d2) / kit.bend) ** 4; sw += w; sl += w * l; }
        }
      }
      return sw > 0 ? sl / sw : 0;
    };
    const G = 5, gx = Math.ceil((x1 - x0) / G) + 1, gz = Math.ceil((z0 - z1) / G) + 1;
    const bends = new Float32Array(gx * gz);
    for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) bends[j * gx + i] = bendAt(x0 + i * G, z0 - j * G);
    const bendOf = (x: number, z: number) => {
      const u = Math.max(0, Math.min(gx - 1.001, (x - x0) / G)), v = Math.max(0, Math.min(gz - 1.001, (z0 - z) / G));
      const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * gx + i;
      return (bends[k] * (1 - fu) + bends[k + 1] * fu) * (1 - fv) + (bends[k + gx] * (1 - fu) + bends[k + gx + 1] * fu) * fv;
    };
    const land = (x: number, z: number) => {
      const bent = kit.base(x, z) + bendOf(x, z);
      const [best, bi] = nearest(x, z);
      if (bi < 0 || best > kit.carve) return bent;
      const target = pts[bi].y - 0.25 - best * 0.03;
      return target + (bent - target) * smooth((best - W / 2 - 0.6) / (kit.carve - W / 2 - 0.6));
    };

    const flat = (colour: number) => new THREE.MeshLambertMaterial({ color: colour, flatShading: true, side: THREE.DoubleSide });
    const H = heights(x0, x1, z0, z1, 104, Math.round((z0 - z1) / 2.7), land);
    scene.add(new THREE.Mesh(solidTerrain(x0, x1, z0, z1, H), flat(kit.terrain)));
    scene.add(new THREE.LineSegments(contours(x0, x1, z0, z1, H, 2.5), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.16 })));

    const lay = (g: THREE.BufferGeometry, colour: number, order = 1) => { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide })); m.renderOrder = order; scene.add(m); return m; };
    lay(strip(pts.map((p) => p.clone().setY(p.y - 0.04)), W + 1.8), kit.shoulder, 1);
    lay(strip(pts, W), kit.asphalt, 2);
    const paint = pts.map((p) => p.clone().setY(p.y + 0.02));
    const line = kit.edge === "dashed" ? (p: THREE.Vector3[], w: number) => dashes(p, w, 3, 3) : strip;
    lay(line(offset(paint, -(W / 2 - 0.3)), 0.16), 0xfaf8f2, 3);
    lay(line(offset(paint, W / 2 - 0.3), 0.16), 0xfaf8f2, 3);
    if (kit.centre === "double") {
      lay(strip(offset(paint, -0.2), 0.14), 0xf2c230, 3);
      lay(strip(offset(paint, 0.2), 0.14), 0xf2c230, 3);
    }

    if (kit.wall) {
      // A low stone wall along whichever edge the land falls away from, as on Stalheimskleiva; it fades out where the land is level.
      const stone = flat(0xaaa697);
      for (const side of [-1, 1]) {
        const inner = offset(pts, side * (W / 2 + 0.5)), outer = offset(pts, side * (W / 2 + 1.0)), probe = offset(pts, side * 7), other = offset(pts, -side * 7);
        const h = pts.map((_, i) => 0.55 * smooth((land(other[i].x, other[i].z) - land(probe[i].x, probe[i].z) - 0.6) / 1.8));
        const top = inner.map((p, i) => p.clone().setY(p.y + h[i])), cap = outer.map((p, i) => p.clone().setY(p.y + h[i]));
        for (const g of [sheet(top, inner), sheet(cap, top), sheet(outer, cap)]) { const m = new THREE.Mesh(g, stone); m.renderOrder = 2; scene.add(m); }
      }
    }
    if (kit.posts) {
      const lines: number[] = [];
      for (const side of [-1, 1]) {
        const edge = offset(pts, side * (W / 2 + 1.1));
        for (let i = 4; i < edge.length; i += 14) lines.push(edge[i].x, edge[i].y, edge[i].z, edge[i].x, edge[i].y + 1, edge[i].z);
      }
      scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(lines), 3)), new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.6 })));
    }
    const scatter = (count: number, geometry: THREE.BufferGeometry, colour: number, place: () => [number, number], scale: () => THREE.Vector3, sink: number) => {
      const mesh = new THREE.InstancedMesh(geometry, flat(colour), count), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      let k = 0;
      for (let tries = 0; k < count && tries < count * 30; tries++) {
        const [x, z] = place(), [d] = nearest(x, z);
        if (d < W / 2 + 3.5) continue;
        const s = scale();
        e.set(sink > 0 ? rnd() * Math.PI : 0, rnd() * Math.PI * 2, sink > 0 ? rnd() * Math.PI : 0); q.setFromEuler(e);
        m.compose(new THREE.Vector3(x, land(x, z) - s.y * sink, z), q, s);
        mesh.setMatrixAt(k++, m);
      }
      mesh.count = k; mesh.instanceMatrix.needsUpdate = true; scene.add(mesh);
    };
    if (kit.boulders) scatter(90, new THREE.DodecahedronGeometry(1, 0), 0xb4ae9f, () => [x0 + rnd() * (x1 - x0), z1 + 60 + rnd() * (z0 - z1 - 60)], () => new THREE.Vector3(0.6 + rnd() * 1.8, 0.5 + rnd() * 1.4, 0.6 + rnd() * 1.8), 0.35);
    if (kit.pines) {
      const centres = Array.from({ length: 14 }, () => [x0 + 20 + rnd() * (x1 - x0 - 40), z1 + 80 + rnd() * (z0 - z1 - 120)]);
      scatter(260, new THREE.ConeGeometry(1, 3.4, 6), 0x9aa08c, () => { const c = centres[Math.floor(rnd() * centres.length)], a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 20; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]; }, () => { const s = 1 + rnd() * 0.9; return new THREE.Vector3(s, s * 1.1, s); }, -0.5);
    }

    let mx = 0, my = 0, tmx = 0, tmy = 0;
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); tmx = ((e.clientX - r.left) / r.width) * 2 - 1; tmy = ((e.clientY - r.top) / r.height) * 2 - 1; };
    const onLeave = () => { tmx = 0; tmy = 0; };
    if (!still) { el.addEventListener("pointermove", onMove); el.addEventListener("pointerleave", onLeave); }

    const at = (s: number, out: THREE.Vector3) => { const i = Math.max(0, Math.min(pts.length - 1, s / STEP)), a = Math.floor(i), f = i - a; return out.copy(pts[a]).lerp(pts[Math.min(pts.length - 1, a + 1)], f); };
    let s = 24, scrollS = 0;
    const loop = length - 140;
    const eye = new THREE.Vector3(), look = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    camera.position.copy(at(s, a)).add(new THREE.Vector3(0, kit.eye[0], kit.eye[1]));
    return {
      still,
      frame({ dt, t }) {
        mx += (tmx - mx) * Math.min(1, dt * 3); my += (tmy - my) * Math.min(1, dt * 3);
        if (!still) { scrollS += (scrollY * 0.09 - scrollS) * Math.min(1, dt * 2.5); s += dt * 4.2; }
        const here = 24 + ((s - 24 + scrollS) % loop);
        at(here, a); at(here + 22, b);
        // Sit a little above the road a stretch behind, on the road itself so a hairpin never puts the camera in the
        // snow wall, looking down the next bend; the mouse leans the view.
        const dir = b.clone().sub(a).setY(0).normalize();
        at(here - kit.eye[1], eye).add(new THREE.Vector3(-dir.z * mx * 5, kit.eye[0] - my * 1.2, dir.x * mx * 5));
        camera.position.lerp(eye, still ? 1 : Math.min(1, dt * 2.2));
        look.copy(b).add(new THREE.Vector3(-dir.z * mx * 6, 0.2 + (still ? 0 : Math.sin(t * 0.4) * 0.25) - my * 2, dir.x * mx * 6));
        camera.lookAt(look);
      },
      dispose() { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave); },
    };
  });
  return <div ref={ref} className={className} aria-hidden="true" />;
}
