# Ares SupermanPunch SF2 Reduction Critique

## Source Read
- Source clip: `SupermanPunch`
- Runtime attack name: `SupermanPunch`
- Original keyed frames: `21` over `0.700s`
- Gameplay attack end from metadata: `0.600s`
- Tail beyond gameplay window: `0.100s`
- Peak right-side reach occurs at frame `8` time `0.300s`

## Reduction Verdict
- Reduced schedule keeps `5` read poses across `36` 60fps gameplay frames.
- `19` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.033s`: guard half extension, mid guard, snappy transition
- `anticipation` at `0.200s`: anticipation guarded, high hands, snappy transition
- `contact` at `0.300s`: strike full extension, mid guard, snappy transition
- `recoil` at `0.667s`: recovery extended, mid guard, readable shift
- `settle` at `0.700s`: recovery half extension, mid guard, readable shift

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
