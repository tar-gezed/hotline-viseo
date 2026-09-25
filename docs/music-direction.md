# Combat music revision

## After-hours results music

The results screen has its own original `results` track at 84 BPM: eight bars of
Dm9 / Bbmaj7 / Fmaj7 / Cadd9, soft pads, sparse bass, half-time percussion and a
bell-like answering phrase. It shares the music gain/mute and voice lifecycle;
results entry restores the user's selected volume after death ducking. Existing
combat, menu and intermission arrangements are unchanged. The development command
`node tools/validate_scores.cjs` exports the loop and seam to
`test-results/scores/after-hours.wav` and checks signal levels; see
[results validation](score-direction.md).

## Direction

The first expansion had two compositional faults: fixed minor intervals were transposed onto major chords, and some pad durations crossed a chord change. High lead registers, strong filter resonance and competing counter-melodies made the result more tiring. Longer arrangements did not fix those problems.

The original four-bar combat score is restored as the first track. Its pitches, rhythm, velocities, fills and intensity counter-melody are preserved. Two event fingerprints in `test_music.js`, captured from the original Git version, protect that restoration. The synth defaults used by the original remain unchanged; output headroom and playback lifecycle improvements apply to the engine as a whole. Combat tempo now remains stable.

The five additional scores each run for 24 bars, around 44–48 seconds. They use the original's regular kick/snare foundation, rolling bass, minor-key harmony and repeating melodic hooks. Each has an explicit four-bar hook and four-bar answer, rather than a single minor shape transposed over every chord. The structure is eight bars of hook, four bars of bass-led break, four bars of answer and eight bars of fuller reprise.

Bass notes select the actual root, third or fifth of the current chord. Lead notes on quarter-note beats are chord members; passing notes stay in the natural-minor key. New leads stay between Bb3 and F5, have lower filter resonance and use a small pitch modulation in cents rather than fixed-Hz wobble. Pads release before the next chord, and the secondary pluck leaves space around the main melody.

## References consulted

- [Ableton: chords, arpeggios and basslines](https://www.ableton.com/en/blog/beginners-guide-to-chords-bass-melodies/): building the layers from a shared scale and chord progression. Applied through explicit chord-compatible notes, not through Ableton dependencies.
- [Ableton Learning Music](https://learningmusic.ableton.com/): combining short musical ideas and changing their arrangement over time.
- [Carpenter Brut interview, Decibel (2017)](https://www.decibelmagazine.com/2017/02/21/neon-knights-q-a-with-carpenter-brut/): contrasts and adapting repeating game music to gameplay timing. These are broad compositional references; no released melody or recording is imported.

## Validation and listening

Run `npm test`. The music regression suite checks the original score, all six complete arrangements, strong-beat harmony, bass/chord compatibility, lead register, pad release, source lifecycle, rotation, mute/volume and background recovery. These are technical and harmonic checks, not a guarantee of artistic quality.

For actual audio, run `node tools/render_music.cjs [output-directory]` using development tooling that supplies Playwright and Microsoft Edge. Playwright can be resolved through `NODE_PATH`; it is not a game dependency and is not part of the normal Node regression runner. The default destination is the OS temporary directory under `hotline-viseo-music`.

The renderer uses the game's own synth in a browser `OfflineAudioContext` at 22,050 Hz stereo. It exports WAV previews and `report.json`, checks for non-finite samples, silence and samples outside the digital range, and includes two bars beyond each new loop boundary. The original preview repeats twice. These exports are listening/review artifacts; gameplay still synthesizes audio live at the device sample rate.

The six default-level renders completed with zero out-of-range samples after the output-headroom adjustment. Noise generation is stochastic, so exact RMS and peak measurements vary between renders. Listen to the previews and to the game with weapon effects to judge melody, fatigue and mix; signal tests cannot judge those preferences.


## Menu volume controls

The title and pause audio screens share `AudioSettings` in `js/ui/audio_menu.js`: music and SFX are independent, clamped to 0–100%, and saved with the music mute preference in `hotline-viseo-audio-v1`. Storage failures leave working session controls. `main.js` reuses the exported engine singletons so captured entity references and UI sounds follow the same SFX gain. Pausing no longer overwrites the chosen music volume; death ducking is proportional to it and a new run restores it. Returning among title, controls and characters does not restart the current menu track. The compositions and gameplay timing are unchanged.

Startup attempts playback immediately while respecting browser autoplay restrictions. Keyboard, background clicks, touch release and foreground recovery resume suspended contexts; early gestures during map loading use the exported singleton. Resume rejections are handled without an unhandled promise rejection. `tools/validate_audio_startup.cjs` measures actual output under permitted and blocked autoplay policies, including the persisted mute case; see [menu validation](menu-direction.md) for its development-only runtime setup.

## Enemy combat and patrol integration

Enemy shots check cover between body and muzzle. Enemies investigate player gunshots at their heard location, while melee and dry fire do not summon them. Each automatic patrol round has a 50% chance of a reachable doorway excursion and return. Wave totals follow 5, 8, 13, 21, 34, 55, 89, 144 and onward, with at most 36 concurrent enemies and validated spawn space. Visual targeting, body clearance and stuck recovery remain active. The current Node regression runner includes 30 suites. See [combat rules and regression coverage](architecture.md#enemy-combat-and-navigation).

## Performance review — 20 September 2026

The performance fixtures keep music and sound effects active, including the dense shooting scenarios. Production synthesis, scheduling, tracks and gains are unchanged. The startup validator now observes blocked autoplay without accidentally granting activation, with isolated browser fixtures and actual signal/mute checks; all five cases pass. See the [performance evidence and audio-test methodology](game-performance.md).
