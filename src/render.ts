import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  type ReadState,
  type Rect,
  tile,
  minable,
  bandAt,
  depth,
  maxFuel,
  maxHull,
  loadKg,
  slots,
  jet,
  scanner,
  BUILDING_RECTS,
  clamp,
} from "./model";
import { controls, menuItems, menuItemRect } from "./interface";

const P = {
  bg: "#0c1923",
  panel: "#112632",
  line: "#35505b",
  muted: "#90a7ad",
  cream: "#e8e6cf",
  gold: "#e4ba78",
  mint: "#8ad7c6",
  red: "#f08572",
};
type Context = CanvasRenderingContext2D;
export function text(
  ctx: Context,
  str: string,
  x: number,
  y: number,
  size = 16,
  color = P.cream,
  weight = 400,
  font = "monospace",
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.fillText(str, x, y);
}
function box(
  ctx: Context,
  r: Rect,
  fill: string,
  stroke?: string,
  radius = 0,
): void {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function sprite(
  ctx: Context,
  s: ReadState,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const image = s.assets.images[key];
  if (image) ctx.drawImage(image as ImageBitmap, x, y, w, h);
}
function rule(ctx: Context, x: number, y: number, w: number, color = P.line) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function tag(
  ctx: Context,
  label: string,
  x: number,
  y: number,
  color = P.gold,
) {
  text(ctx, label, x, y, 11, color, 600);
}
function button(
  ctx: Context,
  r: Rect,
  label: string,
  highlight = false,
  enabled = true,
): void {
  box(
    ctx,
    r,
    enabled ? (highlight ? "#d7b273" : "#19333f") : "#172a34",
    enabled ? (highlight ? "#f4d294" : "#46616a") : "#293e48",
    3,
  );
  if (highlight && enabled) {
    ctx.fillStyle = "#f5d59a";
    ctx.fillRect(r.x, r.y, 4, r.h);
  }
  text(
    ctx,
    label,
    r.x + 18,
    r.y + r.h / 2 + 5,
    14,
    enabled ? (highlight ? "#132630" : P.cream) : "#617780",
    600,
  );
  if (enabled && r.w >= 130) {
    text(
      ctx,
      "↗",
      r.x + r.w - 26,
      r.y + r.h / 2 + 5,
      16,
      highlight ? "#26393d" : P.gold,
    );
  }
}
function drawEffect(
  ctx: Context,
  s: ReadState,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
  tint?: string,
): void {
  const system = s.assets.systems[name];
  if (!system) return;
  ctx.save();
  ctx.translate(x - 160, y - 160);
  // The binding fits its field to a logical 320-square adapter, while every call
  // still goes directly through the engine's recording context.
  const logical = new Proxy(ctx, {
    get(target, key) {
      if (key === "canvas") return { width: 320, height: 320 };
      const value = Reflect.get(target, key, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  ctx.globalAlpha = 0;
  const colored = tint
    ? {
        ...system,
        emitters: system.emitters.map((emitter) => ({
          ...emitter,
          particle: {
            ...emitter.particle,
            colorGradient: [
              { color: "#fff5df", at: 0 },
              { color: tint, at: 0.2 },
              { color: tint, at: 1 },
            ],
          },
        })),
      }
    : system;
  const player = new ParticleCanvasPlayer(colored as ParticleSystem, logical, {
    seed,
    clear: false,
    pixelRadius: 3.2,
    composite:
      name === "gas-seep" || name === "impact-dust" ? "source-over" : "lighter",
  });
  ctx.globalAlpha = 1;
  player.update(Math.max(0.001, age));
  ctx.restore();
}
function tunnel(
  ctx: Context,
  s: ReadState,
  col: number,
  row: number,
  kind: "tunnel" | "lava",
  x: number,
  y: number,
): void {
  const open = (c: number, r: number) => r < 1 || tile(s, c, r).kind === kind;
  const l = open(col - 1, row),
    r = open(col + 1, row),
    u = open(col, row - 1),
    d = open(col, row + 1),
    inset = 8;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(
    x + (l ? 0 : inset),
    y + (u ? 0 : inset),
    C.TILE - (l ? 0 : inset) - (r ? 0 : inset),
    C.TILE - (u ? 0 : inset) - (d ? 0 : inset),
    [l || u ? 0 : 14, r || u ? 0 : 14, r || d ? 0 : 14, l || d ? 0 : 14],
  );
  ctx.clip();
  sprite(
    ctx,
    s,
    kind === "lava"
      ? `hazards/lava/frame0${Math.floor(s.elapsedSeconds * 6) % 4}.png`
      : "tiles/tunnel.png",
    x,
    y,
    C.TILE,
    C.TILE,
  );
  ctx.restore();
  // A diagonal solid keeps its convex ear of dirt at an L or T junction.
  const corners = [
    [l, u, -1, -1],
    [r, u, 1, -1],
    [l, d, -1, 1],
    [r, d, 1, 1],
  ] as const;
  for (const [a, b, dx, dy] of corners)
    if (a && b && !open(col + dx, row + dy)) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        x + (dx === 1 ? C.TILE : 0),
        y + (dy === 1 ? C.TILE : 0),
        inset,
        0,
        Math.PI * 2,
      );
      ctx.clip();
      const band = tile(s, col, row).band ?? bandAt(row, s.coreRow);
      sprite(
        ctx,
        s,
        `tiles/${band}-${Math.abs(col * 7 + row * 13) % C.TILE_VARIANTS}.png`,
        x,
        y,
        C.TILE,
        C.TILE,
      );
      ctx.restore();
    }
}
function world(ctx: Context, s: ReadState): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  const { x: cx, y: cy } = s.camera;
  sprite(ctx, s, "surface/sky.png", 0, C.HUD_H, C.STAGE_W, C.VIEW_H);
  const shake = s.shake > 0 ? Math.min(12, s.shake * 9) : 0;
  ctx.translate(
    -cx + Math.sin(s.elapsedSeconds * 91) * shake,
    C.HUD_H - cy + Math.cos(s.elapsedSeconds * 73) * shake,
  );
  const c0 = Math.max(0, Math.floor(cx / C.TILE)),
    c1 = Math.min(C.WORLD_COLS - 1, Math.ceil((cx + C.VIEW_W) / C.TILE));
  const r0 = Math.max(1, Math.floor(cy / C.TILE)),
    r1 = Math.min(s.coreRow, Math.ceil((cy + C.VIEW_H) / C.TILE));
  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++) {
      const cell = tile(s, col, row),
        x = col * C.TILE,
        y = row * C.TILE,
        variant = Math.abs(col * 7 + row * 13) % C.TILE_VARIANTS;
      sprite(
        ctx,
        s,
        cell.kind === "bedrock"
          ? "tiles/bedrock.png"
          : `tiles/${cell.band ?? bandAt(Math.min(row, s.coreRow - 1), s.coreRow)}-${variant}.png`,
        x,
        y,
        C.TILE,
        C.TILE,
      );
      if (cell.kind === "tunnel" || cell.kind === "lava")
        tunnel(ctx, s, col, row, cell.kind, x, y);
      else if (cell.kind === "stone")
        sprite(
          ctx,
          s,
          `tiles/stone-${(col + row) % 2}.png`,
          x,
          y,
          C.TILE,
          C.TILE,
        );
      else if (cell.kind === "ore" && cell.ore)
        sprite(ctx, s, `ore/${cell.ore}.png`, x, y, C.TILE, C.TILE);
      else if (cell.kind === "material" && cell.material)
        sprite(ctx, s, `materials/${cell.material}.png`, x, y, C.TILE, C.TILE);
      else if (cell.kind === "core")
        sprite(ctx, s, "materials/core.png", x, y, C.TILE, C.TILE);
      if (
        minable(cell) &&
        cell.band &&
        cell.health !== null &&
        cell.health < C.BAND_HEALTH[cell.band]
      ) {
        const frame = Math.min(
          C.CRACK_FRAMES - 1,
          Math.floor(
            (1 - cell.health / C.BAND_HEALTH[cell.band]) * C.CRACK_FRAMES,
          ),
        );
        sprite(ctx, s, `tiles/crack/frame0${frame}.png`, x, y, C.TILE, C.TILE);
      }
      ctx.strokeStyle = "#b9d8d207";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, C.TILE, C.TILE);
    }
  if (cy < C.SURFACE_Y) {
    for (let col = c0; col <= c1; col++)
      if (col !== C.CAVE_MOUTH_COL && tile(s, col, 1).kind !== "tunnel")
        sprite(
          ctx,
          s,
          "surface/ground.png",
          col * C.TILE,
          C.SURFACE_Y,
          C.TILE,
          C.TILE,
        );
    sprite(
      ctx,
      s,
      "surface/cave-mouth.png",
      C.CAVE_MOUTH_COL * C.TILE,
      C.SURFACE_Y - 28,
      C.TILE,
      96,
    );
    for (const b of BUILDING_RECTS) {
      sprite(ctx, s, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      const near =
        Math.abs(s.miner.y + C.MINER_H - C.SURFACE_Y) < 3 &&
        s.miner.x + C.MINER_W / 2 >= b.x - 28 &&
        s.miner.x + C.MINER_W / 2 <= b.x + b.w + 28;
      box(
        ctx,
        { x: b.x + 4, y: C.SURFACE_Y + 16, w: b.w - 8, h: 27 },
        "#102530df",
        near ? P.gold : "#3d5259",
        2,
      );
      text(
        ctx,
        b.id.replace(/-/g, " ").toUpperCase(),
        b.x + 15,
        C.SURFACE_Y + 34,
        11,
        near ? P.gold : "#a4b8b7",
        600,
      );
      if (near && !s.panel && s.launchTime === null) {
        box(
          ctx,
          { x: b.x + 25, y: b.y - 43, w: 190, h: 30 },
          "#142a35",
          P.gold,
          3,
        );
        text(
          ctx,
          "[E] " + (b.id === "save-pad" ? "SAVE" : "INTERACT"),
          b.x + 42,
          b.y - 23,
          12,
          P.gold,
          600,
        );
      }
    }
    sprite(
      ctx,
      s,
      `rocket/stage${s.installed}.png`,
      BUILDING_RECTS[5].x + 95,
      C.SURFACE_Y - 220 - (s.launchTime ?? 0) ** 2 * 140,
      138,
      224,
    );
  }
  const m = s.miner;
  if (s.launchTime === null) {
    const count = m.state === "walk" ? 8 : 4,
      index =
        m.state === "hurt"
          ? Math.min(count - 1, Math.floor(s.animTime * C.ANIM_FPS))
          : Math.floor(s.animTime * C.ANIM_FPS) % count;
    ctx.save();
    ctx.translate(m.x + C.MINER_W / 2, m.y + C.MINER_H / 2);
    if (m.facing === "west") ctx.scale(-1, 1);
    sprite(
      ctx,
      s,
      `miner/${m.state}/frame${String(index).padStart(2, "0")}.png`,
      -C.MINER_SPRITE / 2,
      -C.MINER_SPRITE / 2,
      C.MINER_SPRITE,
      C.MINER_SPRITE,
    );
    ctx.restore();
  }
  // Produced systems are evaluated from the immutable effect age, never a render clock.
  for (const e of s.effects)
    drawEffect(ctx, s, e.name, e.x, e.y, e.age, e.seed, e.tint);
  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++)
      if (tile(s, col, row).kind === "gas")
        drawEffect(
          ctx,
          s,
          "gas-seep",
          (col + 0.5) * C.TILE,
          (row + 0.5) * C.TILE,
          (s.elapsedSeconds + (col * 7 + row * 3) * 0.13) % C.GAS_SEEP_PERIOD,
          col * 97 + row,
        );
  if (s.coreGround) {
    const x = (s.coreGround.col + 0.5) * C.TILE,
      y = (s.coreGround.row + 0.5) * C.TILE;
    sprite(ctx, s, "materials/core-sample.png", x - 28, y - 28, 56, 56);
    text(
      ctx,
      `${Math.ceil(s.coreTimer ?? 0)}s`,
      x - 18,
      y - 38,
      20,
      P.red,
      700,
    );
  }
  ctx.restore();
  if (depth(s) > 0) {
    const mx = m.x + C.MINER_W / 2 - cx,
      my = m.y + C.MINER_H / 2 - cy + C.HUD_H;
    const light = ctx.createRadialGradient(mx, my, 110, mx, my, 740);
    light.addColorStop(0, "#07121c00");
    light.addColorStop(0.75, "#07121c35");
    light.addColorStop(1, "#07121c9a");
    ctx.fillStyle = light;
    ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  }
}
function gauge(
  ctx: Context,
  s: ReadState,
  kind: "fuel" | "hull",
  x: number,
): void {
  const max = kind === "fuel" ? maxFuel(s) : maxHull(s),
    value = s.miner[kind],
    low =
      value / max <
      (kind === "fuel" ? C.LOW_FUEL_FRACTION : C.LOW_HULL_FRACTION),
    color = low ? P.red : kind === "fuel" ? P.gold : P.mint;
  sprite(ctx, s, `icons/${kind}.png`, x, 15, C.ICON_SIZE, C.ICON_SIZE);
  text(ctx, kind.toUpperCase(), x + 32, 21, 10, P.muted, 600);
  text(ctx, `${Math.ceil(value)}/${max}`, x + 32, 39, 14, color, 600);
  ctx.fillStyle = "#29434d";
  ctx.fillRect(x + 119, 15, 64, 25);
  ctx.fillStyle = color;
  ctx.fillRect(x + 121, 17, 60 * clamp(value / max, 0, 1), 21);
  for (let i = 1; i < 6; i++) {
    ctx.fillStyle = "#132733";
    ctx.fillRect(x + 121 + i * 10, 17, 2, 21);
  }
}
function hud(ctx: Context, s: ReadState): void {
  ctx.fillStyle = "#0c1d28";
  ctx.fillRect(0, 0, C.STAGE_W, C.HUD_H);
  rule(ctx, 0, C.HUD_H - 1, C.STAGE_W, "#6f7059");
  gauge(ctx, s, "fuel", 22);
  gauge(ctx, s, "hull", 230);
  sprite(ctx, s, "icons/cargo.png", 442, 15, C.ICON_SIZE, C.ICON_SIZE);
  const overload = loadKg(s) >= jet(s).liftLimitKg;
  tag(
    ctx,
    overload ? C.OVERLOAD : "CARGO BAY",
    474,
    21,
    overload ? P.red : P.muted,
  );
  text(
    ctx,
    `${slots(s)}/${C.CARGO_TIERS[s.tiers.cargo - 1]} · ${Math.round(loadKg(s))}kg`,
    474,
    40,
    13,
    overload || slots(s) >= C.CARGO_TIERS[s.tiers.cargo - 1] ? P.red : P.cream,
  );
  sprite(ctx, s, "icons/credits.png", 654, 15, C.ICON_SIZE, C.ICON_SIZE);
  tag(ctx, "CREDITS", 686, 21, P.muted);
  text(ctx, Math.floor(s.credits).toLocaleString(), 686, 40, 15, P.gold, 600);
  sprite(ctx, s, "icons/depth.png", 808, 15, C.ICON_SIZE, C.ICON_SIZE);
  tag(ctx, "DEPTH", 840, 21, P.muted);
  text(
    ctx,
    `${Math.floor(depth(s)).toLocaleString()} m`,
    840,
    40,
    15,
    P.cream,
    600,
  );
  for (const [i, material] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[material] ? 1 : 0.25;
    sprite(
      ctx,
      s,
      `icons/${material}.png`,
      964 + i * 39,
      15,
      C.ICON_SIZE,
      C.ICON_SIZE,
    );
    ctx.globalAlpha = 1;
  }
  for (const c of controls(s).filter((c) => c.rect.y < C.HUD_H))
    button(ctx, c.rect, c.label, false, c.enabled);
}
function mineUI(ctx: Context, s: ReadState): void {
  const meters = depth(s),
    band = bandAt(
      Math.max(
        1,
        Math.min(s.coreRow - 1, Math.floor((s.miner.y + C.MINER_H) / C.TILE)),
      ),
      s.coreRow,
    ),
    bi = C.BANDS.indexOf(band);
  tag(
    ctx,
    meters > 0
      ? `STRATUM 0${bi + 1} / ${band.toUpperCase()}`
      : "SURFACE / OUTPOST 04",
    26,
    90,
  );
  text(
    ctx,
    meters > 0 ? "THE ONLY WAY OUT IS UP." : "A DEAD WORLD. A WAY HOME.",
    26,
    111,
    10,
    P.muted,
  );
  box(ctx, { x: 1000, y: 77, w: 252, h: 64 }, "#0c202bcf", "#3a5158", 3);
  tag(ctx, "ESCAPE VEHICLE", 1015, 97, P.muted);
  text(ctx, `${s.installed} / 5 COMPONENTS`, 1015, 124, 18, P.gold, 600);
  // The quiet depth ruler is interface, separate from the tile artwork.
  if (meters > 0) {
    ctx.strokeStyle = "#9bb5b246";
    ctx.beginPath();
    ctx.moveTo(18, 150);
    ctx.lineTo(18, 590);
    ctx.stroke();
    for (let y = 150; y <= 590; y += 20) {
      rule(ctx, 18, y, y % 5 === 0 ? 12 : 6, "#728a894d");
    }
    tag(ctx, "↓", 22, 619, P.muted);
  }
  const scan = scanner(s);
  if (scan.locked) {
    box(ctx, { x: 27, y: 135, w: 270, h: 51 }, "#102a35df", "#65978e", 3);
    text(ctx, `SCAN · ${scan.target?.toUpperCase()}`, 43, 155, 12, P.mint, 600);
    text(
      ctx,
      `${scan.distanceTiles?.toFixed(1)} tiles  ${scan.dirY > 0 ? "↓" : "↑"} ${scan.dirX > 0 ? "→" : "←"}`,
      43,
      174,
      12,
      P.cream,
    );
  }
  if (s.satchel.coreSample) {
    box(ctx, { x: 470, y: 76, w: 340, h: 76 }, "#3d2628ef", P.red, 3);
    tag(ctx, "UNSTABLE CORE SAMPLE", 489, 98, P.red);
    text(ctx, `${(s.coreTimer ?? 0).toFixed(1)} s`, 489, 132, 30, P.cream, 700);
    text(ctx, "[J] JETTISON", 665, 128, 12, P.red);
  }
  if (!s.panel) {
    box(ctx, { x: 324, y: 668, w: 632, h: 34 }, "#0c202be8", "#36515a", 3);
    text(
      ctx,
      "A D  MOVE / CUT     S  DRILL DOWN     W / SPACE  THRUST",
      345,
      690,
      12,
      P.muted,
    );
  }
  if (s.noteTime > 0 && s.note) {
    box(ctx, { x: 300, y: 610, w: 680, h: 42 }, "#152f3aed", P.gold, 3);
    text(ctx, s.note, 320, 636, 13, P.gold);
  }
  if (s.notice && s.notice.age >= C.NOTICE_DELAY) {
    box(ctx, { x: 340, y: 588, w: 600, h: 100 }, "#182c36f5", P.red, 4);
    tag(
      ctx,
      s.notice.hazard === "gas" ? "GAS POCKET DETONATION" : "LAVA EXPOSURE",
      360,
      613,
      P.red,
    );
    text(
      ctx,
      s.notice.hazard === "gas"
        ? "Watch for pale seeps. Hull is your only protection."
        : "Avoid molten seams. Upgrade your radiator to resist heat.",
      360,
      639,
      13,
    );
    text(ctx, "Click to dismiss · keep moving", 360, 665, 11, P.muted);
  }
}
function trackEffect(track: C.TrackName, tier: number): string {
  switch (track) {
    case "fuel":
      return `${C.FUEL_TIERS[tier - 1]} fuel capacity`;
    case "hull":
      return `${C.HULL_TIERS[tier - 1]} hull integrity`;
    case "drill":
      return `Power rating ${tier}`;
    case "cargo":
      return `${C.CARGO_TIERS[tier - 1]} cargo slots`;
    case "jetpack":
      return `${C.JETPACK_TIERS[tier - 1].liftLimitKg}kg lift · ${C.JETPACK_TIERS[tier - 1].emptyClimb} climb`;
    case "radiator":
      return `${Math.round(C.RADIATOR_TIERS[tier - 1] * 100)}% heat reduction`;
    case "scanner":
      return tier === 1
        ? "No scanner"
        : `${C.SCANNER_TIERS[tier - 1]} tile lock range`;
  }
}
function supplyIcon(ctx: Context, item: C.ItemId, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  if (item === "dynamite") {
    for (let i = 0; i < 3; i++)
      box(ctx, { x: 5 + i * 7, y: 8, w: 6, h: 19 }, P.red, "#562e32", 2);
    ctx.fillStyle = P.gold;
    ctx.fillRect(4, 16, 23, 4);
    ctx.strokeStyle = P.gold;
    ctx.beginPath();
    ctx.moveTo(15, 7);
    ctx.lineTo(18, 3);
    ctx.lineTo(24, 4);
    ctx.stroke();
  } else if (item === "plastic-explosives") {
    box(ctx, { x: 4, y: 7, w: 24, h: 20 }, "#bdab80", "#e2cd95", 3);
    box(ctx, { x: 9, y: 11, w: 15, h: 9 }, "#203b47");
    text(ctx, "02", 10, 19, 8, P.red);
    ctx.strokeStyle = P.red;
    ctx.beginPath();
    ctx.moveTo(10, 7);
    ctx.lineTo(8, 2);
    ctx.lineTo(26, 2);
    ctx.lineTo(25, 8);
    ctx.stroke();
  } else if (item === "nanobots") {
    ctx.fillStyle = P.mint;
    ctx.fillRect(12, 5, 8, 23);
    ctx.fillRect(5, 12, 23, 8);
    ctx.fillStyle = "#e1fff1";
    ctx.fillRect(14, 13, 4, 5);
  } else if (item === "emergency-fuel") {
    box(ctx, { x: 7, y: 7, w: 20, h: 22 }, P.gold, "#e8d6a1", 2);
    ctx.fillStyle = P.gold;
    ctx.fillRect(17, 2, 8, 6);
    ctx.fillStyle = "#2d4a55";
    ctx.fillRect(11, 10, 12, 5);
    ctx.fillRect(15, 19, 4, 6);
  } else {
    ctx.strokeStyle = item === "quantum-teleporter" ? "#bb9ed9" : P.mint;
    ctx.beginPath();
    ctx.ellipse(16, 16, 12, 9, -0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(16, 16, 7, 13, 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = P.cream;
    ctx.beginPath();
    ctx.moveTo(16, 8);
    ctx.lineTo(21, 16);
    ctx.lineTo(16, 24);
    ctx.lineTo(11, 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
function panel(ctx: Context, s: ReadState): void {
  if (!s.panel) return;
  ctx.fillStyle = "#06121bb8";
  ctx.fillRect(0, C.HUD_H, C.STAGE_W, C.VIEW_H);
  box(ctx, { x: 130, y: 110, w: 1020, h: 525 }, "#102632f7", "#57716f", 6);
  ctx.fillStyle = P.gold;
  ctx.fillRect(130, 110, 5, 65);
  tag(
    ctx,
    "OUTPOST 04 / " +
      (s.panel === "inventory" ? "PERSONAL SYSTEMS" : "SURFACE SERVICES"),
    163,
    139,
    P.muted,
  );
  text(
    ctx,
    s.panel.replace(/-/g, " ").toUpperCase(),
    161,
    177,
    30,
    P.cream,
    600,
    "sans-serif",
  );
  text(
    ctx,
    `${Math.floor(s.credits).toLocaleString()} CR`,
    900,
    160,
    21,
    P.gold,
    600,
  );
  rule(ctx, 162, 197, 956);
  text(ctx, "ESC  CLOSE", 996, 616, 11, P.muted);
  switch (s.panel) {
    case "fuel-depot": {
      for (const [i, kind] of (["fuel", "hull"] as const).entries()) {
        const x = 190 + i * 510;
        sprite(ctx, s, `icons/${kind}.png`, x, 237, 40, 40);
        tag(
          ctx,
          kind === "fuel" ? "JETPACK CHARGE" : "SUIT INTEGRITY",
          x + 60,
          247,
        );
        text(
          ctx,
          `${s.miner[kind].toFixed(1)} / ${kind === "fuel" ? maxFuel(s) : maxHull(s)}`,
          x + 60,
          279,
          28,
        );
        text(
          ctx,
          `${kind === "fuel" ? C.FUEL_PRICE : C.REPAIR_PRICE} CR per ${kind === "fuel" ? "unit" : "point"}`,
          x,
          312,
          13,
          P.muted,
        );
      }
      text(
        ctx,
        "The surface is safe. Fuel and repairs are never free.",
        190,
        515,
        15,
        P.muted,
      );
      break;
    }
    case "ore-market": {
      tag(ctx, "MINERAL", 180, 226, P.muted);
      tag(ctx, "UNITS", 540, 226, P.muted);
      tag(ctx, "VALUE", 658, 226, P.muted);
      let i = 0,
        total = 0;
      for (const ore of C.MINERALS)
        if (s.cargo[ore.id]) {
          const y = 254 + i * 23;
          const count = s.cargo[ore.id] ?? 0;
          sprite(ctx, s, `ore/${ore.id}.png`, 178, y - 16, 25, 25);
          text(ctx, ore.name, 218, y, 14);
          text(ctx, String(count), 550, y, 13, P.muted);
          text(ctx, `${count * ore.value} CR`, 650, y, 13, P.gold);
          total += count * ore.value;
          i++;
        }
      if (!i)
        text(
          ctx,
          "Your cargo bay is empty. The rock is waiting.",
          180,
          292,
          16,
          P.muted,
        );
      text(ctx, "TOTAL VALUE", 180, 566, 12, P.muted);
      text(ctx, `${total.toLocaleString()} CR`, 180, 594, 26, P.gold, 600);
      break;
    }
    case "upgrade-shop":
      for (const [i, track] of C.TRACKS.entries()) {
        const tier = s.tiers[track],
          y = 242 + i * 48;
        tag(ctx, track.toUpperCase(), 180, y);
        text(
          ctx,
          `T${tier} → ${tier < C.MAX_TIER[track] ? trackEffect(track, tier + 1) : "MAXIMUM"}`,
          335,
          y,
          13,
          P.muted,
        );
        rule(ctx, 180, y + 16, 880, "#2b434d");
      }
      break;
    case "supply-depot":
      for (const [i, item] of C.ITEMS.entries()) {
        const y = 247 + i * 57;
        box(ctx, { x: 180, y: y - 22, w: 33, h: 33 }, "#29414b", P.line, 4);
        supplyIcon(ctx, item.id, 181, y - 21);
        text(ctx, `${i + 1}  ${item.name}`, 232, y - 3, 15);
        text(
          ctx,
          `HELD ${s.items[item.id]} · ${["3×3 blast", "5×5 blast", "Risky surface jump", "Safe surface return", "Restore 20 hull", "Restore 30 fuel"][i]}`,
          232,
          y + 16,
          11,
          P.muted,
        );
      }
      break;
    case "launch-pad": {
      sprite(ctx, s, `rocket/stage${s.installed}.png`, 208, 240, 180, 294);
      for (const [i, c] of C.ROCKET_COMPONENTS.entries()) {
        const y = 239 + i * 57;
        tag(
          ctx,
          i < s.installed ? "✓ INSTALLED" : `0${i + 1}`,
          450,
          y,
          i < s.installed ? P.mint : P.muted,
        );
        text(
          ctx,
          c.name,
          570,
          y,
          17,
          i === s.installed ? P.gold : P.cream,
          600,
        );
        text(
          ctx,
          `${c.credits.toLocaleString()} CR${c.material ? " + " + c.material.toUpperCase() : ""}`,
          570,
          y + 21,
          12,
          P.muted,
        );
      }
      if (s.installed === 5)
        text(ctx, "FLIGHT SYSTEMS GREEN. GO HOME.", 450, 568, 16, P.mint, 600);
      break;
    }
    case "inventory": {
      text(
        ctx,
        `${slots(s)}/${C.CARGO_TIERS[s.tiers.cargo - 1]} SLOTS  ·  ${Math.round(loadKg(s))}/${jet(s).liftLimitKg} KG${loadKg(s) >= jet(s).liftLimitKg ? "  " + C.OVERLOAD : ""}`,
        180,
        222,
        12,
        loadKg(s) >= jet(s).liftLimitKg ? P.red : P.gold,
      );
      let i = 0;
      for (const ore of C.MINERALS)
        if (s.cargo[ore.id]) {
          const y = 250 + i * 27;
          sprite(ctx, s, `ore/${ore.id}.png`, 177, y - 18, 25, 25);
          text(ctx, ore.name, 213, y, 13);
          text(
            ctx,
            `${s.cargo[ore.id]} × ${ore.weightKg}kg`,
            365,
            y,
            12,
            P.muted,
          );
          i++;
        }
      if (!i) text(ctx, "No mineral cargo.", 180, 271, 14, P.muted);
      text(
        ctx,
        `RESONITE ${s.satchel.resonite}   CRYENITE ${s.satchel.cryenite}`,
        712,
        228,
        12,
        P.mint,
      );
      tag(ctx, "FIELD SUPPLIES / HOTKEYS 1–6", 712, 256, P.muted);
      for (const [j, item] of C.ITEMS.entries()) {
        const y = 294 + j * 42;
        text(
          ctx,
          `${j + 1}  ${item.name}`,
          712,
          y,
          12,
          s.items[item.id] ? P.cream : "#6d858d",
        );
        text(ctx, `×${s.items[item.id]}`, 910, y, 12, P.gold);
      }
      if (s.satchel.coreSample)
        tag(ctx, `CORE SAMPLE · ${s.coreTimer?.toFixed(1)}s`, 712, 541, P.red);
      break;
    }
  }
  const list = controls(s).filter(
    (c) => c.rect.y > C.HUD_H && c.id !== "dismiss-notice",
  );
  for (const [i, c] of list.entries())
    button(ctx, c.rect, c.label, s.panelIndex === i, c.enabled);
}
function titleArt(ctx: Context, s: ReadState): void {
  sprite(ctx, s, "surface/sky.png", 0, 0, C.STAGE_W, C.STAGE_H);
  // The cross-section uses the same produced strata, veins, tunnels and character
  // as live play, arranged as an editorial title illustration.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(690, 90, 500, 552, 7);
  ctx.clip();
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 7; c++) {
      const x = 680 + c * C.TILE,
        y = 105 + r * C.TILE,
        b = C.BANDS[Math.min(3, Math.floor(r / 2))];
      sprite(ctx, s, `tiles/${b}-${(c + r) % 3}.png`, x, y, C.TILE, C.TILE);
      if (c === 3 || (r === 4 && c > 1 && c < 6))
        sprite(ctx, s, "tiles/tunnel.png", x + 6, y, 68, C.TILE);
      else if ((c * 3 + r * 5) % 7 === 0)
        sprite(
          ctx,
          s,
          `ore/${C.MINERALS[(r + c) % C.MINERALS.length].id}.png`,
          x,
          y,
          C.TILE,
          C.TILE,
        );
    }
  sprite(
    ctx,
    s,
    `miner/jetpack/frame0${Math.floor(s.simTime * C.ANIM_FPS) % 4}.png`,
    902,
    266,
    112,
    112,
  );
  drawEffect(ctx, s, "jetpack-exhaust", 920, 357, s.simTime % 0.6, 76);
  const grad = ctx.createLinearGradient(690, 0, 1190, 0);
  grad.addColorStop(0, "#0c19236b");
  grad.addColorStop(1, "#0c192300");
  ctx.fillStyle = grad;
  ctx.fillRect(690, 90, 500, 552);
  ctx.restore();
  box(ctx, { x: 690, y: 90, w: 500, h: 552 }, "#00000000", "#6f7461", 7);
  tag(ctx, "GEOLOGICAL SURVEY / SECTOR 04", 713, 119, P.gold);
  tag(ctx, "01 — DESCENT IS FREE. ASCENT IS EARNED.", 713, 619, P.gold);
  rule(ctx, 713, 136, 452, "#a2a38250");
}
const HELP = [
  [
    "01 / DIG & HAUL",
    "A/D or arrows move and cut walls. S drills down. Never up.",
  ],
  ["02 / FLY HOME", "W / Space fires the jetpack. Fuel pays for every climb."],
  [
    "03 / WATCH YOUR WEIGHT",
    "Slots limit cargo. Kilograms limit lift. I opens the bay; drop ore.",
  ],
  [
    "04 / SELL & UPGRADE",
    "E activates camp buildings. Sell ore, buy fuel, repair, upgrade.",
  ],
  [
    "05 / READ THE ROCK",
    "Gas seeps warn of blasts. Lava burns. Brake before a hard landing.",
  ],
  [
    "06 / BUILD YOUR ESCAPE",
    "Find Resonite and Cryenite with a scanner. Build five rocket parts.",
  ],
  [
    "07 / THE CORE RUN",
    "Drill the Core for a Sample. You have 90 seconds. J jettisons it.",
  ],
  [
    "08 / PLAN FOR LOSS",
    "Save only at the Save Pad. Standard restores; Hardcore deletes saves.",
  ],
];
function menus(ctx: Context, s: ReadState): void {
  const title = s.screen === "title";
  if (
    title ||
    s.screen === "mode-select" ||
    s.screen === "size-select" ||
    s.screen === "how-to-play"
  )
    titleArt(ctx, s);
  else {
    ctx.fillStyle = "#07151cde";
    ctx.fillRect(0, C.HUD_H, C.STAGE_W, C.VIEW_H);
  }
  if (!title) {
    ctx.fillStyle = "#0c1923d9";
    ctx.fillRect(70, 65, s.screen === "how-to-play" ? 1140 : 580, 600);
  }
  if (title) {
    tag(ctx, "A SUBTERRANEAN EXPEDITION", 92, 118, P.gold);
    rule(ctx, 92, 137, 160, P.gold);
    text(ctx, C.TITLE_TEXT, 84, 257, 94, P.cream, 900, "sans-serif");
    text(ctx, "GO DEEP. GET RICH. GET HOME.", 94, 299, 17, P.gold, 600);
    text(
      ctx,
      "Stranded above a fortune. Powered by what you bring back.",
      94,
      332,
      12,
      P.muted,
    );
    tag(ctx, "32 COLUMNS. FOUR STRATA. ONE WAY OUT.", 94, 629, P.muted);
  } else {
    tag(ctx, "DEEPCORE / EXPEDITION CONTROL", 110, 111, P.gold);
    const heading = {
      "mode-select": "CHOOSE YOUR RISK",
      "size-select": "CHOOSE YOUR DEPTH",
      "how-to-play": "A FIELD GUIDE",
      paused: "TAKE A BREATH",
      victory: "HOMEWARD BOUND",
      "game-over": "SIGNAL LOST",
    }[s.screen as Exclude<C.ScreenName, "title" | "in-mine">];
    text(ctx, heading, 108, 173, 36, P.cream, 800, "sans-serif");
    rule(ctx, 110, 197, s.screen === "how-to-play" ? 1050 : 475);
    if (s.screen === "mode-select") {
      text(
        ctx,
        "Standard · restore your last Save Pad checkpoint.",
        132,
        235,
        13,
        P.muted,
      );
      text(
        ctx,
        "Hardcore · death deletes your save. The end.",
        132,
        264,
        13,
        P.red,
      );
    }
    if (s.screen === "size-select") {
      text(ctx, "Same stakes. A longer climb.", 132, 230, 14, P.muted);
    }
    if (s.screen === "paused")
      text(ctx, "Your expedition will wait.", 132, 235, 15, P.muted);
    if (s.screen === "how-to-play")
      for (const [i, [h, body]] of HELP.entries()) {
        const y = 239 + i * 44;
        tag(ctx, h, 111, y, P.gold);
        text(ctx, body, 345, y, 13, P.cream);
      }
    if (s.summary) {
      const q = s.summary;
      const elapsed = `${Math.floor(q.elapsedSeconds / 60)}m ${Math.floor(q.elapsedSeconds % 60)}s`;
      text(
        ctx,
        q.deathCause
          ? q.deathCause.replace(/-/g, " ").toUpperCase()
          : "ESCAPE ROCKET LAUNCHED",
        132,
        234,
        14,
        q.deathCause ? P.red : P.mint,
        600,
      );
      const lines = [
        [
          "DEEPEST REACH",
          `${Math.floor(q.deepestDepthMeters).toLocaleString()} m`,
        ],
        ["CREDITS EARNED", q.creditsEarned.toLocaleString()],
        ["TIME / MODE", `${elapsed} · ${q.mode.toUpperCase()}`],
        ["ROCKET COMPONENTS", `${q.componentsInstalled} / 5`],
      ];
      for (const [i, [label, value]] of lines.entries()) {
        tag(ctx, label, 132, 273 + i * 34, P.muted);
        text(ctx, value, 364, 273 + i * 34, 15, P.gold);
      }
    }
  }
  for (const [i, label] of menuItems(s).entries()) {
    const r = menuItemRect(s, i)!;
    let suffix = "";
    if (s.screen === "size-select" && i < C.WORLD_SIZES.length)
      suffix = `  /  ${C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[C.WORLD_SIZES[i]] * C.METERS_PER_ROW}m`;
    button(ctx, r, label + suffix, i === s.menuIndex);
  }
  text(
    ctx,
    "↑ ↓  SELECT     ENTER  CONFIRM     M  AUDIO",
    title ? 94 : 132,
    690,
    11,
    P.muted,
  );
  tag(ctx, "ORIGINAL TRANSMISSION / 04", 1010, 690, P.muted);
}
export function renderGame(s: ReadState, ctx: Context): void {
  ctx.imageSmoothingEnabled = false;
  if (["in-mine", "paused", "victory", "game-over"].includes(s.screen)) {
    world(ctx, s);
    hud(ctx, s);
    if (s.screen === "in-mine") {
      mineUI(ctx, s);
      panel(ctx, s);
    } else menus(ctx, s);
  } else menus(ctx, s);
}
