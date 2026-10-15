# Deepcore

**Go deep. Get rich. Get home.** A complete, browser-only subterranean mining expedition. Drill through four geological strata, haul thirteen minerals, manage the weight of your cargo, and build a five-component escape rocket. The mine is the adversary: gas, molten seams, hard landings, and a ninety-second Core Sample countdown.

Choose **Standard** (restore your last save after death) or **Hardcore** (death deletes the save), and a **Quick**, **Standard**, or **Marathon** mine. All progress is local; the Save Pad holds one expedition. No account or server is needed.

## Run

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run dev
```

Open the Vite URL printed in your terminal. Audio unlocks on your first key or pointer interaction.

## Production

```sh
npm run build
npm run preview
```

`dist/index.html` is the entry point. Serve the entire `dist/` directory from any static host, including a nested base path. All artwork, animation frames, live particle systems, and audio are bundled from committed files under `assets/`. The build never runs asset-generation tools and needs no external service.

## Controls

| Input | Action |
| --- | --- |
| A / D or Left / Right | Walk, drift, and drill a wall once flush against it |
| S / Down | Drill the floor while grounded |
| W / Up / Space | Jetpack thrust; the drill never cuts upward |
| E / Enter | Activate a nearby building; confirm a highlighted choice |
| I | Cargo, materials, and field-supply inventory |
| Escape / P | Close a panel, pause, or resume |
| M | Mute / unmute all audio |
| J | Jettison a live Core Sample |
| 1–6 | Dynamite, Plastic Explosives, Quantum Teleporter, Matter Transmitter, Nanobots, Emergency Fuel |
| Up / Down in menus or panels | Select a control; Enter activates it |
| Pointer / touch | Operate menus, panels, status controls, and nearby buildings |
| Backtick | Toggle the engine's read-only diagnostics |

Ore is collected by drilling, not blasting. Sell it at the market. Fuel and hull never regenerate: buy them at the Fuel Depot. Cargo slots limit capacity; weight limits lift. Drop individual ore units in the inventory if overloaded. The scanner finds missing Resonite and Cryenite; the Core lies beneath all four bands. Install the Sample as the rocket's final component before its timer expires.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
npm run build
node scripts/verify-production.mjs
```

The unit suite runs the Simple 2D engine over a native canvas with scripted clocks and real registered input. It exercises physics, drill cadence, fuel, weight, collision, hazards, supplies, economy, save/death rules, menus, debug poses, and generation invariants at every world size. The production browser check serves the built site at `/nested/deepcore/`, checks asset requests, and drives play and resizing in Chromium. Playwright's Chromium must be installed for browser checks.

## Source and original assets

- `src/game.ts`: engine registration, asset loading, input, audio, diagnostics.
- `src/model.ts`: immutable state, world generation, derived readings.
- `src/simulation.ts`: render-free 120 Hz simulation driven by engine delta time.
- `src/transactions.ts`: economy, supplies, saves, hazards, expedition outcomes.
- `src/interface.ts`, `src/render.ts`: shared hit regions, navigation, canvas presentation.
- `src/debug.ts`: the complete versioned automation surface, returned only through `engine.debug`.
- `assets/`: 100 original sprites/frames, twelve live particle systems, twelve sound cues, and an ambient music bed.
- `scripts/produce-assets.mjs`: the one-time authorship recipe using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. Optional; requires those authoring tools. It is entirely separate from the build.
- `showcase/`: player-facing description, captured screenshots, and a gzipped engine drawing replay. `scripts/capture-showcase.mjs` recreates the capture against a running development server.

Simulation transitions copy the parts of state they own and replace edited cells. Rendering reads state only, projects produced particle systems from event ages, and draws through the engine's recording context. Assets are loaded through the engine and emitted by Vite with relative URLs. The supplied entry point, constants, engine, and toolchain remain intact.
