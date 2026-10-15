import * as C from "./constants";
import {
  MINERAL_TINTS,
  BAND_TINTS,
  type DeepcoreState,
  type ReadState,
  tile,
  makeCell,
  put,
  minable,
  grounded,
  clamp,
  cellCol,
  jet,
  loadKg,
  slots,
  depth,
  effect,
  cue,
  note,
} from "./model";
import { continuousDeath, damage, gas, finish } from "./transactions";

export interface Held {
  left: number;
  right: number;
  down: number;
  up: number;
}
const STEP = 1 / 120;
function breakCell(s: DeepcoreState, col: number, row: number): void {
  const cell = tile(s, col, row);
  if (cell.kind === "ore" && cell.ore) {
    if (slots(s) < C.CARGO_TIERS[s.tiers.cargo - 1]) {
      s.cargo[cell.ore] = (s.cargo[cell.ore] ?? 0) + 1;
      cue(s, C.CUES.orePickup);
      effect(
        s,
        "ore-sparkle",
        (col + 0.5) * C.TILE,
        (row + 0.5) * C.TILE,
        MINERAL_TINTS[C.MINERALS.findIndex((m) => m.id === cell.ore)],
      );
    } else note(s, "Cargo full · ore left behind");
  } else if (cell.kind === "material" && cell.material) {
    s.satchel[cell.material]++;
    cue(s, C.CUES.materialChime);
    effect(s, "material-shimmer", (col + 0.5) * C.TILE, (row + 0.5) * C.TILE);
    note(
      s,
      `${cell.material.toUpperCase()} recovered · rocket material secured`,
    );
  } else if (cell.kind === "gas") gas(s, col, row);
  else if (cell.kind === "lava") {
    damage(
      s,
      (cell.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    effect(s, "lava-embers");
    cue(s, C.CUES.lavaSizzle);
  }
  put(s, col, row, makeCell("tunnel", cell.band));
}
function overlapSolid(
  s: ReadState,
  x: number,
  y: number,
): { col: number; row: number }[] {
  const result = [];
  for (
    let r = Math.floor((y + 0.001) / C.TILE);
    r <= Math.floor((y + C.MINER_H - 0.001) / C.TILE);
    r++
  )
    for (
      let c = Math.floor((x + 0.001) / C.TILE);
      c <= Math.floor((x + C.MINER_W - 0.001) / C.TILE);
      c++
    )
      if (tile(s, c, r).kind !== "tunnel") result.push({ col: c, row: r });
  return result;
}
function camera(s: DeepcoreState, dt: number): void {
  const vy = s.miner.vy,
    lead = s.camera.lead,
    target =
      Math.abs(vy) <= C.CAM_STILL_SPEED ? 0 : Math.sign(vy) * C.CAM_LEAD_MAX;
  // Cross zero at the fast unwind rate, then build the opposite lead at normal rate.
  let time = dt,
    current = lead;
  if (
    current !== 0 &&
    (target === 0 || Math.sign(target) !== Math.sign(current))
  ) {
    const rate = (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) * C.CAM_UNWIND_MULT,
      used = Math.min(time, Math.abs(current) / rate);
    current -= Math.sign(current) * rate * used;
    time -= used;
    if (Math.abs(current) < 1e-8) current = 0;
  }
  const rate =
    (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) *
    (Math.abs(target) < Math.abs(current) ? C.CAM_UNWIND_MULT : 1);
  current += clamp(target - current, -rate * time, rate * time);
  s.camera = {
    lead: current,
    x: clamp(s.miner.x + C.MINER_W / 2 - C.VIEW_W / 2, 0, C.WORLD_W - C.VIEW_W),
    y: Math.min(
      s.miner.y + C.MINER_H / 2 - C.VIEW_H / 2 + current,
      (s.coreRow + 1) * C.TILE - C.VIEW_H,
    ),
  };
}
function drill(s: DeepcoreState, h: Held, dt: number): boolean {
  const m = s.miner,
    old = m.drilling;
  const thrust = h.up > 0 && m.fuel > 0;
  let target: typeof old = null;
  const sinking =
    old?.dir === "down" &&
    h.down > 0 &&
    tile(s, old.col, old.row).kind !== "tunnel";
  if (
    m.drill &&
    m.fuel > 0 &&
    !thrust &&
    ((grounded(s) && (!m.travel || Math.abs(m.vy) < 1)) || sinking)
  ) {
    if (h.down > 0) {
      const row = sinking ? old!.row : Math.round((m.y + C.MINER_H) / C.TILE);
      target = { col: cellCol(s), row, dir: "down" };
    } else if (h.left || h.right) {
      const dir = h.right ? "right" : "left",
        col =
          dir === "right"
            ? Math.floor((m.x + C.MINER_W + 0.02) / C.TILE)
            : Math.floor((m.x - 0.02) / C.TILE),
        row = Math.floor((m.y + C.MINER_H / 2) / C.TILE);
      const edge =
        dir === "right"
          ? col * C.TILE - (m.x + C.MINER_W)
          : m.x - (col + 1) * C.TILE;
      if (Math.abs(edge) < 0.1) target = { col, row, dir };
    }
  }
  if (target) {
    const cell = tile(s, target.col, target.row);
    if (
      !minable(cell) &&
      !(cell.kind === "core" && target.dir === "down" && s.coreTimer === null)
    )
      target = null;
  }
  if (!target) {
    if (
      old?.dir === "down" &&
      tile(s, old.col, old.row).kind !== "tunnel" &&
      m.travel &&
      m.y + C.MINER_H > old.row * C.TILE
    )
      m.y = old.row * C.TILE - C.MINER_H;
    m.drilling = null;
    s.drillClock = 0;
    return false;
  }
  if (
    !old ||
    old.col !== target.col ||
    old.row !== target.row ||
    old.dir !== target.dir
  )
    s.drillClock = 0;
  m.drilling = target;
  s.drillClock += dt;
  while (s.drillClock + 1e-9 >= C.DRILL_HIT_INTERVAL && m.fuel > 0) {
    s.drillClock -= C.DRILL_HIT_INTERVAL;
    m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
    const cell = tile(s, target.col, target.row);
    if (cell.kind === "core") {
      s.satchel.coreSample = true;
      s.coreTimer = C.CORE_TIMER;
      effect(
        s,
        "core-extract",
        (target.col + 0.5) * C.TILE,
        target.row * C.TILE,
      );
      cue(s, C.CUES.materialChime);
      note(s, "CORE SAMPLE EXTRACTED · 90 seconds to ignition");
      m.drilling = null;
      return true;
    }
    const health = (cell.health ?? 0) - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
    put(s, target.col, target.row, { ...cell, health: Math.max(0, health) });
    const support = tile(s, target.col, target.row + 1).kind;
    const sink =
      target.dir === "down" && support !== "tunnel" && support !== "lava";
    if (sink && m.travel)
      m.y =
        target.row * C.TILE -
        C.MINER_H +
        C.TILE * (1 - Math.max(0, health) / C.BAND_HEALTH[cell.band!]);
    if (health <= 0) {
      breakCell(s, target.col, target.row);
      m.drilling = null;
      s.drillClock = 0;
      break;
    }
  }
  // Interpolate between hits so a held shaft is a continuous bore.
  if (m.drilling?.dir === "down" && m.travel) {
    const cell = tile(s, target.col, target.row),
      support = tile(s, target.col, target.row + 1).kind;
    if (cell.health !== null && support !== "tunnel" && support !== "lava") {
      const predicted = Math.max(
        0,
        cell.health -
          (C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1] * s.drillClock) /
            C.DRILL_HIT_INTERVAL,
      );
      m.y =
        target.row * C.TILE -
        C.MINER_H +
        C.TILE * (1 - predicted / C.BAND_HEALTH[cell.band!]);
    }
  }
  return true;
}
function step(s: DeepcoreState, h: Held, dt: number): void {
  if (continuousDeath(s)) return;
  const m = s.miner;
  s.hurt = Math.max(0, s.hurt - dt);
  s.knockback = Math.max(0, s.knockback - dt);
  if (s.coreTimer !== null) {
    s.coreTimer -= dt;
    if (s.coreTimer <= 0) {
      const ground = s.coreGround;
      effect(
        s,
        "core-detonation",
        ground ? (ground.col + 0.5) * C.TILE : m.x + C.MINER_W / 2,
        ground ? (ground.row + 0.5) * C.TILE : m.y + C.MINER_H / 2,
      );
      cue(s, C.CUES.gasExplosion);
      s.shake = 2.5;
      const kills =
        s.satchel.coreSample ||
        (!!ground &&
          Math.hypot(
            m.x + C.MINER_W / 2 - (ground.col + 0.5) * C.TILE,
            m.y + C.MINER_H / 2 - (ground.row + 0.5) * C.TILE,
          ) <=
            C.CORE_BLAST_TILES * C.TILE);
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (kills) {
        finish(s, "core-detonation");
        return;
      }
      note(s, "Core Sample detonated · return to the Core for another");
    }
  }
  if (s.panel) {
    continuousDeath(s);
    camera(s, dt);
    return;
  }
  const onGround = grounded(s),
    thrust = h.up > 0 && m.fuel > 0;
  if (h.right) m.facing = "east";
  else if (h.left) m.facing = "west";
  const cutting = drill(s, h, dt),
    load = loadKg(s) / jet(s).liftLimitKg;
  if (m.travel) {
    const lateral = h.right - h.left;
    if (!cutting) {
      const vx = s.knockback > 0 ? m.vx : lateral * C.WALK_SPEED;
      let x = clamp(m.x + vx * dt, C.TILE, C.WORLD_W - C.TILE - C.MINER_W);
      const blocks = overlapSolid(s, x, m.y);
      for (const block of blocks)
        x =
          vx > 0
            ? Math.min(x, block.col * C.TILE - C.MINER_W)
            : vx < 0
              ? Math.max(x, (block.col + 1) * C.TILE)
              : x;
      m.x = x;
      m.vx = vx;
      if (thrust) {
        m.vy = Math.max(
          -jet(s).emptyClimb *
            (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
          m.vy - jet(s).emptyAccel * Math.max(0, 1 - load) * dt,
        );
      } else
        m.vy = Math.min(
          C.FALL_TERMINAL_EMPTY +
            (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) *
              Math.min(1, load),
          m.vy + C.GRAVITY * dt,
        );
      let y = m.y + m.vy * dt;
      const before = m.vy,
        vertical = overlapSolid(s, m.x, y);
      if (vertical.length) {
        for (const block of vertical)
          y =
            before >= 0
              ? Math.min(y, block.row * C.TILE - C.MINER_H)
              : Math.max(y, (block.row + 1) * C.TILE);
        m.vy = 0;
        if (before > C.IMPACT_SAFE_SPEED) {
          const amount = (before - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
          damage(s, amount);
          effect(s, "impact-dust", m.x + C.MINER_W / 2, y + C.MINER_H);
          cue(s, C.CUES.impact);
          s.shake = Math.max(s.shake, Math.min(1.2, amount / 30));
        }
      }
      m.y = y;
    } else {
      if (s.knockback <= 0) {
        m.vx = 0;
        if (m.drilling?.dir === "down") m.vy = 0;
      }
    }
  }
  if (thrust)
    m.fuel -=
      dt *
      (C.THRUST_BURN_MAX +
        (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
          Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
      C.THRUST_BURN_SIZE_MULT[s.worldSize];
  if ((h.left || h.right) && !onGround) m.fuel -= C.AIR_BURN * dt;
  if (m.y + C.MINER_H > C.SURFACE_Y + 0.01) m.fuel -= C.LIFE_SUPPORT_BURN * dt;
  m.fuel = Math.max(0, m.fuel);
  const lava = overlapSolid(s, m.x, m.y).some(
    (p) =>
      tile(s, p.col, p.row).kind === "lava" &&
      !(m.drilling?.col === p.col && m.drilling?.row === p.row),
  );
  if (lava) {
    damage(
      s,
      C.LAVA_CONTACT_DPS * dt * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    if (
      Math.floor(s.elapsedSeconds * 6) !==
      Math.floor((s.elapsedSeconds - dt) * 6)
    ) {
      effect(s, "lava-embers");
      cue(s, C.CUES.lavaSizzle);
    }
  }
  const next: C.MinerState = cutting
    ? m.drilling?.dir === "down" || h.down
      ? "drill-down"
      : "drill-side"
    : s.hurt > 0
      ? "hurt"
      : m.fuel <= 0 && depth(s) > 0
        ? "fuel-out"
        : thrust
          ? "jetpack"
          : !grounded(s)
            ? "fall"
            : h.left || h.right
              ? "walk"
              : "idle";
  if (next !== m.state) {
    m.state = next;
    s.animTime = 0;
  } else s.animTime += dt;
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  camera(s, dt);
  continuousDeath(s);
}
export function advanceSimulation(s: DeepcoreState, h: Held, dt: number): void {
  s.accumulator += dt;
  while (s.accumulator + 1e-10 >= STEP && s.screen === "in-mine") {
    s.accumulator -= STEP;
    s.elapsedSeconds += STEP;
    const previous = s.elapsedSeconds - STEP;
    s.effects = s.effects
      .map((e) => ({ ...e, age: e.age + STEP }))
      .filter((e) => e.age < 1.5);
    s.shake = Math.max(0, s.shake - STEP);
    s.noteTime = Math.max(0, s.noteTime - STEP);
    if (s.notice) {
      s.notice.age += STEP;
      if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
    }
    if (s.launchTime !== null) {
      s.launchTime += STEP;
      if (
        Math.floor(s.launchTime * 8) !== Math.floor((s.launchTime - STEP) * 8)
      )
        effect(
          s,
          "launch-exhaust",
          1840,
          C.SURFACE_Y - s.launchTime * s.launchTime * 140,
        );
      if (s.launchTime >= 3.2) finish(s, null);
      continue;
    }
    step(s, h, STEP);
    if (Math.floor(s.elapsedSeconds * 10) !== Math.floor(previous * 10)) {
      if (s.miner.drilling)
        effect(
          s,
          "drill-debris",
          s.miner.drilling.dir === "down"
            ? s.miner.x + C.MINER_W / 2
            : s.miner.x + (s.miner.facing === "east" ? C.MINER_W : 0),
          s.miner.y +
            (s.miner.drilling.dir === "down" ? C.MINER_H : C.MINER_H / 2),
          BAND_TINTS[
            tile(s, s.miner.drilling.col, s.miner.drilling.row).band ??
              "topsoil"
          ],
        );
      if (s.miner.state === "jetpack")
        effect(
          s,
          "jetpack-exhaust",
          s.miner.x + (s.miner.facing === "east" ? 12 : C.MINER_W - 12),
          s.miner.y + C.MINER_H - 12,
        );
    }
    if (s.coreTimer !== null) {
      const period = s.coreTimer < 15 ? 0.25 : s.coreTimer < 35 ? 0.5 : 1.25;
      if (
        Math.floor(s.elapsedSeconds / period) !== Math.floor(previous / period)
      )
        cue(s, C.CUES.alarmCore);
    }
  }
}
