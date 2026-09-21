# FPS-911484

Clip name: **pending Drew identification**

Actor: `FPS Arms`  
View: `FPV`  
Sword: intentionally visible during review

## Source evidence

Phone source:

`/storage/emulated/0/Movies/screen-20260921-081554-1789996547481.mp4`

Uploaded-chat filename: `911484.mp4`

- SHA-256: `dae4bfa126fae34097464712c51f554a10bc7e5a241bee61cf22a9dd78189cb0`
- bytes: `9,091,139`
- resolution: `2404 x 1080`
- duration: `6.961633 s`
- frames: `491`

The phone source and chat upload matched exactly by SHA-256 and byte count.

The animation loops approximately every `0.83 s`. Near-identical cycle starts were observed around `0.82`, `1.65`, `2.49`, `3.33`, and `4.15 s`. After that clean review interval, Android system UI begins intruding and is excluded from motion interpretation.

## One-cycle contact sheet

![One-cycle contact sheet](contact-sheet-cycle.png)

- 4 x 4 sheet
- generated from a single source cycle `0.000–0.820 s`
- purpose: preserve the authored phase order without duplicating repeated loops
- PNG SHA-256: `4134addae5b01a1a0a571f00a9501c87c312525f2ed096170c4f9eeb6eb41297`

## Motion-detail contact sheet

![Motion-detail contact sheet](contact-sheet-motion-detail.png)

- 6 x 3 sheet
- generated from `0.050–0.780 s`
- purpose: inspect the transition into full forward projection and the return path
- PNG SHA-256: `6d07d5ef415faf6e77d29dc17e1ea86f42866437da1cff1f176ec99fca3cb32f`

## Loop-consistency contact sheet

![Loop-consistency contact sheet](contact-sheet-loop-consistency.png)

- five corresponding cycle-start samples
- approximate times: `0.82`, `1.65`, `2.49`, `3.33`, `4.15 s`
- purpose: show that the recording contains repeated execution of one motion rather than several different source actions
- PNG SHA-256: `63380adb7f75a17f672be840daf2d327870ccd4c839b7c79a5db7e6ca336f814`

## Source-motion observations

Neutral phase description:

`high / near-camera guard -> long forward projection -> low / retracted recovery -> high guard`

Observed properties:

- The weapon begins visually large and near the camera, producing strong foreshortening before the attack commits.
- The transition into the long forward projection is fast relative to the recovery.
- At maximum projection, the sword and arm form a long narrow screen-space line rather than a broad silhouette.
- The recovery travels through a lower diagonal before returning to the near-camera guard.
- The loop is highly repeatable across the clean portion of the recording.
- Most of the perceived size change comes from depth / camera-relative foreshortening, so direct silhouette copying to a side-view or third-person character would be misleading.

## Transferable lesson candidates

These are hypotheses, not target-character prescriptions:

- A strike can read strongly from **depth-scale change** even when the hand path is comparatively simple.
- Near-camera anticipation can make the following extension feel longer than its world-space travel alone.
- Recovery can use a different screen-space path from the outgoing attack instead of simply reversing it.
- A very narrow extreme can still read clearly when the setup and depth contrast are strong.
- Repeated-loop stability makes this a useful source for measuring phase timing once Drew identifies the exact embedded clip.

## Open questions

- Exact FPSPlayer embedded clip name.
- Whether Drew reads the key extreme as a thrust, pointing extension, or another sword-action category.
- Which frame should be treated as the meaningful contact / attack extreme.
- Whether the lower recovery path is intentional attack follow-through or simply the shortest route back to the authored ready pose.
