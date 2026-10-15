import { readFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import console from "node:console";

const carousel = await readFile("showcase/showcase.toml", "utf8");
const files = [...carousel.matchAll(/file\s*=\s*"([^"]+)"/g)].map(
  (match) => match[1],
);
assert(files.length >= 2 && files.length <= 4);
for (const file of files) {
  assert(!file.includes("/") && !file.includes("\\"));
  const size = (await stat(`showcase/${file}`)).size;
  assert(size < 25 * 1024 * 1024);
  if (file.endsWith(".json.gz")) {
    const recording = JSON.parse(
      gunzipSync(await readFile(`showcase/${file}`)).toString(),
    );
    assert(recording.frames.length >= 120);
    assert(recording.images.length > 10);
    assert(recording.frames.every((frame) => !frame.truncated));
    assert(!JSON.stringify(recording).includes('"$opaque"'));
    console.log(
      `${file}: ${recording.frames.length} frames, ${recording.images.length} captured bitmaps, ${(size / 1024).toFixed(0)} KiB.`,
    );
  }
}
console.log("Showcase media and carousel passed.");
