#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(projectRoot, 'tools/refresh_meshy_saber_visual_parity.mjs'), 'utf8');
const toolIndex = fs.readFileSync(path.join(projectRoot, 'tools/pose_lab_tool_index.mjs'), 'utf8');
const docs = fs.readFileSync(path.join(projectRoot, 'docs/VISUAL_EVIDENCE_REFRESH.md'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(source.includes('pose-lab-meshy-saber-visual-parity-refresh-v1'), 'refresh tool should expose a stable schema');
assert(toolIndex.includes('refresh_pose_lab_offline_visual_evidence.mjs'), 'tool index should point Meshy saber visual refresh to the offline evidence refresher');
assert(toolIndex.includes('deprecated for Meshy saber acceptance'), 'tool index should mark the legacy parity refresher as deprecated for Meshy saber acceptance');
assert(docs.includes('node tools/refresh_pose_lab_offline_visual_evidence.mjs'), 'visual evidence docs should use the offline evidence refresher');
assert(docs.includes('Do not use browser capture or debug-bridge'), 'visual evidence docs should forbid browser/debug-bridge acceptance');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['deprecated-meshy-saber-visual-parity-refresh-contract', 'offline-refresh-replacement'],
}, null, 2));
