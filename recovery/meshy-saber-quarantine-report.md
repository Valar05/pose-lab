# Meshy Saber Quarantine Recovery Report

Branch: `recovery/meshy-saber-quarantine` from `origin/main`.

Scope: recovery harness only. This report does not change saber offsets, retargeting, models, rig profile values, pose generation, or visual output.

## Located Surfaces

### Pose Surface

- `src/rig-profiles.js`
  - `meshyCharacter.startupClip`
  - `meshyCharacter.animationAliases`
  - `meshyCharacter.autoRetargetSources`
  - Current Ready source path: `OneHandReady` through `clipTag: 'FPS-SWORD-UPPER'`
- `src/pose-lab.js`
  - active actor/clip state via `debugSnapshot()`
  - active clip read via `debugCurrentClip()`
  - generated clip/runtime application through actor clip selection and retarget loading

### Socket Surface

- `src/rig-profiles.js`
  - `meshyCharacter.weaponProxy`
  - `socketBone: 'WeaponGrip'`
  - `handBone: 'RightHand'`
  - `leftHandBone: 'LeftHand'`
  - `handLocalOffset`, `modelLocalOffset`, `gripOffset`, `rotationDeg`
- `src/pose-lab.js`
  - `createWeaponProxy()`
  - `updateWeaponSocketTransform()`
  - synthetic `WeaponGrip` creation and parent/position/quaternion behavior

### Saber Surface

- `src/rig-profiles.js`
  - `meshyCharacter.weaponAttachment`
  - sabre GLB URL
  - `scale`, `position`, `rotationDeg`, `gripLocalPosition`, `tipLocalPosition`
- `src/pose-lab.js`
  - `attachWeaponAttachment()`
  - `updateWeaponAttachmentTransform()`
  - real sabre visibility and local grip/tip transform application

### Gate Surface

- Existing main-branch gate:
  - `tools/test_pose_lab_visual_red_build_contract.mjs`
  - Reads `generated/visual_red_build/pose_lab_latest.json`
  - Protects local visual evidence, but does not hard-fail Firebase-style human-red Meshy saber review truth.
- Added quarantine gate:
  - `tools/meshy_saber_quarantine_gate.mjs`
  - Reads a visual-truth JSON artifact.
  - Hard-fails when requested actor/clip evidence is missing, pose truth is degraded, the real sword is hidden, or any Meshy saber review reports human-red.

## Known Recovery Rule

The new gate is deliberately not a saber fix. It blocks further false-green work until a visual artifact proves the requested Meshy actor, requested clip, body pose, real sword visibility, and human-visible verdict all agree.

Verification command:

```sh
node tools/meshy_saber_quarantine_gate.mjs --self-test-known-red
```

That command passes only if the gate rejects the known red Meshy saber artifact shape.
