"use client";

import { useEffect, useRef } from "react";

/**
 * A painted container port at night (Nhava Sheva is the client's port), drawn on canvas.
 *
 * - Painted stroke by stroke the first time it scrolls into view.
 * - Water shimmers, crane lights blink, one crane lifts a container, layers lean toward the pointer.
 * - Reduced motion: the finished painting, still. Off screen or in a hidden tab: no frames are drawn.
 *
 * Purely decorative (aria-hidden); the panels placed on top carry the content.
 */

export type SceneVariant = "wide" | "stacks" | "crane" | "water";

type Stroke = (c: CanvasRenderingContext2D) => void;
type Rng = () => number;

const SKY = ["#0b1030", "#18205a", "#33306f", "#6b3f6e", "#a2566a"];
const HAZE = "#d08a45";
const BOXES = ["#b5513d", "#2f4f8f", "#3a8086", "#c09443", "#6c7285", "#94405e", "#4a6fa8", "#d6d2c4"];

function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, f: number, a = 1) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgba(${ch(16)},${ch(8)},${ch(0)},${a})`;
}

/** One soft, slightly ragged brush dab. */
function dab(r: Rng, x: number, y: number, w: number, h: number, color: string): Stroke {
  const rot = (r() - 0.5) * 0.25;
  return (c) => {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  };
}

type Layout = {
  horizon: number; // 0..1 of height, where land meets water
  quay: number; // top of the container yard
  cranes: { x: number; s: number; lift?: boolean }[];
  stacks: { x0: number; x1: number; tiers: number }[];
  zoom: number;
};

const LAYOUTS: Record<SceneVariant, Layout> = {
  wide: {
    horizon: 0.62, quay: 0.5, zoom: 1,
    cranes: [{ x: 0.18, s: 1 }, { x: 0.42, s: 1.08, lift: true }, { x: 0.83, s: 0.92 }],
    stacks: [{ x0: 0.02, x1: 0.36, tiers: 3 }, { x0: 0.5, x1: 0.98, tiers: 4 }],
  },
  stacks: {
    horizon: 0.7, quay: 0.42, zoom: 1.6,
    cranes: [{ x: 0.78, s: 1.25, lift: true }],
    stacks: [{ x0: -0.05, x1: 0.62, tiers: 5 }, { x0: 0.64, x1: 1.05, tiers: 3 }],
  },
  crane: {
    horizon: 0.66, quay: 0.56, zoom: 1.3,
    cranes: [{ x: 0.36, s: 1.35, lift: true }, { x: 0.86, s: 1.05 }],
    stacks: [{ x0: 0.55, x1: 1.05, tiers: 3 }],
  },
  water: {
    horizon: 0.48, quay: 0.4, zoom: 0.85,
    cranes: [{ x: 0.12, s: 0.8 }, { x: 0.3, s: 0.85, lift: true }, { x: 0.6, s: 0.78 }, { x: 0.88, s: 0.82 }],
    stacks: [{ x0: 0, x1: 1, tiers: 3 }],
  },
};

type Crane = { x: number; base: number; h: number; boom: number; lift: boolean };
type Light = { x: number; y: number; r: number; color: string; phase: number; blink: boolean };
type Ripple = { x: number; y: number; w: number; color: string; speed: number; phase: number };

/** Builds the stroke lists for each layer, plus the live elements (lights, ripples, cranes). */
function compose(W: number, H: number, v: SceneVariant, seed: number) {
  const r = rng(seed);
  const L = LAYOUTS[v];
  const hz = H * L.horizon;
  const back: Stroke[] = [];
  const mid: Stroke[] = [];
  const water: Stroke[] = [];
  const ship: Stroke[] = []; // painted after the water, so it sits on it
  const lights: Light[] = [];
  const ripples: Ripple[] = [];
  const cranes: Crane[] = [];
  // Brush size: a fixed scale clamped to the frame, so small cards still get readable boxes.
  const unit = Math.min(1.35, Math.max(0.62, Math.max(W, H) / 700));

  // Sky: a gradient wash, then hundreds of dabs for a painted texture.
  back.push((c) => {
    const g = c.createLinearGradient(0, 0, 0, hz);
    SKY.forEach((col, i) => g.addColorStop(i / (SKY.length - 1), col));
    c.fillStyle = g;
    c.fillRect(0, 0, W, hz + 2);
    const haze = c.createRadialGradient(W * 0.55, hz, 0, W * 0.55, hz, Math.max(W, H) * 0.75);
    haze.addColorStop(0, shade(HAZE, 1, 0.5));
    haze.addColorStop(1, shade(HAZE, 1, 0));
    c.fillStyle = haze;
    c.fillRect(0, 0, W, hz + 2);
  });
  const skyDabs = Math.round(260 * (W * H) / (900 * 600)) + 120;
  for (let i = 0; i < skyDabs; i++) {
    const y = r() * hz;
    const t = y / hz;
    const col = SKY[Math.min(SKY.length - 1, Math.floor(t * SKY.length))];
    back.push(dab(r, r() * W, y, (40 + r() * 120) * unit, (6 + r() * 14) * unit, shade(col, 0.85 + r() * 0.45, 0.22)));
  }
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = r() * hz * 0.7, s = (0.4 + r() * 1.1) * unit;
    back.push((c) => {
      c.fillStyle = `rgba(230,232,255,${0.25 + r() * 0.6})`;
      c.fillRect(x, y, s, s);
    });
  }
  // Far shore: low hills and a line of distant lights.
  back.push((c) => {
    c.fillStyle = "#11142c";
    c.beginPath();
    c.moveTo(0, hz);
    for (let x = 0; x <= W; x += W / 24) c.lineTo(x, hz - (8 + Math.sin(x * 0.01 + seed) * 6 + r() * 6) * unit);
    c.lineTo(W, hz);
    c.closePath();
    c.fill();
  });
  for (let i = 0; i < 40; i++) {
    const x = r() * W;
    lights.push({ x, y: hz - (3 + r() * 6) * unit, r: 0.9 * unit, color: r() > 0.3 ? "#ffcf8a" : "#ffffff", phase: r() * 6, blink: false });
  }

  // Container yard: tiers of boxes along the quay, painted box by box.
  const quayY = H * L.quay;
  const bw = 34 * unit * L.zoom;
  const bh = 13 * unit * L.zoom;
  for (const st of L.stacks) {
    const x0 = st.x0 * W, x1 = st.x1 * W;
    for (let tier = 0; tier < st.tiers; tier++) {
      for (let x = x0; x < x1; x += bw * (1.02 + r() * 0.05)) {
        if (r() < 0.12 && tier === st.tiers - 1) continue; // gaps on top
        const y = hz - bh * (tier + 1) - (quayY > hz ? 0 : (hz - quayY) * 0.15);
        const col = BOXES[Math.floor(r() * BOXES.length)];
        const lit = 0.62 + r() * 0.4;
        const w = bw * (0.96 + r() * 0.03);
        mid.push((c) => {
          c.fillStyle = shade(col, lit);
          c.fillRect(x, y, w, bh * 0.94);
          // corrugation
          c.strokeStyle = shade(col, lit * 0.7, 0.8);
          c.lineWidth = Math.max(0.6, unit * 0.6);
          c.beginPath();
          for (let k = x + 3 * unit; k < x + w - 2; k += 3.2 * unit * L.zoom) {
            c.moveTo(k, y + 1);
            c.lineTo(k, y + bh * 0.9);
          }
          c.stroke();
          // sodium light catching the top edge
          c.fillStyle = shade(HAZE, 1, 0.35);
          c.fillRect(x, y, w, Math.max(1, unit));
        });
      }
    }
  }
  // Quay edge.
  mid.push((c) => {
    c.fillStyle = "#0d1022";
    c.fillRect(0, hz - 2 * unit, W, 5 * unit);
  });

  // Floodlight pools over the yard (sodium orange), painted over the boxes.
  for (const st of L.stacks) {
    const n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      const x = (st.x0 + (st.x1 - st.x0) * ((k + 0.5) / n)) * W;
      const rad = (70 + r() * 50) * unit * L.zoom;
      mid.push((c) => {
        const g = c.createRadialGradient(x, hz - bh, 0, x, hz - bh, rad);
        g.addColorStop(0, shade(HAZE, 1.1, 0.32));
        g.addColorStop(1, shade(HAZE, 1, 0));
        c.fillStyle = g;
        c.fillRect(x - rad, hz - bh - rad, rad * 2, rad * 2);
      });
      lights.push({ x, y: hz - bh * (st.tiers + 2.2), r: 1.6 * unit, color: "#ffd9a0", phase: r() * 6, blink: false });
    }
  }

  // A container ship alongside, under the crane booms: dark hull, a deck of boxes, a lit bridge.
  if (L.cranes.some((c) => c.lift)) {
    const lead = L.cranes.find((c) => c.lift)!;
    const sx1 = lead.x * W + 30 * unit;
    const sx0 = Math.max(-20, sx1 - 300 * unit * Math.max(1, L.zoom * 0.8));
    const deck = hz + 4 * unit;
    const hullH = 16 * unit * L.zoom;
    ship.push((c) => {
      c.fillStyle = "#090b18";
      c.beginPath();
      c.moveTo(sx0, deck);
      c.lineTo(sx1 + 14 * unit, deck);
      c.lineTo(sx1, deck + hullH);
      c.lineTo(sx0 + 8 * unit, deck + hullH);
      c.closePath();
      c.fill();
      c.fillStyle = "rgba(180,60,50,0.55)";
      c.fillRect(sx0 + 6 * unit, deck + hullH - 3 * unit, sx1 - sx0 - 10 * unit, 2 * unit);
    });
    const sbw = 16 * unit * L.zoom, sbh = 7 * unit * L.zoom;
    for (let x = sx0 + 34 * unit; x < sx1 - 10 * unit; x += sbw * 1.04) {
      const tiers = 1 + Math.floor(r() * 3);
      for (let t = 0; t < tiers; t++) {
        const col = BOXES[Math.floor(r() * BOXES.length)];
        const lit = 0.5 + r() * 0.35;
        ship.push((c) => {
          c.fillStyle = shade(col, lit);
          c.fillRect(x, deck - sbh * (t + 1), sbw * 0.95, sbh * 0.92);
        });
      }
    }
    // bridge house at the stern, windows lit
    ship.push((c) => {
      c.fillStyle = "#d8d4ca";
      c.fillRect(sx0 + 8 * unit, deck - 26 * unit, 18 * unit, 26 * unit);
      c.fillStyle = "#ffdca0";
      for (let k = 0; k < 3; k++) c.fillRect(sx0 + 10 * unit, deck - 23 * unit + k * 7 * unit, 14 * unit, 2 * unit);
    });
    lights.push({ x: sx0 + 17 * unit, y: deck - 30 * unit, r: 1.6 * unit, color: "#ffffff", phase: 0, blink: true });
  }

  // Ship-to-shore cranes.
  for (const cr of L.cranes) {
    const x = cr.x * W;
    const h = H * 0.42 * cr.s * Math.min(1.2, L.zoom * 0.85);
    const legW = 38 * unit * cr.s;
    const boom = 120 * unit * cr.s;
    cranes.push({ x, base: hz, h, boom, lift: !!cr.lift });
    mid.push((c) => {
      c.strokeStyle = "#141629";
      c.lineCap = "round";
      c.lineWidth = 4 * unit * cr.s;
      // legs
      c.beginPath();
      c.moveTo(x - legW / 2, hz);
      c.lineTo(x - legW / 2, hz - h);
      c.moveTo(x + legW / 2, hz);
      c.lineTo(x + legW / 2, hz - h);
      c.stroke();
      // cross bracing
      c.lineWidth = 1.6 * unit * cr.s;
      for (let k = 0; k < 3; k++) {
        const y0 = hz - h * (k / 3), y1 = hz - h * ((k + 1) / 3);
        c.beginPath();
        c.moveTo(x - legW / 2, y0);
        c.lineTo(x + legW / 2, y1);
        c.moveTo(x + legW / 2, y0);
        c.lineTo(x - legW / 2, y1);
        c.stroke();
      }
      // boom out over the water (towards the viewer's left) and back
      c.lineWidth = 3.4 * unit * cr.s;
      c.beginPath();
      c.moveTo(x - legW / 2 - boom, hz - h);
      c.lineTo(x + legW / 2 + boom * 0.35, hz - h);
      c.stroke();
      // A-frame and stays
      c.lineWidth = 1.6 * unit * cr.s;
      c.beginPath();
      c.moveTo(x, hz - h - 30 * unit * cr.s);
      c.lineTo(x - legW / 2 - boom, hz - h);
      c.moveTo(x, hz - h - 30 * unit * cr.s);
      c.lineTo(x + legW / 2 + boom * 0.35, hz - h);
      c.moveTo(x - legW / 2, hz - h);
      c.lineTo(x, hz - h - 30 * unit * cr.s);
      c.lineTo(x + legW / 2, hz - h);
      c.stroke();
      // machinery house
      c.fillStyle = "#23274a";
      c.fillRect(x - legW * 0.3, hz - h - 9 * unit * cr.s, legW * 0.6, 9 * unit * cr.s);
    });
    lights.push({ x, y: hz - h - 31 * unit * cr.s, r: 2.2 * unit, color: "#ff4a3d", phase: r() * 6, blink: true });
    lights.push({ x: x - legW / 2 - boom, y: hz - h, r: 1.8 * unit, color: "#ff4a3d", phase: r() * 6, blink: true });
    lights.push({ x: x + legW * 0.2, y: hz - h - 4 * unit, r: 1.4 * unit, color: "#ffe2a8", phase: 0, blink: false });
    // Floodlight beam down from the boom onto the quay.
    const bx = x - legW / 2 - boom * 0.45;
    mid.push((c) => {
      const g = c.createLinearGradient(bx, hz - h, bx, hz);
      g.addColorStop(0, shade("#ffe7b8", 1, 0.22));
      g.addColorStop(1, shade("#ffe7b8", 1, 0));
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(bx - 3 * unit, hz - h);
      c.lineTo(bx + 3 * unit, hz - h);
      c.lineTo(bx + 34 * unit * cr.s, hz);
      c.lineTo(bx - 34 * unit * cr.s, hz);
      c.closePath();
      c.fill();
    });
    lights.push({ x: bx, y: hz - h + 2 * unit, r: 1.8 * unit, color: "#fff1d6", phase: 0, blink: false });
  }

  // Water: dark base with long horizontal strokes, then reflections that move.
  water.push((c) => {
    const g = c.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, "#151a3a");
    g.addColorStop(1, "#070a18");
    c.fillStyle = g;
    c.fillRect(0, hz, W, H - hz);
  });
  const waterDabs = Math.round(160 * (W * (H - hz)) / (900 * 250)) + 60;
  for (let i = 0; i < waterDabs; i++) {
    const y = hz + r() * (H - hz);
    water.push(dab(r, r() * W, y, (60 + r() * 160) * unit, (2 + r() * 4) * unit, shade(r() > 0.5 ? "#26305e" : "#0b0f24", 1, 0.35)));
  }
  // Reflections of lights and cranes, broken into ripples.
  const sources = [...lights.filter((l) => !l.blink).slice(0, 26), ...cranes.map((c) => ({ x: c.x, color: "#ffd08f" }))];
  for (const s of sources) {
    const n = 4 + Math.floor(r() * 6);
    for (let k = 0; k < n; k++) {
      const y = hz + (6 + k * (6 + r() * 10)) * unit;
      if (y > H) break;
      ripples.push({ x: s.x, y, w: (6 + r() * 18) * unit * (1 + k * 0.25), color: s.color, speed: 0.6 + r() * 1.2, phase: r() * 6 });
    }
  }
  for (let i = 0; i < 40; i++) {
    ripples.push({ x: r() * W, y: hz + r() * (H - hz), w: (20 + r() * 60) * unit, color: "#4a5aa0", speed: 0.3 + r() * 0.6, phase: r() * 6 });
  }

  water.push(...ship);
  return { back, mid, water, lights, ripples, cranes, hz, unit };
}

// Pre-rendered glow sprites, one per colour, so lights cost a drawImage per frame, not a gradient.
const glowCache = new Map<string, HTMLCanvasElement>();
function glow(color: string) {
  let g = glowCache.get(color);
  if (!g) {
    g = document.createElement("canvas");
    g.width = g.height = 64;
    const c = g.getContext("2d")!;
    const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, shade(color, 1, 0.6));
    grad.addColorStop(0.18, shade(color, 1, 0.35));
    grad.addColorStop(1, shade(color, 1, 0));
    c.fillStyle = grad;
    c.fillRect(0, 0, 64, 64);
    glowCache.set(color, g);
  }
  return g;
}

// Each painted layer is its own canvas, painted once; parallax moves it with a CSS transform (the
// compositor's job, not the main thread's). Only the thin "fx" canvas (lights, ripples, the moving
// container) redraws, about 30 times a second, and only while the scene is on screen.
const OVERSCAN = 1.05;
const PARALLAX = [4, 10, 3]; // px per unit of pointer offset: back, mid, water

export function PortScene({
  variant = "wide",
  seed = 7,
  className = "",
  children,
}: {
  variant?: SceneVariant;
  seed?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const fxRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = wrap.current;
    const fx = fxRef.current;
    const layerEls = layerRefs.current;
    if (!el || !fx || layerEls.some((l) => !l)) return;
    const fctx = fx.getContext("2d");
    if (!fctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, dpr = 1;
    let scene: ReturnType<typeof compose> | null = null;
    let ctxs: CanvasRenderingContext2D[] = [];
    let painted = 0, total = 0;
    let visible = false, ready = false;
    let raf = 0, last = 0;
    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };

    function setup() {
      const rect = el!.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      ctxs = layerEls.map((cv) => {
        cv!.width = Math.round(W * dpr);
        cv!.height = Math.round(H * dpr);
        const c = cv!.getContext("2d")!;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        return c;
      });
      fx!.width = Math.round(W * dpr);
      fx!.height = Math.round(H * dpr);
      scene = compose(W, H, variant, seed);
      total = scene.back.length + scene.mid.length + scene.water.length;
      painted = 0;
      ready = true;
      if (reduce) paintUpTo(total);
    }

    function paintUpTo(n: number) {
      if (!scene) return;
      const lists = [scene.back, scene.mid, scene.water];
      let i = painted;
      while (i < n) {
        let k = i, li = 0;
        while (li < 3 && k >= lists[li].length) { k -= lists[li].length; li++; }
        if (li >= 3) break;
        lists[li][k](ctxs[li]);
        i++;
      }
      painted = i;
    }

    /** Where a point painted on layer `li` currently appears, after overscan and parallax. */
    const place = (x: number, y: number, li: number) => [
      W / 2 + (x - W / 2) * OVERSCAN + ptr.x * PARALLAX[li],
      H / 2 + (y - H / 2) * OVERSCAN + ptr.y * PARALLAX[li] * 0.5,
    ];

    function frame(t: number) {
      if (!scene) return;
      const time = t / 1000;
      ptr.x += (ptr.tx - ptr.x) * 0.08;
      ptr.y += (ptr.ty - ptr.y) * 0.08;
      layerEls.forEach((cv, i) => {
        cv!.style.transform = `translate3d(${ptr.x * PARALLAX[i]}px, ${ptr.y * PARALLAX[i] * 0.5}px, 0) scale(${OVERSCAN})`;
      });
      const c = fctx!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const fade = painted >= total ? 1 : Math.max(0, painted / total - 0.6) / 0.4;
      if (fade <= 0) return;
      const u = scene.unit;
      c.globalCompositeOperation = "lighter";
      for (const rp of scene.ripples) {
        c.globalAlpha = (0.12 + 0.16 * (0.5 + 0.5 * Math.sin(time * rp.speed * 2 + rp.phase))) * fade;
        const [x, y] = place(rp.x + Math.sin(time * rp.speed + rp.phase) * 3 * u, rp.y, 2);
        c.fillStyle = rp.color;
        c.fillRect(x - rp.w / 2, y, rp.w, Math.max(1, u * 1.2));
      }
      for (const l of scene.lights) {
        const on = l.blink ? (Math.sin(time * 2.4 + l.phase) > 0.2 ? 1 : 0.15) : 0.85 + 0.15 * Math.sin(time * 1.3 + l.phase);
        const [x, y] = place(l.x, l.y, 1);
        const r = l.r * 7;
        c.globalAlpha = on * fade;
        c.drawImage(glow(l.color), x - r, y - r, r * 2, r * 2);
        c.fillStyle = l.color;
        c.fillRect(x - l.r * 0.6, y - l.r * 0.6, l.r * 1.2, l.r * 1.2);
      }
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = fade;
      // One crane moves a container from ship to quay and back.
      for (const cr of scene.cranes) {
        if (!cr.lift) continue;
        const cyc = reduce ? 0.3 : (time / 9) % 1;
        const travel = cyc < 0.5 ? cyc * 2 : 2 - cyc * 2;
        const ease = travel * travel * (3 - 2 * travel);
        const [tx, topY] = place(cr.x - cr.boom * 0.85 + ease * cr.boom * 0.95, cr.base - cr.h, 1);
        const drop = (0.35 + 0.25 * Math.sin(ease * Math.PI)) * cr.h * OVERSCAN;
        c.strokeStyle = "rgba(200,205,230,0.5)";
        c.lineWidth = Math.max(0.6, u * 0.7);
        c.beginPath();
        c.moveTo(tx - 4 * u, topY);
        c.lineTo(tx - 4 * u, topY + drop);
        c.moveTo(tx + 4 * u, topY);
        c.lineTo(tx + 4 * u, topY + drop);
        c.stroke();
        c.fillStyle = "#1a1d33";
        c.fillRect(tx - 9 * u, topY - 3 * u, 18 * u, 4 * u);
        c.fillStyle = shade("#c0533c", 0.8);
        c.fillRect(tx - 15 * u, topY + drop, 30 * u, 11 * u);
        c.fillStyle = shade(HAZE, 1, 0.5);
        c.fillRect(tx - 15 * u, topY + drop, 30 * u, u);
      }
      c.globalAlpha = 1;
    }

    function loop(t: number) {
      raf = 0;
      if (!visible || document.hidden || !ready) return;
      // ~30fps is plenty for a painting.
      if (t - last >= 32) {
        last = t;
        if (painted < total) paintUpTo(Math.min(total, painted + Math.ceil(total / 60)));
        frame(t);
      }
      raf = requestAnimationFrame(loop);
    }
    const kick = () => {
      if (!raf && visible && ready && !document.hidden && !reduce) raf = requestAnimationFrame(loop);
    };

    // Nothing is composed or allocated until the scene is near the screen, and even then only
    // once the browser is idle, so it never competes with the page's first paint.
    let idle = 0;
    const whenIdle = (fn: () => void) => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      idle = ric ? ric(fn, { timeout: 1500 }) : window.setTimeout(fn, 300);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !ready && !idle) {
        whenIdle(() => {
          setup();
          if (reduce) frame(0);
          kick();
        });
        return;
      }
      if (reduce && visible && ready) frame(0);
      kick();
    }, { rootMargin: "200px" });
    io.observe(el);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      if (!ready) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const rect = el.getBoundingClientRect();
        if (Math.abs(rect.width - W) < 2 && Math.abs(rect.height - H) < 2) return;
        setup();
        paintUpTo(total);
        frame(performance.now());
      }, 150);
    });
    ro.observe(el);

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ptr.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      ptr.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    const onLeave = () => { ptr.tx = 0; ptr.ty = 0; };
    if (!reduce) {
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
    }
    document.addEventListener("visibilitychange", kick);

    return () => {
      cancelAnimationFrame(raf);
      const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (cic) cic(idle); else clearTimeout(idle);
      io.disconnect();
      ro.disconnect();
      clearTimeout(resizeTimer);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [variant, seed]);

  return (
    <div ref={wrap} className={`relative isolate overflow-hidden bg-night ${className}`}>
      {[0, 1, 2].map((i) => (
        <canvas
          key={i}
          ref={(c) => {
            layerRefs.current[i] = c;
          }}
          aria-hidden
          className="absolute inset-0 size-full will-change-transform"
          style={{ transform: `scale(${OVERSCAN})` }}
        />
      ))}
      <canvas ref={fxRef} aria-hidden className="absolute inset-0 size-full" />
      {children && <div className="relative h-full">{children}</div>}
    </div>
  );
}
