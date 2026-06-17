# Ares AxeKick SF2 Reduction Critique

## Source Read
- Source clip: `AxeKick`
- Runtime attack name: `AxeKick`
- Original keyed frames: `25` over `0.800s`
- Gameplay attack end from metadata: `0.660s`
- Tail beyond gameplay window: `0.140s`
- Peak left-side reach occurs at frame `8` time `0.267s`

## Reduction Verdict
- Reduced schedule keeps `12` read poses across `40` 60fps gameplay frames.
- `22` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.000s`: start extended leg, low foot, readable shift
- `anticipation` at `0.300s`: anticipation extended leg, high foot, snappy transition
- `contact` at `0.433s`: strike full leg extension, mid foot, snappy transition
- `recoil` at `0.467s`: strike extended leg, low foot, snappy transition
- `settle` at `0.800s`: recovery extended leg, low foot, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
