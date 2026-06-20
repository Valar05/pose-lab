import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const docs = fs.readFileSync(path.join(projectRoot, 'docs', 'ANIMATION_WORKFLOW_TOOLING.md'), 'utf8');

for (const id of [
  'critiqueDock',
  'critiqueFrameSummary',
  'critiqueFrameLabel',
  'critiqueFrameStatus',
  'critiqueComment',
  'critiqueMarks',
  'critiqueBones',
  'critiqueResetPose',
  'critiqueNewKey',
  'critiqueCompare',
  'critiqueSaveNote',
  'critiqueClearNote',
  'critiqueCopyNote',
  'critiqueLog',
]) {
  assert(html.includes(`id="${id}"`), `compact critique dock should include ${id}`);
}

assert(html.includes('class="critique-dock exclusive-accordion"'), 'critique controls should use the compact exclusive accordion');
assert(html.includes('Correct Pose'), 'critique dock should expose the pose correction action');
assert(html.includes('New Key'), 'critique dock should expose the key promotion action');
assert(html.includes('Compare'), 'critique dock should expose compare');
assert(html.includes('Critique</button>'), 'critique dock should expose the critique save action');

for (const needle of [
  'critiqueResetPose',
  'critiquePromoteCurrentFrame(',
  'critiqueToggleCompare(',
  'openCorrectPose(',
  'critiqueNoteKey(',
  'critiqueNoteForFrame(',
  'critiquePersistCurrentNote(',
]) {
  assert(js.includes(needle), `pose-lab.js should include ${needle}`);
}
assert(docs.includes('bare player timeline'), 'workflow doc should describe the bare player timeline contract');
assert(docs.includes('collapsed critique tag window'), 'workflow doc should mention the collapsed critique drawer');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['critique-dock-ui', 'critique-snapshot-state', 'workflow-doc'] }, null, 2));
