/// <reference types="node" />
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
  type Engine,
  type Game,
} from "@clockwyrks/simple-2d";
import {
  game,
  BACKGROUND,
  type DeepcoreState,
  type DeepcoreDebugApi,
} from "./game";
import * as C from "./constants";
import {
  initial,
  generate,
  copy,
  snapshot,
  tile,
  makeCell,
  put,
  grounded,
  type Assets,
} from "./model";
import { debug } from "./debug";
import { controls, choose, menuItems } from "./interface";

const engines: Engine<DeepcoreState, DeepcoreDebugApi>[] = [];
let assets: Assets;
let target: EventTarget;
const store = new Map<string, string>();
beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(await readFile(decodeURIComponent(url.split("?")[0]))),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(buffer: ArrayBuffer) {
        return { duration: (buffer.byteLength - 44) / 44100 };
      }
      async resume() {}
    },
  );
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  });
  const e = await harness(true, true);
  assets = e.state.assets as Assets;
  expect(Object.keys(assets.images)).toHaveLength(100);
  expect(Object.keys(assets.systems)).toHaveLength(12);
});
afterEach(() => {
  for (const e of engines.splice(0)) e.destroy();
  store.clear();
});
afterAll(() => vi.unstubAllGlobals());
async function harness(original = false, render = false) {
  target = new EventTarget();
  const surfaceTarget = target;
  const testGame: Game<DeepcoreState, DeepcoreDebugApi> = original
    ? game
    : {
        ...game,
        initialize(api) {
          for (const action of C.ACTION_NAMES)
            api.input.register(action, { keys: [...C.ACTIONS[action]] });
          for (const cue of Object.values(C.CUES))
            api.audio.define(cue, { freq: 100, durationMs: 100 });
          return [initial(assets), debug];
        },
        render: render ? game.render : () => {},
      };
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const e = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game: testGame,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => surfaceTarget,
    },
  });
  engines.push(e);
  await e.initialize();
  return e;
}
function key(code: string, down = true) {
  const event = new Event(down ? "keydown" : "keyup");
  Object.assign(event, { code, repeat: false });
  target.dispatchEvent(event);
}
async function press(e: Engine<DeepcoreState, DeepcoreDebugApi>, code: string) {
  key(code);
  await e.advance(1);
  key(code, false);
}
function setup(e: Engine<DeepcoreState, DeepcoreDebugApi>, row = 10) {
  e.apply((s) => debug.setScreen(s, "in-mine"));
  e.apply((s) => debug.clearMine(s));
  for (let c = 1; c < C.WORLD_COLS - 1; c++)
    e.apply((s) => debug.setTile(s, c, row, "rock"));
  e.apply((s) =>
    debug.setMinerPosition(s, 4 * C.TILE + 12, row * C.TILE - C.MINER_H),
  );
}
function click(x: number, y: number, type: "down" | "up", device = "mouse") {
  const event = new Event(type === "down" ? "pointerdown" : "pointerup");
  Object.assign(event, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
    pointerType: device,
    button: 0,
    buttons: type === "down" ? 1 : 0,
  });
  target.dispatchEvent(event);
}

describe("engine integration and navigation", () => {
  it("ships distinct authored drawings for every animation state", async () => {
    for (const state of C.MINER_STATES) {
      const count = state === "walk" ? 8 : 4;
      const frames = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          readFile(
            `assets/miner/${state}/frame${String(i).padStart(2, "0")}.png`,
          ),
        ),
      );
      expect(
        new Set(frames.map((frame) => frame.toString("base64"))).size,
      ).toBeGreaterThanOrEqual(2);
      const first = assets.images[`miner/${state}/frame00.png`];
      expect(first.width).toBe(C.MINER_SPRITE);
      expect(first.height).toBe(C.MINER_SPRITE);
    }
    expect(
      (await readFile("assets/miner/drill-side/frame00.png")).equals(
        await readFile("assets/miner/idle/frame00.png"),
      ),
    ).toBe(false);
  });
  it("registers and renders every screen with loaded sprites, sounds and systems", async () => {
    const e = await harness(true, true);
    expect(e.debug.version).toBe(C.DEEPCORE_DEBUG_VERSION);
    for (const screen of C.SCREENS) {
      e.apply((s) => debug.setScreen(s, screen));
      await e.advance(1);
    }
    expect(e.diagnostics().every((d) => d.error === undefined)).toBe(true);
    e.startRecording();
    await e.advance(2);
    const rec = e.stopRecording();
    expect(rec.frames).toHaveLength(2);
    expect(rec.ops.length).toBeGreaterThan(100);
  });
  it("navigates mode and size choices, wraps, returns to the launching entry", async () => {
    const e = await harness();
    await press(e, "Enter");
    expect(e.state.screen).toBe("mode-select");
    await press(e, "ArrowUp");
    expect(e.state.menuIndex).toBe(2);
    await press(e, "Escape");
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(0);
    await press(e, "ArrowDown");
    await press(e, "Enter");
    expect(e.state.screen).toBe("how-to-play");
    await press(e, "Escape");
    expect(e.state.menuIndex).toBe(1);
    await press(e, "ArrowUp");
    await press(e, "Enter");
    await press(e, "Enter");
    await press(e, "Enter");
    expect(e.state.screen).toBe("in-mine");
    expect(e.state.worldSize).toBe("quick");
    expect(e.state.coreRow).toBe(250);
    await press(e, "Escape");
    expect(e.state.screen).toBe("paused");
    await press(e, "KeyP");
    expect(e.state.screen).toBe("in-mine");
  });
  it("requires matching pointer edges, supports touch and reports drawn controls", async () => {
    const e = await harness();
    const r = debug.menuItemRect(e.state, 0)!;
    click(r.x + 20, r.y + 20, "down");
    click(5, 5, "up");
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    click(r.x + 20, r.y + 20, "down", "touch");
    click(r.x + 20, r.y + 20, "up", "touch");
    await e.advance(1);
    expect(e.state.screen).toBe("mode-select");
    setup(e);
    expect(debug.controlRect(e.state, "sell", null)).toBeNull();
    e.apply((s) => debug.setPanel(s, "ore-market"));
    expect(debug.controlRect(e.state, "sell", null)).not.toBeNull();
    await press(e, "KeyM");
    expect(e.state.muted).toBe(true);
    e.apply((s) => debug.reset(s));
    expect(e.state.muted).toBe(true);
  });
});

describe("physics, drilling and the fuel budget", () => {
  it("uses exact hit cadence, persists damage, spends fuel and collects ore", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setMinerTravel(s, false));
    e.apply((s) => debug.setOreTile(s, 4, 10, "cuprite"));
    const original = e.state;
    key("KeyS");
    await e.advance(15);
    expect(debug.tileAt(e.state, 4, 10).health).toBe(2);
    expect(debug.tileAt(original, 4, 10).health).toBe(4);
    key("KeyS", false);
    await e.advance(10);
    expect(debug.tileAt(e.state, 4, 10).health).toBe(2);
    key("KeyS");
    await e.advance(15);
    key("KeyS", false);
    expect(debug.tileAt(e.state, 4, 10).kind).toBe("tunnel");
    expect(debug.snapshot(e.state).cargo.ore.cuprite).toBe(1);
    expect(e.state.miner.fuel).toBeCloseTo(
      100 - 1 - (C.LIFE_SUPPORT_BURN * 40) / 60,
      4,
    );
  });
  it("bores smoothly through supported cells without losing groundedness", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setTile(s, 4, 11, "rock"));
    key("KeyS");
    await e.advance(10);
    const middle = e.state.miner.y;
    expect(middle).toBeGreaterThan(10 * C.TILE - C.MINER_H);
    expect(grounded(e.state)).toBe(true);
    await e.advance(20);
    key("KeyS", false);
    expect(debug.tileAt(e.state, 4, 10).kind).toBe("tunnel");
    expect(e.state.miner.y + C.MINER_H).toBeCloseTo(11 * C.TILE, 3);
  });
  it("drills only on the ground, never upward, never into stone", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setTile(s, 4, 10, "stone"));
    key("KeyS");
    await e.advance(40);
    key("KeyS", false);
    expect(debug.tileAt(e.state, 4, 10).kind).toBe("stone");
    expect(e.state.miner.fuel).toBeCloseTo(
      100 - (C.LIFE_SUPPORT_BURN * 40) / 60,
      4,
    );
    e.apply((s) => debug.setTile(s, 4, 10, "rock"));
    e.apply((s) => debug.setMinerPosition(s, 332, 500));
    key("KeyS");
    await e.advance(1);
    key("KeyS", false);
    expect(e.state.miner.drilling).toBeNull();
  });
  it("walks to a wall before cutting and honors independent faculty gates", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setTile(s, 5, 9, "rock"));
    key("KeyD");
    await e.advance(7);
    expect(e.state.miner.x).toBe(5 * C.TILE - C.MINER_W);
    expect(debug.tileAt(e.state, 5, 9).health).toBe(4);
    await e.advance(31);
    key("KeyD", false);
    expect(debug.tileAt(e.state, 5, 9).kind).toBe("tunnel");
    e.apply((s) => debug.setMinerTravel(s, false));
    e.apply((s) => debug.setMinerVelocity(s, 15, 180));
    const y = e.state.miner.y;
    key("Space");
    await e.advance(30);
    key("Space", false);
    expect(e.state.miner.y).toBe(y);
    expect(e.state.miner.vy).toBe(180);
  });
  it("has an overload wall and restores lift after shedding a heavy unit", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setCargo(s, "aurite", 4));
    key("Space");
    await e.advance(60);
    expect(e.state.miner.y).toBeCloseTo(728);
    expect(debug.snapshot(e.state).miner.overloaded).toBe(true);
    e.apply((s) => debug.dropOre(s, "aurite"));
    e.apply((s) => debug.dropOre(s, "aurite"));
    await e.advance(60);
    key("Space", false);
    expect(e.state.miner.y).toBeLessThan(728);
    expect(debug.snapshot(e.state).miner.overloaded).toBe(false);
  });
  it("follows into unbounded sky and gives identical simulation under split deltas", async () => {
    const a = await harness();
    setup(a);
    key("Space");
    await a.advance(180);
    const av = debug.snapshot(a.state);
    key("Space", false);
    const b = await harness();
    setup(b);
    b.setClock(new SequenceClock([5, 15, 30]));
    key("Space");
    await b.advance(180);
    key("Space", false);
    const bv = debug.snapshot(b.state);
    expect(bv.miner.y).toBeCloseTo(av.miner.y, 7);
    expect(bv.miner.fuel).toBeCloseTo(av.miner.fuel, 7);
    expect(av.miner.y).toBeLessThan(0);
    expect(av.camera.lead).toBeCloseTo(-C.CAM_LEAD_MAX);
    expect(bv.camera.y).toBeCloseTo(av.camera.y, 7);
  });
  it("charges impact by speed and fuel-out ends an expedition immediately", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setMinerPosition(s, 332, 650));
    e.apply((s) => debug.setMinerVelocity(s, 0, 900));
    await e.advance(12);
    expect(e.state.miner.hull).toBeLessThan(80);
    expect(e.state.shake).toBeGreaterThan(0);
    e.apply((s) => debug.setFuel(s, 0));
    await e.advance(1);
    expect(e.state.screen).toBe("game-over");
    expect(e.state.summary?.deathCause).toBe("fuel-out");
  });
});

describe("hazards, supplies and rocket", () => {
  it("extracts inexhaustible Core Samples and collects materials outside cargo", async () => {
    const e = await harness();
    setup(e, 200);
    e.apply((s) => debug.setMinerTravel(s, false));
    e.apply((s) => debug.setMaterialTile(s, 4, 200, "resonite"));
    key("KeyS");
    await e.advance(60);
    key("KeyS", false);
    expect(e.state.satchel.resonite).toBe(1);
    expect(debug.snapshot(e.state).cargo.slotsUsed).toBe(0);
    e.apply((s) =>
      debug.setMinerPosition(
        s,
        C.CORE_COL * C.TILE + 12,
        e.state.coreRow * C.TILE - C.MINER_H,
      ),
    );
    key("KeyS");
    await e.advance(8);
    key("KeyS", false);
    expect(e.state.satchel.coreSample).toBe(true);
    expect(debug.tileAt(e.state, C.CORE_COL, e.state.coreRow).kind).toBe(
      "core",
    );
    expect(e.state.coreTimer).toBeGreaterThan(89);
    e.apply((s) => debug.setCoreCarried(s, false));
    key("KeyS");
    await e.advance(8);
    key("KeyS", false);
    expect(e.state.satchel.coreSample).toBe(true);
  });
  it("preserves horizontal gas knockback and makes zero hull terminal before input", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setTile(s, 3, 9, "gas"));
    e.apply((s) => debug.setItemCount(s, "dynamite", 1));
    e.apply((s) => debug.useItem(s, "dynamite"));
    await e.advance(1);
    expect(e.state.miner.x).toBeGreaterThan(332);
    expect(e.state.miner.vx).toBeGreaterThan(C.WALK_SPEED);
    e.apply((s) => debug.setHull(s, 0));
    await press(e, "Escape");
    expect(e.state.screen).toBe("game-over");
    expect(e.state.summary?.deathCause).toBe("hull-destroyed");
  });
  it("caps field repairs, charges repairs correctly and does not waste a full supply", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setCredits(s, 100));
    e.apply((s) => debug.setHull(s, 31));
    e.apply((s) => debug.buyRepair(s));
    expect(e.state.miner.hull).toBe(56);
    expect(e.state.credits).toBe(50);
    e.apply((s) => debug.repairFull(s));
    expect(e.state.miner.hull).toBe(81);
    expect(e.state.credits).toBe(0);
    e.apply((s) => debug.setItemCount(s, "nanobots", 2));
    e.apply((s) => debug.useItem(s, "nanobots"));
    expect(e.state.miner.hull).toBe(100);
    e.apply((s) => debug.useItem(s, "nanobots"));
    expect(e.state.items.nanobots).toBe(1);
    e.apply((s) => debug.setFuel(s, 90));
    e.apply((s) => debug.setItemCount(s, "emergency-fuel", 2));
    e.apply((s) => debug.useItem(s, "emergency-fuel"));
    expect(e.state.miner.fuel).toBe(100);
    e.apply((s) => debug.useItem(s, "emergency-fuel"));
    expect(e.state.items["emergency-fuel"]).toBe(1);
  });
  it("detonates drilled gas with depth-scaled damage, delayed notice and live effect", async () => {
    const e = await harness();
    setup(e, 140);
    e.apply((s) => debug.setMinerTravel(s, false));
    e.apply((s) => debug.setHull(s, 500));
    e.apply((s) => debug.setTile(s, 4, 140, "gas"));
    key("KeyS");
    await e.advance(60);
    key("KeyS", false);
    expect(e.state.miner.hull).toBeLessThan(440);
    expect(debug.tileAt(e.state, 4, 140).kind).toBe("tunnel");
    expect(debug.snapshot(e.state).notice?.shown).toBe(false);
    await e.advance(100);
    expect(debug.snapshot(e.state).notice?.shown).toBe(true);
    expect(e.state.noticesFired.gas).toBe(true);
  });
  it("reduces lava damage with the radiator and excludes the cell being drilled", async () => {
    const e = await harness();
    setup(e, 300);
    e.apply((s) => debug.setTier(s, "radiator", 5));
    e.apply((s) => debug.setMinerTravel(s, false));
    e.apply((s) => debug.setTile(s, 4, 300, "lava"));
    key("KeyS");
    await e.advance(90);
    key("KeyS", false);
    expect(e.state.miner.hull).toBeCloseTo(
      100 - C.LAVA_DRILL_DEEPSTONE * 0.2,
      5,
    );
    expect(e.state.noticesFired.lava).toBe(true);
  });
  it("blasts stone and destroys ore while preserving unique materials and Core", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setMinerTravel(s, false));
    e.apply((s) => debug.setTile(s, 3, 9, "stone"));
    e.apply((s) => debug.setOreTile(s, 5, 9, "adamite"));
    e.apply((s) => debug.setMaterialTile(s, 4, 8, "resonite"));
    e.apply((s) => debug.setItemCount(s, "dynamite", 1));
    e.apply((s) => debug.useItem(s, "dynamite"));
    expect(debug.tileAt(e.state, 3, 9).kind).toBe("tunnel");
    expect(debug.tileAt(e.state, 5, 9).kind).toBe("tunnel");
    expect(debug.tileAt(e.state, 4, 8).kind).toBe("material");
    expect(debug.snapshot(e.state).cargo.slotsUsed).toBe(0);
    expect(e.state.items.dynamite).toBe(0);
  });
  it("consumes each posed Quantum draw once and uses normal impact on return", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setItemCount(s, "quantum-teleporter", 1));
    e.apply((s) => debug.setNextTeleportHeight(s, 8));
    e.apply((s) => debug.setNextTeleportSpeed(s, 700));
    e.apply((s) => debug.useItem(s, "quantum-teleporter"));
    expect(e.state.miner.y + C.MINER_H).toBe(C.SURFACE_Y - 8 * C.TILE);
    expect(e.state.miner.vy).toBe(700);
    expect(e.state.nextTeleportHeight).toBeNull();
    expect(e.state.nextTeleportSpeed).toBeNull();
    e.apply((s) => debug.setItemCount(s, "matter-transmitter", 1));
    e.apply((s) => debug.useItem(s, "matter-transmitter"));
    expect(e.state.miner.vy).toBe(0);
    expect(e.state.miner.y + C.MINER_H).toBe(C.SURFACE_Y);
  });
  it("keeps the Core timer running in panels, freezes in pause, and respects blast range", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setCoreCarried(s, true));
    e.apply((s) => debug.setCoreTimer(s, 5));
    e.apply((s) => debug.setPanel(s, "inventory"));
    await e.advance(60);
    expect(e.state.coreTimer).toBeCloseTo(4);
    await press(e, "Escape");
    await press(e, "Escape");
    const time = e.state.coreTimer;
    await e.advance(60);
    expect(e.state.coreTimer).toBe(time);
    await press(e, "Escape");
    e.apply((s) => debug.jettison(s));
    e.apply((s) => debug.setMinerPosition(s, 1000, 300));
    e.apply((s) => debug.setMinerTravel(s, false));
    await e.advance(250);
    expect(e.state.coreTimer).toBeNull();
    expect(e.state.screen).toBe("in-mine");
  });
  it("Core detonation kills while carried and hull zero kills even in inventory", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setCoreCarried(s, true));
    e.apply((s) => debug.setCoreTimer(s, 0.1));
    e.apply((s) => debug.setPanel(s, "inventory"));
    await e.advance(7);
    expect(e.state.summary?.deathCause).toBe("core-detonation");
    e.apply((s) => debug.reset(s));
    setup(e);
    e.apply((s) => debug.setPanel(s, "inventory"));
    e.apply((s) => debug.setHull(s, 0));
    await e.advance(1);
    expect(e.state.summary?.deathCause).toBe("hull-destroyed");
  });
  it("fabricates in order, consumes materials and Sample, boards and launches", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setCredits(s, C.ROCKET_TOTAL_CREDITS));
    e.apply((s) => debug.setMaterial(s, "resonite", 1));
    e.apply((s) => debug.setMaterial(s, "cryenite", 1));
    e.apply((s) => debug.setCoreCarried(s, true));
    for (let i = 0; i < 5; i++) e.apply((s) => debug.fabricate(s));
    expect(e.state.credits).toBe(0);
    expect(e.state.coreTimer).toBeNull();
    expect(debug.snapshot(e.state).rocket.nextComponent).toBeNull();
    e.apply((s) => debug.launch(s));
    await e.advance(195);
    expect(e.state.screen).toBe("victory");
    expect(e.state.summary?.componentsInstalled).toBe(5);
  });
});

describe("economy, save and debug invariants", () => {
  it("sells at canonical values, buys only affordable missing fuel, upgrades add capacity", async () => {
    const e = await harness();
    e.apply((s) => debug.setCargo(s, "ferron", 10));
    e.apply((s) => debug.sell(s));
    expect(e.state.credits).toBe(280);
    expect(e.state.creditsEarned).toBe(280);
    e.apply((s) => debug.setFuel(s, 30));
    e.apply((s) => debug.setCredits(s, 330));
    e.apply((s) => debug.buyUpgrade(s, "fuel"));
    expect(e.state.miner.fuel).toBe(105);
    expect(maximumFuel(e.state)).toBe(175);
    e.apply((s) => debug.fillFuel(s));
    expect(e.state.miner.fuel).toBe(135);
    expect(e.state.credits).toBe(0);
    e.apply((s) => debug.buyItem(s, "dynamite"));
    expect(e.state.items.dynamite).toBe(0);
  });
  it("saves an exact mine, refuses live Samples, restores on surface; Hardcore deletes", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setTile(s, 4, 1, "rock"));
    e.apply((s) => debug.setCredits(s, 888));
    e.apply((s) => debug.setOreTile(s, 3, 22, "voltite"));
    e.apply((s) => debug.save(s));
    expect(e.state.hasSave).toBe(true);
    e.apply((s) => debug.setCoreCarried(s, true));
    e.apply((s) => debug.setCredits(s, 9));
    e.apply((s) => debug.save(s));
    e.apply((s) => debug.setScreen(s, "title"));
    e.apply((s) => debug.setMenuIndex(s, 0));
    await press(e, "Enter");
    expect(e.state.credits).toBe(888);
    expect(e.state.miner.y + C.MINER_H).toBe(C.SURFACE_Y);
    expect(debug.tileAt(e.state, 3, 22).ore).toBe("voltite");
    e.apply((s) => debug.setMode(s, "hardcore"));
    e.apply((s) => debug.setHull(s, 0));
    await e.advance(1);
    expect(e.state.hasSave).toBe(false);
    expect(store.size).toBe(0);
  });
  it("resizes without recoloring shared cells, derives readings without ticking, validates inputs", async () => {
    const e = await harness();
    e.apply((s) => debug.setOreTile(s, 3, 200, "voltite"));
    e.apply((s) => debug.setTileHealth(s, 3, 200, 3));
    e.apply((s) => debug.setWorldSize(s, "quick"));
    expect(debug.tileAt(e.state, 3, 200)).toMatchObject({
      band: "rockbed",
      health: 3,
      maxHealth: 8,
    });
    e.apply((s) => debug.setWorldSize(s, "marathon"));
    expect(debug.tileAt(e.state, 3, 250).kind).toBe("tunnel");
    expect(debug.tileAt(e.state, C.CORE_COL, 1000).kind).toBe("core");
    const before = debug.snapshot(e.state);
    e.apply((s) => debug.reconcile(s));
    expect(debug.snapshot(e.state)).toEqual(before);
    expect(() => debug.setTier(e.state, "drill", 6)).toThrow();
    expect(() => debug.setCoreTimer(e.state, 1)).toThrow();
    expect(() => debug.setTile(e.state, 40, 1, "rock")).toThrow();
  });
  it("locks scanner to the nearest needed node only within tier range", async () => {
    const e = await harness();
    setup(e);
    e.apply((s) => debug.setMaterialTile(s, 7, 12, "resonite"));
    e.apply((s) => debug.setMaterialTile(s, 20, 20, "cryenite"));
    expect(debug.snapshot(e.state).scanner.locked).toBe(false);
    e.apply((s) => debug.setTier(s, "scanner", 2));
    expect(debug.snapshot(e.state).scanner.target).toBe("resonite");
    e.apply((s) => debug.setMaterial(s, "resonite", 1));
    expect(debug.snapshot(e.state).scanner.locked).toBe(false);
    e.apply((s) => debug.setTier(s, "scanner", 3));
    expect(debug.snapshot(e.state).scanner.target).toBe("cryenite");
  });
  it("renders every building panel and its operable controls", async () => {
    const e = await harness(false, true);
    setup(e);
    e.apply((s) => debug.setCredits(s, 50000));
    e.apply((s) => debug.setCargo(s, "aurite", 3));
    e.apply((s) => debug.setItemCount(s, "nanobots", 1));
    for (const panel of C.PANELS) {
      e.apply((s) => debug.setPanel(s, panel));
      await e.advance(1);
      for (const c of controls(e.state))
        expect(debug.controlRect(e.state, c.id, c.subject)).toEqual(c.rect);
    }
  });
});
function maximumFuel(s: { tiers: { fuel: number } }) {
  return C.FUEL_TIERS[s.tiers.fuel - 1];
}

describe("generation at all three scales", () => {
  for (const size of C.WORLD_SIZES)
    it(`meets density quotas, keeps materials unique, and leaves a safe path (${size})`, () => {
      const s = debug.setWorldSize(initial(assets), size);
      generate(s);
      const totals = Object.fromEntries(
        C.BANDS.map((b) => [
          b,
          { total: 0, ore: 0, gas: 0, lava: 0, stone: 0, sum: 0 },
        ]),
      );
      for (let r = 1; r < s.coreRow; r++)
        for (let c = 1; c < C.WORLD_COLS - 1; c++) {
          const cell = tile(s, c, r),
            count = totals[cell.band!];
          count.total++;
          count.sum += (r - 1) / (s.coreRow - 1);
          if (
            cell.kind === "ore" ||
            cell.kind === "gas" ||
            cell.kind === "lava" ||
            cell.kind === "stone"
          )
            count[cell.kind]++;
          if (r < C.ORE_MIN_ROW) expect(cell.kind).not.toBe("ore");
        }
      for (const [bi, b] of C.BANDS.entries()) {
        const t = totals[b],
          f = t.sum / t.total;
        expect(t.ore / t.total).toBeCloseTo(C.ORE_DENSITY, 2);
        if (bi > 0) {
          expect(t.stone / t.total).toBeCloseTo(
            C.STONE_DENSITY_MIN +
              ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (f - 0.25)) / 0.75,
            2,
          );
          expect(t.gas / t.total).toBeCloseTo(
            C.GAS_DENSITY_MIN +
              ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (f - 0.25)) / 0.75,
            3,
          );
        }
        if (bi > 1)
          expect(t.lava / t.total).toBeCloseTo(
            C.LAVA_DENSITY_MIN +
              ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (f - 0.5)) / 0.5,
            2,
          );
      }
      expect(s.grid.filter((c) => c.material === "resonite")).toHaveLength(1);
      expect(s.grid.filter((c) => c.material === "cryenite")).toHaveLength(1);
      const visited = new Set<number>(),
        queue = [C.WORLD_COLS + C.CAVE_MOUTH_COL];
      while (queue.length) {
        const i = queue.pop()!;
        if (visited.has(i) || i < 0 || i >= s.grid.length) continue;
        const c = i % C.WORLD_COLS,
          r = Math.floor(i / C.WORLD_COLS),
          cell = tile(s, c, r);
        if (
          c === 0 ||
          c === C.WORLD_COLS - 1 ||
          r < 1 ||
          ["stone", "lava", "bedrock"].includes(cell.kind)
        )
          continue;
        visited.add(i);
        queue.push(i - 1, i + 1, i - C.WORLD_COLS, i + C.WORLD_COLS);
      }
      for (let i = 0; i < s.grid.length; i++)
        if (s.grid[i].kind === "material" || s.grid[i].kind === "core")
          expect(visited.has(i)).toBe(true);
      const original = copy(s);
      const n = debug.setTile(s, 4, 5, "gas");
      expect(tile(original, 4, 5).kind).not.toBe("gas");
      expect(tile(n, 4, 5).kind).toBe("gas");
      expect(snapshot(n).coreRow).toBe(s.coreRow);
    });
  it("honors the five-component state machine and menu transitions independently", () => {
    let s = initial(assets);
    s = choose(s);
    expect(menuItems(s)).toEqual(C.MODE_ITEMS);
    s.menuIndex = 1;
    s = choose(s);
    expect(s.mode).toBe("hardcore");
    s.menuIndex = 3;
    s = choose(s);
    expect(s.menuIndex).toBe(1);
    put(s, 4, 1, makeCell("rock", "topsoil"));
    expect(tile(s, 4, 1).health).toBe(C.BAND_HEALTH.topsoil);
  });
});
