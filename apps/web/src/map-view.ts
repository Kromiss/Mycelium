import {
  BUDS,
  checkColonize,
  ENRICH,
  growthProgress,
  hashFloat,
  hexKey,
  hexNeighbors,
  hexToPixel,
  networkHops,
  pixelToHex,
  zoneAt,
  ZONES,
  type GameState,
  type Hex,
  type OwnerInfo,
  type SkinId,
  type StructureId,
  type EffectKind,
  type EventDto,
  type EventKind,
  type Terrain,
  LENGTH_SCALE,
} from "@mycelium/shared";
import { mix, ownerColor, ownerDark } from "./colors";
import { Application, Container, Graphics, Text } from "pixi.js";

/** Circumradius of a hex in world pixels. */
const SIZE = 30;
const MIN_ZOOM = 0.08; // M9: the forest is three times as big (TILE_SCALE 15)
const MAX_ZOOM = 3;
/** Pointer travel (px) under which a press counts as a tap. */
const TAP_SLOP = 8;

// "Pastille ronde" art direction (GDD §11, M9): soft cream and pastels, round shapes.
const PAGE = 0xfbf6ee;
const CREAM = 0xfffdf8;
const INK = 0x3b3340;
const ZONE_LINE = 0x2b2430;
/** Ground of each zone, from the rim (zone 1) to the centre (zone 7). */
const ZONE_RIM = 0xf6eee2;
const ZONE_CENTRE = 0xe0c7ae;

/** Wild tiles are pastel bubbles. */
const TERRAIN_COLORS: Record<Terrain, number> = {
  litter: 0xf4e4b8,
  humus: 0xe2cdb0,
  deadwood: 0xcfae8c,
  wetland: 0xc3e1f2,
  stump: 0xb98e6c,
  roots: 0xc6ddaf,
  rock: 0xd6d1cb,
  carcass: 0xeec0b8,
  tree: 0xa7c58f,
  ruin: 0xcdc4b6,
  rubble: 0xdcd4c8,
};

/** M7: allies get a white rim, a traitor's network ("Réseau tâché") a rust one. */
const ALLY_RIM = 0xffffff;
const TAINT_RIM = 0xd4553a;

/** Event zones on the map (GDD §7). */
const EVENT_COLORS: Record<EventKind, number> = {
  storm: 0x5f9fe0,
  fire: 0xf07a3a,
  boar: 0xa9794a,
  treefall: 0xb88a4a,
  carcass: 0xd85a5a,
  nematodes: 0xa8b030,
  tree: 0x5f9e4a,
};

/** Marks of the timed tile effects (GDD §6.2); the cut is a white bar across the tile. */
const EFFECT_COLORS: Record<EffectKind, number> = {
  assault: 0xe64d43,
  toxin: 0x6fbc46,
  cut: 0xffffff,
  siphon: 0x3796e0,
  storm: 0x78bcf1,
  ashes: 0x8a8580,
};
const WITHER = 0xe64d43;
/** Bourgeons (M8): a small pale yellow star. */
const BUD = 0xfff3b0;
const BUD_EDGE = 0xc9a640;
/** Tap radius around a bud, in world pixels. */
const BUD_TAP = SIZE * 0.55;

/** Canvas rendering of the hex map with pan / zoom ("Pastille ronde", GDD §11). */
export class MapView {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly groundLayer = new Graphics();
  private readonly networkLayer = new Graphics();
  private readonly frontierLayer = new Graphics();
  private readonly fxLayer = new Graphics();
  private readonly queueLabels = new Container();
  /** Screen-space layer (not zoomed): the pointer toward an off-screen Cœur. */
  private readonly overlay = new Graphics();
  /** Screen position of the off-screen Cœur pointer, if shown (tapping it goes back home). */
  private heartPointer: { x: number; y: number } | null = null;

  private game: GameState | null = null;
  private owners = new Map<string, OwnerInfo>();
  private terrainSignature = "";
  private networkSignature = "";
  /** Zone borders (and the forest's outline): one hex side each, with the tiles on both sides. */
  private zoneEdges: Array<{ edge: number[]; a: string; b: string | null }> = [];
  private selected: Hex | null = null;
  /** Tiles to outline, e.g. those a fruiting would release. */
  private highlighted: Set<string> | null = null;
  private events: EventDto[] = [];
  private now: () => number = Date.now;
  private onSelect: (h: Hex | null) => void = () => {};
  private onBudTap: (h: Hex) => void = () => {};

  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; moved: boolean } | null = null;
  private pinchDistance = 0;

  async init(host: HTMLElement, now: () => number, onSelect: (h: Hex | null) => void): Promise<void> {
    this.now = now;
    this.onSelect = onSelect;
    await this.app.init({
      resizeTo: host,
      background: PAGE,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    host.appendChild(this.app.canvas);
    this.world.addChild(this.groundLayer, this.networkLayer, this.frontierLayer, this.fxLayer, this.queueLabels);
    this.app.stage.addChild(this.world, this.overlay);
    this.app.ticker.add(() => this.frame());
    this.bindInput(this.app.canvas);
  }

  setGame(game: GameState, owners: OwnerInfo[] = []): void {
    const first = this.game === null;
    if (this.game && this.game.id !== game.id) {
      // Another colony (admin tools: playing in or watching a test forest): start again.
      this.terrainSignature = "";
      this.networkSignature = "";
      this.owners.clear();
    }
    this.game = game;
    for (const o of owners) this.owners.set(o.id, o);
    this.refreshNetwork();
    if (first) this.home();
  }

  /** Redraws what changed: the ground (terrains, zones), and the colonies (tiles, levels, the Cœur, the queue). */
  refreshNetwork(): void {
    const game = this.game;
    if (!game) return;
    const tiles = [...game.tiles.values()];
    const terrain = `${game.radius}:${tiles.length}:` + tiles.map((t) => `${t.q},${t.r}${t.terrain}`).join("");
    if (terrain !== this.terrainSignature) {
      this.terrainSignature = terrain;
      this.drawGround(game);
    }
    const signature = [
      [...this.owners.values()].map((o) => `${o.id}${o.color}${o.ally ? "a" : ""}${o.tainted ? "t" : ""}${o.rewardColor ?? ""}${o.skin ?? ""}`).join(","),
      hexKey(game.heart),
      game.queue.map(hexKey).join("|"),
      tiles
        .filter((t) => t.owner !== null || t.structure !== null)
        .map((t) => `${hexKey(t)}${t.owner ?? ""}${t.structure ?? ""}${t.growthEndsAt === null ? "" : "g"}${t.disconnectedSince === null ? "" : "x"}l${t.level}`)
        .join(";"),
    ].join("#");
    if (signature === this.networkSignature) return;
    this.networkSignature = signature;
    this.drawNetwork(game);
  }

  /** M8: what to do when the player taps one of their buds. */
  onBud(handler: (h: Hex) => void): void {
    this.onBudTap = handler;
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
    const fit = Math.min(width, height) / (SIZE * 2 * 11 * LENGTH_SCALE);
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

  /** The ground: each zone a little darker toward the centre, and a bubble on every wild tile. */
  private drawGround(game: GameState): void {
    const g = this.groundLayer.clear();
    const zoneOfTile = (h: Hex) => zoneAt(game.layout, game.radius, h);
    for (const tile of game.tiles.values()) {
      const { x, y } = hexToPixel(tile, SIZE);
      g.poly(hexPoints(x, y, SIZE + 0.5)).fill({ color: zoneTint(zoneOfTile(tile)) });
    }
    for (const tile of game.tiles.values()) {
      const { x, y } = hexToPixel(tile, SIZE);
      this.drawBubble(g, game.seed, tile, x, y);
    }
    // Zone borders, and the forest's outline: kept to be drawn above the colonies (faded on them).
    this.zoneEdges = [];
    if (game.layout.kind === "solo") return;
    for (const tile of game.tiles.values()) {
      const c = hexToPixel(tile, SIZE);
      const zone = zoneOfTile(tile);
      const key = hexKey(tile);
      for (const n of hexNeighbors(tile)) {
        const nk = hexKey(n);
        const other = game.tiles.get(nk);
        if (other && (zoneOfTile(other) === zone || nk < key)) continue;
        this.zoneEdges.push({ edge: hexEdge(c, hexToPixel(n, SIZE), SIZE), a: key, b: other ? nk : null });
      }
    }
  }

  /** A wild tile: a round pastel bubble, with a small mark for the terrains that need one. */
  private drawBubble(g: Graphics, seed: number, tile: Hex & { terrain: Terrain }, x: number, y: number): void {
    const rnd = (i: number) => hashFloat(seed, 23, tile.q, tile.r, i);
    const color = TERRAIN_COLORS[tile.terrain];
    const r = SIZE * (tile.terrain === "tree" ? 0.82 : 0.68);
    g.circle(x, y, r).fill({ color });
    switch (tile.terrain) {
      case "stump":
        g.circle(x, y, r * 0.5).stroke({ width: 2.2, color: mix(color, 0x000000, 0.25) });
        break;
      case "roots":
        for (let i = 0; i < 3; i++) {
          const a = rnd(i) * Math.PI * 2;
          const len = r * 0.75;
          g.moveTo(x, y)
            .quadraticCurveTo(x + Math.cos(a + 0.5) * len * 0.5, y + Math.sin(a + 0.5) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len)
            .stroke({ width: 2.2, color: 0xffffff, alpha: 0.95, cap: "round" });
        }
        break;
      case "wetland":
        g.moveTo(x - r * 0.5, y + 1)
          .quadraticCurveTo(x - r * 0.25, y - r * 0.25, x, y + 1)
          .quadraticCurveTo(x + r * 0.25, y + r * 0.27, x + r * 0.5, y + 1)
          .stroke({ width: 2.4, color: 0xffffff, cap: "round" });
        break;
      case "deadwood": {
        const a = rnd(0) * Math.PI;
        const dx = Math.cos(a) * r * 0.5;
        const dy = Math.sin(a) * r * 0.5;
        g.moveTo(x - dx, y - dy).lineTo(x + dx, y + dy).stroke({ width: 3, color: mix(color, 0x000000, 0.18), cap: "round" });
        break;
      }
      case "carcass":
        for (const dy of [-0.28, 0, 0.28]) g.moveTo(x - r * 0.4, y + dy * r).lineTo(x + r * 0.4, y + dy * r).stroke({ width: 2, color: 0xffffff, cap: "round" });
        break;
      case "tree":
        for (const k of [0.62, 0.36]) g.circle(x, y, r * k).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
        break;
      case "ruin":
        for (const dx of [-0.3, 0, 0.3]) g.roundRect(x + dx * r - 2.5, y - r * 0.35, 5, r * 0.7, 2).fill({ color: 0xffffff, alpha: 0.85 });
        break;
      case "rubble":
        for (let i = 0; i < 3; i++) g.circle(x + (rnd(i) - 0.5) * r, y + (rnd(i + 5) - 0.5) * r, 2.6).fill({ color: mix(color, 0x000000, 0.2) });
        break;
      default:
        break;
    }
  }

  /** The tile's enrichment level (M8, drawn as in GDD §11 M9): 1, 2 or 3 white dots, then a small white mushroom. */
  private drawLevel(g: Graphics, level: number, x: number, y: number, ink: number): void {
    if (level <= 0) return;
    if (level >= ENRICH.milestones[2]!) {
      g.rect(x - 1.8, y - 1, 3.6, 6).fill({ color: 0xffffff });
      g.moveTo(x - 6.5, y).arc(x, y, 6.5, Math.PI, 0).closePath().fill({ color: 0xffffff }).stroke({ width: 1.2, color: ink, alpha: 0.5 });
      return;
    }
    const dots = level >= ENRICH.milestones[1]! ? 3 : level >= ENRICH.milestones[0]! ? 2 : 1;
    for (let i = 0; i < dots; i++) g.circle(x + (i - (dots - 1) / 2) * 7, y, 2.6).fill({ color: 0xffffff, alpha: 0.95 });
  }

  /** A small cream disc with a structure's mark, in the tile's upper-right corner. */
  private drawStructure(g: Graphics, structure: StructureId, x: number, y: number, color: number, skin?: SkinId): void {
    const cx = x + SIZE * 0.42;
    const cy = y - SIZE * 0.4;
    g.circle(cx, cy, 8.5).fill({ color: CREAM }).stroke({ width: 1.5, color, alpha: 0.95 });
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

  /**
   * The colonies: grown tiles of a colony melt into one round patch of its colour (a disc per tile and a
   * thick link between neighbours), outlined in its dark shade; growing tiles are dotted circles.
   */
  private drawNetwork(game: GameState): void {
    const net = this.networkLayer.clear();
    const frontier = this.frontierLayer.clear();
    const me = this.owners.get(game.id);
    const colorOf = (id: string) => (id === game.id ? ownerColor(me) : ownerColor(this.owners.get(id)));
    const darkOf = (id: string) => (id === game.id ? ownerDark(me) : ownerDark(this.owners.get(id)));

    // Grown tiles by colony, and the links between neighbours of a same colony (each pair once).
    const byOwner = new Map<string, { discs: Array<{ x: number; y: number; faded: boolean }>; links: number[][] }>();
    for (const t of game.tiles.values()) {
      if (t.owner === null || t.growthEndsAt !== null) continue;
      const entry = byOwner.get(t.owner) ?? byOwner.set(t.owner, { discs: [], links: [] }).get(t.owner)!;
      const a = hexToPixel(t, SIZE);
      entry.discs.push({ ...a, faded: t.disconnectedSince !== null });
      const key = hexKey(t);
      for (const n of hexNeighbors(t)) {
        const nk = hexKey(n);
        if (nk < key) continue;
        const o = game.tiles.get(nk);
        if (o?.owner !== t.owner || o.growthEndsAt !== null) continue;
        const b = hexToPixel(n, SIZE);
        entry.links.push([a.x, a.y, b.x, b.y]);
      }
    }
    const blob = (discs: Array<{ x: number; y: number }>, links: number[][], grow: number, color: number, alpha = 1) => {
      for (const d of discs) net.circle(d.x, d.y, SIZE * 0.86 + grow);
      if (discs.length) net.fill({ color, alpha });
      for (const [x1, y1, x2, y2] of links) net.moveTo(x1!, y1!).lineTo(x2!, y2!);
      if (links.length) net.stroke({ width: SIZE * 1.3 + grow * 2, color, alpha, cap: "round" });
    };
    // Others first, the player's own colony on top.
    const order = [...byOwner.keys()].sort((a, b) => (a === game.id ? 1 : b === game.id ? -1 : 0));
    for (const id of order) {
      const { discs, links } = byOwner.get(id)!;
      const owner = this.owners.get(id);
      if (owner?.tainted) blob(discs, links, 5, TAINT_RIM);
      else if (owner?.ally) blob(discs, links, 5, ALLY_RIM);
      blob(discs, links, 2, darkOf(id));
      blob(discs, links, 0, colorOf(id));
      // Cut off from the Cœur: paler.
      const faded = discs.filter((d) => d.faded);
      if (faded.length) blob(faded, [], 0.5, CREAM, 0.55);
    }

    // Zone borders above the colonies: sharp on the ground, faded on a colony.
    const owned = (k: string | null) => k !== null && (game.tiles.get(k)?.owner ?? null) !== null;
    for (const faded of [false, true]) {
      let any = false;
      for (const z of this.zoneEdges) {
        if ((owned(z.a) || owned(z.b)) !== faded) continue;
        const [x1, y1, x2, y2] = z.edge;
        net.moveTo(x1!, y1!).lineTo(x2!, y2!);
        any = true;
      }
      if (any) net.stroke({ width: 2.4, color: ZONE_LINE, alpha: faded ? 0.25 : 1, cap: "round" });
    }

    // Levels, structures, growing tiles.
    for (const t of game.tiles.values()) {
      if (t.owner === null) continue;
      const { x, y } = hexToPixel(t, SIZE);
      if (t.growthEndsAt !== null) {
        dottedCircle(net, x, y, SIZE * 0.62, darkOf(t.owner));
        continue;
      }
      if (!(t.owner === game.id && hexKey(t) === hexKey(game.heart))) this.drawLevel(net, t.level, x, y, darkOf(t.owner));
    }
    for (const t of game.tiles.values()) {
      if (t.structure === null || t.owner === null) continue;
      const { x, y } = hexToPixel(t, SIZE);
      this.drawStructure(net, t.structure, x, y, darkOf(t.owner), this.owners.get(t.owner)?.skin);
    }

    // Planned path: numbered cream discs on the queued tiles, dotted links to where they grow from.
    this.queueLabels.removeChildren().forEach((c) => c.destroy());
    const planned = new Set<string>();
    const mine = darkOf(game.id);
    game.queue.forEach((h, i) => {
      const to = hexToPixel(h, SIZE);
      const from = hexNeighbors(h).find((n) => game.tiles.get(hexKey(n))?.owner === game.id || planned.has(hexKey(n)));
      if (from) dotted(net, hexToPixel(from, SIZE), to, mine);
      planned.add(hexKey(h));
      net.circle(to.x, to.y, 10).fill({ color: CREAM }).stroke({ width: 2, color: mine });
      const label = new Text({ text: String(i + 1), style: { fill: INK, fontSize: 11, fontFamily: "Fredoka, Nunito, system-ui, sans-serif", fontWeight: "600" } });
      label.anchor.set(0.5);
      label.position.set(to.x, to.y);
      this.queueLabels.addChild(label);
    });

    // Tiles that can be colonised or planned now: a soft ring in the player's colour.
    const ring = colorOf(game.id);
    for (const t of game.tiles.values()) {
      if (t.owner !== null || !checkColonize(game, t).ok) continue;
      const { x, y } = hexToPixel(t, SIZE);
      frontier.circle(x, y, SIZE * 0.74).stroke({ width: 2.5, color: ring });
    }
    // Hops are not drawn any more, but computing them here keeps the network cache warm for the panel.
    networkHops(game);
  }

  private frame(): void {
    const game = this.game;
    const fx = this.fxLayer.clear();
    if (!game) return;
    const now = this.now();
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 450);
    this.frontierLayer.alpha = 0.35 + 0.4 * pulse;
    const me = this.owners.get(game.id);
    const dark = ownerDark(me);

    // The Cœur: a mushroom in the player's dark shade, with two small eyes, on a cream disc. Bigger when
    // zoomed out, so that it is always easy to find.
    const heart = hexToPixel(game.heart, SIZE);
    const k = Math.max(1, 0.9 / this.world.scale.x);
    const bob = Math.sin(performance.now() / 700) * 0.8 * k;
    drawHeart(fx, heart.x, heart.y + bob, k, dark);
    this.drawHeartPointer(heart, pulse, dark);

    // Growing hyphae: the dotted circle fills up.
    for (const t of game.tiles.values()) {
      if (t.owner !== game.id || t.growthEndsAt === null) continue;
      const progress = growthProgress(t, now, game.upgrades);
      const { x, y } = hexToPixel(t, SIZE);
      const start = -Math.PI / 2;
      const r = SIZE * 0.62;
      fx.moveTo(x + r * Math.cos(start), y + r * Math.sin(start));
      fx.arc(x, y, r, start, start + progress * Math.PI * 2).stroke({ width: 3.5, color: dark, cap: "round" });
    }

    // Border captures (GDD §6.1): a ring of the attacker's colour, as far as they got.
    for (const t of game.tiles.values()) {
      if (!t.capture) continue;
      const { x, y } = hexToPixel(t, SIZE);
      const by = t.capture.by === game.id ? me : this.owners.get(t.capture.by);
      const color = ownerDark(by);
      if (t.owner === game.id) fx.circle(x, y, SIZE * 0.8).fill({ color: WITHER, alpha: 0.08 + 0.14 * pulse });
      const start = -Math.PI / 2;
      const r = SIZE * 0.72;
      fx.circle(x, y, r).stroke({ width: 4, color, alpha: 0.25 });
      fx.moveTo(x + r * Math.cos(start), y + r * Math.sin(start));
      fx.arc(x, y, r, start, start + Math.min(1, t.capture.progress) * Math.PI * 2).stroke({ width: 4, color, alpha: 0.75 + 0.25 * pulse, cap: "round" });
    }

    // Events (GDD §7): announced zones pulse, active ones are tinted.
    for (const e of this.events) {
      const color = EVENT_COLORS[e.kind];
      const active = e.status === "active";
      for (const c of e.cells) {
        const { x, y } = hexToPixel(c, SIZE);
        const shape = fx.circle(x, y, SIZE * 0.8);
        if (active) shape.fill({ color, alpha: 0.14 + 0.06 * pulse });
        shape.stroke({ width: 2, color, alpha: active ? 0.75 : 0.35 + 0.45 * pulse });
      }
      if (e.life !== undefined) {
        // Life bar above the centre of a world boss or of the Nématodes.
        const { x, y } = hexToPixel(e, SIZE);
        const w = SIZE * 2.4;
        fx.roundRect(x - w / 2, y - SIZE * 1.9, w, 7, 3.5).fill({ color: CREAM }).stroke({ width: 1.5, color: INK, alpha: 0.6 });
        fx.roundRect(x - w / 2, y - SIZE * 1.9, w * e.life, 7, 3.5).fill({ color });
      }
    }

    // Active actions (GDD §6.2): a white bar across a cut tile, a small dot per other effect.
    for (const t of game.tiles.values()) {
      if (t.effects.length === 0) continue;
      const active = t.effects.filter((e) => e.until > now);
      if (active.length === 0) continue;
      const { x, y } = hexToPixel(t, SIZE);
      const dots = active.filter((e) => e.kind !== "cut");
      if (dots.length < active.length) {
        fx.moveTo(x - SIZE * 0.6, y + SIZE * 0.35).lineTo(x + SIZE * 0.6, y - SIZE * 0.35).stroke({ width: 7, color: INK, alpha: 0.35, cap: "round" });
        fx.moveTo(x - SIZE * 0.6, y + SIZE * 0.35).lineTo(x + SIZE * 0.6, y - SIZE * 0.35).stroke({ width: 4.5, color: EFFECT_COLORS.cut, cap: "round" });
      }
      dots.forEach((e, i) => {
        const ex = x + (i - (dots.length - 1) / 2) * 9;
        const ey = y + SIZE * 0.55;
        fx.circle(ex, ey, 3.6 + (e.kind === "assault" ? pulse : 0)).fill({ color: EFFECT_COLORS[e.kind] }).stroke({ width: 1.2, color: CREAM });
      });
    }

    // Bourgeons (M8): a small pale yellow star to tap, fading as its time runs out.
    for (const b of game.buds) {
      if (b.until <= now) continue;
      const { x, y } = hexToPixel(b, SIZE);
      const left = Math.min(1, (b.until - now) / BUDS.lifeMs);
      const wobble = Math.sin(performance.now() / 300 + b.q * 1.7 + b.r) * 1.5;
      const s = Math.max(1, 0.7 / this.world.scale.x); // Still easy to spot when zoomed out.
      fx.poly(starPoints(x, y + wobble, (11 + 1.5 * pulse) * s, 5 * s))
        .fill({ color: BUD, alpha: 0.55 + 0.45 * left })
        .stroke({ width: 1.6 * s, color: BUD_EDGE, alpha: 0.9 });
    }

    if (this.highlighted) {
      for (const key of this.highlighted) {
        const tile = game.tiles.get(key);
        if (!tile) continue;
        const { x, y } = hexToPixel(tile, SIZE);
        fx.circle(x, y, SIZE * 0.7).fill({ color: WITHER, alpha: 0.12 + 0.12 * pulse }).stroke({ width: 2, color: WITHER, alpha: 0.8 });
      }
    }

    if (this.selected) {
      const { x, y } = hexToPixel(this.selected, SIZE);
      fx.circle(x, y, SIZE * 0.84).stroke({ width: 3.5, color: CREAM }).circle(x, y, SIZE * 0.84).stroke({ width: 2, color: INK });
    }
  }

  /** When the Cœur is off screen, an arrow on the edge points toward it. */
  private drawHeartPointer(heart: { x: number; y: number }, pulse: number, color: number): void {
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
    const tip = 26 + 2 * pulse;
    o.poly([
      px + Math.cos(a) * tip, py + Math.sin(a) * tip,
      px + Math.cos(a + 0.45) * 17, py + Math.sin(a + 0.45) * 17,
      px + Math.cos(a - 0.45) * 17, py + Math.sin(a - 0.45) * 17,
    ]).fill({ color });
    drawHeart(o, px, py, 0.85, color);
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
    const wx = (sx - this.world.x) / scale;
    const wy = (sy - this.world.y) / scale;
    const now = this.now();
    const bud = this.game.buds.find((b) => {
      if (b.until <= now) return false;
      const p = hexToPixel(b, SIZE);
      return Math.hypot(wx - p.x, wy - p.y) < Math.max(BUD_TAP, 18 / scale);
    });
    if (bud) {
      this.onBudTap({ q: bud.q, r: bud.r });
      return;
    }
    const h = pixelToHex(wx, wy, SIZE);
    const exists = this.game.tiles.has(hexKey(h));
    const same = this.selected && this.selected.q === h.q && this.selected.r === h.r;
    this.onSelect(exists && !same ? h : null);
  }
}

function dotted(g: Graphics, a: { x: number; y: number }, b: { x: number; y: number }, color: number): void {
  const steps = 7;
  for (let i = 0; i < steps; i += 2) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    g.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0).lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
  }
  g.stroke({ width: 2.5, color, alpha: 0.7, cap: "round" });
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

/** A circle in dots: a tile still growing. */
function dottedCircle(g: Graphics, x: number, y: number, r: number, color: number): void {
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.circle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.2);
  }
  g.fill({ color, alpha: 0.85 });
}

/** The Cœur: a mushroom in the colony's dark shade, with two small eyes, on a cream disc. */
function drawHeart(g: Graphics, x: number, y: number, k: number, dark: number): void {
  g.circle(x, y, 15 * k).fill({ color: CREAM }).stroke({ width: 2 * k, color: dark });
  // Stem, then cap.
  g.roundRect(x - 3.5 * k, y - 1 * k, 7 * k, 9 * k, 3 * k).fill({ color: mix(dark, 0xffffff, 0.75) });
  g.moveTo(x - 11 * k, y + 1 * k).arc(x, y + 1 * k, 11 * k, Math.PI, 0).closePath().fill({ color: dark });
  // Two small eyes.
  for (const dx of [-3.6, 3.6]) {
    g.circle(x + dx * k, y - 3 * k, 2.1 * k).fill({ color: 0xffffff });
    g.circle(x + dx * k + 0.5 * k, y - 2.7 * k, 1 * k).fill({ color: INK });
  }
}

/** A five-pointed star. */
function starPoints(x: number, y: number, outer: number, inner: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return pts;
}

/** Ground colour of a zone (1 on the rim to 7 in the centre). */
function zoneTint(zone: number): number {
  return mix(ZONE_RIM, ZONE_CENTRE, (Math.max(1, Math.min(ZONES.count, zone)) - 1) / (ZONES.count - 1));
}
