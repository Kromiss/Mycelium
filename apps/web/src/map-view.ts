import {
  checkColonize,
  EXHAUSTION,
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
  type SkinId,
  type StructureId,
  type EffectKind,
  type EventDto,
  type EventKind,
  type Terrain,
} from "@mycelium/shared";
import { ownerColor } from "./colors";
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
  stump: 0x6e4b2b,
  roots: 0x43331f,
  rock: 0x5f5e57,
  acid: 0x4f5a22,
  carcass: 0x6b3a33,
  tree: 0x2c3f1f,
  ruin: 0x55514a,
  rubble: 0x46423b,
};

/** M7: allies get a bright rim, a traitor's network ("Réseau tâché") a rust one. */
const ALLY_RIM = 0xd8ff8a;
const TAINT_RIM = 0xd4553a;

/** Event zones on the map (GDD §7). */
const EVENT_COLORS: Record<EventKind, number> = {
  storm: 0x7fb8ff,
  fire: 0xff8a3c,
  boar: 0xc79a5a,
  treefall: 0xd8b36a,
  carcass: 0xe06a6a,
  nematodes: 0xd6e05a,
  tree: 0x8fe07a,
};

/** Structure marks (GDD §4.1), drawn in a corner of the tile. */
const STRUCTURE_COLORS: Record<StructureId, number> = {
  node: 0xf0c97a,
  gland: 0xc3a6f2,
  reservoir: 0x7cc4dc,
  rhizomorph: 0xe39a5b,
  sclerotium: 0xd9d4bd,
  carpophore: 0xe0704a,
};
/** Marks of the timed tile effects (GDD §6.2). */
const EFFECT_COLORS: Record<EffectKind, number> = {
  assault: 0xff5a3c,
  toxin: 0x9be15d,
  cut: 0xf2efe6,
  siphon: 0x5ac8ff,
  storm: 0x9fd0ff,
  ashes: 0xb7b2a8,
};
const GAP = 0x0c0e0a;
const MYCELIUM = 0xe9f6c8;
const GLOW = 0xc6f36e;
const SELECT = 0xffffff;
const WITHER = 0xe0704a;
const PLAN = 0xf2e6b8;
/** The Cœur's own colour, so it stands apart from the green network. */
const HEART = 0xffd166;
const HEART_CORE = 0xfff4d6;
/** At most this many nutrient particles flow toward the Cœur each frame. */
const MAX_FLOWS = 600;

/** Canvas rendering of the hex map with pan / zoom (GDD §11: filaments that glow). */
export class MapView {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly terrainLayer = new Graphics();
  private readonly networkLayer = new Graphics();
  private readonly frontierLayer = new Graphics();
  private readonly fxLayer = new Graphics();
  private readonly queueLabels = new Container();
  /** Screen-space layer (not zoomed): the pointer toward an off-screen Cœur. */
  private readonly overlay = new Graphics();
  /** Links from each connected tile to the one it sends its nutrients through, toward the Cœur. */
  private flows: Array<{ x1: number; y1: number; x2: number; y2: number; phase: number }> = [];
  /** Screen position of the off-screen Cœur pointer, if shown (tapping it goes back home). */
  private heartPointer: { x: number; y: number } | null = null;

  private game: GameState | null = null;
  private owners = new Map<string, OwnerInfo>();
  private terrainSignature = "";
  private networkSignature = "";
  private selected: Hex | null = null;
  /** Tiles to outline, e.g. those a fruiting would release. */
  private highlighted: Set<string> | null = null;
  private events: EventDto[] = [];
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
    this.app.stage.addChild(this.world, this.overlay);
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
    const terrain = tiles.map((t) => `${hexKey(t)}${t.terrain}`).join("");
    if (terrain !== this.terrainSignature) {
      this.terrainSignature = terrain;
      this.drawTerrain(game);
    }
    const signature = [
      [...this.owners.values()].map((o) => `${o.id}${o.ally ? "a" : ""}${o.tainted ? "t" : ""}${o.rewardColor ?? ""}${o.skin ?? ""}`).join(","),
      hexKey(game.heart),
      game.queue.map(hexKey).join("|"),
      tiles
        .filter((t) => t.owner !== null || t.exhaustion > 0)
        .map((t) => `${hexKey(t)}${t.owner ?? ""}${t.structure ?? ""}${t.growthEndsAt === null ? "" : "g"}${t.disconnectedSince === null ? "" : "x"}${Math.round(t.exhaustion * 20)}`)
        .join(";"),
    ].join("#");
    if (signature === this.networkSignature) return;
    this.networkSignature = signature;
    this.drawNetwork(game);
  }

  select(h: Hex | null): void {
    this.selected = h;
  }

  /** Events announced or under way (GDD §7), drawn as zones. */
  setEvents(events: EventDto[]): void {
    this.events = events;
  }

  highlight(keys: Set<string> | null): void {
    this.highlighted = keys;
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

  /** Moves the view so that `h` is in the middle, keeping the zoom. */
  centerOn(h: Hex): void {
    const { width, height } = this.app.screen;
    const scale = this.world.scale.x;
    const { x, y } = hexToPixel(h, SIZE);
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
    } else if (tile.terrain === "stump") {
      // A cut trunk seen from above: growth rings.
      for (const [r, a] of [[SIZE * 0.52, 1], [SIZE * 0.36, 0.7], [SIZE * 0.2, 0.55]] as const) {
        g.circle(x, y, r).stroke({ width: 2, color: 0x9a6c3e, alpha: a });
      }
      g.circle(x, y, SIZE * 0.52).fill({ color: 0x8a5e35, alpha: 0.35 });
    } else if (tile.terrain === "roots") {
      // Branching roots.
      for (let i = 0; i < 3; i++) {
        const a = rnd(i) * Math.PI * 2;
        const len = SIZE * (0.45 + rnd(i + 10) * 0.25);
        const mx = x + Math.cos(a + 0.4) * len * 0.5;
        const my = y + Math.sin(a + 0.4) * len * 0.5;
        g.moveTo(x, y).quadraticCurveTo(mx, my, x + Math.cos(a) * len, y + Math.sin(a) * len).stroke({ width: 3, color: 0x8a6a42, alpha: 0.85, cap: "round" });
      }
    } else if (tile.terrain === "rock") {
      // A boulder.
      const pts: number[] = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const r = SIZE * (0.42 + rnd(i) * 0.14);
        pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.85);
      }
      g.poly(pts).fill({ color: 0x8c8a80 }).stroke({ width: 1.5, color: 0x3f3e39 });
      g.moveTo(x - SIZE * 0.2, y - SIZE * 0.15).lineTo(x + SIZE * 0.1, y - SIZE * 0.22).stroke({ width: 1.5, color: 0xb2b0a5, alpha: 0.8 });
    } else if (tile.terrain === "carcass") {
      // Ribs.
      for (let i = -1; i <= 1; i++) {
        g.moveTo(x - SIZE * 0.35, y + i * SIZE * 0.22).quadraticCurveTo(x, y + i * SIZE * 0.22 - SIZE * 0.2, x + SIZE * 0.35, y + i * SIZE * 0.22).stroke({ width: 2.5, color: 0xe8dcc8, alpha: 0.85, cap: "round" });
      }
    } else if (tile.terrain === "tree") {
      // A huge trunk, split by rot.
      g.circle(x, y, SIZE * 0.7).fill({ color: 0x4a3524 }).stroke({ width: 3, color: 0x2a1d12 });
      for (const r of [SIZE * 0.5, SIZE * 0.3]) g.circle(x, y, r).stroke({ width: 1.5, color: 0x7a5a3a, alpha: 0.7 });
      g.moveTo(x - SIZE * 0.1, y - SIZE * 0.6).lineTo(x + SIZE * 0.05, y).lineTo(x - SIZE * 0.05, y + SIZE * 0.55).stroke({ width: 2, color: 0x1a120b });
    } else if (tile.terrain === "ruin") {
      // Broken columns of an old stump-temple.
      for (const [dx, h] of [[-0.3, 0.55], [0, 0.8], [0.3, 0.4]] as const) {
        g.rect(x + dx * SIZE - 3, y + SIZE * 0.35 - h * SIZE, 6, h * SIZE).fill({ color: 0xa8a293 }).stroke({ width: 1, color: 0x3c3a33 });
      }
      g.moveTo(x - SIZE * 0.5, y + SIZE * 0.38).lineTo(x + SIZE * 0.5, y + SIZE * 0.38).stroke({ width: 2, color: 0x8a8577 });
    } else if (tile.terrain === "rubble") {
      for (let i = 0; i < 6; i++) {
        const a = rnd(i) * Math.PI * 2;
        const d = rnd(i + 10) * SIZE * 0.55;
        g.rect(x + Math.cos(a) * d - 2.5, y + Math.sin(a) * d - 2, 5, 4).fill({ color: 0x8a8577, alpha: 0.85 });
      }
    } else if (tile.terrain === "acid") {
      // Sour bubbles.
      for (let i = 0; i < 5; i++) {
        const a = rnd(i) * Math.PI * 2;
        const d = rnd(i + 10) * SIZE * 0.6;
        g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.8 + rnd(i + 20) * 2.2).stroke({ width: 1.3, color: 0xc8e04a, alpha: 0.75 });
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const a = rnd(i) * Math.PI * 2;
        const d = rnd(i + 10) * SIZE * 0.65;
        g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.3).fill({ color: 0x54412f, alpha: 0.9 });
      }
    }
  }

  /** A small mark for a structure, in the tile's upper-right corner. */
  private drawStructure(g: Graphics, structure: StructureId, x: number, y: number, skin?: SkinId): void {
    const cx = x + SIZE * 0.38;
    const cy = y - SIZE * 0.36;
    const color = STRUCTURE_COLORS[structure];
    g.circle(cx, cy, 8).fill({ color: 0x111409, alpha: 0.85 }).stroke({ width: 1.5, color, alpha: 0.95 });
    switch (structure) {
      case "node":
        g.circle(cx, cy, 3.5).fill({ color });
        break;
      case "gland":
        g.moveTo(cx, cy - 4.5).quadraticCurveTo(cx + 4.5, cy + 1, cx, cy + 4).quadraticCurveTo(cx - 4.5, cy + 1, cx, cy - 4.5).fill({ color });
        break;
      case "reservoir":
        g.moveTo(cx - 4, cy - 1).quadraticCurveTo(cx, cy - 4, cx + 4, cy - 1).stroke({ width: 1.5, color });
        g.moveTo(cx - 4, cy + 2).quadraticCurveTo(cx, cy - 1, cx + 4, cy + 2).stroke({ width: 1.5, color });
        break;
      case "rhizomorph":
        g.moveTo(cx - 4.5, cy + 3).lineTo(cx + 4.5, cy - 3).stroke({ width: 3, color, cap: "round" });
        break;
      case "sclerotium":
        g.poly(hexPoints(cx, cy, 4.5)).fill({ color });
        break;
      case "carpophore":
        drawCarpophore(g, cx, cy, color, skin);
        break;
    }
  }

  private drawNetwork(game: GameState): void {
    const net = this.networkLayer.clear();
    const frontier = this.frontierLayer.clear();
    const hops = networkHops(game);
    const connected = [...game.tiles.values()].filter((t) => hops.has(hexKey(t)));

    for (const t of game.tiles.values()) {
      const { x, y } = hexToPixel(t, SIZE);
      // Wear darkens the ground, owned or not (it never goes away).
      const wear = t.exhaustion / EXHAUSTION.max;
      if (wear > 0.02) net.poly(hexPoints(x, y, SIZE - 1)).fill({ color: 0x000000, alpha: wear * 0.35 });
      if (t.owner === null) continue;
      if (t.owner !== game.id) {
        // Another player's tile.
        const owner = this.owners.get(t.owner);
        const color = ownerColor(owner);
        net.poly(hexPoints(x, y, SIZE - 1)).fill({ color, alpha: t.disconnectedSince === null ? 0.34 : 0.18 });
        net.poly(hexPoints(x, y, SIZE - 2.5)).stroke({ width: 1, color, alpha: 0.4 });
        if (owner?.ally) net.poly(hexPoints(x, y, SIZE - 5)).stroke({ width: 1.5, color: ALLY_RIM, alpha: 0.65 });
        if (owner?.tainted) net.poly(hexPoints(x, y, SIZE - 5)).stroke({ width: 2.5, color: TAINT_RIM, alpha: 0.85 });
        continue;
      }
      if (t.growthEndsAt !== null) {
        net.poly(hexPoints(x, y, SIZE - 1)).fill({ color: GLOW, alpha: 0.14 });
      } else if (t.disconnectedSince !== null) {
        net.poly(hexPoints(x, y, SIZE - 1)).fill({ color: WITHER, alpha: 0.32 });
        net.poly(hexPoints(x, y, SIZE - 2.5)).stroke({ width: 1.5, color: WITHER, alpha: 0.7 });
      } else {
        // Own tiles read clearly above the terrain; wear only dims them a little.
        net.poly(hexPoints(x, y, SIZE - 1)).fill({ color: GLOW, alpha: 0.36 * (1 - (t.exhaustion / EXHAUSTION.max) * 0.35) });
        net.poly(hexPoints(x, y, SIZE - 2.5)).stroke({ width: 1.2, color: MYCELIUM, alpha: 0.3 });
      }
    }

    // Territory borders: one outline around each colony, only on edges facing another owner.
    const mine: number[][] = [];
    const theirs = new Map<string, number[][]>();
    for (const t of game.tiles.values()) {
      if (t.owner === null) continue;
      const c = hexToPixel(t, SIZE);
      for (const n of hexNeighbors(t)) {
        if (game.tiles.get(hexKey(n))?.owner === t.owner) continue;
        const edge = hexEdge(c, hexToPixel(n, SIZE), SIZE - 1);
        if (t.owner === game.id) mine.push(edge);
        else (theirs.get(t.owner) ?? theirs.set(t.owner, []).get(t.owner)!).push(edge);
      }
    }
    for (const [owner, edges] of theirs) {
      for (const [x1, y1, x2, y2] of edges) net.moveTo(x1!, y1!).lineTo(x2!, y2!);
      net.stroke({ width: 2.5, color: ownerColor(this.owners.get(owner)), alpha: 0.95, cap: "round" });
    }
    for (const [width, alpha, color] of [
      [10, 0.18, GLOW],
      [3.5, 0.95, MYCELIUM],
    ] as const) {
      for (const [x1, y1, x2, y2] of mine) net.moveTo(x1!, y1!).lineTo(x2!, y2!);
      if (mine.length) net.stroke({ width, color, alpha, cap: "round" });
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
      net.circle(x, y, 4).fill({ color: MYCELIUM, alpha: 0.9 - (t.exhaustion / EXHAUSTION.max) * 0.3 });
    }

    // Nutrient flow (GDD §2.4, §11): each connected tile sends toward a neighbour closer to the Cœur.
    this.flows = [];
    for (const t of connected) {
      const d = hops.get(hexKey(t))!;
      if (d === 0 || this.flows.length >= MAX_FLOWS) continue;
      const next = hexNeighbors(t).find((n) => (hops.get(hexKey(n)) ?? Infinity) < d);
      if (!next) continue;
      const a = hexToPixel(t, SIZE);
      const b = hexToPixel(next, SIZE);
      this.flows.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, phase: hashFloat(game.seed, 31, t.q, t.r) });
    }

    // The Cœur's tile: a golden hex that stays visible under everything else.
    const heart = game.tiles.get(hexKey(game.heart));
    if (heart?.owner === game.id) {
      const { x, y } = hexToPixel(heart, SIZE);
      net.poly(hexPoints(x, y, SIZE - 1)).fill({ color: HEART, alpha: 0.28 });
      net.poly(hexPoints(x, y, SIZE - 3)).stroke({ width: 3, color: HEART, alpha: 0.95 });
    }
    for (const t of game.tiles.values()) {
      if (t.structure === null || t.owner === null) continue;
      const { x, y } = hexToPixel(t, SIZE);
      this.drawStructure(net, t.structure, x, y, t.owner ? this.owners.get(t.owner)?.skin : undefined);
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

    // Nutrients: small sparks travelling along the network toward the Cœur.
    const flowT = performance.now() / 1600;
    for (const f of this.flows) {
      const p = (flowT + f.phase) % 1;
      fx.circle(f.x1 + (f.x2 - f.x1) * p, f.y1 + (f.y2 - f.y1) * p, 1.8).fill({ color: HEART_CORE, alpha: 0.85 * Math.sin(p * Math.PI) });
    }

    // Heart: the starting spore, drawn bigger when zoomed out so it is always easy to find.
    const heart = hexToPixel(game.heart, SIZE);
    const k = Math.max(1, 0.9 / this.world.scale.x);
    const wave = (performance.now() / 2400) % 1;
    fx.poly(hexPoints(heart.x, heart.y, SIZE * (0.6 + 1.6 * wave) * k)).stroke({ width: 2.5 * k, color: HEART, alpha: 0.7 * (1 - wave) });
    fx.circle(heart.x, heart.y, (15 + 4 * pulse) * k).fill({ color: HEART, alpha: 0.22 });
    for (let i = 0; i < 6; i++) {
      // Six short hyphae around the bulb.
      const a = (i / 6) * Math.PI * 2 + performance.now() / 6000;
      fx.moveTo(heart.x + Math.cos(a) * 9 * k, heart.y + Math.sin(a) * 9 * k)
        .lineTo(heart.x + Math.cos(a) * (15 + 2 * pulse) * k, heart.y + Math.sin(a) * (15 + 2 * pulse) * k)
        .stroke({ width: 2 * k, color: HEART, alpha: 0.9, cap: "round" });
    }
    fx.circle(heart.x, heart.y, 9 * k).fill({ color: HEART }).stroke({ width: 2 * k, color: 0x3a2a0a, alpha: 0.8 });
    fx.circle(heart.x, heart.y, 4.5 * k).fill({ color: HEART_CORE });
    this.drawHeartPointer(heart, pulse);

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
      const color = mine ? GLOW : t.owner === game.id ? WITHER : ownerColor(this.owners.get(t.capture.by));
      const start = -Math.PI / 2;
      const r = SIZE * 0.72;
      fx.moveTo(x + r * Math.cos(start), y + r * Math.sin(start));
      fx.arc(x, y, r, start, start + Math.min(1, t.capture.progress) * Math.PI * 2).stroke({ width: 4, color, alpha: 0.6 + 0.4 * pulse });
    }

    // Events (GDD §7): announced zones pulse, active ones are tinted.
    for (const e of this.events) {
      const color = EVENT_COLORS[e.kind];
      const active = e.status === "active";
      for (const c of e.cells) {
        const { x, y } = hexToPixel(c, SIZE);
        const poly = fx.poly(hexPoints(x, y, SIZE - 4));
        if (active) poly.fill({ color, alpha: 0.12 + 0.06 * pulse });
        poly.stroke({ width: 2, color, alpha: active ? 0.7 : 0.35 + 0.45 * pulse });
      }
      if (e.life !== undefined) {
        // Life bar above the centre of a world boss or of the Nématodes.
        const { x, y } = hexToPixel(e, SIZE);
        const w = SIZE * 2.4;
        fx.rect(x - w / 2, y - SIZE * 1.9, w, 6).fill({ color: 0x111409, alpha: 0.85 });
        fx.rect(x - w / 2, y - SIZE * 1.9, w * e.life, 6).fill({ color, alpha: 0.95 });
      }
    }

    // Active actions (GDD §6.2): one small mark per effect along the bottom of the tile.
    for (const t of game.tiles.values()) {
      const active = t.effects.filter((e) => e.until > now);
      if (active.length === 0) continue;
      const { x, y } = hexToPixel(t, SIZE);
      active.forEach((e, i) => {
        const ex = x + (i - (active.length - 1) / 2) * 9;
        const ey = y + SIZE * 0.52;
        const color = EFFECT_COLORS[e.kind];
        if (e.kind === "cut") {
          fx.moveTo(ex - 4, ey - 4).lineTo(ex + 4, ey + 4).moveTo(ex + 4, ey - 4).lineTo(ex - 4, ey + 4).stroke({ width: 2.5, color, alpha: 0.95 });
        } else {
          fx.circle(ex, ey, 3.5 + (e.kind === "assault" ? pulse : 0)).fill({ color, alpha: 0.95 });
        }
      });
    }

    if (this.highlighted) {
      for (const k of this.highlighted) {
        const tile = game.tiles.get(k);
        if (!tile) continue;
        const { x, y } = hexToPixel(tile, SIZE);
        fx.poly(hexPoints(x, y, SIZE - 3)).fill({ color: WITHER, alpha: 0.12 + 0.12 * pulse }).stroke({ width: 2, color: WITHER, alpha: 0.8 });
      }
    }

    if (this.selected) {
      const { x, y } = hexToPixel(this.selected, SIZE);
      fx.poly(hexPoints(x, y, SIZE - 1.5)).stroke({ width: 3, color: SELECT, alpha: 0.95 });
    }
  }

  /** When the Cœur is off screen, a golden arrow on the edge points toward it. */
  private drawHeartPointer(heart: { x: number; y: number }, pulse: number): void {
    const o = this.overlay.clear();
    const { width, height } = this.app.screen;
    const sx = this.world.x + heart.x * this.world.scale.x;
    const sy = this.world.y + heart.y * this.world.scale.y;
    const margin = 24;
    this.heartPointer = null;
    if (sx >= 0 && sx <= width && sy >= 0 && sy <= height) return;
    const cx = width / 2;
    const cy = height / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    // Where the line from the centre to the Cœur leaves the screen, pulled in by the margin.
    const t = Math.min((width / 2 - margin) / Math.abs(dx || 1e-6), (height / 2 - margin) / Math.abs(dy || 1e-6));
    const px = cx + dx * t;
    const py = cy + dy * t;
    this.heartPointer = { x: px, y: py };
    const a = Math.atan2(dy, dx);
    o.circle(px, py, 15 + 2 * pulse).fill({ color: 0x111409, alpha: 0.85 }).stroke({ width: 2, color: HEART, alpha: 0.95 });
    o.circle(px, py, 5).fill({ color: HEART });
    const tip = 26 + 2 * pulse;
    o.poly([
      px + Math.cos(a) * tip, py + Math.sin(a) * tip,
      px + Math.cos(a + 0.45) * 17, py + Math.sin(a + 0.45) * 17,
      px + Math.cos(a - 0.45) * 17, py + Math.sin(a - 0.45) * 17,
    ]).fill({ color: HEART });
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
    if (this.heartPointer && Math.hypot(sx - this.heartPointer.x, sy - this.heartPointer.y) < 30) {
      this.centerOn(this.game.heart);
      return;
    }
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

/** The side of the hex centred on `c` that faces the neighbour centred on `n`, as [x1, y1, x2, y2]. */
function hexEdge(c: { x: number; y: number }, n: { x: number; y: number }, radius: number): number[] {
  const a = Math.atan2(n.y - c.y, n.x - c.x);
  const s = Math.PI / 6;
  return [c.x + radius * Math.cos(a - s), c.y + radius * Math.sin(a - s), c.x + radius * Math.cos(a + s), c.y + radius * Math.sin(a + s)];
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

/** The Carpophore mark, in the skin its owner shows (M7 rewards). */
function drawCarpophore(g: Graphics, cx: number, cy: number, color: number, skin: SkinId | undefined): void {
  switch (skin) {
    case "morel":
      // A honeycombed cone.
      g.rect(cx - 1.2, cy + 1.5, 2.4, 3).fill({ color: 0xf2e6b8 });
      g.poly([cx, cy - 5.5, cx + 3.5, cy + 2, cx - 3.5, cy + 2]).fill({ color: 0xb08850 });
      for (const dy of [-1.5, 0.5]) g.circle(cx, cy + dy, 0.9).fill({ color: 0x5a4020 });
      break;
    case "coprinus":
      // A tall shaggy bell.
      g.rect(cx - 1, cy + 2, 2, 3).fill({ color: 0xf2e6b8 });
      g.roundRect(cx - 2.8, cy - 5.5, 5.6, 8, 2.5).fill({ color: 0xe8e2d4 });
      g.moveTo(cx - 2.8, cy + 2.5).lineTo(cx + 2.8, cy + 2.5).stroke({ width: 1.2, color: 0x2a2620 });
      break;
    case "clavaria":
      // Coral branches.
      for (const a of [-0.6, 0, 0.6]) g.moveTo(cx, cy + 4.5).lineTo(cx + Math.sin(a) * 5, cy - 4 + Math.abs(a) * 2).stroke({ width: 1.8, color: 0xf0a878, cap: "round" });
      break;
    case "amanita":
      // Red cap, white dots.
      g.rect(cx - 1.2, cy - 0.5, 2.4, 4.5).fill({ color: 0xf2e6b8 });
      g.moveTo(cx - 5, cy).arc(cx, cy, 5, Math.PI, 0).closePath().fill({ color: 0xd8402e });
      for (const [dx, dy] of [[-2.2, -1.5], [0.8, -3], [2.6, -1]] as const) g.circle(cx + dx, cy + dy, 0.8).fill({ color: 0xffffff });
      break;
    default:
      g.rect(cx - 1.2, cy - 0.5, 2.4, 4.5).fill({ color: 0xf2e6b8 });
      g.moveTo(cx - 5, cy).arc(cx, cy, 5, Math.PI, 0).closePath().fill({ color });
  }
}
