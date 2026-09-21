# FPS Arms Animation Archaeology

Living visual review archive for the original `FPSPlayer.glb` donor in Pose Lab.

## Boundary

This archive records and studies the original source animations. It does **not** migrate or retarget FPSPlayer into Pose Lab V2.

Do not infer clip names from appearance. A motion stays unidentified until Drew confirms it visually.

The sword remains visible during review by choice so sword-bearing source motion can be inspected rather than cosmetically hidden.

## Canonical donor

- Repo: `Valar05/pose-lab`
- Actor label: `FPS Arms`
- Actor role: `fps-arms`
- Asset: `assets/models/FPSPlayer.glb`
- Asset SHA-256: `e3cd9a6a1a18dc2f606d39c46fea4ecdc88b983f5bc4538ef164d4bf5efee20c`
- 55 embedded animations
- 45 skin joints
- 2 meshes: `Arms`, `Cube`
- 1,040 triangles
- first-person camera: source `Camera` bone


## Source-of-truth hierarchy

The original Pose Lab is canonical for FPSPlayer structure, rig behavior, retarget rules, camera setup, weapon/socket logic, and existing measured audits. This archive is supplementary visual evidence only.

Canonical sources, in order:

1. `PROJECT_ORIENTATION.md` in `Valar05/pose-lab`
2. `src/rig-profiles.js` → `player` / `FPS Arms` profile
3. existing Pose Lab generated FPS audit outputs and the tools that produced them
4. these screen recordings and contact sheets, used only to annotate visual reads, identify clips, and preserve examples that are easier to understand by eye

Do not re-derive a fact from a recording when Pose Lab already records it directly. Do not let a supplementary contact-sheet interpretation override Pose Lab's own rig/source documentation.

Current durable canonical refs used for this archive:

- branch: `recovery/from-usable-meshy-fk-7e6ee94`
- `PROJECT_ORIENTATION.md` blob `53b12ca4e43a6312cd9cd1c1d3ee8edd51c7d127`
- `src/rig-profiles.js` blob `87fcd5419e8e0afc380e2be63ac5b2549ac794d9`
- `docs/ANIMATION_WORKFLOW_TOOLING.md` blob `e00097a8042c7bdbc0873dcc42c960ffde793d98`

Pose Lab already documents, among other things, the 55-clip GLB validation, bind/model-pose retarget basis, `ShoulderCenter`-based FPS weapon mapping, `WeaponR` / camera bone behavior, the single-leg source plus mirrored support-leg overlay, and the distinction between first-person source motion and full-body retargeting.

## Review method

For each sample:

1. Preserve the exact phone recording path, byte count, and SHA-256.
2. Match any chat upload to the phone file by SHA-256 before using it as evidence.
3. Identify the clean visible interval. Exclude notification shade / unrelated UI intrusion.
4. Generate a whole-motion contact sheet.
5. Generate a tighter phase-detail contact sheet when useful.
6. Record what is source-specific separately from what may transfer to another character.
7. Keep Drew's corrections as explicit history.
8. Do not rename an unknown clip by inference.

## Reviewed samples

| Sample | Clip name | Evidence | Status |
| --- | --- | --- | --- |
| [FPS-910947](FPS-910947/README.md) | `FistAttack2` | two contact sheets + exact source hash | documented + identified |
| [FPS-911484](FPS-911484/README.md) | `FistAttackAir` | three contact sheets + exact source hash | documented + identified |
| [FPS-911491](FPS-911491/README.md) | `FistAttackCrouch` | three contact sheets + exact source hash | documented + identified |
| [FPS-911507](FPS-911507/README.md) | pending Drew identification | three contact sheets + exact source hash | documented |
| [FPS-911509](FPS-911509/README.md) | pending Drew identification | three contact sheets + exact source hash | documented; shield-bash/backhand dual-use note |
| [FPS-911511](FPS-911511/README.md) | pending Drew identification | cycle + shoulder-orbit + loop sheets | documented; torso-free full-orbit lesson |

## Embedded clip inventory

**Recognition note:** `FistAttackAir` is the only FPSPlayer clip in this source set that has the leg.

Unchecked means not yet documented in this archive. A checked item should have a linked sample/contact sheet before being treated as reviewed.

- [ ] `0T-Pose`
- [ ] `Climbing`
- [ ] `ClimbingSide`
- [ ] `FistAttack1`
- [x] `FistAttack2`
- [ ] `FistAttack3`
- [ ] `FistAttack4`
- [ ] `FistAttack5`
- [x] `FistAttackAir`
- [ ] `FistAttackAirForward`
- [x] `FistAttackCrouch`
- [ ] `FistAttackSprint`
- [ ] `FistBlock`
- [ ] `FistBlockHitLeft`
- [ ] `FistBlockHitParry`
- [ ] `FistBlocking`
- [ ] `FistInjuredRight`
- [ ] `FistJump`
- [ ] `FistPowerAttack`
- [ ] `FistPowerAttackForwardOld`
- [ ] `FistPowerAttackNeutral`
- [ ] `FistReadied`
- [ ] `FistReady`
- [ ] `FistThrow`
- [ ] `FistWalking`
- [ ] `JumpAddative`
- [ ] `KickParrySpecial`
- [ ] `KickPushAttack`
- [ ] `KickPushAttackOld`
- [ ] `KnifeAttack1`
- [ ] `KnifeAttack2`
- [ ] `KnifeAttack3`
- [ ] `KnifeAttack4`
- [ ] `KnifePowerAttackAir`
- [ ] `KnifePowerAttackBack`
- [ ] `KnifePowerAttackForward`
- [ ] `KnifePowerAttackLeft`
- [ ] `KnifePowerAttackNeutral`
- [ ] `KnifePowerAttackRight`
- [ ] `KnifeReadied`
- [ ] `KnifeReady`
- [ ] `LandAdditive`
- [ ] `Mantle`
- [ ] `OneHandAirForwardAttack`
- [ ] `OneHandAttack1`
- [ ] `OneHandAttack2`
- [ ] `OneHandAttack3`
- [ ] `OneHandAttack4`
- [ ] `OneHandAttack5`
- [ ] `OneHandReadied`
- [ ] `OneHandReady`
- [ ] `WandFire`
- [ ] `WandFire.001`
- [ ] `WandReadied`
- [ ] `WandReady`

## Cross-character use

Source poses from this first-person rig are not automatically safe pose donors. The strongest reusable information may instead be timing, screen-space commitment, anticipation, overshoot, recoil ordering, holds, and settle behavior.

Treat every transfer as a hypothesis until the target character is visually reviewed.

### Torso-free rotational freedom

`FPS-911511` demonstrates that the donor's missing torso is not merely absent geometry. It permits the shoulder / arm assembly to orbit around the body axis through poses a conventional ribcage would block. Preserve this as a rig-design affordance; do not automatically “fix” the missing anatomy away.
