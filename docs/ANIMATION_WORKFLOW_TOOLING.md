# Animation Workflow Tooling

This lab now has a small command-line toolchain for reducing credit spend and avoiding repeated visual-guess loops while tuning SF2-style poseclips.

## Local Scoring

```sh
python3 tools/score_poseclip_sf2.py --poseclip assets/pose_indexes/ares_axekick_sf2.poseclip.json
```

Scores anticipation length, contact hold, hip travel, apex height, contact extension, arm motion, and recommended critique frames. Use this before spending vision/GPT critique on a clip.

## Source Pose Discovery

```sh
python3 tools/find_source_anticipation.py --poseclip assets/pose_indexes/ares_axekick_sf2.poseclip.json
python3 tools/extract_phase_candidates.py --poseclip assets/pose_indexes/ares_axekick_sf2.poseclip.json
```

These scripts inspect the indexed source frames and suggest useful anticipation/phase candidates from the original animation instead of guessing in the generated poseclip.

## Timing Variants

```sh
python3 tools/tune_sf2_timing.py --poseclip assets/pose_indexes/ares_axekick_sf2.poseclip.json --variant heavy
```

Generates timing proposals only. It does not rewrite poseclip tracks. Use it to compare light, medium, heavy, and special move timing before changing the generator.

## Version Deltas

```sh
python3 tools/compare_poseclip_versions.py --base OLD.poseclip.json --candidate NEW.poseclip.json
```

Reports actual track and schedule deltas. Use this when a version number or cache key changed but the animation does not visibly change.

## Critique Packets

```sh
python3 tools/build_critique_packet.py --poseclip assets/pose_indexes/ares_axekick_sf2.poseclip.json --out generated/pose_renders/ares_axekick_packet --view xz
```

Builds a render manifest, stickframe PNGs, and critique packet using `tools/render_poseclip_stickframes.py`. Use `--video` when a timed GIF/MP4 is needed.

## Overlay Plans

```sh
python3 tools/overlay_motion.py --target assets/pose_indexes/ares_axekick_sf2.poseclip.json --donor assets/pose_indexes/ares_headbutt_sf2.poseclip.json
```

Validates narrow donor overlay tracks without mutating poseclips. Apply overlays in the generator so non-target tracks can be tested.

## Cache/List Audit

```sh
node tools/poseclip_cache_key_audit.mjs
```

Checks that generated SF2 clips have cache origins, clean labels, visual evidence links, and no duplicate cache keys.

## Controlled Pose Data Overwrite

```sh
python3 tools/overwrite_pose_data.py --target assets/pose_indexes/ares_axekick_sf2.poseclip.json --source /path/to/new.poseclip.json --kind poseclip
```

Use this instead of `apply_patch` when replacing pose data on Android shared storage. The writer validates the JSON schema, restricts writes to project-owned pose/generated roots, writes atomically, and creates a timestamped backup under `generated/pose_overwrites/backups/`. Use `--dry-run` to validate without writing and `--allow-new` only when intentionally creating a new pose artifact.

## Tests

```sh
node tools/test_poseclip_workflow_tools.mjs
node tools/test_poseclip_stickframe_render.mjs
node tools/test_pose_data_overwrite.mjs
```

The workflow test exercises scoring, anticipation discovery, phase extraction, timing variants, version comparison, packet building, overlay planning, and cache audit. The stickframe test validates render manifests, evidence slots, PNG generation, and critique packet links.
