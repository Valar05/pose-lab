# FPS-910947

Clip name: **pending Drew identification**

Actor: `FPS Arms`  
View: `FPV`  
Sword: intentionally visible during review

## Source evidence

Phone source:

`/storage/emulated/0/Movies/screen-20260921-070519-1789992317613.mp4`

Uploaded-chat filename: `910947.mp4`

- SHA-256: `89c191a9553c8cb2d74b830de2599685ca2f0a11d6534ff76832ba15d2cb28cc`
- bytes: `3,624,254`
- resolution: `1080 x 2404`
- duration: `1.901644 s`
- frames: `174`

The phone source and chat upload matched exactly by SHA-256 and byte count.

Useful animation evidence is approximately the first `0.84 s`. After roughly `0.9 s`, the Android notification shade obscures the viewport and is excluded from motion interpretation.

## Whole-motion contact sheet

![Whole-motion contact sheet](contact-sheet-clean.png)

- 4 x 4 sheet
- generated from source window `0.000–0.840 s`
- dense temporal sampling for overall extension / disappearance / return arc
- PNG SHA-256: `4feba60aa600f6452cb69d21306cfe8b632be51501b0921e62c0546627784257`

## Motion-detail contact sheet

![Motion-detail contact sheet](contact-sheet-motion-detail.png)

- 6 x 3 sheet
- generated from source window `0.100–0.780 s`
- tighter crop for extension, overshoot, recoil, and settle ordering
- PNG SHA-256: `75878663e107963ae520a57c27ef53ff387350503a6159bc25adc4f5b70d44d1`

## What is useful here

Treat this clip primarily as **timing and deformation evidence**, not as a direct pose donor.

The first-person rig can cheat anatomy and foreshortening aggressively. Those spatial poses do not automatically belong on a third-person or 2D character.

The transferable motion grammar is:

`compact -> violent extension -> very brief extreme/overshoot -> fast attacking-limb recoil -> softer body settle`

Important observations:

- Maximum extension is passed through rather than held politely.
- The attacking limb / weapon can exceed the comfortable screen-space silhouette for a blink.
- The return does not need to be a symmetric reverse of the attack.
- The attacking limb can retract before the rest of the body has fully settled.
- A large-looking strike does not require many separately authored poses if deformation carries the bridge and overshoot.

## April correction: this is relevant to the JAB

Drew correction: the April slot previously called the “spray animation” is actually the **jab**.

So this FPS sample is useful to April as a jab timing/deformation reference.

Do **not** copy the first-person geometry directly.

Potential April transfer:

- keep authored structure close to `IDLE -> JAB CONTACT -> IDLE`;
- one authored non-idle contact drawing may be enough;
- manufacture anticipation / bridge / recovery with controlled deformation;
- keep feet/base planted unless the authored move explicitly travels;
- concentrate compression in the shoulder / upper-body strike lane instead of full-body squash;
- snap hard into contact;
- allow a very brief deformation overshoot beyond the comfortable authored silhouette;
- keep contact exposure short;
- retract the arm faster than the final body settle;
- visual overshoot reach may exceed gameplay hit reach.

Provisional timing shape:

`compact -> SNAP -> contact -> micro-overshoot -> arm recoil -> body settle`

This is a hypothesis for April, not a finished prescription. Drew's later visual judgment overrides it.

## Open questions

- Which embedded FPSPlayer clip is this?
- Which frames does Drew consider the meaningful contact / extreme / recovery beats?
- Should April inherit this amount of overshoot, or a reduced version?
- Does this become part of a reusable `jab / linear strike` motion family after comparison with more source clips?
