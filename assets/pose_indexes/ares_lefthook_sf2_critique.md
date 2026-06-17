# Ares LeftHook SF2 Reduction Critique

## Source Read
- Source clip: `Hook`
- Runtime attack name: `LeftHook`
- Original keyed frames: `21` over `0.667s`
- Gameplay attack end from metadata: `0.350s`
- Tail beyond gameplay window: `0.317s`
- Peak left-side reach occurs at frame `5` time `0.167s`

## Reduction Verdict
- Reduced schedule keeps `5` read poses across `21` 60fps gameplay frames.
- `12` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.000s`: start half extension, mid guard, readable shift
- `anticipation` at `0.100s`: guard guarded, high hands, snappy transition
- `contact` at `0.167s`: strike full extension, mid guard, snappy transition
- `recoil` at `0.233s`: strike extended, mid guard, readable shift
- `settle` at `0.667s`: settle half extension, mid guard, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
