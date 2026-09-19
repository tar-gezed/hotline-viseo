# Developer & Agent Guidelines — Hotline Viseo: After Hours

This document defines the development rules, architectural standards, and mandatory Git commit policies for all AI agents and human contributors working on this repository.

---

## 1. Project Overview & Technology Stack

**Hotline Viseo** is a top-down 2D neon action game inspired by *Hotline Miami*, situated within the stylized floor plan of the VISEO office.

- **Language & Runtime:** Vanilla JavaScript (ES6+ standard), executed directly by the browser. The game will be published as a Github Page with a Github Page auto deployment.
- **Rendering:** High-performance HTML5 Canvas 2D with custom CRT, chromatic aberration, scanlines, dynamic lighting, and trauma shake post-processing.
- **Audio:** Procedural Web Audio API sound synthesis (`SoundEffects`) and multi-track retro synthwave synthesizer (`SynthMusic`).
- **Dependencies:** **Zero runtime production dependencies.** The game runs entirely as a static web application compatible with GitHub Pages.
- **Development Tooling:** Node.js (>= 18.0.0) used for now for local static file serving (`tools/serve.cjs`) and running automated test suites.

---

## 2. Mandatory Git Commit Conventions

All commits in this repository **must strictly follow these non-negotiable rules**:

### 2.1 Conventional Commits Specification
Every commit message must strictly comply with the [Conventional Commits](https://www.conventionalcommits.org/) format:

```text
<type>(<scope>): <complete, clear, and relevant title in English>

<ultra-complete description of all changes committed>
```
- **Language:** Commit messages must be written **in English exclusively**.

---

## 3. Mandatory Pre-Commit Workflow

Before staging or committing any changes, the following two steps **MUST** be performed:

### 3.1 Synchronize All Documentation & Readmes
> [!IMPORTANT]
> **Before every single commit, all documentation files and READMEs MUST be updated.**

### 3.2 Execute Regression Test Suite
All automated Node.js regression suites must pass with 0 errors before staging or committing:

```bash
npm test
# Equivalent to: node tools/test.cjs
```

## 4. UI Integration References

The dedicated title, character, controls, audio, credits, tools and pause screens
share `UITheme` and `CanvasMenu`; see [menu direction](docs/menu-direction.md)
for state routing, input handling, audio policy and browser validation commands.
The regression runner currently includes 21 suites. Browser acceptance checks
are optional development tools and add no production dependencies.
