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

const helper = js.match(/function poseEditHasMeaningfulValue\(edit = \{\}\) \{[\s\S]*?\n\}/)?.[0] || '';
const applyCorrection = methodBody('applyPoseCorrection(correction = {})');
const fkApply = methodBody('applyPoseFkEdit(name, edit = {})');

assert(helper.includes('Array.isArray(edit.worldQuat) && edit.worldQuat.length === 4'), 'worldQuat-only FK corrections must count as meaningful edits');
assert(helper.includes('Math.abs(Number(edit.angle || 0))'), 'gesture angle metadata should count as meaningful edit intent');
assert(applyCorrection.includes('if (!poseEditHasMeaningfulValue(edit)) continue;'), 'pose correction playback should use the shared meaningful-edit predicate');
assert(!applyCorrection.includes('Math.abs(Number(edit.x || 0)) + Math.abs(Number(edit.y || 0))'), 'pose correction playback must not use the old numeric-only skip condition');
assert(fkApply.includes('if (Array.isArray(edit.worldQuat) && edit.worldQuat.length === 4)'), 'FK apply should still consume worldQuat corrections');
assert(fkApply.includes('setBoneWorldQuaternion(bone, worldQuat)'), 'worldQuat corrections should be applied in world space');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['worldquat-correction-not-empty', 'fk-worldquat-playback'] }, null, 2));
