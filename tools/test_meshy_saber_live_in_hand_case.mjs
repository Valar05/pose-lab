#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const caseData = JSON.parse(fs.readFileSync(path.join(projectRoot, 'cases/meshy-saber-live-in-hand.json'), 'utf8'));
const firebaseContract = fs.readFileSync(path.join(projectRoot, 'tools/test_firebase_visual_truth_contract.mjs'), 'utf8');
const captureTool = fs.readFileSync(path.join(projectRoot, 'tools/capture_firebase_visual_truth.mjs'), 'utf8');

assert(caseData.id === 'meshy-saber-live-in-hand', 'missing Meshy saber in-hand case');
assert(caseData.route.kind === 'weapon-fk', 'Meshy saber in-hand case should use the Firebase weapon-fk route');
assert(caseData.route.clip.includes('OneHandReady') && caseData.route.clip.includes('[FPS-SWORD-UPPER'), 'Meshy saber in-hand case should cover the Ready FK clip');
assert(caseData.checks.some((check) => String(check.command || '').includes('test_firebase_hosting_config.mjs')), 'case should run the Firebase hosting contract');
assert(caseData.checks.some((check) => String(check.command || '').includes('test_firebase_visual_truth_contract.mjs')), 'case should run the Firebase visual truth contract');
assert(caseData.evidenceArtifacts.includes('generated/firebase_visual_truth/latest/visual_truth.json'), 'case should require durable Firebase visual truth evidence');
assert(caseData.evidenceArtifacts.includes('generated/firebase_visual_truth/latest/tpose.png'), 'case should require the hosted T-pose screenshot');
assert(caseData.evidenceArtifacts.includes('generated/firebase_visual_truth/latest/ready_visual_follow.png'), 'case should require the hosted Ready visual-follow contact sheet');
assert(caseData.expectedVisibleBehavior.some((line) => /real saber/i.test(line)), 'case should name the real saber mesh, not only markers');
assert(caseData.forbiddenProof.some((line) => /marker/i.test(line)), 'case should forbid debug marker substitution');

assert(captureTool.includes("authority: 'firebase-hosted-cloud-browser'"), 'Firebase capture should declare hosted cloud authority');
assert(captureTool.includes('evaluateTpose') && captureTool.includes('evaluateReady'), 'Firebase capture should evaluate both T-pose and Ready');
assert(firebaseContract.includes('truthLedger?.tposeStableIdle === true'), 'Firebase contract should require stable T-pose truth');
assert(firebaseContract.includes('truthLedger?.readyBoringFk === true'), 'Firebase contract should require Ready boring FK truth');
assert(firebaseContract.includes('tipTracksHand'), 'Firebase contract should require saber tip to track hand');
assert(captureTool.includes("offlineRender: 'diagnostic-only'"), 'Firebase capture should demote offline render to diagnostic-only');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['meshy-saber-firebase-in-hand-case', 'firebase-visual-truth-contract'],
}, null, 2));
