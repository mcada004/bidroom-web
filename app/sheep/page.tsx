"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SheepState = "walk" | "jump" | "graze";

type Sheep = {
  id: number;
  x: number;
  depth: number;
  size: number;
  speed: number;
  state: SheepState;
  jumpT: number;
  jumpDur: number;
  jumpH: number;
  grazeT: number;
  legPhase: number;
  bobPhase: number;
  headDip: number;
  headDipTarget: number;
  hasJumped: boolean;
  fade: number;
};

type Poof = {
  x: number;
  y: number;
  t: number;
  dur: number;
  scale: number;
  puffs: { a: number; d: number; r: number }[];
};

type Star = { x: number; y: number; r: number; phase: number };

const MIN_SHEEP = 5;
const MAX_SHEEP = 9;

// Scene layout, all as fractions of the canvas height/width.
const HORIZON = 0.5;
const MOON_X = 0.68;
const LAKE_CY = 0.585;
const LAKE_RX = 0.34;
const LAKE_RY = 0.075;
const FENCE_X = 0.52;
const FENCE_H = 0.075;
const FENCE_BASE = 0.835;
const FENCE_TOP = FENCE_BASE - FENCE_H;
const GROUND_NEAR = 0.78;
const GROUND_SPREAD = 0.08;

function groundY(sheep: Sheep, h: number) {
  return h * (GROUND_NEAR + sheep.depth * GROUND_SPREAD);
}

// Height, as a fraction of canvas height, that clears the fence from this
// sheep's own ground line. Keeps every depth clearing the rail by the same
// margin instead of some sheep sailing up over the lake.
function jumpHeightFor(sheep: Sheep) {
  const groundFrac = GROUND_NEAR + sheep.depth * GROUND_SPREAD;
  return Math.max(0.06, groundFrac - FENCE_TOP + 0.045);
}

function jumpOffset(sheep: Sheep, h: number) {
  if (sheep.state !== "jump") return 0;
  const t = sheep.jumpT;
  return -h * sheep.jumpH * 4 * t * (1 - t);
}

function sheepScale(sheep: Sheep, h: number) {
  return (h / 620) * sheep.size * (0.82 + sheep.depth * 0.34);
}

function makeSheep(id: number, w: number, h: number): Sheep {
  const depth = Math.random();
  const size = 0.9 + Math.random() * 0.25;
  return {
    id,
    x: -w * 0.08 - Math.random() * w * 0.14,
    depth,
    size,
    speed: h * (0.055 + Math.random() * 0.03) * (0.82 + depth * 0.34),
    state: "walk",
    jumpT: 0,
    jumpDur: 0.85 + Math.random() * 0.25,
    jumpH: 0,
    grazeT: 0,
    legPhase: Math.random() * Math.PI * 2,
    bobPhase: Math.random() * Math.PI * 2,
    headDip: 0,
    headDipTarget: 0,
    hasJumped: false,
    fade: 0,
  };
}

function makePoof(x: number, y: number, scale: number): Poof {
  const puffs = Array.from({ length: 9 }, (_, i) => ({
    a: (i / 9) * Math.PI * 2 + Math.random() * 0.5,
    d: 14 + Math.random() * 16,
    r: 4 + Math.random() * 6,
  }));
  return { x, y, t: 0, dur: 0.62, scale, puffs };
}

export default function SheepPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheepRef = useRef<Sheep[]>([]);
  const poofsRef = useRef<Poof[]>([]);
  const starsRef = useRef<Star[]>([]);
  const nextIdRef = useRef(1);
  const spawnTimerRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [counted, setCounted] = useState(0);

  // Hit test in canvas coordinates. Returns the front-most sheep under the point.
  const pickSheep = useCallback((px: number, py: number): Sheep | null => {
    const { h } = sizeRef.current;
    const ordered = [...sheepRef.current].sort((a, b) => b.depth - a.depth);
    for (const sheep of ordered) {
      if (sheep.fade < 0.25) continue;
      const scale = sheepScale(sheep, h);
      const yOff = jumpOffset(sheep, h);
      const dx = (px - sheep.x) / scale;
      const dy = (py - (groundY(sheep, h) + yOff)) / scale;
      // Generous ellipse covering body and head, origin at the sheep's feet.
      if ((dx / 32) ** 2 + ((dy + 26) / 26) ** 2 <= 1) return sheep;
    }
    return null;
  }, []);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const hit = pickSheep(px, py);
      if (!hit) return;

      const { h } = sizeRef.current;
      const scale = sheepScale(hit, h);
      const yOff = jumpOffset(hit, h);
      poofsRef.current.push(
        makePoof(hit.x, groundY(hit, h) + yOff - 26 * scale, scale)
      );
      sheepRef.current = sheepRef.current.filter((s) => s.id !== hit.id);
      setCounted((c) => c + 1);
    },
    [pickSheep]
  );

  const handleMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const hit = pickSheep(event.clientX - rect.left, event.clientY - rect.top);
      canvas.style.cursor = hit ? "pointer" : "default";
    },
    [pickSheep]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let last = performance.now();
    let elapsed = 0;

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: rect.width, h: rect.height };
      starsRef.current = Array.from({ length: 70 }, () => ({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height * HORIZON * 0.95,
        r: 0.6 + Math.random() * 1.3,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Seed the meadow so it is never empty on first paint.
    const { w: seedW, h: seedH } = sizeRef.current;
    sheepRef.current = Array.from({ length: MIN_SHEEP }, () => {
      const sheep = makeSheep(nextIdRef.current++, seedW, seedH);
      sheep.x = Math.random() * seedW * 0.85;
      sheep.fade = 1;
      if (sheep.x > seedW * FENCE_X) sheep.hasJumped = true;
      return sheep;
    });

    function update(dt: number) {
      const { w, h } = sizeRef.current;
      const fenceX = w * FENCE_X;

      for (const sheep of sheepRef.current) {
        sheep.fade = Math.min(1, sheep.fade + dt * 1.6);

        if (sheep.state === "jump") {
          sheep.jumpT += dt / sheep.jumpDur;
          sheep.x += sheep.speed * 1.15 * dt;
          if (sheep.jumpT >= 1) {
            sheep.jumpT = 0;
            sheep.state = "walk";
            sheep.hasJumped = true;
          }
          continue;
        }

        if (sheep.state === "graze") {
          sheep.grazeT -= dt;
          sheep.headDipTarget = 1;
          if (sheep.grazeT <= 0) {
            sheep.state = "walk";
            sheep.headDipTarget = 0;
          }
        } else {
          sheep.x += sheep.speed * dt;
          sheep.legPhase += dt * 7;
          sheep.bobPhase += dt * 14;
          sheep.headDipTarget = 0;

          const jumpSpan = sheep.speed * 1.15 * sheep.jumpDur;
          const jumpStart = fenceX - jumpSpan * 0.5;
          const approaching = sheep.x > jumpStart - w * 0.14;

          if (!sheep.hasJumped && sheep.x >= jumpStart) {
            sheep.state = "jump";
            sheep.jumpT = 0;
            sheep.jumpH = jumpHeightFor(sheep);
          } else if (!approaching && Math.random() < dt * 0.11) {
            sheep.state = "graze";
            sheep.grazeT = 1.6 + Math.random() * 2.2;
          }
        }

        sheep.headDip += (sheep.headDipTarget - sheep.headDip) * Math.min(1, dt * 4);
      }

      sheepRef.current = sheepRef.current.filter(
        (s) => s.x < sizeRef.current.w + sizeRef.current.w * 0.12
      );

      // Repopulate on a loose timer so replacement never looks one-for-one.
      spawnTimerRef.current -= dt;
      if (spawnTimerRef.current <= 0) {
        const count = sheepRef.current.length;
        if (count < MAX_SHEEP) {
          const burst = count < MIN_SHEEP && Math.random() < 0.45 ? 2 : 1;
          for (let i = 0; i < burst && sheepRef.current.length < MAX_SHEEP; i++) {
            sheepRef.current.push(makeSheep(nextIdRef.current++, w, h));
          }
        }
        spawnTimerRef.current =
          sheepRef.current.length < MIN_SHEEP
            ? 0.5 + Math.random() * 1.1
            : 1.8 + Math.random() * 3.4;
      }

      for (const poof of poofsRef.current) poof.t += dt;
      poofsRef.current = poofsRef.current.filter((p) => p.t < p.dur);
    }

    function drawSky(w: number, h: number, time: number) {
      if (!ctx) return;
      const sky = ctx.createLinearGradient(0, 0, 0, h * HORIZON);
      sky.addColorStop(0, "#080d20");
      sky.addColorStop(0.55, "#151f42");
      sky.addColorStop(1, "#2c3968");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h * HORIZON + 1);

      for (const star of starsRef.current) {
        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 1.6 + star.phase));
        ctx.fillStyle = `rgba(226,236,255,${twinkle * 0.9})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      const moonX = w * MOON_X;
      const moonY = h * 0.15;
      const moonR = h * 0.055;
      const glow = ctx.createRadialGradient(moonX, moonY, moonR * 0.4, moonX, moonY, moonR * 4);
      glow.addColorStop(0, "rgba(226,232,255,0.34)");
      glow.addColorStop(1, "rgba(226,232,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR * 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f2f0e4";
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(190,196,214,0.5)";
      ctx.beginPath();
      ctx.arc(moonX - moonR * 0.3, moonY - moonR * 0.25, moonR * 0.17, 0, Math.PI * 2);
      ctx.arc(moonX + moonR * 0.28, moonY + moonR * 0.12, moonR * 0.12, 0, Math.PI * 2);
      ctx.arc(moonX - moonR * 0.05, moonY + moonR * 0.42, moonR * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawHills(w: number, h: number) {
      if (!ctx) return;
      const hz = h * HORIZON;

      // Far ridge line.
      ctx.fillStyle = "#171f42";
      ctx.beginPath();
      ctx.moveTo(0, hz);
      ctx.lineTo(0, hz - h * 0.1);
      ctx.quadraticCurveTo(w * 0.16, hz - h * 0.23, w * 0.32, hz - h * 0.07);
      ctx.quadraticCurveTo(w * 0.43, hz - h * 0.15, w * 0.52, hz - h * 0.05);
      ctx.quadraticCurveTo(w * 0.66, hz - h * 0.17, w * 0.79, hz - h * 0.08);
      ctx.quadraticCurveTo(w * 0.9, hz - h * 0.21, w, hz - h * 0.12);
      ctx.lineTo(w, hz);
      ctx.closePath();
      ctx.fill();

      // Valley walls sloping down toward the lake.
      ctx.fillStyle = "#1f2a52";
      ctx.beginPath();
      ctx.moveTo(0, hz - h * 0.07);
      ctx.quadraticCurveTo(w * 0.18, hz - h * 0.03, w * 0.46, hz + h * 0.05);
      ctx.lineTo(0, hz + h * 0.16);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(w, hz - h * 0.09);
      ctx.quadraticCurveTo(w * 0.82, hz - h * 0.04, w * 0.54, hz + h * 0.05);
      ctx.lineTo(w, hz + h * 0.16);
      ctx.closePath();
      ctx.fill();

      // A scatter of pines along the valley walls for texture.
      ctx.fillStyle = "#141c38";
      const pines: [number, number, number][] = [
        [0.06, 0.035, 1], [0.12, 0.02, 0.8], [0.2, 0.045, 1.1], [0.27, 0.028, 0.85],
        [0.35, 0.055, 0.9], [0.68, 0.05, 0.95], [0.76, 0.03, 0.8], [0.84, 0.048, 1.05],
        [0.91, 0.026, 0.85], [0.97, 0.04, 1],
      ];
      for (const [fx, fy, fs] of pines) {
        const px = w * fx;
        const py = hz + h * fy;
        const ph = h * 0.05 * fs;
        ctx.beginPath();
        ctx.moveTo(px, py - ph);
        ctx.lineTo(px + ph * 0.3, py);
        ctx.lineTo(px - ph * 0.3, py);
        ctx.closePath();
        ctx.fill();
      }
    }

    function drawGroundAndLake(w: number, h: number, time: number) {
      if (!ctx) return;
      const hz = h * HORIZON;

      const meadow = ctx.createLinearGradient(0, hz, 0, h);
      meadow.addColorStop(0, "#22402f");
      meadow.addColorStop(0.45, "#1b3325");
      meadow.addColorStop(1, "#101c16");
      ctx.fillStyle = meadow;
      ctx.fillRect(0, hz, w, h - hz);

      const lx = w * 0.5;
      const ly = h * LAKE_CY;
      const rx = w * LAKE_RX;
      const ry = h * LAKE_RY;

      // Soft shoreline so the lake sits into the meadow rather than on top of it.
      ctx.fillStyle = "rgba(104,138,126,0.1)";
      ctx.beginPath();
      ctx.ellipse(lx, ly, rx * 1.03, ry * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();

      const water = ctx.createLinearGradient(0, ly - ry, 0, ly + ry);
      water.addColorStop(0, "#2b4a70");
      water.addColorStop(0.5, "#1d3557");
      water.addColorStop(1, "#152a45");
      ctx.fillStyle = water;
      ctx.beginPath();
      ctx.ellipse(lx, ly, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Moon reflection and ripples, clipped to the water.
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(lx, ly, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();

      // Moon column: a soft glow fading down the water, broken by short dashes.
      const reflectX = w * MOON_X;
      const column = ctx.createLinearGradient(0, ly - ry, 0, ly + ry);
      column.addColorStop(0, "rgba(226,234,255,0.2)");
      column.addColorStop(0.55, "rgba(226,234,255,0.08)");
      column.addColorStop(1, "rgba(226,234,255,0)");
      ctx.fillStyle = column;
      ctx.beginPath();
      ctx.ellipse(reflectX, ly, w * 0.03, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const yy = ly - ry * 0.8 + t * ry * 1.7;
        const wob = Math.sin(time * 1.1 + i * 0.9) * w * 0.008;
        const half = w * (0.022 - t * 0.009);
        ctx.fillStyle = `rgba(236,242,255,${0.24 * (1 - t * 0.8)})`;
        ctx.beginPath();
        ctx.ellipse(reflectX + wob, yy, half, h * 0.0035, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Scattered short ripples, offset per row so they never line up as bands.
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const yy = ly - ry * 0.72 + t * ry * 1.5;
        const drift = Math.sin(time * 0.5 + i * 2.3) * w * 0.03;
        const cx = lx + Math.sin(i * 12.9) * rx * 0.5 + drift;
        const len = rx * (0.1 + ((i * 7) % 5) / 5 * 0.14);
        ctx.strokeStyle = `rgba(168,200,235,${0.07 + 0.04 * Math.sin(time + i)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - len, yy);
        ctx.lineTo(cx + len, yy);
        ctx.stroke();
      }
      ctx.restore();

      // Foreground grass tufts.
      ctx.strokeStyle = "rgba(30,62,44,0.85)";
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 46; i++) {
        const gx = ((i * 97.3) % 100) / 100 * w;
        const gy = h * 0.9 + ((i * 53.7) % 100) / 100 * h * 0.1;
        const gh = h * 0.012 + ((i * 31.1) % 10) / 10 * h * 0.012;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.quadraticCurveTo(gx + gh * 0.35, gy - gh * 0.6, gx + gh * 0.15, gy - gh);
        ctx.stroke();
      }
    }

    function drawFence(w: number, h: number) {
      if (!ctx) return;
      const baseY = h * FENCE_BASE;
      const fenceH = h * FENCE_H;
      const halfW = h * 0.075;
      const x = w * FENCE_X;

      ctx.strokeStyle = "#6b4f36";
      ctx.lineCap = "round";

      ctx.lineWidth = Math.max(3, h * 0.009);
      for (const px of [x - halfW, x + halfW]) {
        ctx.beginPath();
        ctx.moveTo(px, baseY);
        ctx.lineTo(px, baseY - fenceH);
        ctx.stroke();
      }

      ctx.lineWidth = Math.max(2.5, h * 0.007);
      for (const t of [0.35, 0.68, 1]) {
        ctx.beginPath();
        ctx.moveTo(x - halfW - h * 0.006, baseY - fenceH * t);
        ctx.lineTo(x + halfW + h * 0.006, baseY - fenceH * t);
        ctx.stroke();
      }
    }

    function drawSheep(sheep: Sheep, h: number) {
      if (!ctx) return;
      const gy = groundY(sheep, h);
      const scale = sheepScale(sheep, h);

      const yOff = jumpOffset(sheep, h);
      const tilt = sheep.state === "jump" ? (0.5 - sheep.jumpT) * 0.42 : 0;
      const bob = sheep.state === "walk" ? Math.sin(sheep.bobPhase) * 0.7 : 0;

      ctx.save();
      ctx.globalAlpha = sheep.fade;

      // Ground shadow tightens as the sheep lifts off.
      const lift = Math.min(1, -yOff / (h * Math.max(0.06, sheep.jumpH)));
      const shrink = 1 - lift * 0.55;
      ctx.save();
      ctx.translate(sheep.x, gy + 2);
      ctx.scale(scale, scale);
      ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - lift * 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 23 * shrink, 5 * shrink, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.translate(sheep.x, gy + yOff + bob);
      ctx.scale(scale, scale);
      ctx.rotate(tilt);

      // Legs. Origin is at the feet, so legs run from y=-16 to y=0.
      const legs: [number, number][] = [
        [-13, 0],
        [-7, Math.PI],
        [9, Math.PI],
        [14, 0],
      ];
      ctx.strokeStyle = "#3b3f52";
      ctx.lineWidth = 3.4;
      ctx.lineCap = "round";
      for (const [lx, phase] of legs) {
        let angle: number;
        if (sheep.state === "jump") {
          const t = sheep.jumpT;
          const splay = Math.sin(Math.PI * t) * 0.75;
          angle = lx < 0 ? splay : -splay;
        } else if (sheep.state === "graze") {
          angle = 0;
        } else {
          angle = Math.sin(sheep.legPhase + phase) * 0.45;
        }
        ctx.save();
        ctx.translate(lx, -16);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 16);
        ctx.stroke();
        ctx.restore();
      }

      // Fluffy body: one ellipse plus a ring of bumps, filled as a single path.
      ctx.fillStyle = "#f5f2e9";
      ctx.beginPath();
      ctx.ellipse(0, -26, 22, 15, 0, 0, Math.PI * 2);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const bx = Math.cos(a) * 19;
        const by = -26 + Math.sin(a) * 12;
        ctx.moveTo(bx + 7.5, by);
        ctx.arc(bx, by, 7.5, 0, Math.PI * 2);
      }
      ctx.moveTo(-23 + 5, -33);
      ctx.arc(-23, -33, 5, 0, Math.PI * 2);
      ctx.fill();

      // Head, dipping toward the grass while grazing.
      const dip = sheep.headDip;
      ctx.save();
      ctx.translate(23, -32 + dip * 12);
      ctx.rotate(dip * 0.85);
      ctx.fillStyle = "#3b3f52";
      ctx.beginPath();
      ctx.ellipse(0, 0, 8.5, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-4, -8, 4.4, 2.8, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f5f2e9";
      ctx.beginPath();
      ctx.arc(3.4, -1.6, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    }

    function drawPoof(poof: Poof) {
      if (!ctx) return;
      const t = poof.t / poof.dur;
      const ease = 1 - (1 - t) * (1 - t);
      ctx.save();
      ctx.translate(poof.x, poof.y);
      ctx.scale(poof.scale, poof.scale);
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = "#f5f2e9";
      for (const puff of poof.puffs) {
        const d = puff.d * ease;
        ctx.beginPath();
        ctx.arc(Math.cos(puff.a) * d, Math.sin(puff.a) * d - ease * 6, puff.r * (1 - t * 0.55), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function render(time: number) {
      if (!ctx) return;
      const { w, h } = sizeRef.current;
      if (w === 0 || h === 0) return;

      drawSky(w, h, time);
      drawHills(w, h);
      drawGroundAndLake(w, h, time);

      // Sheep that have not jumped are behind the fence; the rest are in front.
      const behind = sheepRef.current
        .filter((s) => !s.hasJumped)
        .sort((a, b) => a.depth - b.depth);
      const front = sheepRef.current
        .filter((s) => s.hasJumped)
        .sort((a, b) => a.depth - b.depth);

      for (const sheep of behind) drawSheep(sheep, h);
      drawFence(w, h);
      for (const sheep of front) drawSheep(sheep, h);
      for (const poof of poofsRef.current) drawPoof(poof);
    }

    function loop(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      update(dt);
      render(elapsed);
      frame = requestAnimationFrame(loop);
    }

    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <main className="page">
      <section className="hero">
        <h1 className="hero-title">Counting Sheep</h1>
        <p className="hero-subtitle">
          A quiet valley, a still lake, and a fence that never runs out of sheep.
          Tap one to send it off to sleep.
        </p>
      </section>

      <section className="stack" style={{ maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
            lineHeight: 0,
          }}
        >
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            onMouseMove={handleMove}
            aria-label="A moonlit valley with a lake where sheep jump over a fence. Click a sheep to count it."
            style={{
              display: "block",
              width: "100%",
              height: "clamp(320px, 58vh, 560px)",
              touchAction: "manipulation",
            }}
          />
        </div>

        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <span className="pill">
            Sheep counted: <strong>{counted}</strong>
          </span>
          <div className="row" style={{ gap: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>
              {counted === 0
                ? "Click a sheep to start counting."
                : counted < 10
                  ? "Keep going…"
                  : "Getting sleepy yet?"}
            </span>
            <button
              className="button secondary"
              type="button"
              onClick={() => setCounted(0)}
              disabled={counted === 0}
            >
              Reset
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
