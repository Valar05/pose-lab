# Standalone Pose Lab Orientation

This is a standalone browser Pose Lab seeded from the newer `gravity-fist-threejs` pose lab. It is for inspecting imported GLB/Blend animation assets before they become runtime actors.

## Entry Points

- `pose-lab.html`: browser lab UI.
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

Open `http://127.0.0.1:8797/pose-lab.html`.

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
