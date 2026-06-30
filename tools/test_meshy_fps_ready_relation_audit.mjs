import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const output = execFileSync('node', [path.join(projectRoot, 'tools', 'meshy_fps_ready_relation_audit.mjs')], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const audit = JSON.parse(fs.readFileSync(path.join(projectRoot, result.path), 'utf8'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'ready relation audit should complete');
assert(audit.schema === 'pose-lab-meshy-fps-ready-relation-audit-v1', `unexpected schema ${audit.schema}`);
assert(audit.targetRest === 'Meshy calibrated FPS-REST-ARMS-CAL--120', `ready audit should start from accepted calibrated rest, got ${audit.targetRest}`);
assert(audit.metrics.sampleCount === 62, `ready audit should preserve both hands across 31 source keys, got ${audit.metrics.sampleCount}`);
assert(audit.metrics.sideSampleCounts?.right === 31 && audit.metrics.sideSampleCounts?.left === 31, `ready audit should include 31 keys for both hands, got ${JSON.stringify(audit.metrics.sideSampleCounts)}`);
assert(audit.samples.some((entry) => entry.side === 'right') && audit.samples.some((entry) => entry.side === 'left'), 'ready audit preview should include both hands');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-ready-relation-audit-diagnostic-only', 'calibrated-rest-relative-ready-samples'], metrics: audit.metrics }, null, 2));
