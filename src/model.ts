import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Effect {
  name: string;
  x: number;
  y: number;
  age: number;
  seed: number;
  tint?: string;
}
export const MINERAL_TINTS = [
  "#c09c7c",
  "#c8b650",
  "#df8c5b",
  "#c4dae0",
  "#5e9ed5",
  "#a9c95a",
  "#bf97d0",
  "#f2a85c",
  "#e86869",
  "#82eddd",
  "#6af0a0",
  "#f189c4",
  "#ffda77",
];
export const BAND_TINTS: Record<C.BandName, string> = {
  topsoil: "#b99576",
  rockbed: "#a1b6ba",
  deepstone: "#9298bd",
  coreshell: "#d58b8e",
};
export interface Assets {
  images: Record<string, ImageBitmap>;
  systems: Record<string, ParticleSystem>;
}
export interface DeepcoreState {
  assets: Assets;
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  hasSave: boolean;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  coreTimer: number | null;
  coreGround: { col: number; row: number } | null;
  camera: { x: number; y: number; lead: number };
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
    drilling: {
      col: number;
      row: number;
      dir: "down" | "left" | "right";
    } | null;
  };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  installed: number;
  noticesFired: Record<C.NoticeHazard, boolean>;
  notice: { hazard: C.NoticeHazard; age: number } | null;
  summary: {
    deepestDepthMeters: number;
    creditsEarned: number;
    elapsedSeconds: number;
    mode: C.Mode;
    componentsInstalled: number;
    deathCause: C.DeathCause | null;
  } | null;
  grid: Cell[];
  accumulator: number;
  drillClock: number;
  hurt: number;
  knockback: number;
  animTime: number;
  shake: number;
  launchTime: number | null;
  effects: Effect[];
  sounds: C.CueName[];
  note: string;
  noteTime: number;
  pointerStarts: Record<number, string>;
  panelIndex: number;
}
export type ReadState = DeepReadonly<DeepcoreState>;
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export const bandAt = (row: number, coreRow: number) =>
  C.BANDS[Math.min(3, Math.floor((4 * (row - 1)) / (coreRow - 1)))];
export const depth = (s: ReadState) =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export const maxFuel = (s: ReadState) => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: ReadState) => C.HULL_TIERS[s.tiers.hull - 1];
export const jet = (s: ReadState) => C.JETPACK_TIERS[s.tiers.jetpack - 1];
export const slots = (s: ReadState) =>
  Object.values(s.cargo).reduce((a, b) => a + (b ?? 0), 0);
export const loadKg = (s: ReadState) =>
  C.MINERALS.reduce((a, m) => a + (s.cargo[m.id] ?? 0) * m.weightKg, 0);
export const cellCol = (s: ReadState) =>
  Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE);
export const cellRow = (s: ReadState) =>
  Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE);
export const minable = (c: DeepReadonly<Cell>) =>
  ["rock", "ore", "material", "gas", "lava"].includes(c.kind);
export function makeCell(kind: C.TileKind, band: C.BandName | null): Cell {
  return {
    kind,
    band,
    ore: null,
    material: null,
    health:
      band && ["rock", "ore", "material", "gas", "lava"].includes(kind)
        ? C.BAND_HEALTH[band]
        : null,
  };
}
export function tile(
  s: ReadState,
  col: number,
  row: number,
): DeepReadonly<Cell> {
  if (row < 1 && col >= 0 && col < C.WORLD_COLS)
    return makeCell("tunnel", null);
  return s.grid[row * C.WORLD_COLS + col] && col >= 0 && col < C.WORLD_COLS
    ? s.grid[row * C.WORLD_COLS + col]
    : makeCell("bedrock", null);
}
export function grounded(s: ReadState): boolean {
  if (s.miner.drilling?.dir === "down") {
    const d = s.miner.drilling,
      cell = tile(s, d.col, d.row),
      support = tile(s, d.col, d.row + 1);
    if (
      minable(cell) &&
      support.kind !== "tunnel" &&
      support.kind !== "lava" &&
      s.miner.y + C.MINER_H >= d.row * C.TILE &&
      s.miner.y + C.MINER_H <= (d.row + 1) * C.TILE
    )
      return true;
  }
  const feet = s.miner.y + C.MINER_H;
  if (Math.abs(feet / C.TILE - Math.round(feet / C.TILE)) > 0.015) return false;
  const row = Math.round(feet / C.TILE);
  return [
    Math.floor((s.miner.x + 1) / C.TILE),
    Math.floor((s.miner.x + C.MINER_W - 1) / C.TILE),
  ].some((c) => tile(s, c, row).kind !== "tunnel");
}
export function copy(s: ReadState): DeepcoreState {
  return {
    ...s,
    assets: s.assets as Assets,
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    camera: { ...s.camera },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    noticesFired: { ...s.noticesFired },
    notice: s.notice ? { ...s.notice } : null,
    summary: s.summary ? { ...s.summary } : null,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    grid: s.grid.slice() as Cell[],
    effects: s.effects.map((e) => ({ ...e })),
    sounds: [...s.sounds],
    pointerStarts: { ...s.pointerStarts },
  };
}
export function put(s: DeepcoreState, col: number, row: number, c: Cell): void {
  s.grid[row * C.WORLD_COLS + col] = c;
}
export function emptyGrid(coreRow: number): Cell[] {
  return Array.from({ length: (coreRow + 1) * C.WORLD_COLS }, (_, i) => {
    const row = Math.floor(i / C.WORLD_COLS),
      col = i % C.WORLD_COLS;
    const kind =
      row === 0
        ? "tunnel"
        : row === coreRow
          ? col === C.CORE_COL
            ? "core"
            : "bedrock"
          : col === 0 || col === C.WORLD_COLS - 1
            ? "bedrock"
            : "tunnel";
    return makeCell(
      kind,
      row > 0 && row < coreRow ? bandAt(row, coreRow) : null,
    );
  });
}
export const BUILDING_RECTS = C.BUILDINGS.map((id, i) => ({
  id,
  x: 120 + i * (280 + C.BUILDING_GAP),
  y: C.SURFACE_Y - 170,
  w: 240,
  h: 170,
}));
export function initial(
  assets: Assets,
  muted = false,
  hasSave = false,
): DeepcoreState {
  return {
    assets,
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow: C.STANDARD_ROWS,
    menuIndex: 0,
    muted,
    simTime: 0,
    elapsedSeconds: 0,
    hasSave,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    coreTimer: null,
    coreGround: null,
    camera: { x: 0, y: C.SURFACE_Y - C.MINER_H / 2 - C.VIEW_H / 2, lead: 0 },
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      drilling: null,
    },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: {
      fuel: 1,
      drill: 1,
      cargo: 1,
      hull: 1,
      jetpack: 1,
      radiator: 1,
      scanner: 1,
    },
    items: {
      dynamite: 0,
      "plastic-explosives": 0,
      "quantum-teleporter": 0,
      "matter-transmitter": 0,
      nanobots: 0,
      "emergency-fuel": 0,
    },
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    installed: 0,
    noticesFired: { gas: false, lava: false },
    notice: null,
    summary: null,
    grid: emptyGrid(C.STANDARD_ROWS),
    accumulator: 0,
    drillClock: 0,
    hurt: 0,
    knockback: 0,
    animTime: 0,
    shake: 0,
    launchTime: null,
    effects: [],
    sounds: [],
    note: "",
    noteTime: 0,
    pointerStarts: {},
    panelIndex: 0,
  };
}
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function generate(s: DeepcoreState): void {
  s.grid = emptyGrid(s.coreRow);
  for (let row = 1; row < s.coreRow; row++)
    for (let col = 1; col < C.WORLD_COLS - 1; col++)
      put(s, col, row, makeCell("rock", bandAt(row, s.coreRow)));
  const materialPos = C.MATERIALS.map((material, i) => ({
    material,
    col: 2 + Math.floor(Math.random() * (C.WORLD_COLS - 4)),
    row:
      Math.floor((0.29 + i * 0.25 + Math.random() * 0.16) * (s.coreRow - 1)) +
      1,
  }));
  const safe = (col: number, row: number) =>
    col === C.CAVE_MOUTH_COL ||
    materialPos.some(
      (p) =>
        p.row === row &&
        col >= Math.min(p.col, C.CAVE_MOUTH_COL) &&
        col <= Math.max(p.col, C.CAVE_MOUTH_COL),
    ) ||
    (row === s.coreRow - 1 && col >= C.CORE_COL && col <= C.CAVE_MOUTH_COL);
  for (const [bi, band] of C.BANDS.entries()) {
    const cells: number[] = [];
    for (let row = 1; row < s.coreRow; row++)
      if (bandAt(row, s.coreRow) === band)
        for (let col = 1; col < C.WORLD_COLS - 1; col++)
          cells.push(row * C.WORLD_COLS + col);
    const total = cells.length;
    const middle =
      cells.reduce(
        (a, i) => a + (Math.floor(i / C.WORLD_COLS) - 1) / (s.coreRow - 1),
        0,
      ) / total;
    const available = shuffle(
      cells.filter(
        (i) => !safe(i % C.WORLD_COLS, Math.floor(i / C.WORLD_COLS)),
      ),
    );
    const place = (kind: C.TileKind, count: number) => {
      for (let n = 0; n < count && available.length; n++) {
        const i = available.pop()!;
        s.grid[i] = makeCell(kind, band);
      }
    };
    if (bi >= 2) {
      const count = Math.round(
        total *
          (C.LAVA_DENSITY_MIN +
            ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (middle - 0.5)) / 0.5),
      );
      let done = 0;
      while (done < count && available.length) {
        const start = available.pop()!;
        for (const i of [
          start,
          start + 1,
          start + C.WORLD_COLS,
          start + C.WORLD_COLS + 1,
        ]) {
          const row = Math.floor(i / C.WORLD_COLS),
            col = i % C.WORLD_COLS;
          if (
            done < count &&
            col > 0 &&
            col < C.WORLD_COLS - 1 &&
            row < s.coreRow &&
            tile(s, col, row).band === band &&
            tile(s, col, row).kind === "rock" &&
            !safe(col, row)
          ) {
            s.grid[i] = makeCell("lava", band);
            done++;
          }
        }
      }
      for (let n = available.length - 1; n >= 0; n--)
        if (s.grid[available[n]].kind !== "rock") available.splice(n, 1);
    }
    if (bi > 0) {
      place(
        "stone",
        Math.round(
          total *
            (C.STONE_DENSITY_MIN +
              ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (middle - 0.25)) /
                0.75),
        ),
      );
      place(
        "gas",
        Math.round(
          total *
            (C.GAS_DENSITY_MIN +
              ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (middle - 0.25)) /
                0.75),
        ),
      );
    }
    const oreCells = shuffle(
      cells.filter(
        (i) =>
          s.grid[i].kind === "rock" &&
          Math.floor(i / C.WORLD_COLS) >= C.ORE_MIN_ROW,
      ),
    );
    let orePlaced = 0;
    const oreQuota = Math.round(total * C.ORE_DENSITY);
    while (orePlaced < oreQuota && oreCells.length) {
      const i = oreCells.pop()!;
      if (s.grid[i].kind !== "rock") continue;
      const f = (Math.floor(i / C.WORLD_COLS) - 1) / (s.coreRow - 1);
      const weights = C.MINERALS.map(
        (m) => m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
      );
      let draw = Math.random() * weights.reduce((a, b) => a + b, 0);
      let selected = 0;
      while (selected < weights.length - 1 && (draw -= weights[selected]) > 0)
        selected++;
      // A short horizontal seam shares a draw at the same depth, retaining the
      // canonical marginal mineral distribution while forming real veins.
      for (const index of [i, i + 1, i + 2]) {
        if (
          orePlaced >= oreQuota ||
          Math.floor(index / C.WORLD_COLS) !== Math.floor(i / C.WORLD_COLS) ||
          index % C.WORLD_COLS >= C.WORLD_COLS - 1 ||
          s.grid[index].kind !== "rock"
        )
          continue;
        s.grid[index] = {
          ...makeCell("ore", band),
          ore: C.MINERALS[selected].id,
        };
        orePlaced++;
      }
    }
  }
  for (const p of materialPos)
    put(s, p.col, p.row, {
      ...makeCell("material", bandAt(p.row, s.coreRow)),
      material: p.material,
    });
  put(s, C.CAVE_MOUTH_COL, 1, makeCell("tunnel", C.BANDS[0]));
}
export function scanner(s: ReadState) {
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1];
  let closest: {
    target: C.MaterialId;
    dx: number;
    dy: number;
    dist: number;
  } | null = null;
  if (range !== null)
    for (let i = 0; i < s.grid.length; i++) {
      const cell = s.grid[i];
      if (
        cell.kind === "material" &&
        cell.material &&
        !s.satchel[cell.material]
      ) {
        const dx = (i % C.WORLD_COLS) - cellCol(s),
          dy = Math.floor(i / C.WORLD_COLS) - cellRow(s),
          dist = Math.hypot(dx, dy);
        if (dist <= range && (!closest || dist < closest.dist))
          closest = { target: cell.material, dx, dy, dist };
      }
    }
  return closest
    ? {
        locked: true,
        target: closest.target,
        dirX: closest.dx / (closest.dist || 1),
        dirY: closest.dy / (closest.dist || 1),
        distanceTiles: closest.dist,
      }
    : { locked: false, target: null, dirX: 0, dirY: 0, distanceTiles: null };
}
export function snapshot(s: ReadState) {
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      ...s.miner,
      col: cellCol(s),
      row: cellRow(s),
      grounded: grounded(s),
      maxFuel: maxFuel(s),
      maxHull: maxHull(s),
      overloaded: loadKg(s) >= jet(s).liftLimitKg,
      drilling: s.miner.drilling
        ? {
            ...s.miner.drilling,
            progress:
              1 -
              (tile(s, s.miner.drilling.col, s.miner.drilling.row).health ??
                0) /
                C.BAND_HEALTH[
                  tile(s, s.miner.drilling.col, s.miner.drilling.row).band ??
                    "topsoil"
                ],
          }
        : null,
    },
    cargo: {
      slotsUsed: slots(s),
      slotCap: C.CARGO_TIERS[s.tiers.cargo - 1],
      loadKg: loadKg(s),
      liftLimitKg: jet(s).liftLimitKg,
      ore: Object.fromEntries(Object.entries(s.cargo).filter(([, n]) => n > 0)),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? { hazard: s.notice.hazard, shown: s.notice.age >= C.NOTICE_DELAY }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
export function note(s: DeepcoreState, text: string) {
  s.note = text;
  s.noteTime = 3.5;
}
export function effect(
  s: DeepcoreState,
  name: string,
  x = s.miner.x + C.MINER_W / 2,
  y = s.miner.y + C.MINER_H / 2,
  tint?: string,
) {
  s.effects.push({
    name,
    x,
    y,
    age: 0,
    seed: Math.floor(s.simTime * 10000 + s.effects.length * 97),
    tint,
  });
}
export function cue(s: DeepcoreState, name: C.CueName) {
  s.sounds.push(name);
}
