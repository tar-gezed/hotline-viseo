# Game performance and regression review — 20 September 2026

The later Internet-coop work and its separate five-peer measurements are documented in [Multiplayer performance — 23 September 2026](multiplayer-performance.md). The figures below describe the original solo review, not the cost of rendering five simultaneous browser clients.

## Scope and outcome

This pass addresses sustained frame cost after the enemy navigation and combat changes in `6973f15` and `84afbfb`. The comparison baseline is `84afbfb`, before the changes described here. The review covers game code, the render pipeline, collision/navigation, accumulated cosmetic objects, UI and audio integration. It adds no production dependencies and keeps static GitHub Pages deployment.

The largest measured improvement comes from reducing geometric work in navigation and collision, with additional savings from visibility culling, a shorter presentation path and bounded corpse retention. At 1280×720 with 36 living enemies, JavaScript animation-callback work fell from **15.5 ms to 3.7 ms p95**. This is a measured scenario, not a promise that every frame on every machine will meet 60 FPS. The extreme ultrawide combat fixture still averages about 57 FPS.

## Navigation and collision: retain exact decisions, reduce candidate work

`NavGraph.canTraverse` still checks the full actor radius against current geometry whenever the caller requests it. Enemy update frequency, sight checks, attack checks, hearing, patrol choices, stuck recovery and door responses keep their existing timing.

In `js/engine/pathfinding.js`:

- Swept-body clearance first compares the path's bounding box with wall/glass bounds expanded by the required radius and thickness. Distant segments cannot intersect the swept disc and skip the exact distance calculation.
- Walls and glass are traversed without constructing a combined spread array on every query.
- Segment-distance comparisons use squared distances; square roots remain only where the actual distance is needed. The existing 0.001 clearance tolerance is preserved, including nonpositive-threshold handling.
- A `WeakMap` stores each solid prop's corners and bounding box. Every lookup checks position, effective collision dimensions, angle and centered convention. A changed prop immediately rebuilds its geometry; a replaced map does not remain owned by a global strong cache.
- Prop bounds reject distant furniture before point-inside and edge checks. Doors, lock state and shattered glass remain live inputs; reachability and line of sight are not cached.
- A* computes candidate cost before invoking geometric clearance. An edge that cannot improve the known cost no longer incurs a clearance query; accepted paths retain their existing cost and clearance rules.

In `js/engine/collision.js`:

- Static segment descriptors are returned directly to read-only callers instead of copying four endpoints on every query. Dynamic door geometry still follows the actual leaf.
- Raycasts reject segments outside the ray's bounds before exact intersection. Rectangular obstacles use a conservative half-sum-of-dimensions extent around the same center used by collision geometry before constructing rotated edges.
- Circle/segment and circle/rectangle resolution reject distant candidates before projection or oriented-box transforms. Candidates that survive still use the existing narrow-phase solver, obstacle order, thickness and response.

These changes target repeated arithmetic and temporary objects without introducing a delayed reaction to a closing door. They do not introduce the audit's proposed LOS throttle, navigation-result cache, spatial grid or group-alert rewrite. Those proposals were not needed to obtain the measured gain and would require separate behavior validation.

## Rendering and the pickup-text correction

`Camera.getVisibleWorldBounds` now encloses the rotated viewport using the absolute sine/cosine contributions of both dimensions, zoom, camera roll, shake roll and positional shake. This makes culling conservative at viewport corners, including ultrawide views.

`main.js` uses padded bounds to skip drawing offscreen living enemies, grounded enemies, corpses and floor weapons. The two render-time enemy `filter` allocations become direct loops. Simulation remains active offscreen. `MapRenderer.renderProps` also rejects offscreen furniture, with an extent covering centered and legacy pivots plus decorative/shadow padding. Background, grounded objects, fixtures and standing actors retain their layer order.

The normal presentation path used to draw the world into `sceneCanvas`, downsample into `pixelCanvas`, upscale back into `sceneCanvas`, then copy into the output through postprocessing. Ordinary frames now pass `pixelCanvas` directly to the postprocessor with nearest-neighbor scaling. Active glitch or enabled chromatic aberration above its existing 0.8 threshold still receives the original full-resolution intermediate, preserving fractional crops and distortion offsets. Canvas state is saved/restored around the shorter path; HUD and other screen-space UI keep their rendering behavior.

The reported black spikes on pickup text came from acute miter joins on the thick outline of italic glyphs. `FloatingText._drawLabel` now sets `lineJoin = 'round'` and `miterLimit = 2`. The sprite is still rasterized once and its position, rotation, pop scale, glow and fade still animate as before. Five real raster fixtures reproduced opaque outlying black pixels before the fix (85, 385, 61, 107 and 415) and measured zero afterward. A separate capture uses the actual pickup handler.

## Cosmetic retention and supply lifetime

`js/entities/world_cleanup.js` exports the browser `WorldCleanup` helper and a CommonJS API for Node tests. `index.html` loads it before the main game loop. `CONFIG.CLEANUP` owns the settings:

| Setting | Value | Behavior |
| --- | --- | --- |
| `MAX_CORPSES` | 96 | Start fading the oldest eligible deaths when retained bodies exceed this count |
| `CORPSE_SECONDS` | 90 | Start fading an individual corpse at this simulation age |
| `CORPSE_FADE_SECONDS` | 2 | Fade before removal |
| `SUPPLY_WEAPON_WAVES` | 2 | Remove an unused tagged supply weapon at a wave difference of two |

Cleanup runs after enemy updates, counts only dead actors, and compacts the array in place without changing survivor order. Age is measured in simulation time, so pausing does not age bodies. The initial one-second death slide is protected from count-based removal. The count can temporarily exceed 96 while new deaths finish sliding or old ones fade. Selection uses time since death, not spawn order. Living and knocked-down actors remain available to combat, execution and recovery. `Enemy.render` applies the cosmetic alpha only inside its existing saved dead-render state.

Both supply creation paths tag their floor weapon with the current wave: the immediate resupply drop and the weapon released from an opened crate. The next wave-start callback removes only tagged floor weapons whose `currentWave - supplyWave >= 2`; a weapon created during wave three expires at the start of wave five. Authored weapons and enemy drops are unaffected. Picking up and later dropping a supply weapon creates a regular floor weapon, so it is no longer considered an unused supply. Crate interactions, ammo refill, effects and sounds keep their existing behavior.

The count threshold is based on a render-only sweep with bodies concentrated in the visible area. Each case warms up for 30 frames and measures 120 render calls paced by native animation frames:

| Visible corpses | Render work p95 |
| ---: | ---: |
| 0 | 2.0 ms |
| 48 | 3.2 ms |
| 96 | 5.0 ms |
| 192 | 8.0 ms |
| 500 | 15.8 ms |

Keeping 96 leaves substantially more of a 16.67 ms frame budget for AI, physics, effects and presentation than retaining 192 or 500. The 90-second fallback is a visual-retention choice, not a benchmark-derived optimal lifetime; the measured count cap is the primary load bound.

Blood remains persistent. Zero versus 5,000 baked blood stamps both measured 2.4 ms render p95: these stamps already occupy a fixed-size persistent canvas rather than thousands of separately redrawn objects. Fading them would add reconstruction work without a demonstrated saving in this fixture. Existing active blood/particle limits remain in effect. These measurements concern redraw cost, not the cost of initially producing 5,000 splashes.

## Measurements and their limits

Measurements used local headless Microsoft Edge `153.0.4234.32`, ANGLE/Direct3D11 on an NVIDIA GeForce RTX 4060 Ti. Browser diagnostics reported Canvas 2D and GPU compositing enabled, with multiple raster threads enabled. Hardware, browser scheduling, thermal conditions and other workloads affect results.

The seeded browser probe uses the actual map, engine, renderer, postprocessor and audio. It enters a wave-eight fixture, replaces automatic reinforcement delivery with a fixed actor population and makes the player invulnerable for repeatability. Default scenarios warm up for two seconds, then measure ten seconds at 1280×720. Instrumentation is present on both baseline and current runs. The comparison includes active AI; it is not an entire human playthrough through eight waves.

| Fixture | Baseline callback p95 | Final callback p95 | Reduction |
| --- | ---: | ---: | ---: |
| 5 living enemies | 3.3 ms | 2.4 ms | 27% |
| 36 living enemies | 15.5 ms | 3.7 ms | 76% |
| 36 living enemies + 500 initial corpses | 22.2 ms | 5.2 ms | 77% |

The last row deliberately includes the retention policy: the final build settles to 96 corpses, while the baseline retains 500. It is not an equal-corpse-count microbenchmark of geometry alone. The final default runs had animation-interval p95 of 8.4 ms and no intervals above 25 ms during their ten-second samples. The percentages describe the complete patch in these fixtures; they do not isolate the contribution of each optimization.

Additional fixtures place 36 shooters at reachable positions around an invulnerable player with 96 corpses. Audio remains active:

| Combat fixture | Duration | Recorded shots | Mean cadence | Callback work p95 | Animation interval p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1920×1080 | 30 s | 2,808 | 90.1 FPS | 8.5 ms | 16.7 ms |
| 3440×1440 | 60 s | 5,364 | 57.1 FPS | 10.9 ms | 25.0 ms |

Shot counters are cumulative fixture counters, including warmup, rather than a precise rate measured only inside the sample window. The heavy fixtures produced zero page errors. Mean cadence is derived from animation-frame intervals. It does not establish constant 60 FPS: the ultrawide run falls below that target, and even the 1080p run has occasional longer intervals.

Callback work measures JavaScript execution plus synchronous canvas command submission. GPU work is asynchronous and is not fully represented by that number. Animation-frame intervals are recorded separately as a scheduling/cadence indicator, not a direct hardware presentation trace. A separate 600-step enemy/door simulation sample excludes rendering and is not used as an FPS claim. CPU-profile recording is optional and should not be mixed with primary timing comparisons.

Local JSON, logs and screenshots are generated in ignored `test-results/performance/`. The original campaign includes `before.json`, `final.json`, `retention.json`, `combat-1080-final.json`, `combat-ultrawide-final.json` and `summary.json`. This document preserves the results in version control; generated artifacts and browser packages are not production assets.

## GPU and CPU worker investigation

Canvas 2D already used GPU acceleration on the measured browser. The patch keeps that pipeline and removes one ordinary-frame full-screen copy; it does not enable a previously unused WebGL renderer. Canvas acceleration remains an implementation/device decision, not a guarantee of the API. No `willReadFrequently` hint or gameplay pixel readback was added. See the [HTML canvas context specification](https://html.spec.whatwg.org/dev/canvas.html).

OffscreenCanvas can move rendering to a worker, but the current game combines synchronous mutable entity objects, canvas rendering, input, DOM screens and Web Audio orchestration. A worker has no `Window`/DOM access. A useful migration needs explicit ownership, compact snapshots or transferable buffers, and handling for resize, pause, map reload, cancellation and stale results. Moving A* alone without that design could delay reactions to changed doors or require expensive object copies. Browser raster threads already exist independently of application simulation threads. See [OffscreenCanvas in the HTML standard](https://html.spec.whatwg.org/multipage/canvas.html#the-offscreencanvas-interface) and [MDN's worker execution model](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).

No new application Worker is introduced. SharedArrayBuffer is not assumed available: shared-memory access requires cross-origin isolation, which this static deployment does not configure. See [cross-origin isolation requirements](https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated).

A WebGL2 migration would require replacing drawing primitives, sprite batching, lighting and postprocessing with GPU resources/shaders, plus context-loss and fallback handling. It is not a drop-in switch for Canvas 2D drawing calls. The current CPU reductions are obtained with a much smaller compatibility surface; a future GPU renderer should be evaluated against the remaining ultrawide workload and visual parity fixtures. See the [WebGL 2 specification](https://registry.khronos.org/webgl/specs/2.0/).

## Regression evidence and reproduction

At the time of this 20 September review, `npm test` passed all **23 suites** then present, including the new `test_performance_safety.js`. It checks prop-geometry invalidation, live glass and door changes, rotated viewport coverage, corpse cap/age/slide behavior, oldest-death retention and supply expiry. Existing combat, scoring, waves, doors, character, input, map, music and visual-pipeline suites also passed. The current repository adds seven coop suites, for 30 total; see [multiplayer architecture](multiplayer-architecture.md#validation-et-reproduction).

Additional checks compare 5,000 body-clearance queries, 5,000 raycasts and 5,000 static body collision results against `84afbfb`. All 15,000 sampled results match. The reference validator uses the actual imported map, multiple radii, stationary paths, moving/locked doors and shattered glass; this is sampled equivalence, not a proof for every possible map.

Browser acceptance passed `validate_enemy_ai`, `validate_performance`, `validate_floating_text`, `validate_menus`, `validate_hud`, `validate_wave_hud`, `validate_death`, `validate_scores` and `validate_audio_startup`. The performance visual validator compares 15 world renders pixel for pixel at 1280×720, 3440×1440 and odd-sized 1153×721, including roll, shake, zoom, glitch, flash, CRT and chromatic aberration. It also exercises both supply hooks and pickup reuse. These fixed fixtures exclude the intentionally changed corpse lifetime and text outline from the world-parity claim.

The existing menu/HUD/wave/death/score checks cover their navigation and viewport cases. The audio validator now starts a fresh browser per policy/gesture fixture, disables engagement-based autoplay exemptions, and observes startup through CDP `Runtime.evaluate` with `userGesture: false`. Ordinary Playwright evaluation could otherwise grant activation and invalidate the blocked-autoplay assertion. A normal key replaces the modifier-only keyboard fixture. Actual signal, mute and keyboard/mouse/touch unlock cases pass; production audio code is unchanged.

Use an external development Playwright installation and Microsoft Edge for the three new browser probes. The audio validator also supports `CHROME_PATH`; none of these dependencies are imported by the game. Start the server in a separate terminal:

```powershell
node tools/serve.cjs --port 8097
```

Then configure the module path for your own installation and run:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/path/to/node_modules/playwright'
$env:PERF_TEST_URL = 'http://127.0.0.1:8097/'
node tools/profile_game.cjs --revision 84afbfb --out test-results/performance/before.json
node tools/profile_game.cjs --out test-results/performance/final.json
node tools/profile_game.cjs --retention --out test-results/performance/retention.json
node tools/profile_game.cjs --combat --width 1920 --height 1080 --seconds 30 --out test-results/performance/combat-1080-final.json
node tools/profile_game.cjs --combat --width 3440 --height 1440 --seconds 60 --out test-results/performance/combat-ultrawide-final.json
node tools/validate_geometry.cjs
node tools/validate_performance.cjs
node tools/validate_floating_text.cjs
npm test
```

Run timing probes sequentially with other heavy browser work stopped. `profile_game.cjs` accepts `--url` (default shown above), `--headed` and `--cpu-profile`; the latter writes a `.cpuprofile` alongside its output. `validate_performance.cjs` and `validate_geometry.cjs` accept `PERF_REFERENCE` (default `84afbfb`). Keep that Git history available for baseline comparisons. Response-injected bridges and invulnerability exist only in the test harness, never in served production source files. The profiling routes assume a server mounted at `/`.
