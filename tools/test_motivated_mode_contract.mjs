import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const doc = fs.readFileSync(path.join(projectRoot, 'docs', 'MOTIVATED_MODE.md'), 'utf8');
const workflow = fs.readFileSync(path.join(projectRoot, 'docs', 'ANIMATION_WORKFLOW_TOOLING.md'), 'utf8');
const orientation = fs.readFileSync(path.join(projectRoot, 'PROJECT_ORIENTATION.md'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

for (const needle of [
  '# Motivated Mode',
  'Own the outcome, not the task.',
  '- Run available tests.',
  '- Check for obvious regressions.',
  '- Update documentation.',
  '- Suggest missing automation.',
  '- Suggest missing tooling.',
  '- Suggest missing tests.',
  '- Suggest next experiment.',
  'Do not stop at task completion if useful adjacent work is obvious.',
  '## Initiative Audit',
  'What can I check automatically?',
  'What can I document automatically?',
  'What can I test automatically?',
  'What future friction can I remove?',
  'What tool would save time next run?',
  'If any answer exists, do it before stopping.',
  'write_codex_rules_from_source.sh',
  'sh /storage/emulated/0/Documents/GodotProjects/tools/write_codex_rules_from_source.sh',
  '~/.codex/rules/default.rules',
  'workspace-write-operator',
  'sandbox-sensitive location',
]) {
  assert(doc.includes(needle), `MOTIVATED_MODE.md should include ${needle}`);
}

assert(workflow.includes('docs/MOTIVATED_MODE.md'), 'ANIMATION_WORKFLOW_TOOLING should link the saved Motivated Mode contract');
assert(workflow.includes('## Initiative Audit'), 'ANIMATION_WORKFLOW_TOOLING should include Initiative Audit');
assert(workflow.includes('What can I check automatically?'), 'ANIMATION_WORKFLOW_TOOLING should include Initiative Audit prompts');
assert(orientation.includes('docs/MOTIVATED_MODE.md'), 'PROJECT_ORIENTATION should link the saved Motivated Mode contract');
assert(orientation.includes('Initiative Audit'), 'PROJECT_ORIENTATION should mention Initiative Audit');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['motivated-mode-doc', 'workflow-link', 'orientation-link'] }, null, 2));
