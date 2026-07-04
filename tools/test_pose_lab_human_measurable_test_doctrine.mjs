import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const doctrinePath = path.join(projectRoot, 'docs', 'POSE_LAB_HUMAN_MEASURABLE_TEST_DOCTRINE.md');
const reviewPath = path.join(projectRoot, 'docs', 'POSE_LAB_AGENT_REVIEW_PROCESS.md');
const failurePath = path.join(projectRoot, 'docs', 'POSE_LAB_AGENT_FAILURE_CONTRACT.md');
const toolIndexPath = path.join(projectRoot, 'docs', 'TOOL_INDEX.md');
const lagoonPath = path.join(projectRoot, 'docs', 'POSE_LAB_LAGOON_ROADMAP.md');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const doctrine = read(doctrinePath);
const review = read(reviewPath);
const failure = read(failurePath);
const toolIndex = read(toolIndexPath);
const lagoon = read(lagoonPath);

for (const phrase of [
  'human-visible relationship',
  'acceptance',
  'diagnostic',
  'guardrail',
  'quarantine',
  'Could the screenshot still be red while this test passes?',
  'node tools/pose_lab_visual_truth_preflight.mjs --json',
]) {
  assert(doctrine.includes(phrase), `human-measurable test doctrine missing ${phrase}`);
}

assert(doctrine.includes('schema has `ok: true`'), 'doctrine must forbid ok:true as acceptance by itself');
assert(doctrine.includes('offline render, localhost capture, or debug bridge output is green'), 'doctrine must demote offline/local/debug proof');
assert(doctrine.includes('hand owns hilt'), 'doctrine must name the Meshy saber visible relationship');
assert(review.includes('POSE_LAB_HUMAN_MEASURABLE_TEST_DOCTRINE.md'), 'review process must require the test doctrine');
assert(review.includes('Test Harness Gate'), 'review process must include a test harness gate');
assert(failure.includes('Test Harness Recovery Rule'), 'failure contract must include test harness recovery');
assert(toolIndex.includes('POSE_LAB_HUMAN_MEASURABLE_TEST_DOCTRINE.md'), 'tool index must list the test doctrine');
assert(lagoon.includes('Truth Before Motion'), 'lagoon roadmap must start from truth before motion');
assert(lagoon.includes('Safe Authoring Modes'), 'lagoon roadmap must define safe authoring modes');
assert(lagoon.includes('Disposable Candidates, Protected Goldens'), 'lagoon roadmap must protect goldens from generated candidates');

console.log(JSON.stringify({
  checked: ['pose-lab-human-measurable-test-doctrine'],
  doctrine: path.relative(projectRoot, doctrinePath),
}, null, 2));
