import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'critique-snapshot-report-'));
const clipPath = path.join(tmpRoot, 'exported.poseclip.json');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const payload = {
  clip: {
    name: 'axe_kick_reposed',
    userData: {
      critique: {
        savedAt: '2026-06-18T12:00:00.000Z',
        frameKey: 'f012',
        frameTag: 'contact',
        spriteFrame: 12,
        sourceTime: 0.4,
        note: {
          comment: 'heel should settle first',
          marks: ['circle-heel'],
          bones: ['mixamorig:LeftFoot'],
        },
        boneEdits: [
          { boneName: 'mixamorig:LeftFoot', useTranslate: true, useRotate: true, useScale: false, posX: 2, posY: -1, posZ: 0, rotX: 4, rotY: 0, rotZ: 0, scale: 100 },
          { boneName: 'mixamorig:Spine', useTranslate: false, useRotate: true, useScale: false, posX: 0, posY: 0, posZ: 0, rotX: 1, rotY: 0, rotZ: 0, scale: 100 },
        ],
      },
    },
  },
};
fs.writeFileSync(clipPath, JSON.stringify(payload, null, 2));
const output = execFileSync('python3', ['tools/report_critique_snapshot.py', '--clip', clipPath], { cwd: projectRoot, encoding: 'utf8' });
const report = JSON.parse(output);
assert(report.schema === 'pose-lab-critique-snapshot-report-v1', 'report schema mismatch');
assert(report.hasCritique === true, 'critique flag missing');
assert(report.clipName === 'axe_kick_reposed', 'clip name mismatch');
assert(report.noteComment === 'heel should settle first', 'note comment mismatch');
assert(report.noteMarkCount === 1, 'mark count mismatch');
assert(report.noteBoneCount === 1, 'bone count mismatch');
assert(report.boneEditCount === 2, 'bone edit count mismatch');
assert(report.editedBones.includes('mixamorig:LeftFoot'), 'edited bones should include left foot');
assert(report.editedBones.includes('mixamorig:Spine'), 'edited bones should include spine');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['critique-snapshot-report'] }, null, 2));
