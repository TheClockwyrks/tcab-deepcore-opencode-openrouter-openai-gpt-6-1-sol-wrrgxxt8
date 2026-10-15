import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import console from "node:console";
import { URL } from "node:url";

const prefix = "/nested/deepcore/";
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".wav": "audio/wav",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (!pathname.startsWith(prefix)) {
      response.writeHead(404);
      response.end();
      return;
    }
    const relative = pathname.slice(prefix.length) || "index.html";
    const file = path.resolve("dist", relative);
    assert(file.startsWith(path.resolve("dist") + path.sep));
    response.writeHead(200, {
      "content-type": mime[path.extname(file)] || "application/octet-stream",
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(4184, "127.0.0.1", resolve));
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors = [],
    failures = [];
  let assets = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
    if (response.url().includes("/assets/")) assets++;
  });
  await page.goto(`http://127.0.0.1:4184${prefix}`);
  await page.waitForTimeout(1600);
  assert(
    (await page.screenshot()).byteLength > 25000,
    "Title should render real artwork",
  );
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
  }
  await page.keyboard.down("s");
  await page.waitForTimeout(1800);
  await page.keyboard.up("s");
  await page.keyboard.down("Space");
  await page.waitForTimeout(1200);
  await page.keyboard.up("Space");
  await page.keyboard.press("i");
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await page.keyboard.press("p");
  await page.keyboard.press("p");
  await page.setViewportSize({ width: 840, height: 940 });
  await page.waitForTimeout(100);
  assert(assets >= 125, `Expected all generated assets, saw ${assets}`);
  assert.deepEqual(failures, []);
  assert.deepEqual(errors, []);
  console.log(
    `Production passed at ${prefix}: ${assets} asset requests, drilling, thrust, panels, pause, and resize.`,
  );
} finally {
  await browser.close();
  server.close();
}
