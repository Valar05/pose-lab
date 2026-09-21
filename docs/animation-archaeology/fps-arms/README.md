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
| [FPS-911491](FPS-911491/README.md) | pending Drew identification | three contact sheets + exact source hash | documented |

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
- [ ] `FistAttackCrouch`
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
