import * as C from "./constants";
import {
  type ReadState,
  type DeepcoreState,
  type Rect,
  BUILDING_RECTS,
  slots,
  maxFuel,
  maxHull,
  note,
} from "./model";
import * as T from "./transactions";

export function menuItems(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    case "in-mine":
      return [];
  }
}
export function menuItemRect(s: ReadState, index: number): Rect | null {
  if (index < 0 || index >= menuItems(s).length) return null;
  if (s.screen === "how-to-play") return { x: 90, y: 622, w: 320, h: 48 };
  const x = s.screen === "title" ? 90 : 132,
    y =
      s.screen === "title"
        ? 376
        : s.screen === "mode-select"
          ? 306
          : s.screen === "size-select"
            ? 258
            : s.screen === "paused"
              ? 290
              : 425;
  return { x, y: y + index * 66, w: s.screen === "title" ? 390 : 480, h: 52 };
}
export interface Control {
  id: string;
  subject: string | null;
  rect: Rect;
  label: string;
  enabled: boolean;
}
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine") return [];
  const controls: Control[] = [];
  const add = (
    id: string,
    subject: string | null,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    enabled = true,
  ) => controls.push({ id, subject, rect: { x, y, w, h }, label, enabled });
  add("inventory", null, 1064, 8, 92, 38, "BAY [I]");
  add("pause", null, 1164, 8, 40, 38, "Ⅱ");
  add("mute", null, 1212, 8, 52, 38, s.muted ? "OFF" : "♪");
  if (s.notice && s.notice.age >= C.NOTICE_DELAY)
    add("dismiss-notice", null, 340, 588, 600, 100, "");
  switch (s.panel) {
    case "fuel-depot":
      add(
        "buy-fuel",
        null,
        190,
        335,
        360,
        50,
        `+${C.FUEL_BUY_INCREMENT} FUEL · ${C.FUEL_BUY_INCREMENT * C.FUEL_PRICE} CR`,
        s.credits > 0 && s.miner.fuel < maxFuel(s),
      );
      add(
        "fill-fuel",
        null,
        190,
        400,
        360,
        50,
        "FILL TANK",
        s.credits > 0 && s.miner.fuel < maxFuel(s),
      );
      add(
        "buy-repair",
        null,
        700,
        335,
        360,
        50,
        `+${C.REPAIR_BUY_INCREMENT} HULL · ${C.REPAIR_BUY_INCREMENT * C.REPAIR_PRICE} CR`,
        s.credits > 0 && s.miner.hull < maxHull(s),
      );
      add(
        "repair-full",
        null,
        700,
        400,
        360,
        50,
        "REPAIR TO FULL",
        s.credits > 0 && s.miner.hull < maxHull(s),
      );
      break;
    case "ore-market":
      add("sell", null, 770, 547, 280, 50, C.SELL, slots(s) > 0);
      break;
    case "upgrade-shop":
      for (const [i, track] of C.TRACKS.entries())
        add(
          "buy-upgrade",
          track,
          860,
          218 + i * 48,
          200,
          36,
          s.tiers[track] >= C.MAX_TIER[track]
            ? "MAX TIER"
            : `${C.UPGRADE_PRICES[s.tiers[track] - 1]} CR →`,
          s.tiers[track] < C.MAX_TIER[track] &&
            s.credits >= C.UPGRADE_PRICES[s.tiers[track] - 1],
        );
      break;
    case "supply-depot":
      for (const [i, item] of C.ITEMS.entries())
        add(
          "buy-item",
          item.id,
          860,
          222 + i * 57,
          200,
          40,
          `${item.price} CR →`,
          s.credits >= item.price,
        );
      break;
    case "launch-pad":
      add(
        s.installed === C.ROCKET_COMPONENT_IDS.length ? "launch" : "fabricate",
        null,
        730,
        543,
        320,
        50,
        s.installed === C.ROCKET_COMPONENT_IDS.length ? C.LAUNCH : C.FABRICATE,
        s.installed === C.ROCKET_COMPONENT_IDS.length || T.canFabricate(s),
      );
      break;
    case "inventory": {
      let i = 0;
      for (const ore of C.MINERALS)
        if (s.cargo[ore.id]) {
          add("drop-ore", ore.id, 545, 232 + i * 27, 92, 23, "DROP 1");
          i++;
        }
      for (const [j, item] of C.ITEMS.entries())
        if (s.items[item.id])
          add("use-item", item.id, 960, 272 + j * 42, 100, 32, C.USE);
      if (s.satchel.coreSample)
        add("jettison", null, 757, 551, 303, 42, C.JETTISON);
      break;
    }
    case null:
      break;
  }
  return controls;
}
export function controlRect(
  s: ReadState,
  id: string,
  subject: string | null,
): Rect | null {
  return (
    controls(s).find((c) => c.id === id && c.subject === subject)?.rect ?? null
  );
}
export const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
export function activateBuilding(s: DeepcoreState, id: C.BuildingId): void {
  const b = BUILDING_RECTS.find((b) => b.id === id)!;
  const center = s.miner.x + C.MINER_W / 2;
  if (
    Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) > 2 ||
    center < b.x - 28 ||
    center > b.x + b.w + 28
  )
    return;
  if (id === "save-pad") T.save(s);
  else {
    s.panel = id;
    s.panelIndex = 0;
  }
}
export function act(
  s: DeepcoreState,
  id: string,
  subject: string | null,
): void {
  switch (id) {
    case "drop-ore":
      T.dropOre(s, subject as C.OreId);
      break;
    case "use-item":
      T.useItem(s, subject as C.ItemId);
      break;
    case "jettison":
      T.jettison(s);
      break;
    case "sell":
      T.sell(s);
      break;
    case "buy-fuel":
      T.purchaseResource(s, "fuel", false);
      break;
    case "fill-fuel":
      T.purchaseResource(s, "fuel", true);
      break;
    case "buy-repair":
      T.purchaseResource(s, "hull", false);
      break;
    case "repair-full":
      T.purchaseResource(s, "hull", true);
      break;
    case "buy-upgrade":
      T.buyUpgrade(s, subject as C.TrackName);
      break;
    case "buy-item":
      T.buyItem(s, subject as C.ItemId);
      break;
    case "fabricate":
      T.fabricate(s);
      break;
    case "launch":
      T.launch(s);
      break;
    case "dismiss-notice":
      s.notice = null;
      break;
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      s.panelIndex = 0;
      break;
    case "pause":
      if (s.panel) s.panel = null;
      else {
        s.screen = "paused";
        s.menuIndex = 0;
      }
      break;
  }
}
export function back(s: DeepcoreState): void {
  if (s.screen === "in-mine") {
    act(s, "pause", null);
    return;
  }
  if (s.screen === "paused") {
    s.screen = "in-mine";
    s.menuIndex = 0;
    return;
  }
  if (s.screen === "size-select") {
    s.screen = "mode-select";
    s.menuIndex = C.MODES.indexOf(s.mode);
    return;
  }
  if (s.screen === "mode-select" || s.screen === "how-to-play") {
    const how = s.screen === "how-to-play";
    s.screen = "title";
    s.menuIndex = (s.hasSave ? 1 : 0) + (how ? 1 : 0);
  }
}
export function choose(s: DeepcoreState): DeepcoreState {
  const name = menuItems(s)[s.menuIndex];
  switch (s.screen) {
    case "title":
      if (name === C.TITLE_ITEMS[0]) return T.restore(s);
      s.screen = name === C.TITLE_ITEMS[1] ? "mode-select" : "how-to-play";
      s.menuIndex = 0;
      break;
    case "mode-select":
      if (s.menuIndex === C.MODES.length) back(s);
      else {
        s.mode = C.MODES[s.menuIndex];
        s.screen = "size-select";
        s.menuIndex = 0;
      }
      break;
    case "size-select":
      if (s.menuIndex === C.WORLD_SIZES.length) back(s);
      else {
        s.worldSize = C.WORLD_SIZES[s.menuIndex];
        return T.start(s);
      }
      break;
    case "how-to-play":
      back(s);
      break;
    case "paused":
      if (s.menuIndex === 0) back(s);
      else if (s.menuIndex === 1) return T.start(s);
      else {
        s.screen = "title";
        s.menuIndex = s.hasSave ? 1 : 0;
      }
      break;
    case "victory":
    case "game-over":
      if (s.menuIndex === 0)
        return name === C.GAME_OVER_SAVE_ITEMS[0] ? T.restore(s) : T.start(s);
      s.screen = "title";
      s.menuIndex = s.hasSave ? 1 : 0;
      break;
    case "in-mine":
      note(s, "");
      break;
  }
  return s;
}
