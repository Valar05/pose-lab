import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function methodBody(name) {
  const marker = `  ${name} {`;
  const start = js.indexOf(marker);
  if (start < 0) return '';
  const brace = start + marker.length - 1;
  let depth = 0;
  for (let i = brace; i < js.length; i += 1) {
    if (js[i] === '{') depth += 1;
    if (js[i] === '}') {
      depth -= 1;
      if (depth === 0) return js.slice(start, i + 1);
    }
  }
  return '';
}

for (const needle of [
  "const POSE_HISTORY_KEY = 'pose-lab:pose-history:v1'",
  'const POSE_HISTORY_LIMIT = 80',
  'this.poseHistory = this.readPoseHistory();',
  "schema: 'pose-lab-pose-history-v1'",
  'localStorage.getItem(POSE_HISTORY_KEY)',
  'localStorage.setItem(POSE_HISTORY_KEY, JSON.stringify(this.poseHistory))',
  'poseHistorySnapshot(label = \'pose edit\')',
  'pushPoseHistory(label = \'pose edit\'',
  'restorePoseHistorySnapshot(snapshot',
  'undoPoseCorrection()',
  'redoPoseCorrection()',
  'updateUndoRedoUi()',
]) {
  assert(js.includes(needle), `pose history runtime missing ${needle}`);
}

const pushHistory = methodBody('pushPoseHistory(label = \'pose edit\', snapshot = null)');
assert(pushHistory.includes('this.poseHistory.undo.push(item)'), 'history push should add undo snapshots');
assert(pushHistory.includes('POSE_HISTORY_LIMIT'), 'history push should enforce a bounded stack');
assert(pushHistory.includes('this.poseHistory.redo = []'), 'new edits should clear redo history');

const restore = methodBody('restorePoseHistorySnapshot(snapshot, statusText = \'restored pose edit\')');
for (const needle of [
  'this.poseCorrections = this.clonePoseCorrections(snapshot.poseCorrections)',
  'this.writePoseCorrections()',
  'this.poseCorrectionSessionActive = this.hasPoseCorrectionEntries()',
  'actor?.seek(actor.activeAction?.time || 0)',
  'this.applyPoseCorrectionOverlay(actor)',
  'this.renderCritiqueFrames()',
]) {
  assert(restore.includes(needle), `history restore should include ${needle}`);
}

const undo = methodBody('undoPoseCorrection()');
assert(undo.includes('this.poseHistory?.undo?.pop()'), 'undo should pop the undo stack');
assert(undo.includes('this.poseHistory.redo.push(this.poseHistorySnapshot'), 'undo should preserve current state for redo');

const redo = methodBody('redoPoseCorrection()');
assert(redo.includes('this.poseHistory?.redo?.pop()'), 'redo should pop the redo stack');
assert(redo.includes('this.poseHistory.undo.push(this.poseHistorySnapshot'), 'redo should preserve current state for undo');

const applyEditor = methodBody("applyPoseEditorEdit(statusText = 'edited pose')");
assert(applyEditor.includes('this.pushPoseHistory(statusText || \'edited pose\')'), 'numeric pose edits should create history before mutation');
const startDrag = methodBody('startTouchPoseEditDrag()');
assert(startDrag.includes("const beforeHistory = this.poseHistorySnapshot('touch pose drag')"), 'touch drag should snapshot before correction-key creation');
assert(startDrag.includes("this.pushPoseHistory('touch pose drag', beforeHistory)"), 'touch drag should push the pre-edit snapshot');
const down = methodBody('handleTouchPosePointerDown(event)');
assert(down.includes('this.allowCameraMultiTouch(event)'), 'two-finger camera gestures should not create pose history');
const resetKey = methodBody('resetCurrentPoseCorrectionKey()');
assert(resetKey.includes("this.pushPoseHistory('reset pose frame ' + frame)"), 'reset frame should be undoable');
const resetClip = methodBody('resetActiveClipPoseCorrections()');
assert(resetClip.includes("this.pushPoseHistory('reset clip edits')"), 'reset clip should be undoable');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['persistent-pose-history-undo-redo'] }, null, 2));
