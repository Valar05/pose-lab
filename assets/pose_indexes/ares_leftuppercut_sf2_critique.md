# Ares LeftUppercut SF2 Reduction Critique

## Source Read
- Source clip: `LeftUppercut`
- Runtime attack name: `LeftUppercut`
- Original keyed frames: `21` over `0.667s`
- Gameplay attack end from metadata: `0.250s`
- Tail beyond gameplay window: `0.417s`
- Peak left-side reach occurs at frame `6` time `0.200s`

## Reduction Verdict
- Reduced schedule keeps `5` read poses across `15` 60fps gameplay frames.
- `10` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.000s`: start half extension, mid guard, readable shift
- `anticipation` at `0.067s`: guard guarded, high hands, snappy transition
- `contact` at `0.167s`: strike extended, high hands, snappy transition
- `recoil` at `0.200s`: strike extended, high hands, snappy transition
- `settle` at `0.667s`: settle half extension, mid guard, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
