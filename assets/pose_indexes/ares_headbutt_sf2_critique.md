# Ares Headbutt SF2 Reduction Critique

## Source Read
- Source clip: `Headbutt`
- Runtime attack name: `Headbutt`
- Original keyed frames: `23` over `0.767s`
- Gameplay attack end from metadata: `0.660s`
- Tail beyond gameplay window: `0.107s`
- Peak head-side reach occurs at frame `8` time `0.300s`

## Reduction Verdict
- Reduced schedule keeps `5` read poses across `40` 60fps gameplay frames.
- `21` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.033s`: guard coiled head guard, level head, readable shift
- `anticipation` at `0.067s`: guard coiled head guard, level head, snappy transition
- `contact` at `0.300s`: strike forward head drive, level head, snappy transition
- `recoil` at `0.333s`: strike coiled head guard, level head, snappy transition
- `settle` at `0.767s`: recovery coiled head guard, level head, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
