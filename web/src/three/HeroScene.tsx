import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fbm, offset, strip, wireTerrain } from "./road";
import { reducedMotion, useScene } from "./scene";

/* The front page: a long mountain road winding down through fog, marked like a Norwegian road. The camera
   rides it slowly; scrolling the page rides faster, the mouse leans into the bends. */

const LENGTH = 1400; // world units of road
const STEP = 1.5;    // distance between road points
const ROAD_W = 6.5;  // two lanes
const BG = 0x0a0b0e;

/** The mountainside: a slope down the -z axis with ridges and bumps. */
const terrain = (x: number, z: number) => z * 0.125 + fbm(x * 0.012, z * 0.012) * 13 + fbm(x * 0.05, z * 0.05) * 1.5;
/** The road's centre line: switchbacks across the slope, resting on the terrain. */
function roadAt(s: number, out: THREE.Vector3) {
  const x = Math.sin(s * 0.011) * 42 + Math.sin(s * 0.0037 + 1.3) * 28;
  const z = -s;
  out.set(x, terrain(x, z) + 0.9, z);
  return out;
}

export default function HeroScene({ className }: { className?: string }) {
  const ref = useScene(({ scene, camera, el }) => {
    const still = reducedMotion();
    scene.fog = new THREE.FogExp2(BG, 0.0105);

    const n = Math.floor(LENGTH / STEP);
    const pts = Array.from({ length: n }, (_, i) => roadAt(i * STEP, new THREE.Vector3()));
    // A Norwegian road: asphalt, white edge lines, and a yellow centre line that is dashed 3 m on, 9 m off,
    // but solid (sperrelinje) through the sharp bends where you could not see to overtake.
    const asphalt = new THREE.Mesh(strip(pts, ROAD_W), new THREE.MeshBasicMaterial({ color: 0x23262d, side: THREE.DoubleSide }));
    scene.add(asphalt);
    const shoulder = new THREE.Mesh(strip(pts.map((p) => p.clone().setY(p.y - 0.06)), ROAD_W + 1.6), new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.DoubleSide }));
    scene.add(shoulder);
    const paint = (g: THREE.BufferGeometry, colour: number) => { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide })); m.renderOrder = 2; scene.add(m); };
    const lifted = pts.map((p) => p.clone().setY(p.y + 0.02));
    paint(strip(offset(lifted, -(ROAD_W / 2 - 0.35)), 0.16), 0xe9e6dc);
    paint(strip(offset(lifted, ROAD_W / 2 - 0.35), 0.16), 0xe9e6dc);
    const bend = (i: number) => { const a = pts[Math.max(0, i - 6)], b = pts[i], c = pts[Math.min(n - 1, i + 6)]; const t1 = Math.atan2(b.x - a.x, a.z - b.z), t2 = Math.atan2(c.x - b.x, b.z - c.z); return Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))); };
    const dashes: THREE.BufferGeometry[] = [];
    let run: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const on = (i * STEP) % 12 < 3 || bend(i) > 0.09;
      if (on) run.push(lifted[i]);
      if ((!on || i === n - 1) && run.length > 1) { dashes.push(strip(run, 0.18)); run = []; }
      if (!on) run = [];
    }
    paint(mergeGeometries(dashes), 0xf2c230);

    const wire = new THREE.LineSegments(wireTerrain(-170, 170, -LENGTH - 60, 40, 48, 170, terrain), new THREE.LineBasicMaterial({ color: 0x5a5f72, transparent: true, opacity: 0.3 }));
    scene.add(wire);

    // Speed: faint sparks rushing past the camera, in camera space.
    const N = still ? 0 : 260, sp = new Float32Array(N * 3);
    const reset = (i: number, far = false) => { sp[i * 3] = (Math.random() - 0.5) * 40; sp[i * 3 + 1] = (Math.random() - 0.3) * 24; sp[i * 3 + 2] = far ? -90 - Math.random() * 60 : -Math.random() * 150; };
    for (let i = 0; i < N; i++) reset(i);
    const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(sp, 3)),
      new THREE.PointsMaterial({ color: 0xffb084, size: 0.22, transparent: true, opacity: 0.55, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparks.frustumCulled = false;
    camera.add(sparks);
    scene.add(camera);

    let mx = 0, my = 0, tmx = 0, tmy = 0;
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); tmx = ((e.clientX - r.left) / r.width) * 2 - 1; tmy = ((e.clientY - r.top) / r.height) * 2 - 1; };
    const onLeave = () => { tmx = 0; tmy = 0; };
    if (!still) { el.addEventListener("pointermove", onMove); el.addEventListener("pointerleave", onLeave); }

    let s = 30, scrollS = 0;
    const eye = new THREE.Vector3(), look = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    camera.position.copy(roadAt(s, a)).add(new THREE.Vector3(0, 3.2, 8));
    return {
      frame({ dt, t }) {
        mx += (tmx - mx) * Math.min(1, dt * 3); my += (tmy - my) * Math.min(1, dt * 3);
        const target = scrollY * 0.09; scrollS += (target - scrollS) * Math.min(1, dt * 2.5);
        if (!still) s += dt * 4.2;
        const at = 30 + ((s - 30 + scrollS) % (LENGTH - 260));
        roadAt(at, a); roadAt(at + 26, b);
        // Sit a little above and behind the road, looking down the next bend; the mouse leans the view.
        const dir = b.clone().sub(a).setY(0).normalize();
        eye.copy(a).addScaledVector(dir, -16).add(new THREE.Vector3(-dir.z * mx * 5, 7 - my * 1.4, dir.x * mx * 5));
        camera.position.lerp(eye, Math.min(1, dt * 2.2));
        look.copy(b).add(new THREE.Vector3(-dir.z * mx * 6, 0.6 + Math.sin(t * 0.4) * 0.3 - my * 2, dir.x * mx * 6));
        camera.lookAt(look);
        if (N) {
          const v = 44 * dt;
          for (let i = 0; i < N; i++) { sp[i * 3 + 2] += v * (1 + Math.abs(sp[i * 3 + 2]) / 60); if (sp[i * 3 + 2] > -1) reset(i, true); }
          (sparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }
      },
      dispose() { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave); },
    };
  });
  return <div ref={ref} className={className} aria-hidden="true" />;
}
