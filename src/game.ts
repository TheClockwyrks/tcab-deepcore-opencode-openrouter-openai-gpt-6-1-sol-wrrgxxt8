import type { Game } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  type DeepcoreState,
  type Assets,
  initial,
  copy,
  snapshot,
  BUILDING_RECTS,
  maxFuel,
  depth,
} from "./model";
import { debug, type DeepcoreDebugApi } from "./debug";
import { advanceSimulation } from "./simulation";
import {
  controls,
  menuItems,
  menuItemRect,
  contains,
  choose,
  back,
  act,
  activateBuilding,
} from "./interface";
import { hasSave, continuousDeath, useItem, jettison } from "./transactions";
import { renderGame } from "./render";

export type { DeepcoreState, DeepcoreDebugApi };
export const BACKGROUND = "#0c1923";
const urls = import.meta.glob<string>("../assets/**/*.{png,wav,json}", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTION_NAMES)
      api.input.register(action, { keys: [...C.ACTIONS[action]] });
    const assets: Assets = { images: {}, systems: {} };
    await Promise.all(
      Object.entries(urls).map(async ([key, url]) => {
        const name = key.replace("../assets/", "");
        const relative = url.replace(/^.*?assets\//, "");
        if (name.endsWith(".png"))
          assets.images[name] = await api.assets.loadImage(relative);
        else if (name.endsWith(".json"))
          assets.systems[name.replace("fx/", "").replace(".json", "")] =
            JSON.parse(
              await (await api.assets.load(relative)).text(),
            ) as ParticleSystem;
        else if (name.endsWith(".wav"))
          await api.audio.load(
            name.replace("audio/", "").replace(".wav", ""),
            relative,
          );
      }),
    );
    const sources: Record<
      string,
      (s: ReturnType<typeof snapshot>) => string | number
    > = {
      "Screen / panel": (s) => `${s.screen} / ${s.panel ?? "—"}`,
      "Mode / size": (s) => `${s.mode} / ${s.worldSize}`,
      Position: (s) => `${s.miner.x.toFixed(1)}, ${s.miner.y.toFixed(1)}`,
      Velocity: (s) => `${s.miner.vx.toFixed(1)}, ${s.miner.vy.toFixed(1)}`,
      Miner: (s) =>
        `${s.miner.state} / ${s.miner.facing} / grounded ${s.miner.grounded}`,
      "Fuel / hull": (s) =>
        `${s.miner.fuel.toFixed(1)}/${s.miner.maxFuel} · ${s.miner.hull.toFixed(1)}/${s.miner.maxHull}`,
      Drill: (s) =>
        s.miner.drilling
          ? `${s.miner.drilling.col},${s.miner.drilling.row} ${(s.miner.drilling.progress * 100).toFixed(0)}%`
          : "—",
      Credits: (s) => s.credits,
      Depth: (s) => s.depthMeters.toFixed(1),
      Cargo: (s) =>
        `${s.cargo.slotsUsed}/${s.cargo.slotCap} · ${s.cargo.loadKg}kg · overload ${s.miner.overloaded}`,
      Satchel: (s) =>
        `R ${s.satchel.resonite} C ${s.satchel.cryenite} Core ${s.satchel.coreSample}`,
      Tiers: (s) =>
        Object.entries(s.tiers)
          .map(([k, v]) => `${k} ${v}`)
          .join(" · "),
      "Core timer": (s) => s.coreTimer?.toFixed(1) ?? "—",
      Scanner: (s) => `${s.scanner.locked} / ${s.scanner.target ?? "—"}`,
    };
    for (const [name, read] of Object.entries(sources))
      api.diagnostics.register(name, (s) => read(snapshot(s)));
    return [initial(assets, false, hasSave()), debug];
  },
  update(state, api, dt) {
    let s = copy(state);
    s.simTime += dt;
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    if (s.screen === "in-mine")
      s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
    // A depleted hull is terminal before any panel, pause or repair input acts.
    const endedThisFrame = continuousDeath(s);
    const pressed = Object.fromEntries(
      C.ACTION_NAMES.filter((n) => n !== "mute").map((n) => [
        n,
        api.input.pressed(n),
      ]),
    );
    const menu = menuItems(s);
    const hit = (x: number, y: number): string | null => {
      if (s.screen !== "in-mine") {
        for (let i = 0; i < menuItems(s).length; i++) {
          const r = menuItemRect(s, i);
          if (r && contains(r, x, y)) return `menu:${s.screen}:${i}`;
        }
        return null;
      }
      for (const c of controls(s))
        if (c.enabled && contains(c.rect, x, y))
          return `control:${c.id}:${c.subject ?? ""}`;
      if (!s.panel)
        for (const b of BUILDING_RECTS)
          if (
            contains(
              {
                x: b.x - s.camera.x,
                y: b.y - s.camera.y + C.HUD_H,
                w: b.w,
                h: b.h,
              },
              x,
              y,
            )
          )
            return `building:${b.id}`;
      return null;
    };
    for (const sample of endedThisFrame ? [] : api.input.pointerSamples()) {
      const target = hit(sample.x, sample.y);
      if (target?.startsWith("menu:"))
        s.menuIndex = Number(target.split(":")[2]);
      if (s.panel && target?.startsWith("control:")) {
        const panelControls = controls(s).filter(
          (c) => c.rect.y > C.HUD_H && c.id !== "dismiss-notice",
        );
        const index = panelControls.findIndex(
          (c) => `control:${c.id}:${c.subject ?? ""}` === target,
        );
        if (index >= 0) s.panelIndex = index;
      }
      if (sample.type === "down") {
        if (target) s.pointerStarts[sample.id] = target;
        if (target === "control:dismiss-notice:") s.notice = null;
        if (target?.startsWith("building:"))
          activateBuilding(s, target.split(":")[1] as C.BuildingId);
      }
      if (sample.type === "up") {
        if (target && s.pointerStarts[sample.id] === target) {
          if (target.startsWith("menu:")) s = choose(s);
          else if (target.startsWith("control:")) {
            const [, id, subject] = target.split(":");
            if (id === "mute") api.audio.setMuted(!api.audio.muted());
            else act(s, id, subject || null);
          }
        }
        delete s.pointerStarts[sample.id];
      }
    }
    if (!endedThisFrame) {
      if (pressed.pause) back(s);
      else if (s.screen !== "in-mine") {
        if (pressed.up)
          s.menuIndex = (s.menuIndex + menu.length - 1) % menu.length;
        if (pressed.down) s.menuIndex = (s.menuIndex + 1) % menu.length;
        if (pressed.activate) s = choose(s);
      } else {
        if (!continuousDeath(s)) {
          if (pressed.inventory) act(s, "inventory", null);
          if (pressed.jettison) jettison(s);
          for (const [i, item] of C.ITEM_IDS.entries())
            if (pressed[`supply${i + 1}`]) useItem(s, item);
          if (s.panel) {
            const list = controls(s).filter(
              (c) => c.rect.y > C.HUD_H && c.id !== "dismiss-notice",
            );
            if (list.length) {
              if (pressed.down) s.panelIndex = (s.panelIndex + 1) % list.length;
              if (pressed.up)
                s.panelIndex = (s.panelIndex + list.length - 1) % list.length;
              if (pressed.activate) {
                const c = list[s.panelIndex % list.length];
                if (c.enabled) act(s, c.id, c.subject);
              }
            }
          } else if (pressed.activate)
            for (const b of BUILDING_RECTS) activateBuilding(s, b.id);
        }
      }
    }
    if (s.screen === "in-mine")
      advanceSimulation(
        s,
        {
          left: api.input.value("left"),
          right: api.input.value("right"),
          down: api.input.value("down"),
          up: api.input.value("up"),
        },
        dt,
      );
    else if (s.screen === "game-over" || s.screen === "victory") {
      s.animTime += dt;
      s.effects = s.effects
        .map((e) => ({ ...e, age: e.age + dt }))
        .filter((e) => e.age < 1.5);
      s.shake = Math.max(0, s.shake - dt);
    }
    api.audio.loop(C.CUES.music);
    const loop = (cue: C.CueName, on: boolean) => {
      if (on) api.audio.loop(cue);
      else api.audio.stop(cue);
    };
    loop(
      C.CUES.drill,
      s.screen === "in-mine" && !s.panel && s.miner.drilling !== null,
    );
    loop(
      C.CUES.thrust,
      s.screen === "in-mine" && !s.panel && s.miner.state === "jetpack",
    );
    loop(
      C.CUES.alarmFuel,
      s.screen === "in-mine" && s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION,
    );
    for (const cue of s.sounds) api.audio.play(cue);
    s.sounds = [];
    s.muted = api.audio.muted();
    return s;
  },
  render(state, api) {
    renderGame(state, api.ctx);
  },
};
