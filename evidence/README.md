# Pose Lab Evidence Surface

Evidence code owns visual truth, route verification, artifact mining, and case reports.

Current evidence tools still live in `tools/` during migration. The new front door is:

```sh
node tools/pose_lab_case.mjs list
node tools/pose_lab_case.mjs verify --case meshy-weapon-fk-pinning
```

Evidence output belongs under `generated/cases/<case-id>/...` unless a tool already has a stable canonical path.
