#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const caseData = JSON.parse(fs.readFileSync(path.join(projectRoot, 'cases/meshy-saber-live-in-hand.json'), 'utf8'));
const redBuildContract = fs.readFileSync(path.join(projectRoot, 'tools/test_pose_lab_visual_red_build_contract.mjs'), 'utf8');
const refreshTool = fs.readFileSync(path.join(projectRoot, 'tools/refresh_pose_lab_offline_visual_evidence.mjs'), 'utf8');

assert(caseData.id === 'meshy-saber-live-in-hand', 'missing Meshy saber in-hand case');
assert(caseData.route.kind === 'weapon-fk', 'Meshy saber in-hand case should use the offline weapon-fk route');
assert(caseData.route.clip.includes('0T-Pose') && caseData.route.clip.includes('[FPS-REST-ARMS'), 'Meshy saber in-hand case should cover the accepted T-pose calibration clip');
assert(caseData.checks.some((check) => String(check.command || '').includes('test_pose_lab_visual_red_build_contract.mjs')), 'case should run the offline visual red-build contract');
assert(caseData.checks.some((check) => String(check.command || '').includes('test_meshy_tpose_weapon_orientation_contract.mjs')), 'case should run the T-pose weapon orientation contract');
assert(caseData.evidenceArtifacts.includes('generated/visual_red_build/pose_lab_latest.json'), 'case should require durable offline visual evidence');
assert(caseData.evidenceArtifacts.includes('generated/pose_lab_offline_render/visual_red_build_tpose/pose_weapon_render.png'), 'case should require the offline render PNG');
assert(caseData.expectedVisibleBehavior.some((line) => /real saber/i.test(line)), 'case should name the real saber mesh, not only markers');
assert(caseData.forbiddenProof.some((line) => /marker/i.test(line)), 'case should forbid debug marker substitution');

assert(refreshTool.includes('offline-pose-render') || redBuildContract.includes('offline-pose-render'), 'offline visual evidence must use captureKind offline-pose-render');
assert(redBuildContract.includes('deprecated live capture evidence is not accepted'), 'offline visual contract should reject deprecated live capture evidence');
assert(redBuildContract.includes('weaponBladeDirectionMatchesFpsSource'), 'offline visual contract should require blade direction parity');
assert(redBuildContract.includes('rawHandToAppliedHilt'), 'offline visual contract should expose raw-hand-to-hilt distance');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['meshy-saber-offline-in-hand-case', 'offline-visual-red-build-contract'],
}, null, 2));
