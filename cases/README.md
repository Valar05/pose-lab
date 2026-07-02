# Pose Lab Cases

Cases are named visual-truth problems with one route, one expected behavior, and one evidence pack.

Use cases when a bug can otherwise sprawl across screenshots, debug bridge output, offline renderers, source-string tests, and generated scratch folders.

Required case behavior:

- name the actor and clip;
- name the route kind;
- state the expected visible behavior;
- list contract references;
- list artifact paths that count as evidence;
- separate default cheap checks from heavier visual/render checks.

Run:

```sh
node tools/pose_lab_case.mjs list
node tools/pose_lab_case.mjs verify --case <case-id>
node tools/pose_lab_case.mjs verify --case <case-id> --run-checks
```
