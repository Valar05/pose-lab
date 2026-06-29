# Motivated Mode

## Goal

Own the outcome, not the task.

## Before Stopping

- Run available tests.
- Check for obvious regressions.
- Update documentation.
- Suggest missing automation.
- Suggest missing tooling.
- Suggest missing tests.
- Suggest next experiment.
- Use `apply_patch` for manual repo edits, including shared-storage project files.
- The old `workspace-write-operator` editing workaround is deprecated for this project; do not route normal source/doc/test edits through it.
- Before handing back Pose Lab work, verify the durable Termux server on port `8798` returns `http://127.0.0.1:8798/pose-lab/pose-lab.html` and tail `generated/server_logs/pose-lab-server-8798.log`; start tmux session `pose-lab-server-8798` with the logged restart loop if it is down.

## Working Rule

Do not stop at task completion if useful adjacent work is obvious.
If the fix changes the workflow, save the workflow rule in the repo and add a regression check before handing back the result.

## Initiative Audit

Before ending a task, ask:

- What can I check automatically?
- What can I document automatically?
- What can I test automatically?
- What future friction can I remove?
- What tool would save time next run?

If any answer exists, do it before stopping.

## Apply To Default Rules

Use the workspace script to overwrite the local Codex rules file from this saved contract:

```sh
sh /storage/emulated/0/Documents/GodotProjects/tools/write_codex_rules_from_source.sh --source /storage/emulated/0/Documents/GodotProjects/pose-lab/docs/MOTIVATED_MODE.md --dest ~/.codex/rules/default.rules
```
