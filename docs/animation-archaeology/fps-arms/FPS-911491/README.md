# FPS-911491

Clip name: **FistAttackCrouch** (confirmed by Drew)

Actor: `FPS Arms`  
View: `FPV`  
Sword: intentionally visible during review

## Source evidence

Phone source:

`/storage/emulated/0/Movies/screen-20260921-083043-1789997439019.mp4`

Uploaded-chat filename: `911491.mp4`

- SHA-256: `b4efff64747812e55ece342f499e4f8f638b66dbba03755b288b675c765359e2`
- bytes: `9,421,127`
- resolution: `2404 x 1080`
- duration: `4.985389 s`
- frames: `353`

The phone source and chat upload matched exactly by SHA-256 and byte count.

The clean recording contains repeated execution of one motion at roughly a one-second cadence before Android system UI intrudes. Representative corresponding cycle starts are around `0.00`, `1.06`, `2.08`, and `3.14 s`.

## One-cycle contact sheet

![One-cycle contact sheet](contact-sheet-cycle.png)

- 4 x 4 sheet
- generated from source window `0.000–1.060 s`
- PNG SHA-256: `29658ae775c9b8b113838f07973150fb127f565fa730bfc5061fdfe3b27f7211`

## Motion-detail contact sheet

![Motion-detail contact sheet](contact-sheet-motion-detail.png)

- 6 x 3 sheet
- generated from source window `0.080–0.980 s`
- PNG SHA-256: `3ac25897821396444e5b40bf980a4f057cda98669609234de17be4b705c06e61`

## Loop-consistency contact sheet

![Loop-consistency contact sheet](contact-sheet-loop-consistency.png)

- four corresponding cycle-start samples
- approximate times: `0.00`, `1.06`, `2.08`, `3.14 s`
- PNG SHA-256: `a2da6b7e50c95dec8496fafc8a57a5c1dc209672b7cee1d72391dc09bbfa3bf6`

## Neutral phase description

`near-camera high / closed pose -> downward and forward travel -> compact low-center phase -> return to near-camera high pose`

## Observations

- The cycle uses strong depth change: the near-camera hand/weapon begins visually large, then recedes sharply.
- Most of the action occurs through a compact lower-center path before returning to the large near-camera pose.
- The return is fast enough to make the loop seam visually important; the repeated-cycle strip is kept specifically to expose whether that seam changes.
- The motion should not be semantically named from appearance alone. Drew will identify the embedded clip visually.

## Open questions

- Exact FPSPlayer embedded clip name.
- Which phase Drew considers the attack/contact extreme.
- Whether any blue rig overlay visible in the recording represents a useful source-motion feature or only Pose Lab visualization and camera overlap.

## Drew identification

Drew identified this recorded source motion as `FistAttackCrouch`.
