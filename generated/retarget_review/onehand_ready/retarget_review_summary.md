# Meshy OneHandReady Retarget Review

Generated: 2026-06-30T16:09:26.078Z
Candidate: OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]
Decision: needs_weapon_socket_promotion
Promotion applied: false

## Visual Read
The synchronized review shows the FK silhouette is usable for review, while production saber placement remains offset. The socket candidate makes the grip follow-through retarget-friendly without touching the arm, but promotion is intentionally deferred.

## Arm Metrics
- Right hand avg error: 0.20304
- Left hand avg error: 0.22811
- Right elbow avg error: 0.19636
- Left elbow avg error: 0.20803
- FK first divergence layer: fk

## Weapon Metrics
- Production picked grip avg/max: 0.53876 / 0.53884
- Socket-candidate picked grip avg/max: 0.00325 / 0.0051
- Production tip avg/max: 0.48679 / 0.48724
- Socket-candidate shifted-tip avg/max: 0.49009 / 0.49881
- Blade direction avg/max deg: 38.485 / 39.772

## Next Bottleneck
Run an explicit, separately confirmed production socket-promotion pass for Meshy modelLocalOffset, then re-review blade direction/tip with visual marker parity.

No production retarget behavior, startup clip, accepted baseline, grip landmark, tip landmark, blade basis, FK, or roll setting was changed.
