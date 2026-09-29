import {
  checkColonize,
  growthProgress,
  hashFloat,
  hexKey,
  hexNeighbors,
  hexToPixel,
  networkHops,
  pixelToHex,
  type GameState,
  type Hex,
  type OwnerInfo,
  type Terrain,
} from "@mycelium/shared";
import { playerColor } from "./colors";
import { Application, Container, Graphics, Text } from "pixi.js";

/** Circumradius of a hex in world pixels. */
const SIZE = 30;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3;
/** Pointer travel (px) under which a press counts as a tap. */
const TAP_SLOP = 8;

const TERRAIN_COLORS: Record<Terrain, number> = {
  litter: 0x9a6f35,
  humus: 0x3b2c20,
  deadwood: 0x5e4330,
  wetland: 0x234a58,
};
const GAP = 0x0c0e0a;
const MYCELIUM = 0xe9f6c8;
const GLOW = 0xc6f36e;
const SELECT = 0xffffff;
const WITHER = 0xe0704a;
const PLAN = 0xf2e6b8;

/** Canvas rendering of the hex map with pan / zoom (GDD §11: filaments that glow). */
export class MapView {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly terrainLayer = new Graphics();
  private readonly networkLayer = new Graphics();
  private readonly frontierLayer = new Graphics();
  private readonly fxLayer = new Graphics();
  private readonly queueLabels = new Container();

  private game: GameState | null = null;
  private owners = new Map<string, OwnerInfo>();
  private terrainSignature = "";
  private networkSignature = "";
  private selected: Hex | null = null;
  private now: () => number = Date.now;
  private onSelect: (h: Hex | null) => void = () => {};

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; moved: boolean } | null = null;
  private pinchDistance = 0;

  async init(host: HTMLElement, now: () => number, onSelect: (h: Hex | null) => void): Promise<void> {
    this.now = now;
    this.onSelect = onSelect;
    await this.app.init({
      resizeTo: host,
      background: GAP,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    host.appendChild(this.app.canvas);
    this.world.addChild(this.terrainLayer, this.frontierLayer, this.networkLayer, this.fxLayer, this.queueLabels);
    this.app.stage.addChild(this.world);
    this.app.ticker.add(() => this.frame());
    this.bindInput(this.app.canvas);
  }

  setGame(game: GameState, owners: OwnerInfo[] = []): void {
    const first = this.game === null;
    this.game = game;
    for (const o of owners) this.owners.set(o.id, o);
    this.refreshNetwork();
    if (first) this.home();
  }

  /**
   * Redraws what changed: terrain (Dead wood turning into Humus), and the network (colonised
   * tiles, growth, exhaustion by steps of 5 %, disconnections, the Cœur, the queue).
   */
  refreshNetwork(): void {
    const game = this.game;
    if (!game) return;
    const tiles = [...game.tiles.values()];
    const terrain = tiles.map((t) => `${hexKey(t)}${t.terrain[0]}`).join("");
    if (terrain !== this.terrainSignature) {
      this.terrainSignature = terrain;
      this.drawTerrain(game);
    }
    const signature = [
      hexKey(game.heart),
      game.queue.map(hexKey).join("|"),
      tiles
        .filter((t) => t.owner !== null || t.exhaustion > 0)
        .map((t) => `${hexKey(t)}${t.owner ?? ""}${t.growthEndsAt === null ? "" : "g"}${t.disconnectedSince === null ? "" : "x"}${Math.round(t.exhaustion * 20)}`)
        .join(";"),
    ].join("#");
    if (signature === this.networkSignature) return;
    this.networkSignature = signature;
    this.drawNetwork(game);
  }

  select(h: Hex | null): void {
    this.selected = h;
  }

  zoomBy(factor: number): void {
    const { width, height } = this.app.screen;
    this.zoomAt(width / 2, height / 2, factor);
  }

  /** Centers the camera on the Cœur at a comfortable zoom. */
  home(): void {
    if (!this.game) return;
    const { width, height } = this.app.screen;
    const fit = Math.min(width, height) / (SIZE * 2 * 11);
    const scale = clamp(fit, MIN_ZOOM, 1.4);
    const { x, y } = hexToPixel(this.game.heart, SIZE);
    this.world.scale.set(scale);
    this.world.position.set(width / 2 - x * scale, height / 2 - y * scale);
  }

  // -------------------------------------------------------------------------
  // Drawing

  private drawTerrain(game: GameState): void {
    const g = this.terrainLayer.clear();
    if (game.layout.kind === "forest") {
      // The forest beyond sight (GDD §2.1 fog): a dark disc with faint hex hints.
      const r = (game.radius + 0.7) * SIZE * Math.sqrt(3);
      g.circle(0, 0, r).fill({ color: 0x151812 }).stroke({ width: 2, color: 0x2a2f22 });
    }
    for (const tile of game.tiles.values()) {
      const { x, y } = hexToPixel(tile, SIZE);
      const shade = 0.88 + 0.24 * hashFloat(game.seed, 11, tile.q, tile.r);
      g.poly(hexPoints(x, y, SIZE - 1)).fill({ color: scaleColor(TERRAIN_COLORS[tile.terrain], shade) });
      this.drawTexture(g, game.seed, tile, x, y);
    }
  }

  /** Small deterministic details so terrains read at a glance. */
  private drawTexture(g: Graphics, seed: number, tile: Hex & { terrain: Terrain }, x: number, y: number): void {
    const rnd = (i: number) => hashFloat(seed, 23, tile.q, tile.r, i);
    if (tile.terrain === "litter") {
      for (let i = 0; i < 4; i++) {
        const a = rnd(i) * Math.PI * 2;
        const d = rnd(i + 10) * SIZE * 0.6;
        g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, 4, 2).fill({ color: rnd(i + 20) > 0.5 ? 0xc0873a : 0x7d4f22, alpha: 0.8 });
      }
    } else if (tile.terrain === "deadwood") {
      const angle = rnd(0) * Math.PI;
      const dx = Math.cos(angle) * SIZE * 0.55;
      const dy = Math.sin(angle) * SIZE * 0.55;
      g.moveTo(x - dx, y - dy).lineTo(x + dx, y + dy).stroke({ width: 7, color: 0x7a5639, cap: "round" });
      g.moveTo(x - dx * 0.8, y - dy * 0.8).lineTo(x + dx * 0.8, y + dy * 0.8).stroke({ width: 1.5, color: 0x4a3222, alpha: 0.9 });
    } else if (tile.terrain === "wetland") {
      for (let i = 0; i < 3; i++) {
        const cx = x + (rnd(i) - 0.5) * SIZE * 0.9;
        const cy = y + (rnd(i + 10) - 0.5) * SIZE * 0.9;
        const w = 5 + rnd(i + 20) * 6;
        g.moveTo(cx - w, cy).quadraticCurveTo(cx, cy - 3, cx + w, cy).stroke({ width: 1.4, color: 0x8fc3cf, alpha: 0.55 });
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const a = rnd(i) * Math.PI * 2;
        const d = rnd(i + 10) * SIZE * 0.65;
        g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.3).fill({ color: 0x54412f, alpha: 0.9 });
      }
    }
  }

  private drawNetwork(game: GameState): void {
    const net = this.networkLayer.clear();
    const frontier = this.frontierLayer.clear();
    const hops = networkHops(game);
    const connected = [...game.tiles.values()].filter((t) => hops.has(hexKey(t)));

    for (const t of game.tiles.values()) {
      const { x, y } = hexToPixel(t, SIZE);
      // Exhaustion darkens the ground, owned or not (resting tiles recover slowly).
      if (t.exhaustion > 0.01) net.poly(hexPoints(x, y, SIZE - 1)).fill({ color: 0x000000, alpha: t.exhaustion * 0.45 });
      if (t.owner === null) continue;
      if (t.owner !== game.id) {
        // Another player's tile.
        const color = playerColor(this.owners.get(t.owner)?.color ?? 0);
        net.poly(hexPoints(x, y, SIZE - 1)).fill({ color, alpha: t.disconnectedSince === null ? 0.42 : 0.2 });
        net.poly(hexPoints(x, y, SIZE - 2.5)).stroke({ width: 1.5, color, alpha: 0.8 });
        continue;
      }
      if (t.growthEndsAt !== null) {
        net.poly(hexPoints(x, y, SIZE - 1)).fill({ color: GLOW, alpha: 0.07 });
      } else if (t.disconnectedSince !== null) {
        net.poly(hexPoints(x, y, SIZE - 1)).fill({ color: WITHER, alpha: 0.28 });
        net.poly(hexPoints(x, y, SIZE - 2.5)).stroke({ width: 1.5, color: WITHER, alpha: 0.7 });
      } else {
        net.poly(hexPoints(x, y, SIZE - 1)).fill({ color: GLOW, alpha: 0.2 * (1 - t.exhaustion * 0.6) });
        net.poly(hexPoints(x, y, SIZE - 2.5)).stroke({ width: 1.5, color: MYCELIUM, alpha: 0.35 });
      }
    }

    // Filaments between neighbouring connected tiles (each pair once).
    const segments: Array<[number, number, number, number]> = [];
    for (const t of connected) {
      const a = hexToPixel(t, SIZE);
      for (const n of hexNeighbors(t)) {
        if (!hops.has(hexKey(n)) || hexKey(n) < hexKey(t)) continue;
        const b = hexToPixel(n, SIZE);
        segments.push([a.x, a.y, b.x, b.y]);
      }
    }
    for (const [width, alpha, color] of [
      [9, 0.12, GLOW],
      [3.5, 0.55, MYCELIUM],
      [1.2, 1, 0xffffff],
    ] as const) {
      for (const [x1, y1, x2, y2] of segments) net.moveTo(x1, y1).lineTo(x2, y2);
      if (segments.length) net.stroke({ width, color, alpha, cap: "round" });
    }
    for (const t of connected) {
      const { x, y } = hexToPixel(t, SIZE);
      net.circle(x, y, 4).fill({ color: MYCELIUM, alpha: 0.9 - t.exhaustion * 0.5 });
    }

    // Planned path: dotted links from each queued tile to where it will grow from.
    this.queueLabels.removeChildren().forEach((c) => c.destroy());
    const planned = new Set<string>();
    game.queue.forEach((h, i) => {
      const to = hexToPixel(h, SIZE);
      const from = hexNeighbors(h).find((n) => game.tiles.get(hexKey(n))?.owner === game.id || planned.has(hexKey(n)));
      if (from) dotted(net, hexToPixel(from, SIZE), to);
      planned.add(hexKey(h));
      net.poly(hexPoints(to.x, to.y, SIZE - 5)).stroke({ width: 2, color: PLAN, alpha: 0.8 });
      net.circle(to.x, to.y, 9).fill({ color: 0x1b1f15, alpha: 0.85 }).stroke({ width: 1.5, color: PLAN });
      const label = new Text({ text: String(i + 1), style: { fill: PLAN, fontSize: 11, fontFamily: "system-ui, sans-serif", fontWeight: "600" } });
      label.anchor.set(0.5);
      label.position.set(to.x, to.y);
      this.queueLabels.addChild(label);
    });

    // Tiles that can be colonised or planned now.
    for (const t of game.tiles.values()) {
      if (t.owner !== null || !checkColonize(game, t).ok) continue;
      const { x, y } = hexToPixel(t, SIZE);
      frontier.poly(hexPoints(x, y, SIZE - 4)).stroke({ width: 2, color: GLOW, alpha: 0.9 });
    }
  }

  private frame(): void {
    const game = this.game;
    const fx = this.fxLayer.clear();
    if (!game) return;
    const now = this.now();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 450);
    this.frontierLayer.alpha = 0.35 + 0.45 * pulse;

    // Heart: the starting spore.
    const heart = hexToPixel(game.heart, SIZE);
    fx.circle(heart.x, heart.y, 9 + 2 * pulse).fill({ color: GLOW, alpha: 0.25 });
    fx.circle(heart.x, heart.y, 6).fill({ color: 0xf7f0cf });

    // Growing hyphae: a filament creeping from the network to the tile, and a progress ring.
    for (const t of game.tiles.values()) {
      if (t.owner !== game.id || t.growthEndsAt === null) continue;
      const progress = growthProgress(t, now, game.upgrades);
      const to = hexToPixel(t, SIZE);
      const source = hexNeighbors(t)
        .map((n) => game.tiles.get(hexKey(n)))
        .find((n) => n?.owner === game.id && n.growthEndsAt === null);
      if (source) {
        const from = hexToPixel(source, SIZE);
        const x = from.x + (to.x - from.x) * progress;
        const y = from.y + (to.y - from.y) * progress;
        fx.moveTo(from.x, from.y).lineTo(x, y).stroke({ width: 3, color: MYCELIUM, alpha: 0.9, cap: "round" });
        fx.circle(x, y, 3 + pulse).fill({ color: 0xffffff });
      }
      const start = -Math.PI / 2;
      fx.moveTo(to.x + (SIZE * 0.55) * Math.cos(start), to.y + (SIZE * 0.55) * Math.sin(start));
      fx.arc(to.x, to.y, SIZE * 0.55, start, start + progress * Math.PI * 2).stroke({ width: 3, color: GLOW, alpha: 0.95 });
    }

    // Border captures (GDD §6.1): an arc showing how far the neighbour got.
    for (const t of game.tiles.values()) {
      if (!t.capture) continue;
      const { x, y } = hexToPixel(t, SIZE);
      const mine = t.capture.by === game.id;
      const color = mine ? GLOW : t.owner === game.id ? WITHER : playerColor(this.owners.get(t.capture.by)?.color ?? 0);
      const start = -Math.PI / 2;
      const r = SIZE * 0.72;
      fx.moveTo(x + r * Math.cos(start), y + r * Math.sin(start));
      fx.arc(x, y, r, start, start + Math.min(1, t.capture.progress) * Math.PI * 2).stroke({ width: 4, color, alpha: 0.6 + 0.4 * pulse });
    }

    if (this.selected) {
      const { x, y } = hexToPixel(this.selected, SIZE);
      fx.poly(hexPoints(x, y, SIZE - 1.5)).stroke({ width: 3, color: SELECT, alpha: 0.95 });
    }
  }

  // -------------------------------------------------------------------------
  // Input: drag to pan, wheel / pinch / buttons to zoom, tap to select.

  private bindInput(canvas: HTMLCanvasElement): void {
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (this.pointers.size === 1) this.dragStart = { x: e.offsetX, y: e.offsetY, moved: false };
      if (this.pointers.size === 2) {
        this.pinchDistance = this.currentPinchDistance();
        if (this.dragStart) this.dragStart.moved = true;
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const next = { x: e.offsetX, y: e.offsetY };
      this.pointers.set(e.pointerId, next);
      if (this.pointers.size === 2) {
        const d = this.currentPinchDistance();
        const [a, b] = [...this.pointers.values()];
        if (this.pinchDistance > 0 && a && b) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinchDistance);
        this.pinchDistance = d;
        return;
      }
      this.world.position.x += next.x - prev.x;
      this.world.position.y += next.y - prev.y;
      if (this.dragStart && Math.hypot(next.x - this.dragStart.x, next.y - this.dragStart.y) > TAP_SLOP) {
        this.dragStart.moved = true;
      }
    });
    const end = (e: PointerEvent) => {
      if (!this.pointers.delete(e.pointerId)) return;
      if (this.pointers.size === 0) {
        if (this.dragStart && !this.dragStart.moved) this.tap(e.offsetX, e.offsetY);
        this.dragStart = null;
      }
      this.pinchDistance = 0;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", (e) => {
      this.dragStart = null;
      end(e);
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }

  private currentPinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    const old = this.world.scale.x;
    const scale = clamp(old * factor, MIN_ZOOM, MAX_ZOOM);
    const wx = (sx - this.world.x) / old;
    const wy = (sy - this.world.y) / old;
    this.world.scale.set(scale);
    this.world.position.set(sx - wx * scale, sy - wy * scale);
  }

  private tap(sx: number, sy: number): void {
    if (!this.game) return;
    const scale = this.world.scale.x;
    const h = pixelToHex((sx - this.world.x) / scale, (sy - this.world.y) / scale, SIZE);
    const exists = this.game.tiles.has(hexKey(h));
    const same = this.selected && this.selected.q === h.q && this.selected.r === h.r;
    this.onSelect(exists && !same ? h : null);
  }
}

function dotted(g: Graphics, a: { x: number; y: number }, b: { x: number; y: number }): void {
  const steps = 7;
  for (let i = 0; i < steps; i += 2) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    g.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0).lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
  }
  g.stroke({ width: 2, color: PLAN, alpha: 0.7, cap: "round" });
}

function hexPoints(cx: number, cy: number, radius: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
  }
  return pts;
}

function scaleColor(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
