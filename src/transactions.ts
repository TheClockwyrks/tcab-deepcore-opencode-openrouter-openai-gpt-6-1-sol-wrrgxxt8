import * as C from "./constants";
import {
  type DeepcoreState,
  type ReadState,
  copy,
  initial,
  emptyGrid,
  generate,
  maxFuel,
  maxHull,
  cellCol,
  cellRow,
  makeCell,
  tile,
  put,
  effect,
  cue,
  note,
  jet,
  loadKg,
} from "./model";

const SAVE_KEY = "deepcore.expedition.v1";
export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}
export function clearSave(s: DeepcoreState): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* Storage is optional. */
  }
  s.hasSave = false;
}
export function start(s: ReadState): DeepcoreState {
  const n = initial(s.assets as DeepcoreState["assets"], s.muted);
  n.mode = s.mode;
  n.simTime = s.simTime;
  n.worldSize = s.worldSize;
  n.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[n.worldSize]);
  n.screen = "in-mine";
  clearSave(n);
  generate(n);
  note(n, "Camp 04 · Dig. Sell. Upgrade. Build your way home.");
  return n;
}
export function save(s: DeepcoreState): void {
  if (s.coreTimer !== null) {
    note(s, "Save refused · unstable Core Sample is live");
    return;
  }
  try {
    const { assets: _assets, ...payload } = s;
    void _assets;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...payload, effects: [], sounds: [] }),
    );
    s.hasSave = true;
    note(s, "Expedition saved · return safely, prospector");
  } catch {
    note(s, "Storage unavailable · expedition not saved");
  }
}
export function restore(s: ReadState): DeepcoreState {
  try {
    const payload = JSON.parse(
      localStorage.getItem(SAVE_KEY) ?? "null",
    ) as DeepcoreState | null;
    if (
      !payload ||
      !Array.isArray(payload.grid) ||
      !C.WORLD_SIZES.includes(payload.worldSize)
    )
      return copy(s);
    const n = {
      ...initial(s.assets as DeepcoreState["assets"], s.muted, true),
      ...payload,
      assets: s.assets as DeepcoreState["assets"],
      muted: s.muted,
      simTime: s.simTime,
      hasSave: true,
    };
    n.screen = "in-mine";
    n.panel = null;
    n.menuIndex = 0;
    n.summary = null;
    // A checkpoint should not drop the returning player straight into a shaft
    // they carved beneath their original spawn. Prefer the nearest intact ledge.
    let surfaceCol = C.SPAWN_COL;
    if (tile(n, surfaceCol, 1).kind === "tunnel") {
      const ledges = Array.from(
        { length: C.PLAYABLE_COL_MAX },
        (_, i) => i + C.PLAYABLE_COL_MIN,
      ).filter((col) => tile(n, col, 1).kind !== "tunnel");
      ledges.sort(
        (a, b) => Math.abs(a - C.SPAWN_COL) - Math.abs(b - C.SPAWN_COL),
      );
      surfaceCol = ledges[0] ?? C.SPAWN_COL;
    }
    n.miner = {
      ...n.miner,
      x: surfaceCol * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      state: "idle",
      drilling: null,
    };
    return n;
  } catch {
    return copy(s);
  }
}
export function finish(s: DeepcoreState, cause: C.DeathCause | null): void {
  if (s.summary) return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
  s.screen = cause ? "game-over" : "victory";
  s.panel = null;
  s.menuIndex = 0;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  s.miner.drilling = null;
  if (cause) {
    s.miner.state = cause === "fuel-out" ? "fuel-out" : "hurt";
    s.animTime = 0;
    cue(s, C.CUES.death);
    effect(s, "death-burst");
    if (s.mode === "hardcore") clearSave(s);
  } else clearSave(s);
}
export function continuousDeath(s: DeepcoreState): boolean {
  if (!["in-mine", "paused"].includes(s.screen) || s.launchTime !== null)
    return false;
  if (s.miner.hull <= 0) {
    finish(s, "hull-destroyed");
    return true;
  }
  if (s.miner.fuel <= 0 && s.miner.y + C.MINER_H > C.SURFACE_Y + 0.01) {
    s.miner.state = "fuel-out";
    finish(s, "fuel-out");
    return true;
  }
  return false;
}
export function damage(
  s: DeepcoreState,
  amount: number,
  hazard?: C.NoticeHazard,
): void {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, age: 0 };
  }
}
export function gas(s: DeepcoreState, col: number, row: number): void {
  const x = (col + 0.5) * C.TILE,
    y = (row + 0.5) * C.TILE;
  effect(s, "gas-explosion", x, y);
  cue(s, C.CUES.gasExplosion);
  s.shake = Math.max(s.shake, 1.2);
  const dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y,
    dist = Math.hypot(dx, dy);
  if (dist <= C.GAS_BLAST_TILES * C.TILE) {
    const f = (row - 1) / (s.coreRow - 1);
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) * Math.max(0, f - 0.25)) / 0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.knockback = 0.25;
      s.miner.vx = (dx / (dist || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (dist || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function sell(s: DeepcoreState): void {
  const total = C.MINERALS.reduce(
    (a, m) => a + (s.cargo[m.id] ?? 0) * m.value,
    0,
  );
  s.credits += total;
  s.creditsEarned += total;
  s.cargo = {};
  note(
    s,
    total
      ? `Cargo sold · +${total.toLocaleString()} Credits`
      : "Cargo bay is empty",
  );
  if (total) cue(s, C.CUES.fabricate);
}
export function purchaseResource(
  s: DeepcoreState,
  resource: "fuel" | "hull",
  full: boolean,
): void {
  const max = resource === "fuel" ? maxFuel(s) : maxHull(s),
    price = resource === "fuel" ? C.FUEL_PRICE : C.REPAIR_PRICE,
    increment =
      resource === "fuel" ? C.FUEL_BUY_INCREMENT : C.REPAIR_BUY_INCREMENT;
  const amount = Math.max(
    0,
    Math.min(
      max - s.miner[resource],
      full ? Infinity : increment,
      s.credits / price,
    ),
  );
  if (amount <= 0) {
    note(s, "No purchase · tank full or insufficient Credits");
    return;
  }
  s.credits -= amount * price;
  s.miner[resource] += amount;
  cue(s, C.CUES.fabricate);
  note(
    s,
    resource === "fuel" ? "Jetpack fuel replenished" : "Suit hull repaired",
  );
}
export function buyUpgrade(s: DeepcoreState, track: C.TrackName): void {
  const tier = s.tiers[track];
  if (tier >= C.MAX_TIER[track]) {
    note(s, "Already at maximum tier");
    return;
  }
  const price = C.UPGRADE_PRICES[tier - 1];
  if (s.credits < price) {
    note(s, "Insufficient Credits");
    return;
  }
  const oldFuel = maxFuel(s),
    oldHull = maxHull(s);
  s.credits -= price;
  s.tiers[track]++;
  s.miner.fuel += maxFuel(s) - oldFuel;
  s.miner.hull += maxHull(s) - oldHull;
  cue(s, C.CUES.fabricate);
  note(s, `${track.toUpperCase()} upgraded · tier ${s.tiers[track]}`);
}
export function buyItem(s: DeepcoreState, item: C.ItemId): void {
  const def = C.ITEMS.find((i) => i.id === item)!;
  if (s.credits < def.price) {
    note(s, "Insufficient Credits");
    return;
  }
  s.credits -= def.price;
  s.items[item]++;
  cue(s, C.CUES.fabricate);
  note(s, `${def.name} acquired`);
}
export function jettison(s: DeepcoreState): void {
  if (!s.satchel.coreSample) {
    note(s, "No Core Sample carried");
    return;
  }
  s.satchel.coreSample = false;
  s.coreGround = { col: cellCol(s), row: cellRow(s) };
  note(s, "Core Sample jettisoned · move beyond 3 tiles");
}
export function canFabricate(s: ReadState): boolean {
  const c = C.ROCKET_COMPONENTS[s.installed];
  return (
    !!c &&
    s.credits >= c.credits &&
    (!c.material ||
      (c.material === "core-sample"
        ? s.satchel.coreSample
        : s.satchel[c.material] > 0))
  );
}
export function fabricate(s: DeepcoreState): void {
  const c = C.ROCKET_COMPONENTS[s.installed];
  if (!c || !canFabricate(s)) {
    note(s, "Fabrication requires Credits and the listed material");
    return;
  }
  s.credits -= c.credits;
  if (c.material === "core-sample") {
    s.satchel.coreSample = false;
    s.coreTimer = null;
  } else if (c.material) s.satchel[c.material]--;
  s.installed++;
  cue(s, C.CUES.fabricate);
  note(s, `${c.name} installed · ${s.installed}/5`);
}
export function launch(s: DeepcoreState): void {
  if (s.installed < C.ROCKET_COMPONENT_IDS.length) {
    note(s, "Install all five rocket components first");
    return;
  }
  s.launchTime = 0;
  s.screen = "in-mine";
  s.panel = null;
  cue(s, C.CUES.launch);
  effect(s, "launch-exhaust", 1840, C.SURFACE_Y);
  clearSave(s);
}
export function useItem(s: DeepcoreState, item: C.ItemId): void {
  if (s.items[item] <= 0) {
    note(s, "No supply held");
    return;
  }
  if (item === "nanobots" || item === "emergency-fuel") {
    const resource = item === "nanobots" ? "hull" : "fuel",
      maximum = resource === "hull" ? maxHull(s) : maxFuel(s);
    if (s.miner[resource] >= maximum) {
      note(s, "Supply not needed");
      return;
    }
    s.miner[resource] = Math.min(
      maximum,
      s.miner[resource] +
        (resource === "hull" ? C.NANOBOT_HULL : C.EMERGENCY_FUEL),
    );
    effect(s, "material-shimmer");
    cue(s, C.CUES.fabricate);
  } else if (item === "quantum-teleporter" || item === "matter-transmitter") {
    if (
      item === "matter-transmitter" &&
      s.miner.x === C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2 &&
      s.miner.y === C.SURFACE_Y - C.MINER_H &&
      s.miner.vx === 0 &&
      s.miner.vy === 0
    ) {
      note(s, "Already at the surface");
      return;
    }
    const height =
        s.nextTeleportHeight ??
        C.TELEPORT_HEIGHT_TILES_MIN +
          Math.random() *
            (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN),
      speed =
        s.nextTeleportSpeed ??
        C.TELEPORT_SPEED_MIN +
          Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN);
    effect(s, "core-extract");
    s.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
    s.miner.y =
      C.SURFACE_Y -
      C.MINER_H -
      (item === "quantum-teleporter" ? height * C.TILE : 0);
    s.miner.vx = 0;
    s.miner.vy = item === "quantum-teleporter" ? speed : 0;
    s.miner.drilling = null;
    if (item === "quantum-teleporter") {
      s.nextTeleportHeight = null;
      s.nextTeleportSpeed = null;
    }
    cue(s, C.CUES.materialChime);
  } else {
    const radius =
        item === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS,
      cx = cellCol(s),
      cy = cellRow(s);
    let changed = false;
    for (let r = cy - radius; r <= cy + radius; r++)
      for (let c = cx - radius; c <= cx + radius; c++) {
        const cell = tile(s, c, r);
        if (
          r > 0 &&
          r < s.coreRow &&
          c > 0 &&
          c < C.WORLD_COLS - 1 &&
          !["bedrock", "core", "material", "tunnel"].includes(cell.kind)
        ) {
          changed = true;
          if (cell.kind === "gas") gas(s, c, r);
          put(s, c, r, makeCell("tunnel", cell.band));
        }
      }
    if (!changed) {
      note(s, "Nothing here to blast");
      return;
    }
    effect(s, "gas-explosion");
    cue(s, C.CUES.gasExplosion);
    s.shake = Math.max(s.shake, 1);
  }
  s.items[item]--;
  note(s, `${C.ITEMS.find((i) => i.id === item)!.name} used`);
  continuousDeath(s);
}
export function resize(s: DeepcoreState, size: C.WorldSize): void {
  const old = s.coreRow,
    next = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
    grid = emptyGrid(next);
  for (let r = 0; r < Math.min(old, next); r++)
    for (let c = 0; c < C.WORLD_COLS; c++)
      grid[r * C.WORLD_COLS + c] = { ...s.grid[r * C.WORLD_COLS + c] };
  s.grid = grid;
  s.coreRow = next;
  s.worldSize = size;
}
export function dropOre(s: DeepcoreState, ore: C.OreId): void {
  if ((s.cargo[ore] ?? 0) > 0) {
    s.cargo[ore]!--;
    if (!s.cargo[ore]) delete s.cargo[ore];
    note(
      s,
      `One ${ore} discarded · ${Math.round(loadKg(s))}/${jet(s).liftLimitKg} kg`,
    );
  } else note(s, "None of that mineral held");
}
