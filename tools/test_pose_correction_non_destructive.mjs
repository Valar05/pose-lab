import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
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

const writeCorrections = methodBody('writePoseCorrections()');
const poseEntry = methodBody('poseCorrectionEntry(actor = this.actors.get(this.selected), clip = actor?.activeClip(), create = false)');
const poseKey = methodBody('currentPoseCorrectionKey(create = false)');
const annotate = methodBody('annotatePoseCorrectionKey(key, actor = this.actors.get(this.selected), clip = actor?.activeClip())');
const learning = methodBody('currentCritiqueLearningContext(actor = this.actors.get(this.selected), clip = actor?.activeClip())');
const applyEditor = methodBody("applyPoseEditorEdit(statusText = 'edited pose')");
const touchDelta = methodBody('applyTouchPoseDelta(event)');
const savePose = methodBody("savePoseCorrectionKey(statusText = 'saved pose key')");
const promote = methodBody('critiquePromoteCurrentFrame()');
const cleanupSave = methodBody("saveCleanupDraft(actor, clip, reason = 'autosave')");
const cleanupExport = methodBody('exportActiveCleanupClip()');

assert(writeCorrections.includes('localStorage.setItem(POSE_CORRECTIONS_KEY, JSON.stringify(this.poseCorrections))'), 'pose corrections should be stored in their own localStorage record');
assert(!writeCorrections.includes('clip.tracks') && !writeCorrections.includes('.tracks.push') && !writeCorrections.includes('serializeAnimationClip'), 'writing pose corrections must not serialize or mutate animation tracks');
assert(poseEntry.includes("kind: 'critique-guidance'"), 'pose correction entries should be guidance, not replacement clips');
assert(poseEntry.includes('destructive: false'), 'pose correction entries should be explicitly non-destructive');
assert(poseEntry.includes("sourceClipMutation: 'forbidden'"), 'pose correction entries should forbid source clip mutation');
assert(poseKey.includes("kind: 'critique-guidance'"), 'pose correction keys should be guidance records');
assert(poseKey.includes('destructive: false'), 'pose correction keys should be explicitly non-destructive');
assert(poseKey.includes("sourceClipMutation: 'forbidden'"), 'pose correction keys should forbid source clip mutation');
assert(annotate.includes("key.kind = 'critique-guidance';"), 'saved corrections should be annotated as critique guidance');
assert(annotate.includes('key.destructive = false;'), 'saved corrections should stay non-destructive');
assert(annotate.includes("key.sourceClipMutation = 'forbidden';"), 'saved corrections should forbid source mutation');
assert(annotate.includes('key.learningContext = this.currentCritiqueLearningContext(actor, clip);'), 'saved corrections should capture learning context');
assert(annotate.includes('infer correction intent and principles; do not copy corrected frames verbatim'), 'learning goal should explicitly reject frame-copying');
assert(learning.includes('comment: liveComment || saved?.comment ||'), 'learning context should carry the critique reason/comment');
assert(learning.includes('marks: liveMarks.length ? liveMarks'), 'learning context should carry critique marks');
assert(learning.includes('bones: liveBones.length ? liveBones'), 'learning context should carry critique bones');
assert(applyEditor.includes('this.annotatePoseCorrectionKey(key, actor, actor.activeClip());'), 'numeric pose edits should annotate correction keys instead of baking clips');
assert(touchDelta.includes('this.annotatePoseCorrectionKey(touchEdit.key, touchEdit.actor, touchEdit.actor.activeClip());'), 'touch pose edits should annotate correction keys instead of baking clips');
assert(savePose.includes('this.annotatePoseCorrectionKey(key);'), 'saving a pose key should refresh learning context');
assert(promote.includes('this.annotatePoseCorrectionKey(poseKey, actor, clip);'), 'promoting critique frames should bind correction and reason');
assert(cleanupSave.includes('const draftClip = serializeAnimationClip(clip);'), 'cleanup drafts may serialize clips, but only through cleanup flow');
assert(cleanupSave.includes('critique: this.critiqueStateSnapshot(actor, clip)'), 'cleanup drafts should carry critique state as metadata');
assert(cleanupExport.includes('const payloadClip = serializeAnimationClip(clip);'), 'clip export should be explicit cleanup/export flow, not pose correction writeback');
assert(cleanupExport.includes('critique: this.critiqueStateSnapshot(actor, clip)'), 'exported clips should carry critique state as metadata');
assert(!js.includes('activeClip().tracks =') && !js.includes('clip.tracks = correction') && !js.includes('clip.tracks.push(correction'), 'pose correction code must not directly overwrite source clip tracks');
assert(html.includes('pose-editor-99'), 'cache token should force browser reload for FK axis inference fix');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['non-destructive-pose-corrections', 'learning-context', 'no-source-clip-overwrite'] }, null, 2));
