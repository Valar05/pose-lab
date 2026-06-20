# Standalone Pose Lab Orientation

This is a standalone browser Pose Lab seeded from the newer `gravity-fist-threejs` pose lab. It is for inspecting imported GLB/Blend animation assets before they become runtime actors.

## Entry Points

- `pose-lab.html`: browser lab UI.
- `pose-lab.html`: critique-first entry by default; use `?mode=standard` for the fuller lab chrome.
- `pose-critique.html`: explicit critique alias that opens the same lab with the 3D viewport as the priority surface.
- `tools/call_codex_critique.py`: Codex-backed critique runner that consumes a poseclip packet and writes prompt/run artifacts under `generated/codex_critiques/`.
- `src/pose-lab.js`: Gravity Fist-derived lab runtime with clip, bone, transform, and retarget panels.
- `src/rig-profiles.js`: local FPSPlayer profile used by the lab.
- `assets/models/FPSPlayer.glb`: runtime GLB exported from `FPSPlayer.blend`.
- `assets/source/FPSPlayer.blend`: copied source blend for provenance.
- `assets/models/arcane/Forgeborn.glb`: Arcane Manifold full-body player rig copied from THECAULDRON.
- `assets/models/arcane/Animation_*.fbx`: Arcane Manifold native leg/turn animation clips loaded onto the full rig.
- `assets/source/arcane/Player.tscn`: Arcane Manifold scene reference for active player model and AnimationPlayer wiring.
- `assets/asset_manifest.json`: asset source and processing notes.

## Run

```sh
python -m http.server 8797
```

Open `http://127.0.0.1:8797/pose-lab.html` for the critique-first landing page, or `pose-lab.html?mode=standard` for the full lab surface.
The critique path is Pose Lab first; Legion is not the backend for this workflow.

## Durable Termux Server

Keep a durable tmux-backed Pose Lab server listening on port `8798` before handing work back:

```sh
mkdir -p /storage/emulated/0/Documents/GodotProjects/pose-lab/generated/server_logs
tmux new-session -d -s pose-lab-server-8798 "while true; do echo \"[\$(date -Is)] starting python http.server 8798 cwd=/storage/emulated/0/Documents/GodotProjects\"; cd /storage/emulated/0/Documents/GodotProjects && python -u -m http.server 8798; code=\$?; echo \"[\$(date -Is)] server exited code=\$code; restarting in 2s\"; sleep 2; done >> /storage/emulated/0/Documents/GodotProjects/pose-lab/generated/server_logs/pose-lab-server-8798.log 2>&1"
curl -I --max-time 5 http://127.0.0.1:8798/pose-lab/pose-lab.html
tail -80 /storage/emulated/0/Documents/GodotProjects/pose-lab/generated/server_logs/pose-lab-server-8798.log
```

If the session already exists, do not restart it unnecessarily; verify the tmux session, HTTP response, and log tail. The durable URL is `http://127.0.0.1:8798/pose-lab/pose-lab.html`; request and crash logs are in `generated/server_logs/pose-lab-server-8798.log`.

## Troubleshooting Order

When Pose Lab looks wrong, do not collapse multiple failures into one diagnosis. Check them in this order:

1. Inspect the newest screenshot or contact sheet first. Treat it as the source of truth for the visible state.
2. Confirm the browser is on the intended entry path and mode, including any query-string overrides such as `actor`, `qaActor`, `clip`, `mode`, or visual-QA flags.
3. Verify the selected actor in the startup resolver before chasing panel visibility or clip search logic. In critique mode, the default should be Ares if it is available.
4. Check whether a syntax error or module failure is preventing the UI from finishing its render pass.
5. The visual-QA harness should emit a ready-to-view Android broadcast after the first rendered beacon so the browser can be reopened from automation without guessing.
6. Check whether persistence is restoring an older actor, clip, or panel state after startup.
7. Only after the page is visibly on the correct actor and module-loaded should you debug missing controls, hidden docks, or clip-list filtering.

This order prevents a stale screenshot, a startup override, and a parse error from being treated as one bug.

## Ritual Word

When the user says `get motivated`, continue through implementation and verification instead of stopping after the first diagnosis. Anticipate the next likely failure, add the regression test, and close the loop before handing back the result.

## Device Capture Standard

Use the visual QA harness or a fresh Android screenshot from the live browser when you need visible proof.

1. Wake or launch the browser on the actual page URL.
2. Wait for the page to finish loading and confirm the visible mode from the screenshot.
3. Prefer the visual QA contact sheet for capture sequences and the newest Android screenshot for browser chrome or DOM state.
4. Do not rely on the old standalone `screencap` path. It is not the source of truth for this workflow.
5. If the page looks stale, bump the cache token or hard-refresh before changing animation logic.

## Validation

```sh
node --check src/pose-lab.js
python3 -m json.tool assets/asset_manifest.json >/dev/null
```

The FPSPlayer GLB was validated with Three GLTFLoader: 55 clips, `Arms` SkinnedMesh, `placeholderWeapon`, and bones including `WeaponR`, `WeaponL`, `Camera`, `HitboxHandR`, and `HitboxHandL`.



## Self-Service File Opening

Cleanup mode has an `Open Files` control that accepts local `.fbx`, `.glb`, and `.gltf` files from the browser. Select a model file plus any animation FBX files together; Pose Lab creates an in-memory `Opened` actor, loads the selected animations as clips, and opens the Cleanup panel. These local actors are temporary browser-session assets and are not added to `src/rig-profiles.js`. The bundled Orc/FPS/Arcane assets are now best treated as recent presets for common work, not as the only library path.

## Orc Import Packs And Merge

Downloaded Orc candidate packs should be staged under `assets/source/orc_berserker/import_packs/` and extracted runtime FBXs should live under `assets/models/orc_berserker/imported/`. The Orc preset is allowed to load those imported candidates directly, but they are still lab-side assets until cleanup or merge work produces a stable result. Use `docs/ORC_IMPORT_AND_MERGE_WORKFLOW.md` for the narrow workflow instead of rediscovering the asset layout each turn.

## Infinite Brutality Orc Cleanup

The lab now loads an `Orc Cleanup` actor before the older FPS/Arcane actors. It uses `assets/models/orc_berserker/standing_idle.fbx` as the active Infinite Brutality enemy rig and loads the Pro Melee Axe runtime subset from `assets/models/pro_melee_axe/*.fbx` as native extra clips. Startup opens the Cleanup panel on `standing_melee_attack_horizontal [smooth]` so the edited Pose Lab swing can be inspected directly.

Traversal clips on this profile strip hips/root XZ translation while preserving hip Y movement, matching the game-side controller policy: the runtime owns traversal/floor motion, while the mocap still provides vertical hip bounce and limb silhouette.

## Arcane Retarget Lab

The lab now loads two actor tabs:

- `FPS Arms`: first-person arm/weapon animation source from `FPSPlayer.glb`.
- `Arcane Rig`: full-body `Forgeborn.glb` target with Arcane walking/backward/turn FBX clips loaded as native own clips.

Use the Retarget panel with Source `FPS Arms` and Target `Arcane Full Rig`. For normal arm-transfer experiments, disable Translate and keep Rotate enabled with Position `None`. For clips where FPS torso/chest rotation should drive Arcane body yaw, enable `Torso to hips`; this builds extra clips that copy the selected FPS torso quaternion track onto Arcane's hip bone instead of using generic skeleton retargeting.

The imported FPS clips must be retargeted from the exported model/bind pose, not from animation keyframe zero. Many attack clips start already in a weapon-ready/combat pose, so using frame zero as rest collapses the punch read into broad shoulder drift. The current mapped-arm path uses model-rest quaternion deltas for all imported FPS arm clips.

Arcane also needs bone-roll correction: source arm/forearm/hand deltas are conjugated through an inferred chain-up basis built from each bone's rest child direction plus world-up. This keeps fist jabs from turning into upward reaches when FPSPlayer and Forgeborn store different local bone rolls. The readout mode should show `mapped-chain-up-basis-rest-delta` when this path is active.

First-person view mode uses Arcane Manifold's copied `Player.tscn` camera data: `Model/Armature/Skeleton3D/Head/Camera3D`, local position `(-0.0286048, 0.0880932, 0.076746)`, FOV `85`, parented to the animated `Head` bone. Startup selects Arcane and plays the generated `FistAttack1` retarget in FPV so attack readability can be judged like in-game arms. Because Forgeborn is a single skinned mesh, FPV collapses the `Head`, `head_end`, and `headfront` bones after calculating the camera to keep the helmet out of view; the visible Orbit/FPV buttons restore or reapply that mask.

## Local Blender Note

Debian/Termux Blender exists at `/usr/bin/blender` version 4.3.2 and can inspect the `.blend`, but exporter paths currently crash inside embedded Python while importing numpy/ctypes. The successful GLB export used Blender 4.4.3 on THECAULDRON.

See [docs/MOTIVATED_MODE.md](/storage/emulated/0/Documents/GodotProjects/pose-lab/docs/MOTIVATED_MODE.md:1) for the saved contract and the before-stopping checklist.

The same contract now includes an Initiative Audit: check, document, and test the cheap follow-up work before you stop.
