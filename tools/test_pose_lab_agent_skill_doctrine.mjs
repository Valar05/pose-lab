import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const homeSkillsRoot = '/data/data/com.termux/files/home/.codex/skills';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const skillFiles = [
  path.join(workspaceRoot, '.codex', 'skills', 'ai-mentorship', 'SKILL.md'),
  path.join(workspaceRoot, '.codex', 'skills', 'visual-red-build-contract', 'SKILL.md'),
  path.join(workspaceRoot, '.codex', 'skills', 'visual-qa-harness', 'SKILL.md'),
  path.join(workspaceRoot, '.codex', 'skills', '3d-animation-poseclip-tuning', 'SKILL.md'),
  path.join(homeSkillsRoot, 'pose-animation-import-lab', 'SKILL.md'),
  path.join(homeSkillsRoot, 'threejs-pose-lab-import', 'SKILL.md'),
];

for (const file of skillFiles) {
  assert(fs.existsSync(file), `missing skill file ${file}`);
  const text = read(file);
  assert(/human-visible|visible relationship|screenshot|video/.test(text), `${file} must reference visible evidence`);
  assert(/false-green|tests pass|machine contracts|diagnostic/.test(text), `${file} must guard against false-green machine proof`);
}

const aiMentorship = read(skillFiles[0]);
assert(aiMentorship.includes('Test Harness Mentorship'), 'ai-mentorship must include test harness mentorship');
assert(aiMentorship.includes('If a test could pass while the screenshot or video still looks wrong'), 'ai-mentorship must reject false acceptance tests');

const visualRed = read(skillFiles[1]);
assert(visualRed.includes('Test Harness Rule'), 'visual-red-build-contract must include a test harness rule');
assert(visualRed.includes('Acceptance tests must require the accepted visual evidence lane'), 'visual-red-build-contract must require visual evidence for acceptance');

console.log(JSON.stringify({
  checked: ['pose-lab-agent-skill-doctrine'],
  skills: skillFiles.map((file) => path.relative(workspaceRoot, file)),
}, null, 2));
