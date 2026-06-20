import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const workflow = fs.readFileSync(path.join(projectRoot, 'docs', 'ANIMATION_WORKFLOW_TOOLING.md'), 'utf8');

for (const id of [
  'playerTransport',
  'playerTransportLabel',
  'cleanupTime',
  'cleanupTimelineCanvas',
  'cleanupScrub',
  'playerPrevFrame',
  'playerPlayPause',
  'playerNextFrame',
  'playerStop',
  'critiqueJumpStart',
  'critiqueJumpAnticipation',
  'critiqueJumpContact',
  'critiqueJumpRecovery',
  'critiqueJumpEnd',
  'critiqueDock',
  'critiqueComment',
  'critiqueMarks',
  'critiqueBones',
  'critiqueResetPose',
  'critiqueNewKey',
  'critiqueCompare',
  'critiqueSaveNote',
  'critiqueClearNote',
  'critiqueCopyNote',
]) {
  assert(html.includes(`id="${id}"`), `compact transport should include ${id}`);
}

for (const needle of [
  'critiqueTimelineState(',
  'critiqueApplyPlaybackMode(',
  'critiqueSeekFrame(',
  'critiqueStepKeyframe(',
  'critiqueJumpSemantic(',
  'critiqueTogglePlayback(',
  'critiquePromoteCurrentFrame(',
  'critiqueToggleCompare(',
  'openCorrectPose(',
  'updateCritiqueTransportUi(',
  'updatePlayerTransportUi(',
  "if (this.labMode === 'critique') this.updateCleanupUi();",
  'stepActiveClipFrames(',
  'exclusive-accordion',
  'CRITIQUE_STEP_FPS',
  'CRITIQUE_LIVE_FPS',
  'Math.round(Number(UI.critiqueScrub.value || 0) * CRITIQUE_STEP_FPS)',
  'frameCount: Math.max(1, Math.ceil(duration * CRITIQUE_STEP_FPS))',
  'UI.critiqueJumpStart?.addEventListener',
  'UI.critiqueJumpAnticipation?.addEventListener',
  'UI.critiqueJumpContact?.addEventListener',
  'UI.critiqueJumpRecovery?.addEventListener',
  'UI.critiqueJumpEnd?.addEventListener',
  "document.querySelectorAll('details.exclusive-accordion')",
  'details.open = false;',
]) {
  assert(js.includes(needle), `pose-lab.js should include ${needle}`);
}

assert(workflow.includes('Step 30'), 'workflow doc should mention the 30fps stepper');
assert(workflow.includes('Live 60fps'), 'workflow doc should mention live 60fps playback');
assert(workflow.includes('get motivated'), 'workflow doc should encode the get motivated ritual');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['html-controls', 'js-transport', 'workflow-ritual'] }, null, 2));
