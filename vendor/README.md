# Vendored Trystero MQTT

The game dynamically imports `trystero-mqtt.min.js` only after entering multiplayer. It contains `@trystero-p2p/mqtt@0.25.4` and its bundled browser dependencies, compiled to an ES2020 ESM module by `esbuild@0.25.12`. Source: https://github.com/dmotz/trystero. There are no runtime CDN imports. Public MQTT signaling and WebRTC STUN traffic are network services, not module downloads.

SHA-256 of the checked-in bundle:

```
d1bb1f38873465361ff78b83df4d4f0404f3aea5ecb95ad7ddbb2027ce27752b
```

Rebuild from the repository root (development only):

```
npm ci --prefix tools/vendor-build
node tools/vendor-build/build.cjs
```

The lockfile pins the dependency graph. `LICENSES.txt` retains the installed package license notices; esbuild also retains legal comments in the bundle. Ship both the bundle and licenses with the static site. The bundler and npm dependencies are not loaded by the game. See `docs/multiplayer-architecture.md` for protocol, transport topology and validation.
