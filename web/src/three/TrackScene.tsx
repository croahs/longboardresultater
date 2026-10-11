import { useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Track } from "../data";
import { num, raw } from "../format";
import { t } from "../lang";
import { curtain, ribbon, wireTerrain, fbm } from "./road";
import { reducedMotion, useScene } from "./scene";

/* A hill's real road in 3D, from tracks.py: lat/lon/elevation per point, coloured by grade. Drag to orbit,
   wheel to zoom; it turns slowly on its own until touched. Hovering the road shows the stretch under the cursor. */

const EXAGGERATE = 1.6; // heights are stretched this much, so a long gentle hill still reads as a hill

interface Hover { x: number; y: number; km: number; ele: number; grade: number }

export default function TrackScene({ track, className }: { track: Track; className?: string }) {
  const [hover, setHover] = useState<Hover | null>(null);
  const labels = useRef<{ start: HTMLDivElement | null; finish: HTMLDivElement | null }>({ start: null, finish: null });
  const ref = useScene(({ scene, camera, renderer, el }) => {
    const still = reducedMotion();
    const raw = track.pts;
    const lat0 = raw[0][0], lon0 = raw[0][1], kx = Math.cos((lat0 * Math.PI) / 180) * 111320, kz = 110540;
    const eles = raw.map((p) => p[2]), minE = Math.min(...eles);
    const local = raw.map((p) => new THREE.Vector3((p[1] - lon0) * kx, (p[2] - minE) * EXAGGERATE, -(p[0] - lat0) * kz));
    const box = new THREE.Box3().setFromPoints(local), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const extent = Math.max(size.x, size.z, 1), S = 100 / extent; // fit the hill in about 100 units
    const dist: number[] = [0];
    for (let i = 1; i < raw.length; i++) dist.push(dist[i - 1] + Math.hypot(local[i].x - local[i - 1].x, local[i].z - local[i - 1].z));
    const pts = local.map((p) => p.sub(centre).multiplyScalar(S));
    const grades = raw.map((p) => -p[3]); // tracks.py: negative = descending; here positive = descending
    const floor = Math.min(...pts.map((p) => p.y)) - 6;

    scene.fog = new THREE.FogExp2(0x0a0b0e, 0.0045);
    const road = new THREE.Mesh(ribbon(pts, grades, Math.max(1.2, 8 * S)), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    road.renderOrder = 2;
    scene.add(road);
    const veil = new THREE.Mesh(curtain(pts, grades, floor), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    veil.renderOrder = 1;
    scene.add(veil);
    // A quiet wire ground with a hint of relief, so the hill has somewhere to stand.
    const span = 90;
    const wire = new THREE.LineSegments(wireTerrain(-span, span, -span, span, 36, 36, (x, z) => floor - 2 + fbm(x * 0.03, z * 0.03) * 3), new THREE.LineBasicMaterial({ color: 0x5a5f72, transparent: true, opacity: 0.25 }));
    scene.add(wire);
    const ring = (p: THREE.Vector3, colour: number) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.28, 10, 40), new THREE.MeshBasicMaterial({ color: colour }));
      m.position.copy(p).setY(p.y + 0.2); m.rotation.x = Math.PI / 2; scene.add(m);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, p.y - floor, 6), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.5 }));
      pole.position.copy(p).setY((p.y + floor) / 2); scene.add(pole);
    };
    ring(pts[0], 0xf2f0ea); ring(pts[pts.length - 1], 0xff5a1f);

    camera.near = 0.5; camera.far = 1000; camera.fov = 42; camera.updateProjectionMatrix();
    camera.position.set(70, 55, 95);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.autoRotate = !still; controls.autoRotateSpeed = 0.5;
    controls.minDistance = 25; controls.maxDistance = 320; controls.maxPolarAngle = Math.PI / 2 - 0.03; controls.enablePan = false;
    controls.target.set(0, (pts[0].y + pts[pts.length - 1].y) / 4, 0);
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let has = false;
    const onMove = (e: PointerEvent) => { const r = el.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); has = true; };
    const onLeave = () => { has = false; setHover(null); };
    el.addEventListener("pointermove", onMove); el.addEventListener("pointerleave", onLeave);
    let lastHit = -1;
    const place = (div: HTMLDivElement | null, p: THREE.Vector3, w: number, h: number) => {
      if (!div) return;
      const v = p.clone().setY(p.y + 3).project(camera);
      div.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      div.style.opacity = v.z < 1 ? "1" : "0";
    };
    return {
      frame({ w, h }) {
        controls.update();
        place(labels.current.start, pts[0], w, h); place(labels.current.finish, pts[pts.length - 1], w, h);
        if (!has) return;
        ray.setFromCamera(mouse, camera);
        const hit = ray.intersectObject(road)[0];
        const i = hit?.faceIndex != null ? Math.min(raw.length - 1, Math.floor(hit.faceIndex / 2)) : -1;
        if (i !== lastHit) {
          lastHit = i;
          if (i < 0) setHover(null);
          else { const v = pts[i].clone().project(camera); setHover({ x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, km: dist[i] / 1000, ele: raw[i][2], grade: grades[i] }); }
        }
      },
      dispose() { controls.dispose(); el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", onLeave); },
    };
  }, [track]);
  return (
    <div className={`track-scene ${className || ""}`}>
      <div ref={ref} className="track-canvas" role="img" aria-label={t("Bakken i 3D, farget etter bratthet", "The hill in 3D, coloured by steepness")} />
      <div className="track-label start" ref={(d) => { labels.current.start = d; }}>Start</div>
      <div className="track-label finish" ref={(d) => { labels.current.finish = d; }}>{t("Mål", "Finish")}</div>
      {hover && (
        <div className="track-tip" style={{ transform: `translate(${hover.x}px, ${hover.y}px)` }} role="status">
          <b>{num(hover.grade, 1)} %</b><span>{num(hover.km, 2)} km · {Math.round(hover.ele)} {t("moh", "m a.s.l.")}</span>
        </div>
      )}
      <p className="track-hint">{t("Dra for å snu, rull for å zoome. Høyden er strukket", "Drag to turn, scroll to zoom. Height is stretched")} ×{raw(EXAGGERATE)}.</p>
    </div>
  );
}
