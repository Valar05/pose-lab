#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tool = path.join(projectRoot, 'tools', 'meshy_hand_fk_visual_gate.mjs');

function runNode(args) {
  try {
    const output = execFileSync('node', [tool, ...args], { cwd: projectRoot, encoding: 'utf8' });
    return { code: 0, output };
  } catch (error) {
    return { code: Number(error.status ?? 1), output: String(error.stdout || '') + String(error.stderr || '') };
  }
}

function parseJsonOutput(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0) throw new Error('visual gate did not print JSON output');
  if (end < start) throw new Error('visual gate JSON output was incomplete');
  return JSON.parse(output.slice(start, end + 1));
}

const partial = parseJsonOutput(runNode(['--allow-missing-ready', '--out', 'generated/quartermaster_visual_gate/test_partial']).output);
if (partial.ok !== true || partial.verdict !== 'green') {
  throw new Error(`expected partial visual gate to be green for resolved cases, got ${JSON.stringify(partial)}`);
}

const acceptanceRun = runNode(['--out', 'generated/quartermaster_visual_gate/test_acceptance']);
const acceptance = parseJsonOutput(acceptanceRun.output);
if (acceptanceRun.code === 0 || acceptance.ok !== false || acceptance.verdict !== 'red') {
  throw new Error(`expected default visual gate to fail red until Ready is resolvable, got code=${acceptanceRun.code} ${JSON.stringify(acceptance)}`);
}
if (!acceptance.unresolvedRequiredCases?.includes('Ready')) {
  throw new Error(`expected Ready to be the unresolved required case, got ${JSON.stringify(acceptance.unresolvedRequiredCases)}`);
}

const reportPath = path.join(projectRoot, acceptance.report);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
for (const name of ['model-rest', 'MeshyWalk']) {
  const entry = report.reports.find((item) => item.name === name);
  if (!entry?.green) throw new Error(`${name} should be green before Ready blocks acceptance`);
  if (entry.sabreBoundsInWeaponGrip?.length < 0.5) throw new Error(`${name} real sabre mesh bounds are too small: ${JSON.stringify(entry.sabreBoundsInWeaponGrip)}`);
  if (JSON.stringify(entry.visibleHiltInWeaponGrip) !== JSON.stringify([0, 0, 0])) throw new Error(`${name} hilt is not pinned: ${JSON.stringify(entry.visibleHiltInWeaponGrip)}`);
}

console.log(JSON.stringify({
  checked: ['meshy-hand-fk-visual-gate'],
  partialReport: partial.report,
  acceptanceReport: acceptance.report,
  acceptanceVerdict: acceptance.verdict,
  unresolvedRequiredCases: acceptance.unresolvedRequiredCases,
}, null, 2));
