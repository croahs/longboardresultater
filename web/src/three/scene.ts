import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

/* One WebGL canvas in a container div: sizes to the container, renders only while visible, stops when the
   tab is hidden, and disposes everything on unmount. The scene builder returns a frame function and a cleanup. */

export interface Frame { dt: number; t: number; w: number; h: number }
export interface Built { frame: (f: Frame) => void; dispose?: () => void; onResize?: (w: number, h: number) => void }
export type Builder = (ctx: { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; el: HTMLDivElement }) => Built;

export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useScene(build: Builder, deps: unknown[] = []): RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch { el.dataset.webgl = "no"; return; } // no WebGL: the CSS behind the canvas carries the look
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
    const built = build({ scene, camera, renderer, el });
    let w = 1, h = 1;
    const size = () => {
      w = Math.max(1, el.clientWidth); h = Math.max(1, el.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      built.onResize?.(w, h);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    let visible = true, hidden = document.hidden, raf = 0, last = performance.now(), t = 0;
    const loop = (now: number) => {
      raf = 0;
      if (!visible || hidden) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      built.frame({ dt, t, w, h });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf && visible && !hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }, { threshold: 0.01 });
    io.observe(el);
    const vis = () => { hidden = document.hidden; kick(); };
    document.addEventListener("visibilitychange", vis);
    kick();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      built.dispose?.();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => x.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
