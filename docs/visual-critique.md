# Visual and gameplay repair review — 9 September 2026

Integration update, 18 September 2026: the title and supporting screens now use a shared Canvas palette, hard shadows, subtle scanlines and an original moving skyline. These menus replace the combined launch/character screen; the world rendering and collision work reviewed below is unchanged. See [menu direction and validation](menu-direction.md) for the current four-resolution capture workflow and its limitations.

Performed directly by the main agent, without subagents. This is a critical self-review, not an independent reviewer verdict.

## Pass 1: architecture and collision

The supplied screenshots showed floating VISEO signs, overlapping furniture, and distorted core floors. The current source had already removed the signs and cleaned some wall joins, but the renderer expected service-room polygons that the map never exported. The corresponding existing visual regression failed.

Restored three explicit service-room floor polygons with real matching partitions. The second divider was revised again after inspecting the first capture: its horizontal cut made the middle room triangular. The final divider follows the diagonal shell. Trimmed the west wood floor to the physical dividing wall. Moved the small-room printer away from its table and door, and centered the table farther into the room. Preserved the angled focus-room envelope from the supplied plan rather than forcing it into rectangular rooms.

Removed the blanket 35.2-world-unit addition to furniture collision dimensions. Decorative chairs no longer create a continuous invisible blocking band around tables. The tabletop/desk body remains solid. The editor probe then exposed an older physics defect: a circle fully inside a rotated rectangle reported no contact. Reused the local-space AABB resolver to handle both interior and edge contact, with a dedicated rotated-furniture regression. This uncovered five embedded authored enemy placements; moved them into clear floor space. Repaired the patrol reference made invalid by moving the small-room table.

## Pass 2: player and gait

The player had disconnected-looking feet from a second backward translation and oversized pale sleeve blocks that swallowed the head. Rebuilt the torso using the enemy shoulder and neck proportions, with a brown jacket, narrow cream sleeves, outlined hands and an attached mask. Removed the duplicate foot offset for both human actor types. Alternating step displacement now follows actual travel relative to aim, including strafing and backpedalling. The torso remains aimed. Wall-blocked and stopped movement still freezes the gait.

Live contact sheets showed that the old 3-pixel raster also erased small actor features. Changed the shared world raster to 2-pixel blocks, then recaptured the player and enemy at normal gameplay zoom. The result keeps readable masks, hands and shoes without separate actor/world pixel densities.

## Pass 3: artistic direction

Compared actual combat side by side with the Hotline Miami 2 screenshot linked in review.html (PC Gamer). The first result was too pastel and low contrast. Darkened grey/lavender carpet and deepened jade floors so warm furniture, pale actors and red impacts separate more clearly. Retained the source office footprint and furniture density.

The reference still has richer hand-authored prop detail and more varied floor textures. These repairs improve readability and remove the concrete defects; they do not establish artistic parity with the finished commercial game. The local combat capture and reference also show different combat densities, so blood coverage is not a controlled comparison.

## Debug editor and verification

- F2: live collision overlay; F3: map editor.
- Added sampled player-clearance dots with exact point probing and closed-door preview.
- Browser interaction checked furniture selection, numeric edits, undo, redo, local draft persistence, blocked probe output and clearance rendering without JavaScript errors.
- All test_*.js suites are run after the final changes, including map connectivity, spawn clearance, combat, waves, gait, visual geometry, gamepad and rotated furniture.
- Live automated combat captures exercise pickup, aiming, movement, kills, death and restart. This is not a complete multi-wave human playthrough; wave lifecycle has separate automated coverage.
- Final comparison captures: final-compare-plan.png, final-compare-materials.png, final-compare-interiors.png and final-compare-gameplay.png. Player motion: critic-actors-gait-2x.png. Debug editor: final-editor-clearance.png.

Editor floor zones remain separate from wall editing. Moving walls does not automatically regenerate floors; drafts remain local and do not rewrite source files. Clearance dots use a 24-world-unit sampling grid, so narrow passages must also be checked with the exact probe.
