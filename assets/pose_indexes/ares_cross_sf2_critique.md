# Ares Cross SF2 Reduction Critique

## Source Read
- Source clip: `Cross`
- Runtime attack name: `Cross`
- Original keyed frames: `27` over `0.867s`
- Gameplay attack end from metadata: `0.550s`
- Tail beyond gameplay window: `0.317s`
- Peak right-side reach occurs at frame `8` time `0.267s`

## Reduction Verdict
- Reduced schedule keeps `5` read poses across `33` 60fps gameplay frames.
- `19` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.000s`: start half extension, mid guard, readable shift
- `anticipation` at `0.233s`: anticipation guarded, mid guard, snappy transition
- `contact` at `0.267s`: strike full extension, high hands, snappy transition
- `recoil` at `0.667s`: recovery extended, mid guard, held pose
- `settle` at `0.767s`: settle half extension, mid guard, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
