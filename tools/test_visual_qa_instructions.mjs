import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const orientation = fs.readFileSync(path.join(projectRoot, 'PROJECT_ORIENTATION.md'), 'utf8');
const workflow = fs.readFileSync(path.join(projectRoot, 'docs', 'ANIMATION_WORKFLOW_TOOLING.md'), 'utf8');
const skill = fs.readFileSync('/storage/emulated/0/Documents/GodotProjects/.codex/skills/visual-qa-harness/SKILL.md', 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(orientation.includes('Device Capture Standard'), 'PROJECT_ORIENTATION should define a device capture standard');
assert(workflow.includes('Device Capture Standard'), 'ANIMATION_WORKFLOW_TOOLING should define a device capture standard');
assert(workflow.includes('Live 60fps'), 'ANIMATION_WORKFLOW_TOOLING should mention live 60fps transport');
assert(workflow.includes('get motivated'), 'ANIMATION_WORKFLOW_TOOLING should encode the get motivated ritual');
assert(orientation.includes('Do not rely on the old standalone `screencap` path.'), 'PROJECT_ORIENTATION should reject the old screencap path');
assert(workflow.includes('Do not use the old standalone `screencap` path.'), 'ANIMATION_WORKFLOW_TOOLING should reject the old screencap path');
assert(skill.includes('fresh Android browser frames'), 'visual QA skill should still describe the live browser capture flow');
assert(skill.includes('stale-build'), 'visual QA skill should keep stale-build as the cache failure mode');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['device-capture-standard', 'screencap-ban', 'visual-qa-skill'] }, null, 2));
