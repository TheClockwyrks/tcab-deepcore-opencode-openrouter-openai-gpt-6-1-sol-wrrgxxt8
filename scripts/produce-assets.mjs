// One-time authorship recipe. The production build only bundles its finished files.
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import console from "node:console";

const root = path.resolve("assets");
const temp = "/tmp/opencode";
let seed = 73491;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const run = (tool, args) =>
  execFileSync(tool, args.map(String), { stdio: "pipe" });
let ops = [];
const rect = (x, y, w, h, color) =>
  ops.push({
    op: "fill_rect",
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    color,
  });
const line = (x1, y1, x2, y2, color) =>
  ops.push({
    op: "line",
    x0: Math.round(x1),
    y0: Math.round(y1),
    x1: Math.round(x2),
    y1: Math.round(y2),
    color,
  });
const circle = (cx, cy, r, color) =>
  ops.push({
    op: "fill_circle",
    cx: Math.round(cx),
    cy: Math.round(cy),
    r: Math.round(r),
    color,
  });
function poly(points, color) {
  const min = Math.ceil(Math.min(...points.map((p) => p[1]))),
    max = Math.floor(Math.max(...points.map((p) => p[1])));
  for (let y = min; y <= max; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2)
      rect(xs[i], y, xs[i + 1] - xs[i] + 1, 1, color);
  }
}
function save(file, w = 80, h = 80, sheet = false) {
  const out = path.join(root, file);
  mkdirSync(path.dirname(out), { recursive: true });
  const log = path.join(temp, "art-actions.json");
  writeFileSync(log, JSON.stringify(ops));
  run(sheet ? "draw-sheet" : "draw", [
    "render",
    "--actions",
    log,
    "--out",
    out,
    "--width",
    w,
    "--height",
    h,
    "--no-layers",
  ]);
  ops = [];
}
const bands = ["topsoil", "rockbed", "deepstone", "coreshell"];
const palettes = [
  ["#58443d", "#624c41", "#6a5143", "#473932", "#80604b"],
  ["#3b4750", "#424e57", "#4b5660", "#303b43", "#647079"],
  ["#292f3d", "#303747", "#394151", "#222834", "#4a5266"],
  ["#402e39", "#4b323d", "#563744", "#30252f", "#70414a"],
];
for (let b = 0; b < 4; b++)
  for (let n = 0; n < 3; n++) {
    const p = palettes[b];
    rect(0, 0, 80, 80, p[0]);
    for (let i = 0; i < 950; i++) {
      const x = rnd() * 80,
        y = rnd() * 80;
      rect(x, y, 1 + rnd() * 3, 1 + rnd() * 2, p[1 + Math.floor(rnd() * 4)]);
    }
    for (let i = 0; i < 6; i++) {
      const x = rnd() * 80,
        y = rnd() * 80;
      line(x, y, x + 8 + rnd() * 17, y - 3, p[3]);
      line(x, y + 1, x + 9, y, p[1]);
    }
    save(`tiles/${bands[b]}-${n}.png`);
  }
rect(0, 0, 80, 80, "#101d26");
for (let i = 0; i < 200; i++) rect(rnd() * 80, rnd() * 80, 2, 1, "#182732");
save("tiles/tunnel.png");
rect(0, 0, 80, 80, "#172730");
for (let y = 0; y < 80; y += 20) {
  rect(1, y + 1, 78, 18, "#253943");
  line(1, y + 2, 78, y + 2, "#38515a");
  for (let x = 4; x < 80; x += 20) rect(x, y + 8, 3, 3, "#14242d");
}
save("tiles/bedrock.png");
for (let n = 0; n < 2; n++) {
  rect(0, 0, 80, 80, "#303744");
  poly(
    [
      [5, 22],
      [23, 4],
      [55, 7],
      [76, 28],
      [70, 65],
      [42, 77],
      [10, 63],
    ],
    "#182b39",
  );
  poly(
    [
      [8, 24],
      [24, 7],
      [54, 10],
      [70, 29],
      [64, 38],
      [17, 42],
    ],
    "#6a808c",
  );
  poly(
    [
      [17, 42],
      [64, 38],
      [70, 29],
      [67, 62],
      [42, 72],
      [12, 61],
    ],
    "#3c5362",
  );
  line(24, 11, 57, 15, "#a3b9bf");
  line(15 + n * 5, 54, 51, 46, "#253a49");
  save(`tiles/stone-${n}.png`);
}
const ores = [
  "ferron",
  "marlite",
  "cuprite",
  "argenite",
  "cobaltine",
  "voltite",
  "halcite",
  "pyronium",
  "cindrite",
  "adamite",
  "verdite",
  "roselite",
  "aurite",
];
const colors = [
  "#c09c7c",
  "#c8b650",
  "#df8c5b",
  "#c4dae0",
  "#5e9ed5",
  "#a9c95a",
  "#bf97d0",
  "#f2a85c",
  "#e86869",
  "#82eddd",
  "#6af0a0",
  "#f189c4",
  "#ffda77",
];
for (let n = 0; n < ores.length; n++) {
  const c = colors[n];
  if (n < 10) {
    for (let i = 0; i < 310; i++) {
      const x = rnd() * 80;
      const mid = 45 + Math.sin(x / 17) * 9;
      const y = mid + (rnd() - 0.5) * 27;
      rect(
        x,
        y,
        2 + rnd() * 7,
        1 + rnd() * 3,
        c + (rnd() > 0.45 ? "b0" : "55"),
      );
    }
    for (let i = 0; i < 28; i++) {
      let x = rnd() * 80,
        y = 45 + Math.sin(x / 17) * 9 + (rnd() - 0.5) * 13;
      line(x, y, x + 6, y - 2, c);
      rect(x, y, 2, 1, "#fff1c9b0");
    }
  } else {
    poly(
      [
        [21, 22],
        [56, 18],
        [68, 34],
        [43, 66],
        [12, 39],
      ],
      "#0f1d27",
    );
    poly(
      [
        [23, 24],
        [53, 21],
        [63, 35],
        [42, 59],
        [17, 38],
      ],
      c,
    );
    poly(
      [
        [23, 24],
        [53, 21],
        [48, 36],
        [31, 39],
      ],
      "#e9fff0",
    );
    poly(
      [
        [17, 38],
        [31, 39],
        [42, 59],
      ],
      c + "90",
    );
    poly(
      [
        [48, 36],
        [63, 35],
        [42, 59],
      ],
      "#304f67",
    );
    line(53, 12, 53, 28, "#ffffff");
    line(46, 20, 60, 20, "#ffffff");
  }
  save(`ore/${ores[n]}.png`);
}
for (const [name, c] of [
  ["resonite", "#78e5bd"],
  ["cryenite", "#baadff"],
  ["core", "#ffba6b"],
  ["core-sample", "#ffdc9c"],
]) {
  if (name === "core") {
    for (let r = 33; r > 0; r -= 3)
      circle(
        40,
        40,
        r,
        ["#7b373b", "#b44c43", "#f18451", "#ffe29b"][
          Math.floor((33 - r) / 9)
        ] ?? "#fff3c2",
      );
    poly(
      [
        [40, 10],
        [58, 39],
        [40, 69],
        [24, 40],
      ],
      "#ffe6a1",
    );
  } else {
    poly(
      [
        [16, 60],
        [24, 25],
        [34, 19],
        [43, 58],
      ],
      c,
    );
    poly(
      [
        [36, 60],
        [40, 12],
        [49, 7],
        [58, 57],
      ],
      c,
    );
    poly(
      [
        [51, 62],
        [58, 31],
        [68, 28],
        [68, 56],
      ],
      c,
    );
    poly(
      [
        [24, 25],
        [34, 19],
        [32, 53],
      ],
      "#effff3",
    );
    poly(
      [
        [40, 12],
        [49, 7],
        [48, 51],
      ],
      "#fff4ff",
    );
    poly(
      [
        [48, 51],
        [49, 7],
        [58, 57],
      ],
      "#53678e",
    );
    line(14, 66, 70, 66, c);
  }
  save(`materials/${name}.png`);
}
for (let f = 0; f < 4; f++) {
  for (let i = 0; i <= f + 1; i++) {
    const x = 40 + (i - 1) * 8;
    line(40, 12, x, 32, "#0a111bd0");
    line(x, 32, 25 + i * 10, 56, "#0a111bd0");
    line(25 + i * 10, 56, 10 + i * 18, 80, "#0a111bd0");
    line(x, 32, 70, 20 + i * 10, "#0a111ba0");
  }
  save(`tiles/crack/frame0${f}.png`, 80, 80, true);
}
for (let f = 0; f < 4; f++) {
  rect(0, 0, 80, 80, "#a3382e");
  for (let y = 0; y < 80; y += 4)
    for (let x = 0; x < 80; x += 3) {
      const s = Math.sin(x * 0.13 + y * 0.1 + f * 1.5);
      rect(
        x,
        y,
        3,
        4,
        s > 0.6
          ? "#ffd77a"
          : s > 0
            ? "#f3984c"
            : s > -0.6
              ? "#df6036"
              : "#94352e",
      );
    }
  for (let i = 0; i < 16; i++) circle(rnd() * 80, rnd() * 80, 2, "#ffe49b");
  save(`hazards/lava/frame0${f}.png`, 80, 80, true);
}
const states = {
  idle: 4,
  walk: 8,
  "drill-down": 4,
  "drill-side": 4,
  jetpack: 4,
  fall: 4,
  hurt: 4,
  "fuel-out": 4,
};
for (const [state, count] of Object.entries(states))
  for (let f = 0; f < count; f++) {
    const phase = (f / count) * Math.PI * 2;
    let bob =
      state === "walk"
        ? Math.abs(Math.sin(phase)) * 2
        : state === "idle"
          ? Math.sin(phase)
          : state.startsWith("drill")
            ? (f % 2) * 2
            : state === "hurt"
              ? -f
              : 2 + (state === "fall" || state === "fuel-out" ? f % 2 : 0);
    const sl = state === "fuel-out" ? 4 : 0;
    const lean = (y) =>
      state === "drill-side" && y < 48 ? 4 : state === "hurt" ? -f * 2 : 0;
    const R = (x, y, w, h, c) => rect(x + lean(y), y + bob, w, h, c);
    const C = (x, y, r, c) => circle(x + lean(y), y + bob, r, c);
    // Heavy silhouette, rear pack and two independently posed legs.
    R(12, 29, 15, 29, "#0b1923");
    R(14, 31, 10, 23, "#526978");
    R(14, 34, 3, 17, "#9ab0af");
    R(11, 52, 12, 8, "#152c37");
    if (state === "jetpack") {
      poly(
        [
          [12, 59 + bob],
          [26, 59 + bob],
          [20, 78 - (f % 3) * 3],
        ],
        "#ef9a4c",
      );
      poly(
        [
          [15, 59 + bob],
          [22, 59 + bob],
          [19, 72 + (f % 2) * 4],
        ],
        "#e8fbba",
      );
    }
    const leg =
      state === "walk"
        ? Math.sin(phase) * 7
        : state === "fall"
          ? 5 + Math.sin(phase) * 2
          : state === "drill-side"
            ? 6
            : state === "fuel-out"
              ? 2
              : 0;
    R(25 - leg, 52, 13, 19, "#0c1b27");
    R(41 + leg, 51, 13, 20, "#0c1b27");
    R(27 - leg, 53, 9, 14, "#b77c49");
    R(43 + leg, 53, 9, 14, "#ddac66");
    R(23 - leg, 66, 16, 7, "#243b48");
    R(40 + leg, 66, 17, 7, "#2b4550");
    R(24 - leg, 66, 13, 2, "#88a3a5");
    R(23, 29 + sl, 32, 27, "#101d28");
    R(26, 31 + sl, 26, 23, "#d5a263");
    R(26, 31 + sl, 7, 22, "#9c6842");
    R(33, 34 + sl, 17, 12, "#e9b777");
    R(24, 49 + sl, 30, 6, "#334a56");
    R(37, 49 + sl, 7, 5, "#8cd0c6");
    C(state === "hurt" ? 34 : 39, 21 + sl, 18, "#101e2a");
    C(39, 20 + sl, 15, "#e8b968");
    R(25, 14 + sl, 28, 16, "#172d3b");
    R(29, 16 + sl, 23, 10, "#62b9bf");
    R(33, 17 + sl, 18, 3, "#bce9da");
    R(47, 21 + sl, 5, 6, "#377583");
    R(24, 10 + sl, 9, 8, "#2c434b");
    R(25, 11 + sl, 6, 4, f % 2 ? "#fff0a9" : "#bfe8db");
    R(33, 3 + sl, 12, 3, "#f6d992");
    if (state === "drill-down") {
      R(45, 35, 12, 20, "#0e202c");
      R(47, 37, 8, 14, "#e8b676");
      R(47, 48, 15, 9, "#405b67");
      R(46, 56, 13, 9, "#9db6b8");
      poly(
        [
          [46, 64 + bob],
          [60, 64 + bob],
          [53, 79],
        ],
        "#c1d2cd",
      );
      for (let y = 65; y < 78; y += 4) line(48, y, 58, y - 3, "#536d79");
    } else {
      let dy =
        state === "fall"
          ? -6 + (f % 2) * 2
          : state === "hurt"
            ? -8
            : state === "fuel-out"
              ? 9
              : state === "drill-side"
                ? -3
                : 0;
      R(48, 35 + dy, 13, 13, "#111f2b");
      R(50, 37 + dy, 9, 8, "#e3b375");
      R(55, 41 + dy, 14, 14, "#1a303d");
      R(57, 43 + dy, 12, 8, "#8ca5aa");
      R(60, 42 + dy, 6, 3, "#d0dbd0");
      const drillShift = state === "hurt" ? -f * 2 : 0;
      poly(
        [
          [68 + drillShift, 42 + bob + dy],
          [68 + drillShift, 53 + bob + dy],
          [79 + drillShift, 47 + bob + dy],
        ],
        "#b5c9c7",
      );
      for (let x = 69; x < 77; x += 3)
        line(
          x + drillShift,
          43 + bob + dy,
          x + 2 + drillShift,
          50 + bob + dy,
          "#4c6975",
        );
    }
    save(`miner/${state}/frame${String(f).padStart(2, "0")}.png`, 80, 80, true);
  }
// A painted, dithered distant skyline, not a runtime backdrop sketch.
rect(0, 0, 1280, 720, "#101e2b");
for (let y = 0; y < 720; y += 4) {
  let t = y / 720;
  const c = [
    Math.round(15 + 16 * t),
    Math.round(29 + 16 * t),
    Math.round(42 + 14 * t),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
  rect(0, y, 1280, 4, "#" + c);
}
for (let i = 0; i < 280; i++) {
  let x = rnd() * 1280,
    y = rnd() * 500;
  rect(x, y, 1, 1, i % 9 === 0 ? "#a6c5c0" : "#426270");
}
circle(985, 166, 70, "#344650");
circle(965, 151, 63, "#43545b");
for (let i = 0; i < 40; i++)
  circle(936 + rnd() * 100, 100 + rnd() * 90, 2 + rnd() * 9, "#3a4c55");
for (let layer = 0; layer < 3; layer++) {
  const points = [
    [0, 720],
    [0, 520 + layer * 45],
  ];
  for (let x = 0; x <= 1280; x += 60)
    points.push([x, 450 + layer * 65 + rnd() * 100]);
  points.push([1280, 720]);
  poly(points, ["#263b47", "#213440", "#192e3a"][layer]);
}
for (let i = 0; i < 9; i++) {
  let x = i * 172 + 20;
  rect(x, 550 + rnd() * 60, 12, 140, "#142732");
  line(x + 6, 540, x + 6, 488, "#35505a");
  rect(x + 5, 488, 3, 3, "#b1835b");
}
save("surface/sky.png", 1280, 720);
rect(0, 0, 80, 80, "#354047");
rect(0, 0, 80, 6, "#8a8170");
rect(0, 6, 80, 4, "#3d4a4f");
for (let i = 0; i < 100; i++)
  rect(rnd() * 80, 12 + rnd() * 68, 2, 1, "#465158");
save("surface/ground.png");
poly(
  [
    [4, 80],
    [9, 35],
    [25, 7],
    [58, 5],
    [75, 34],
    [78, 80],
  ],
  "#26363c",
);
poly(
  [
    [14, 80],
    [18, 39],
    [31, 18],
    [53, 18],
    [66, 40],
    [67, 80],
  ],
  "#0b1922",
);
line(18, 38, 31, 18, "#9a885e");
line(53, 18, 66, 40, "#9a885e");
rect(26, 8, 31, 5, "#bca674");
save("surface/cave-mouth.png");
for (const [i, id] of [
  "fuel-depot",
  "ore-market",
  "save-pad",
  "upgrade-shop",
  "supply-depot",
  "launch-pad",
].entries()) {
  const accent = [
    "#e8ad68",
    "#82c3b0",
    "#96d9df",
    "#e5c778",
    "#c297d2",
    "#e2ad70",
  ][i];
  rect(8, 179, 224, 17, "#10222e");
  rect(10, 179, 220, 4, "#789193");
  if (i === 0) {
    for (const x of [26, 80]) {
      rect(x, 60, 45, 119, "#122733");
      circle(x + 22, 63, 22, "#6c8589");
      rect(x + 2, 63, 41, 100, "#526e77");
      rect(x + 6, 65, 7, 93, "#7c9696");
      rect(x + 2, 91, 41, 6, "#223d4a");
      rect(x + 2, 141, 41, 7, "#223d4a");
    }
    rect(140, 97, 72, 82, "#283e49");
    rect(144, 101, 64, 7, accent);
    rect(153, 118, 41, 24, "#0d242d");
    rect(157, 122, 30, 7, "#9cd8c9");
    rect(150, 153, 47, 18, "#789292");
    line(195, 145, 224, 130, accent);
    line(224, 130, 223, 175, accent);
  } else if (i === 2) {
    rect(62, 156, 116, 22, "#3b636c");
    rect(72, 152, 96, 5, accent);
    rect(91, 56, 58, 98, "#223f4d");
    rect(97, 62, 46, 58, "#081f2c");
    for (let y = 68; y < 115; y += 8) rect(102, y, 35, 2, accent);
    rect(108, 132, 25, 6, "#e5c58d");
    rect(73, 31, 94, 11, "#415f69");
    line(120, 42, 120, 56, accent);
  } else if (i === 5) {
    rect(17, 157, 206, 22, "#53636a");
    for (let x = 25; x < 220; x += 28)
      poly(
        [
          [x, 157],
          [x + 12, 157],
          [x + 23, 178],
          [x + 11, 178],
        ],
        "#ac8d59",
      );
    rect(35, 19, 12, 138, "#385461");
    for (let y = 24; y < 155; y += 24) {
      line(37, y, 83, y + 23, "#557580");
      line(83, y, 37, y + 23, "#557580");
    }
    rect(79, 19, 8, 138, "#3f5c69");
  } else {
    poly(
      [
        [18, 81],
        [43, 50],
        [186, 50],
        [221, 81],
      ],
      "#718282",
    );
    rect(22, 81, 195, 98, "#314a55");
    rect(27, 86, 185, 12, accent);
    rect(29, 101, 66, 63, "#152e3b");
    rect(33, 107, 58, 46, "#244652");
    for (let y = 111; y < 150; y += 10) rect(35, y, 53, 2, "#60908c");
    rect(111, 108, 48, 69, "#1b333f");
    rect(116, 114, 37, 31, "#5c777c");
    rect(150, 150, 3, 4, accent);
    rect(174, 111, 28, 37, "#122b38");
    rect(177, 114, 22, 4, accent);
    if (i === 1) {
      for (let x = 20; x < 90; x += 23) {
        rect(x, 149, 20, 28, "#6b7774");
        poly(
          [
            [x, 149],
            [x + 8, 138],
            [x + 20, 150],
          ],
          "#b7a48a",
        );
      }
    }
    if (i === 3) {
      rect(180, 29, 9, 28, "#809692");
      circle(184, 27, 14, "#c6a765");
      circle(184, 27, 6, "#253f4b");
    }
    if (i === 4) {
      for (let x = 166; x < 220; x += 26) {
        rect(x, 149, 23, 28, "#7b776e");
        rect(x + 3, 152, 17, 3, "#bdac85");
        line(x + 2, 156, x + 20, 173, "#343d43");
      }
    }
  }
  for (let x = 15; x < 230; x += 32) {
    rect(x, 185, 3, 3, "#b6c1b4");
  }
  save(`surface/${id}.png`, 240, 200);
}
for (let f = 0; f <= 5; f++) {
  rect(3, 240, 154, 14, "#304c59");
  rect(3, 240, 154, 3, "#a3afa0");
  if (f > 0) {
    poly(
      [
        [52, 222],
        [52, 95],
        [80, 44],
        [108, 95],
        [108, 222],
      ],
      "#182c39",
    );
    rect(58, 99, 44, 122, "#879995");
    rect(59, 99, 7, 119, "#b6c0a8");
    rect(92, 99, 9, 120, "#496675");
    for (let y = 111; y < 215; y += 23) {
      rect(57, y, 46, 3, "#334f5c");
    }
  }
  if (f > 1) {
    rect(37, 133, 17, 93, "#b5ab88");
    rect(108, 133, 17, 93, "#8e9a91");
    rect(38, 147, 15, 9, "#cf9c60");
    rect(109, 147, 15, 9, "#cf9c60");
  }
  if (f > 2) {
    poly(
      [
        [56, 96],
        [80, 48],
        [104, 96],
      ],
      "#dad5b4",
    );
    poly(
      [
        [80, 48],
        [104, 96],
        [84, 96],
      ],
      "#8a9e9c",
    );
    circle(80, 114, 11, "#1a4254");
    circle(80, 113, 7, "#8ad8d1");
    line(76, 108, 83, 107, "#e0fff1");
  }
  if (f > 3) {
    poly(
      [
        [57, 181],
        [35, 220],
        [57, 211],
      ],
      "#cb8b55",
    );
    poly(
      [
        [104, 181],
        [127, 220],
        [104, 211],
      ],
      "#bf8051",
    );
    rect(65, 220, 30, 14, "#506c75");
    rect(69, 227, 22, 9, "#233d4b");
  }
  if (f > 4) {
    rect(71, 158, 19, 28, "#223d49");
    rect(76, 161, 9, 19, "#ffe59e");
    rect(74, 192, 13, 5, "#e6ad63");
  }
  save(`rocket/stage${f}.png`, 160, 260, true);
}
for (const [i, name] of [
  "fuel",
  "hull",
  "cargo",
  "credits",
  "depth",
  "resonite",
  "cryenite",
  "core-sample",
].entries()) {
  const c = [
    "#e6b672",
    "#77c4bd",
    "#c5bda4",
    "#e6c77f",
    "#9dbac3",
    "#78e5bd",
    "#baadff",
    "#ffdc9c",
  ][i];
  if (i === 0) {
    poly(
      [
        [9, 2],
        [17, 2],
        [17, 8],
        [20, 11],
        [20, 22],
        [4, 22],
        [4, 7],
        [9, 7],
      ],
      c,
    );
    rect(7, 11, 10, 5, "#1c3845");
  } else if (i === 1) {
    poly(
      [
        [12, 2],
        [22, 6],
        [20, 16],
        [12, 23],
        [4, 16],
        [2, 6],
      ],
      c,
    );
    poly(
      [
        [12, 5],
        [18, 8],
        [16, 15],
        [12, 19],
      ],
      "#254a58",
    );
  } else if (i === 2) {
    rect(3, 5, 18, 17, c);
    line(3, 5, 12, 12, "#294856");
    line(21, 5, 12, 12, "#294856");
    line(12, 12, 12, 22, "#294856");
  } else if (i === 3) {
    circle(12, 12, 10, c);
    circle(12, 12, 7, "#304855");
    rect(10, 5, 3, 14, c);
    rect(7, 8, 10, 3, c);
    rect(7, 14, 10, 3, c);
  } else if (i === 4) {
    line(12, 2, 12, 20, c);
    poly(
      [
        [5, 14],
        [19, 14],
        [12, 22],
      ],
      c,
    );
    rect(3, 3, 4, 2, c);
    rect(3, 8, 4, 2, c);
  } else {
    poly(
      [
        [12, 1],
        [22, 10],
        [12, 23],
        [3, 11],
      ],
      c,
    );
    poly(
      [
        [12, 1],
        [15, 10],
        [12, 23],
        [8, 11],
      ],
      "#effff0",
    );
  }
  save(`icons/${name}.png`, 24, 24);
}
// Authored live systems: multiple layers for flashes, shock shells, smoke and chips.
const effects = [
  "gas-seep",
  "drill-debris",
  "jetpack-exhaust",
  "ore-sparkle",
  "material-shimmer",
  "gas-explosion",
  "lava-embers",
  "impact-dust",
  "core-extract",
  "core-detonation",
  "launch-exhaust",
  "death-burst",
];
for (const name of effects) {
  const cfg = path.join(temp, "particle-config.json");
  const burst = name.includes("explosion") || name === "core-detonation";
  writeFileSync(
    cfg,
    JSON.stringify({
      width: 320,
      height: 320,
      duration_ms: 1500,
      fps: 24,
      actions: path.join(temp, "particle-actions.json"),
      preview: path.join(temp, "particle.gif"),
      system: path.join(root, `fx/${name}.json`),
    }),
  );
  mkdirSync(path.join(root, "fx"), { recursive: true });
  const cmd = (...args) => run("particle-2d", ["--config", cfg, ...args]);
  cmd("init");
  const seep = name === "gas-seep",
    exhaust = name.includes("exhaust"),
    spark =
      name.includes("sparkle") ||
      name.includes("shimmer") ||
      name === "core-extract";
  cmd(
    "add-emitter",
    "--name",
    "body",
    "--shape",
    seep ? "box" : "disc",
    "--x",
    160,
    "--y",
    160,
    "--radius",
    seep ? 25 : 8,
    "--size-x",
    65,
    "--size-y",
    30,
    "--burst",
    seep ? 7 : burst ? 95 : exhaust ? 35 : 24,
    "--lifetime",
    seep ? 1300 : burst ? 900 : 650,
    "--lifetime-spread",
    200,
    "--speed",
    seep ? 17 : burst ? 175 : exhaust ? 130 : 65,
    "--speed-spread",
    seep ? 8 : 40,
    "--dir-y",
    exhaust ? -1 : 1,
    "--cone-angle",
    seep ? 30 : exhaust ? 18 : 180,
  );
  cmd(
    "set-particle",
    "--emitter",
    "body",
    "--size-from",
    seep ? 1.4 : burst ? 2.6 : 0.55,
    "--size-to",
    seep ? 3.5 : 0,
    "--opacity-from",
    seep ? 0.14 : 0.9,
    "--opacity-to",
    0,
    "--color-gradient",
    seep
      ? "#c6ddbb@0,#7da995@1"
      : spark
        ? "#e5fff4@0,#63d8c6@0.5,#5583a4@1"
        : "#ffe6a4@0,#e99454@0.4,#6c7274@1",
  );
  cmd(
    "set-forces",
    "--gravity",
    seep ? 0 : exhaust ? -80 : -120,
    "--drag",
    0.7,
    "--turbulence",
    "12,0.03",
  );
  if (burst || name === "core-detonation") {
    cmd(
      "add-emitter",
      "--name",
      "shock",
      "--shape",
      "disc",
      "--x",
      160,
      "--y",
      160,
      "--radius",
      3,
      "--burst",
      75,
      "--lifetime",
      450,
      "--speed",
      name === "core-detonation" ? 420 : 260,
      "--cone-angle",
      180,
    );
    cmd(
      "set-particle",
      "--emitter",
      "shock",
      "--size-from",
      0.7,
      "--size-to",
      0.1,
      "--color-gradient",
      "#fff4ce@0,#dd925e@1",
    );
    cmd(
      "add-emitter",
      "--name",
      "flash",
      "--shape",
      "point",
      "--x",
      160,
      "--y",
      160,
      "--burst",
      1,
      "--lifetime",
      180,
      "--speed",
      0,
    );
    cmd(
      "set-particle",
      "--emitter",
      "flash",
      "--size-from",
      burst ? 15 : 25,
      "--size-to",
      0,
      "--color-gradient",
      "#fffce4@0,#ffb97e@1",
    );
  }
  cmd("render");
  console.log(`Produced ${name}`);
}
// Layered synthesis plus sampled metal for tactile confirmations and impacts.
for (const [i, name] of [
  "drill",
  "thrust",
  "ore-pickup",
  "material-chime",
  "gas-explosion",
  "lava-sizzle",
  "impact",
  "fabricate",
  "launch",
  "death",
  "alarm-fuel",
  "alarm-core",
].entries()) {
  const config = path.join(temp, "audio-config.json");
  writeFileSync(
    config,
    JSON.stringify({
      sample_rate: 22050,
      channels: "mono",
      max_duration_ms: 2400,
      seed: 531 + i,
      actions: path.join(temp, "audio-actions.json"),
      preview: path.join(temp, "wave.png"),
      wav: path.join(root, `audio/${name}.wav`),
      sample_pack: "combat-core",
    }),
  );
  mkdirSync(path.join(root, "audio"), { recursive: true });
  const tool = ["ore-pickup", "material-chime", "impact", "fabricate"].includes(
    name,
  )
    ? "sfx-sample"
    : "sfx-synth";
  const cmd = (...args) => run(tool, ["--config", config, ...args]);
  cmd("init");
  if (tool === "sfx-sample")
    cmd(
      "add-sample",
      "--name",
      name === "impact"
        ? "impact_metal_hollow"
        : name === "material-chime"
          ? "debris_glass"
          : name === "fabricate"
            ? "mech_ratchet"
            : "mech_clip_load",
      "--t",
      0,
      "--gain",
      -25,
      "--fade-out",
      80,
    );
  const boom = ["gas-explosion", "death", "launch", "impact"].includes(name),
    noise = ["drill", "thrust", "lava-sizzle"].includes(name);
  cmd(
    "add-voice",
    "--name",
    "body",
    "--wave",
    boom || noise ? "noise" : "sine",
    "--freq",
    i > 9 ? 640 : 580,
    "--gain",
    boom ? -18 : noise ? -29 : -24,
    "--dur",
    name === "launch" ? 1800 : noise ? 850 : boom ? 650 : 240,
  );
  cmd(
    "set-envelope",
    "--voice",
    "body",
    "--env",
    noise ? "gate" : boom ? "punch" : "pluck",
  );
  cmd(
    "add-voice",
    "--name",
    "tone",
    "--wave",
    noise ? "saw" : "sine",
    "--freq",
    boom ? 75 : noise ? 65 : 420 + i * 54,
    "--gain",
    noise ? -34 : -25,
    "--start",
    40,
    "--dur",
    boom ? 800 : noise ? 850 : 330,
  );
  cmd("set-envelope", "--voice", "tone", "--env", noise ? "gate" : "pluck");
  if (!noise)
    cmd(
      "set-pitch",
      "--voice",
      "tone",
      "--slide-to",
      boom ? 28 : 1050 + i * 60,
      "--over",
      boom ? 700 : 260,
    );
  cmd("render");
}
const mc = path.join(temp, "music-config.json");
writeFileSync(
  mc,
  JSON.stringify({
    sample_rate: 22050,
    channels: "stereo",
    max_duration_ms: 32000,
    seed: 42,
    actions: path.join(temp, "music-actions.json"),
    preview: path.join(temp, "music.png"),
    wav: path.join(root, "audio/music.wav"),
    mid: path.join(root, "audio/music.mid"),
    instrument_bank: "synthwave",
  }),
);
const mus = (...args) => run("music", ["--config", mc, ...args]);
mus("init");
mus("set-tempo", "--bpm", 72);
mus("define-track", "--name", "abyss", "--instrument", "warm_pad");
mus("define-track", "--name", "signal", "--instrument", "fm_bell");
mus("set-track-fx", "--track", "abyss", "--gain", -26, "--reverb", 0.5);
mus("set-track-fx", "--track", "signal", "--gain", -30, "--reverb", 0.65);
for (let b = 0; b < 32; b += 4) {
  const p = [38, 34, 41, 36][Math.floor(b / 8)];
  mus(
    "add-note",
    "--track",
    "abyss",
    "--pitch",
    p,
    "--t",
    b,
    "--dur",
    4,
    "--velocity",
    65,
  );
  for (let j = 0; j < 4; j++)
    mus(
      "add-note",
      "--track",
      "signal",
      "--pitch",
      p + 24 + [0, 7, 12, 3][j],
      "--t",
      b + j * 0.75,
      "--dur",
      1.5,
      "--velocity",
      40 + j * 5,
    );
}
mus("render");
console.log("All original Deepcore assets produced.");
