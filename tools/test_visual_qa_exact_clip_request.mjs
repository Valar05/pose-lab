import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

if (!source.includes("frameMode: params.get('qaFrameMode') || ''")) {
  failures.push('visual QA config must accept qaFrameMode');
}
if (!source.includes('visualQaReadFrames(clip)')) {
  failures.push('visual QA must support deterministic read-frame capture');
}
if (!source.includes("if (this.isRestoringState || this.visualQa?.enabled) return;")) {
  failures.push('visual QA mode must not write localStorage state');
}
if (!source.includes('entry.labels[0] === wanted') || !source.includes('entry.labels[1] === wanted')) {
  failures.push('clip selector must prefer exact clip name/label before fuzzy matching');
}
if (!source.includes("frameMode: this.visualQa.frameMode || ''")) {
  failures.push('visual QA beacon/capture metadata must report frameMode');
}
if (!source.includes("tag: readFrame?.tag || ''") || !source.includes('poseclipTime: readFrame')) {
  failures.push('read-frame captures must report pose tag and poseclip time');
}

if (failures.length) throw new Error(failures.join('\n'));
console.log('PASS test_visual_qa_exact_clip_request');
