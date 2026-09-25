# Wave transition performance

After Hours results use a separate opaque scene and an original `results` music
track. The hidden world is skipped in `GAME_OVER`; the intermission measurements
below describe the existing wave transition. See [results validation](score-direction.md).

## Findings

Combat music is synthesized live; changing to `wave_clear` does not fetch or decode a music file. A browser probe of the first-wave transition measured `music.play` at 0–0.1 ms and the intermission scheduler at about 0.1 ms p95. Disabling music playback entirely did not remove the rendering spike.

Two visible causes were found:

- The wave-clear hook explicitly requested 120 ms of hit-stop, slowing simulation to 8% speed. That looked like a stall despite frames continuing to render.
- The large floating victory label repainted outlined, blurred text under an animated transform every frame. Removing only this label in an ablation probe reduced clear-phase frame work from about 8 ms p95 to 2.6 ms. The first use of victory text fonts, including the banner checkmark's fallback font, also incurred extra work.

## Changes

- Remove the additional wave-clear hit-stop. Combat-hit feedback, victory flash, score, supplies and intermission countdown remain intact.
- Rasterize each floating label once into a supersampled canvas. Position, rotation, scale and opacity still animate, using a bitmap blit. Each bitmap belongs to its short-lived label; there is no accumulating global cache.
- Warm victory text and banner fonts during menu initialization so their first use does not coincide with the last kill of wave one.

## Verification

Repeated local Edge headless runs at a 1280×720 viewport measured clear-phase frame work at **2.6–3.3 ms p95** after the fix versus **7.9–8.2 ms** before. The cold maximum fell from roughly **18 ms** to **10–12 ms** after font warmup. These are JavaScript frame-callback work measurements, not a promised FPS on every machine. Frame delivery can still vary with GPU load and browser scheduling.

The probe uses the real map, renderer, music scheduler, sound effects and wave-clear callbacks. Enemy AI is disabled to keep the player alive; the final kill is simulated through the spawner and existing enemy death methods. It is a transition regression scenario, not a full combat load benchmark. Runs validated intermission, supplies rendering, wave two, active combat music, zero added wave-clear hit-stop and no page errors. A screenshot also checked the cached victory text and intermission banner.

Run `npm start`, then `node tools/profile_wave_transition.cjs http://localhost:8080` with Playwright available through development tooling or `NODE_PATH`, and Microsoft Edge installed. The script injects its private bridge into the served response, never into production code. It compares playback enabled versus stopped, reports frame intervals separately from callback work, and reports audio call timings. `--no-clear-text` enables the ablation; `--screenshot` saves screenshots in the OS temp directory but should not be used for timing comparisons.

`npm test` covers all 23 regression suites. The visual-pipeline suite verifies that a moving/fading label is painted only once, blitted every live frame and no longer rendered after expiry. Music score and lifecycle regressions remain unchanged and pass.

The dedicated title-menu integration preserves the startup text warmup. Pause now remembers whether it interrupted PLAYING or INTERMISSION, including a round trip through audio settings. `tools/validate_menus.cjs` checks that resume restores INTERMISSION instead of prematurely entering combat. The performance measurements above belong to the original profiling campaign; menu acceptance captures are not new timing benchmarks. See [menu validation](menu-direction.md).

## Enemy combat and patrol integration

Enemy shots check cover between body and muzzle. Enemies investigate player gunshots at their heard location, while melee and dry fire do not summon them. Each automatic patrol round has a 50% chance of a reachable doorway excursion and return. Wave totals follow 5, 8, 13, 21, 34, 55, 89, 144 and onward, with at most 36 concurrent enemies and validated spawn space. Visual targeting, body clearance and stuck recovery remain active. The current Node regression runner includes 31 suites. See [combat rules and regression coverage](architecture.md#enemy-combat-and-navigation).

## Performance review — 20 September 2026

The measurements above describe the earlier wave-clear campaign and are not the late-wave baseline. The new [whole-game performance report](game-performance.md) compares against `84afbfb`: 36-actor callback p95 drops from 15.5 to 3.7 ms at 1280×720. It documents the active-combat fixtures, remaining ultrawide limitation, corpse/supply retention, rounded floating-text outlines and GPU/worker decisions. The cached label animation and existing wave-clear timing remain intact; the current Node runner passes 31 suites.
