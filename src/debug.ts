import * as C from "./constants";
import {
  type ReadState,
  type DeepcoreState,
  copy,
  initial,
  snapshot,
  tile,
  minable,
  makeCell,
  bandAt,
  put,
  generate,
  emptyGrid,
  BUILDING_RECTS,
  maxFuel,
  maxHull,
  cellCol,
  cellRow,
} from "./model";
import * as T from "./transactions";
import { menuItems, menuItemRect, controlRect } from "./interface";

function assert(
  value: unknown,
  message = "Invalid Deepcore debug argument",
): asserts value {
  if (!value) throw new RangeError(message);
}
const finite = (n: number) => assert(Number.isFinite(n));
const nonnegative = (n: number) => {
  finite(n);
  assert(n >= 0);
};
const count = (n: number) => {
  nonnegative(n);
  assert(Number.isInteger(n));
};
const member = <T extends string>(value: T, list: readonly T[]) =>
  assert(list.includes(value));
function pose(s: ReadState, fn: (n: DeepcoreState) => void): DeepcoreState {
  const n = copy(s);
  fn(n);
  return n;
}
function cellDomain(s: ReadState, c: number, r: number) {
  assert(
    Number.isInteger(c) &&
      Number.isInteger(r) &&
      c >= 0 &&
      c < C.WORLD_COLS &&
      r >= 1 &&
      r <= s.coreRow,
  );
}
const minerNumber = (key: "fuel" | "hull") => (s: ReadState, n: number) => {
  nonnegative(n);
  return pose(s, (s) => {
    s.miner[key] = n;
  });
};
const transaction = (fn: (s: DeepcoreState) => void) => (s: ReadState) =>
  pose(s, fn);
export const debug = {
  version: C.DEEPCORE_DEBUG_VERSION,
  snapshot,
  tileAt(s: ReadState, col: number, row: number) {
    const c =
      row < 0 || row > s.coreRow || col < 0 || col >= C.WORLD_COLS
        ? makeCell("bedrock", null)
        : tile(s, col, row);
    return {
      ...c,
      maxHealth: minable(c) && c.band ? C.BAND_HEALTH[c.band] : null,
    };
  },
  findTile(s: ReadState, kind: C.TileKind) {
    member(kind, C.TILE_KINDS);
    let best: { col: number; row: number } | null = null,
      dist = Infinity;
    for (let i = 0; i < s.grid.length; i++)
      if (s.grid[i].kind === kind) {
        const col = i % C.WORLD_COLS,
          row = Math.floor(i / C.WORLD_COLS),
          d = Math.hypot(col - cellCol(s), row - cellRow(s));
        if (d < dist) {
          best = { col, row };
          dist = d;
        }
      }
    return best;
  },
  buildings(_s: ReadState) {
    return BUILDING_RECTS.map((b) => ({ ...b }));
  },
  menuItemRect,
  controlRect(s: ReadState, control: string, subject: string | null) {
    member(control, [
      "drop-ore",
      "use-item",
      "jettison",
      "sell",
      "buy-fuel",
      "fill-fuel",
      "buy-repair",
      "repair-full",
      "buy-upgrade",
      "buy-item",
      "fabricate",
      "launch",
      "dismiss-notice",
      "inventory",
      "pause",
      "mute",
    ]);
    if (control === "drop-ore")
      assert(C.MINERALS.some((m) => m.id === subject));
    else if (control === "use-item" || control === "buy-item")
      assert(C.ITEM_IDS.some((id) => id === subject));
    else if (control === "buy-upgrade")
      assert(C.TRACKS.some((id) => id === subject));
    else assert(subject === null);
    return controlRect(s, control, subject);
  },
  reset(s: ReadState) {
    return initial(s.assets as DeepcoreState["assets"], s.muted, s.hasSave);
  },
  reconcile(s: ReadState) {
    return copy(s);
  },
  generateMine: transaction(generate),
  clearMine: transaction((s) => {
    s.grid = emptyGrid(s.coreRow);
  }),
  clearCargo: transaction((s) => {
    s.cargo = {};
  }),
  clearItems: transaction((s) => {
    for (const item of C.ITEM_IDS) s.items[item] = 0;
  }),
  setTile(
    s: ReadState,
    col: number,
    row: number,
    kind: Exclude<C.TileKind, "ore" | "material">,
  ) {
    cellDomain(s, col, row);
    member(kind, ["rock", "gas", "lava", "stone", "bedrock", "tunnel", "core"]);
    return pose(s, (s) =>
      put(
        s,
        col,
        row,
        makeCell(
          kind,
          row < s.coreRow || ["rock", "gas", "lava"].includes(kind)
            ? bandAt(row, s.coreRow)
            : null,
        ),
      ),
    );
  },
  setOreTile(s: ReadState, col: number, row: number, ore: C.OreId) {
    cellDomain(s, col, row);
    member(
      ore,
      C.MINERALS.map((m) => m.id),
    );
    return pose(s, (s) =>
      put(s, col, row, { ...makeCell("ore", bandAt(row, s.coreRow)), ore }),
    );
  },
  setMaterialTile(
    s: ReadState,
    col: number,
    row: number,
    material: C.MaterialId,
  ) {
    cellDomain(s, col, row);
    member(material, C.MATERIALS);
    return pose(s, (s) =>
      put(s, col, row, {
        ...makeCell("material", bandAt(row, s.coreRow)),
        material,
      }),
    );
  },
  setTileHealth(s: ReadState, col: number, row: number, health: number) {
    cellDomain(s, col, row);
    const c = tile(s, col, row);
    assert(minable(c) && health > 0 && health <= C.BAND_HEALTH[c.band!]);
    return pose(s, (s) => put(s, col, row, { ...c, health }));
  },
  placeCoreSample(s: ReadState, col: number, row: number) {
    cellDomain(s, col, row);
    assert(s.coreTimer === null && tile(s, col, row).kind === "tunnel");
    return pose(s, (s) => {
      s.coreGround = { col, row };
      s.coreTimer = C.CORE_TIMER;
    });
  },
  setMinerPosition(s: ReadState, x: number, y: number) {
    finite(x);
    finite(y);
    return pose(s, (s) => {
      s.miner.x = x;
      s.miner.y = y;
    });
  },
  setMinerVelocity(s: ReadState, vx: number, vy: number) {
    finite(vx);
    finite(vy);
    return pose(s, (s) => {
      s.miner.vx = vx;
      s.miner.vy = vy;
    });
  },
  setFacing(s: ReadState, facing: C.Facing) {
    member(facing, C.FACINGS);
    return pose(s, (s) => {
      s.miner.facing = facing;
    });
  },
  setFuel: minerNumber("fuel"),
  setHull: minerNumber("hull"),
  setMinerTravel(s: ReadState, enabled: boolean) {
    assert(typeof enabled === "boolean");
    return pose(s, (s) => {
      s.miner.travel = enabled;
    });
  },
  setMinerDrill(s: ReadState, enabled: boolean) {
    assert(typeof enabled === "boolean");
    return pose(s, (s) => {
      s.miner.drill = enabled;
    });
  },
  setScreen(s: ReadState, screen: C.ScreenName) {
    member(screen, C.SCREENS);
    return pose(s, (s) => {
      s.screen = screen;
    });
  },
  setPanel(s: ReadState, panel: C.PanelId | null) {
    if (panel !== null) member(panel, C.PANELS);
    return pose(s, (s) => {
      s.panel = panel;
    });
  },
  setMenuIndex(s: ReadState, index: number) {
    count(index);
    assert(index < menuItems(s).length);
    return pose(s, (s) => {
      s.menuIndex = index;
    });
  },
  setMode(s: ReadState, mode: C.Mode) {
    member(mode, C.MODES);
    return pose(s, (s) => {
      s.mode = mode;
    });
  },
  setWorldSize(s: ReadState, size: C.WorldSize) {
    member(size, C.WORLD_SIZES);
    return pose(s, (s) => T.resize(s, size));
  },
  setCredits(s: ReadState, value: number) {
    nonnegative(value);
    return pose(s, (s) => {
      s.credits = value;
    });
  },
  setTier(s: ReadState, track: C.TrackName, tier: number) {
    member(track, C.TRACKS);
    count(tier);
    assert(tier >= 1 && tier <= C.MAX_TIER[track]);
    return pose(s, (s) => {
      s.tiers[track] = tier;
      s.miner.fuel = Math.min(s.miner.fuel, maxFuel(s));
      s.miner.hull = Math.min(s.miner.hull, maxHull(s));
    });
  },
  setCargo(s: ReadState, ore: C.OreId, n: number) {
    member(
      ore,
      C.MINERALS.map((m) => m.id),
    );
    count(n);
    return pose(s, (s) => {
      if (n) s.cargo[ore] = n;
      else delete s.cargo[ore];
    });
  },
  setMaterial(s: ReadState, material: C.MaterialId, n: number) {
    member(material, C.MATERIALS);
    count(n);
    return pose(s, (s) => {
      s.satchel[material] = n;
    });
  },
  setCoreCarried(s: ReadState, carried: boolean) {
    assert(typeof carried === "boolean");
    if (carried) assert(s.coreTimer === null);
    return pose(s, (s) => {
      if (!carried && !s.satchel.coreSample) return;
      s.satchel.coreSample = carried;
      s.coreTimer = carried ? C.CORE_TIMER : null;
      if (!carried) s.coreGround = null;
    });
  },
  setCoreTimer(s: ReadState, seconds: number) {
    finite(seconds);
    assert(seconds > 0 && s.coreTimer !== null);
    return pose(s, (s) => {
      s.coreTimer = seconds;
    });
  },
  setItemCount(s: ReadState, item: C.ItemId, n: number) {
    member(item, C.ITEM_IDS);
    count(n);
    return pose(s, (s) => {
      s.items[item] = n;
    });
  },
  setRocketInstalled(s: ReadState, n: number) {
    count(n);
    assert(n <= C.ROCKET_COMPONENT_IDS.length);
    return pose(s, (s) => {
      s.installed = n;
    });
  },
  setNoticeFired(s: ReadState, hazard: C.NoticeHazard, fired: boolean) {
    member(hazard, C.NOTICE_HAZARDS);
    assert(typeof fired === "boolean");
    return pose(s, (s) => {
      s.noticesFired[hazard] = fired;
    });
  },
  setCameraLead(s: ReadState, lead: number) {
    finite(lead);
    assert(Math.abs(lead) <= C.CAM_LEAD_MAX);
    return pose(s, (s) => {
      s.camera.lead = lead;
    });
  },
  setElapsed(s: ReadState, seconds: number) {
    nonnegative(seconds);
    return pose(s, (s) => {
      s.elapsedSeconds = seconds;
    });
  },
  clearSave: transaction(T.clearSave),
  setNextTeleportHeight(s: ReadState, n: number | null) {
    assert(
      n === null ||
        (Number.isFinite(n) &&
          n >= C.TELEPORT_HEIGHT_TILES_MIN &&
          n <= C.TELEPORT_HEIGHT_TILES_MAX),
    );
    return pose(s, (s) => {
      s.nextTeleportHeight = n;
    });
  },
  setNextTeleportSpeed(s: ReadState, n: number | null) {
    assert(
      n === null ||
        (Number.isFinite(n) &&
          n >= C.TELEPORT_SPEED_MIN &&
          n <= C.TELEPORT_SPEED_MAX),
    );
    return pose(s, (s) => {
      s.nextTeleportSpeed = n;
    });
  },
  dropOre(s: ReadState, ore: C.OreId) {
    member(
      ore,
      C.MINERALS.map((m) => m.id),
    );
    return pose(s, (s) => T.dropOre(s, ore));
  },
  sell: transaction(T.sell),
  buyFuel: transaction((s) => T.purchaseResource(s, "fuel", false)),
  fillFuel: transaction((s) => T.purchaseResource(s, "fuel", true)),
  buyRepair: transaction((s) => T.purchaseResource(s, "hull", false)),
  repairFull: transaction((s) => T.purchaseResource(s, "hull", true)),
  buyUpgrade(s: ReadState, track: C.TrackName) {
    member(track, C.TRACKS);
    return pose(s, (s) => T.buyUpgrade(s, track));
  },
  buyItem(s: ReadState, item: C.ItemId) {
    member(item, C.ITEM_IDS);
    return pose(s, (s) => T.buyItem(s, item));
  },
  useItem(s: ReadState, item: C.ItemId) {
    member(item, C.ITEM_IDS);
    return pose(s, (s) => T.useItem(s, item));
  },
  jettison: transaction(T.jettison),
  fabricate: transaction(T.fabricate),
  launch: transaction(T.launch),
  save: transaction(T.save),
  dismissNotice: transaction((s) => {
    s.notice = null;
  }),
};
export type DeepcoreDebugApi = typeof debug;
