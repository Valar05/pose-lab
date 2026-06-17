# Ares SpinningHighKick SF2 Reduction Critique

## Source Read
- Source clip: `SpinningHighKick`
- Runtime attack name: `SpinningHighKick`
- Original keyed frames: `26` over `0.867s`
- Gameplay attack end from metadata: `0.800s`
- Tail beyond gameplay window: `0.067s`
- Peak right-side reach occurs at frame `11` time `0.400s`

## Reduction Verdict
- Reduced schedule keeps `6` read poses across `48` 60fps gameplay frames.
- `25` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.033s`: guard extended leg, low foot, held pose
- `anticipation` at `0.233s`: guard extended leg, low foot, snappy transition
- `contact` at `0.400s`: strike full leg extension, high foot, snappy transition
- `recoil` at `0.567s`: strike loaded leg, low foot, snappy transition
- `settle` at `0.867s`: recovery extended leg, low foot, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
