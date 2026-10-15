import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import console from "node:console";
import { Buffer } from "node:buffer";

// Run against the development server. The capture engine stays in this closure;
// the shipped page never publishes an engine or a debug surface on window.
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (error) => {
  throw error;
});
await page.route("http://localhost:5173/", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<html><body style="margin:0;background:#0c1923"><canvas id="capture" style="width:1280px;height:720px;display:block"></canvas></body></html>',
  }),
);
await page.goto("http://localhost:5173/");
const media = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/.vendor/engine/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const C = await import("/src/constants.ts");
  const canvas = globalThis.document.getElementById("capture");
  const e = createEngine({
    canvas,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
  });
  await e.initialize();
  const pose = (method, ...args) => e.apply((s) => e.debug[method](s, ...args));
  const key = (code, down) =>
    globalThis.document.dispatchEvent(
      new globalThis.KeyboardEvent(down ? "keydown" : "keyup", { code }),
    );
  pose("setWorldSize", "quick");
  pose("generateMine");
  pose("setScreen", "in-mine");
  for (const track of C.TRACKS)
    pose("setTier", track, track === "scanner" ? 2 : 3);
  pose("setFuel", C.FUEL_TIERS[2]);
  pose("setHull", C.HULL_TIERS[2]);
  pose("setCredits", 2280);
  for (let row = 67; row < 82; row++) pose("setTile", 16, row, "tunnel");
  for (let col = 13; col <= 18; col++) pose("setTile", col, 76, "tunnel");
  for (let row = 82; row <= 88; row++) {
    pose("setOreTile", 16, row, row % 2 ? "cobaltine" : "argenite");
    pose("setTile", 16, row + 1, "rock");
  }
  for (let row = 1; row < e.state.coreRow; row++)
    for (let col = 1; col < C.WORLD_COLS - 1; col++)
      if (e.debug.tileAt(e.state, col, row).material === "resonite")
        pose("setTile", col, row, "rock");
  pose("setMaterialTile", 19, 84, "resonite");
  pose("setMinerPosition", 16 * C.TILE + 12, 82 * C.TILE - C.MINER_H);
  await e.advance(1);
  e.startRecording();
  key("KeyS", true);
  await e.advance(140);
  const mine = canvas.toDataURL("image/png");
  key("KeyS", false);
  key("Space", true);
  await e.advance(170);
  key("Space", false);
  const recording = e.stopRecording();
  pose("reset");
  pose("setWorldSize", "quick");
  pose("generateMine");
  pose("setScreen", "in-mine");
  pose("setRocketInstalled", 4);
  pose("setCredits", 6900);
  pose("setMaterial", "resonite", 1);
  pose("setMaterial", "cryenite", 1);
  pose("setMinerPosition", 1460, C.SURFACE_Y - C.MINER_H);
  await e.advance(1);
  const camp = canvas.toDataURL("image/png");
  pose("setTier", "fuel", 5);
  pose("setFuel", 390);
  pose("setTier", "hull", 5);
  pose("setHull", 320);
  pose("setTier", "radiator", 5);
  for (let row = 204; row <= 211; row++) pose("setTile", 16, row, "tunnel");
  for (let col = 13; col <= 20; col++)
    for (let row = 209; row <= 211; row++) pose("setTile", col, row, "tunnel");
  for (let col = 19; col <= 23; col++)
    for (let row = 212; row <= 213; row++) pose("setTile", col, row, "lava");
  for (let col = 11; col <= 14; col++) pose("setOreTile", col, 212, "pyronium");
  pose("setOreTile", 18, 208, "aurite");
  pose("setCargo", "cindrite", 4);
  pose("setCoreCarried", true);
  pose("setCoreTimer", 42);
  pose("setMinerPosition", 16 * C.TILE + 12, 212 * C.TILE - C.MINER_H);
  await e.advance(1);
  const core = canvas.toDataURL("image/png");
  e.destroy();
  return { recording, mine, camp, core };
});
await writeFile(
  "showcase/descent.json.gz",
  gzipSync(JSON.stringify(media.recording), { level: 9 }),
);
for (const [key, name] of [
  ["mine", "rockbed.png"],
  ["camp", "surface.png"],
  ["core", "coreshell.png"],
])
  await writeFile(
    `showcase/${name}`,
    Buffer.from(media[key].split(",")[1], "base64"),
  );
console.log(
  `Captured ${media.recording.frames.length} live frames and three screenshots.`,
);
await browser.close();
