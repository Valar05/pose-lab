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

Builds a render manifest, stickframe PNGs, and critique packet using `tools/render_poseclip_stickframes.py`. Critique packets default to 30 fps so the tagged frames line up with the slower human read used for review. Use `--frames step` when you want a compact per-frame strip with labels like `f012` instead of phase chunks, and use `--video` when a timed GIF/MP4 is needed.

## Offline Weapon Stick Parity

```sh
node tools/weapon_retarget_stick_debug.mjs --preset fpsPlayer
```

Use this before touching the live Pose Lab viewport when comparing FPS Arms saber motion to Meshy Character. The `fpsPlayer` preset loads `assets/models/FPSPlayer.glb`, samples `OneHandAttack1`, uses the solved `WeaponR` virtual saber tip, and writes `generated/weapon_retarget_debug/fps_onehand_attack1/weapon_retarget_stick_sheet.png` plus JSON metrics including grip travel, blade sweep, shoulder-frame blade direction error, and shoulder-frame grip error. Treat the source-derived offline path as a diagnostic, not the live runtime algorithm; the accepted Meshy runtime path is currently `fps-upper-key-convert` for `OneHandReady` only, preserving authored FPS key times, closing generated quaternion seams for the authored cyclic wrap, using bounded IK correction on mapped source rotation tracks without replacing them, and solving `WeaponGrip` from the mapped `Weapon.R` virtual blade frame.

## FPS Weapon Basis Audit

```sh
node tools/meshy_fps_weapon_basis_audit.mjs
```

Use this when Meshy saber rotation looks sideways or rolled. It compares the rejected raw wrist-relative `Weapon.R` orientation against the accepted frame-solved weapon basis at the 31 authored `OneHandReady` source keys. The audit writes `generated/weapon_retarget_debug/fps_weapon_basis_audit.json`; the current red-build failure measured raw blade direction around 125 degrees off on average on the attack path, so runtime now maps the `Weapon.R` virtual blade tip and up axis from FPS `ShoulderCenter` into Meshy `Spine02` before writing `WeaponGrip`.


## Troubleshooting Loop

When a critique section, actor landing, or pose listing seems wrong, use this order:

1. Read the newest screenshot or video frame before changing code.
2. Verify the loaded entry URL and actor override parameters.
3. Check startup-selection code and saved-state restore separately.
4. Confirm module load success before diagnosing UI placement or controls.
5. If the visible page still disagrees with the code, add a failing test for the visible behavior, not just for a field or label.

This keeps parse failures, actor bootstrapping, and dock visibility from masking each other.

## Transport Rules

The compact critique section should support two playback modes in the same control group:

1. `Step 30` for one-frame scrub at the critique step rate, frame stepping, and keyframe jumping.
2. `Live 60fps` for continuous playback when you want to catch easing and IK artifacts.
3. `Loop` and `Ping-Pong` are playback modifiers, not separate screens.

## Ritual Word

When the user says `get motivated`, do not stop after diagnosis. Continue through implementation, verification, and the next obvious follow-up fix in the same turn when the environment allows it.

## Device Capture Standard

Use the live browser plus the visual QA harness as the capture path.

1. Start from the actual page URL in the Android browser.
2. If the visible UI looks stale, refresh or bump the cache token before judging the change.
3. Use the visual QA report for frame sequences and the newest Android screenshot for browser chrome or DOM visibility.
4. Do not use the old standalone `screencap` path.

## UX Critique Skill

Use the `ux-critique-workflow` skill when the visible problem is control density, hidden player transport, or stale open-state in a critique layout.

## Phone-First Control Layout

Critique mode is viewport-first. It should boot with no large sheet open: the model stays visible, and the bare player timeline carries the scrub rail, jump controls, and critique tag drawer. Use `Clips` for clip search, `Pose` for frame notes, `Edit` for cleanup/range actions, `Bones` for live reposing, `More` for import/merge/index/advanced controls, and `View` for readout. Keep the clip selector on the same transport rail so it does not wrap into a second button row. Hide the pose editor summary until `Correct Pose` is invoked. The critique station should keep the visible controls to: transport, scrub timeline, keyframe markers, and a collapsed critique tag window with `Correct Pose`, `New Key`, `Compare`, and `Critique`. Do not restore the old full-height cleanup wall on startup.

## Frame Critique Notes

```sh
python3 tools/record_frame_critique.py --attack AxeKick --tag contact --comment 'heel should settle first' --bone mixamorig:LeftFoot --mark heel-lock
```

Use this when you want a compact grease-pencil style note attached to a single capture slot. The note is stored in the visual evidence JSON next to the frame it refers to, and both the render packet and OpenAI critique runner will surface it.

The compact critique section in `pose-lab.html?mode=critique` keeps the workflow local: step 30fps, jump keyframes, write a short note, tag marks or bones, and save the critique with any live bone edits before exporting it with the CLI later.

## OpenAI Critique Runner

```sh
python3 tools/call_openai_critique.py --poseclip assets/pose_indexes/ares_axekick_sf2.poseclip.json --model YOUR_CHEAP_OPENAI_MODEL --dry-run
```

Builds the existing critique packet, picks a small frame subset, and prepares an OpenAI Responses API request with image inputs. Use `--dry-run` to verify the packet before spending credits. Live runs save `critique.md`, `response.json`, and request metadata under `generated/openai_critiques/`.


## Debug CLI

```sh
node tools/pose_lab_debug.mjs serve --port 8899 --page-url http://127.0.0.1:8797/pose-lab.html
node tools/pose_lab_debug.mjs --bridge http://127.0.0.1:8899 status
```

The browser page can also be inspected directly from the devtools console with `window.poseLabDebug.exec('status')`, `window.poseLabDebug.exec('actor orc')`, `window.poseLabDebug.exec('bone select mixamorig:LeftHand')`, `window.poseLabDebug.exec('bone rotate mixamorig:Spine 35 0 0')`, or `window.poseLabDebug.exec('qa capture')`. Use `debugBridge=1&debugBridgeUrl=...` in the page URL to connect the live page to the Node bridge.

## Critique Snapshot Audit

```sh
python3 tools/report_critique_snapshot.py --clip generated/openai_critiques/latest/exported.poseclip.json --pretty
```

Summarizes the saved critique state from an exported poseclip or draft payload. Use this to confirm the note text, marked bones, and live bone edits survived the save path before you spend another critique pass.

## Codex Critique Runner

```sh
python3 tools/call_codex_critique.py --poseclip assets/pose_indexes/ares_axekick_sf2.poseclip.json --model o3 --dry-run
```

Builds the same critique packet, assembles a Codex prompt, and writes `prompt.md` plus `request_meta.json` before handing the text to `codex exec`. Use this when you want the critique back end to stay inside the Codex toolchain instead of the OpenAI API path.

## Critique-First Entry

Open `pose-critique.html` when you want the 3D viewport to be the default landing surface. It loads the same lab with critique mode active so the heavy panel stack stays out of the way until you open it.

## Batch OpenAI Critique

```sh
python3 tools/batch_openai_critiques.py --glob 'assets/pose_indexes/ares_*kick_sf2.poseclip.json' --model YOUR_CHEAP_OPENAI_MODEL --dry-run
```

Runs the same packetized critique flow across multiple poseclips and writes a batch manifest. This is the cheap way to review a family of kicks or punches without spending Codex turns on first-pass visual reads.

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

Use `apply_patch` for normal manual repo edits. For intentional bulk pose-data replacement, this writer remains available as a validation/backup tool: it validates the JSON schema, restricts writes to project-owned pose/generated roots, writes atomically, and creates a timestamped backup under `generated/pose_overwrites/backups/`. Use `--dry-run` to validate without writing and `--allow-new` only when intentionally creating a new pose artifact.

## Ganondorf Steering Reference

See [docs/GANONDORF_REFERENCE.md](/storage/emulated/0/Documents/GodotProjects/pose-lab/docs/GANONDORF_REFERENCE.md:1) when you need a dedicated realistic-character benchmark for Smash-style body cheating. Use it for body steering, compression, and silhouette decisions, not for literal timing.

## Live Pose Correction Overlay

Critique mode now treats corrected poses as editable overlay keys stored in `localStorage` under `pose-lab:pose-corrections:v1`. The base player view must stay clean: no always-on skeleton dots, no debug watch-bone markers, and no IK gizmos until the user enters correction mode. `Correct Pose` enables viewport-first touch controls instead of opening a large numeric menu. Tap a dedicated hand/foot IK control or the screen-space path of a bone segment to select it; tap empty viewport space to deselect. One-finger drag moves IK controls in the camera plane and rotates FK bone selections. Canvas-picked controls sync into the tiny touch HUD and do not route through the hidden legacy Bones panel. `New Key` creates a real correction key at the current 30fps frame, not just a note. Hand and foot endpoints use sparse Blender/Rigify-style outline IK handles with invisible hit proxies; toes, fingers, hitboxes, and end bones remain FK-selectable skeleton targets instead of detached IK controls. `Compare` toggles the overlay while preserving the current time.

Key navigation wraps: next key from the final authored key jumps to the first, and previous key from the first jumps to the final. When no authored keys exist, frame stepping wraps across the 30fps stepped timeline.

## Tests

```sh
node tools/test_poseclip_workflow_tools.mjs
node tools/test_poseclip_stickframe_render.mjs
node tools/test_weapon_retarget_stick_debug.mjs
node tools/test_weapon_retarget_fps_meshy_stick_debug.mjs
node tools/test_pose_data_overwrite.mjs
node tools/test_openai_critique_runner.mjs
node tools/test_codex_critique_runner.mjs
node tools/test_attack_smash_steering.mjs
node tools/test_ux_critique_workflow.mjs
node tools/test_pose_correction_editor.mjs
node tools/test_bone_touch_selection.mjs
```

The workflow test exercises scoring, anticipation discovery, phase extraction, timing variants, version comparison, packet building, overlay planning, and cache audit. The stickframe test validates render manifests, evidence slots, PNG generation, and critique packet links. The OpenAI critique test validates packet assembly, frame selection, request preview generation, and batch dry-run wiring without spending API credits.

## Motivated Mode

See [docs/MOTIVATED_MODE.md](/storage/emulated/0/Documents/GodotProjects/pose-lab/docs/MOTIVATED_MODE.md:1) for the saved working contract. The rule is simple: own the outcome, not the task.

## Initiative Audit

Before ending a workflow pass, ask:

- What can I check automatically?
- What can I document automatically?
- What can I test automatically?
- What future friction can I remove?
- What tool would save time next run?

If any answer exists, perform it before stopping.
