#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const casesRoot = path.join(projectRoot, 'cases');
const defaultOutRoot = path.join(projectRoot, 'generated', 'cases');

function parseArgs(argv) {
  const args = {
    command: argv[2] || 'list',
    caseId: '',
    outRoot: defaultOutRoot,
    runChecks: false,
    json: false,
    all: false,
  };
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--case') args.caseId = String(argv[++i] || '');
    else if (arg.startsWith('--case=')) args.caseId = arg.slice('--case='.length);
    else if (arg === '--out') args.outRoot = path.resolve(projectRoot, argv[++i] || defaultOutRoot);
    else if (arg.startsWith('--out=')) args.outRoot = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--run-checks') args.runChecks = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--all') args.all = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function rel(file) {
  return path.relative(projectRoot, file).replace(/\\/g, '/');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listCases() {
  if (!fs.existsSync(casesRoot)) return [];
  return fs.readdirSync(casesRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_'))
    .map((entry) => readJson(path.join(casesRoot, entry.name)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function loadCase(caseId) {
  if (!caseId) throw new Error('missing --case');
  const file = path.join(casesRoot, `${caseId}.json`);
  if (!fs.existsSync(file)) throw new Error(`missing case: ${caseId}`);
  const data = readJson(file);
  if (data.schema !== 'pose-lab-case-v1') throw new Error(`invalid case schema for ${caseId}`);
  if (data.id !== caseId) throw new Error(`case id mismatch: expected ${caseId}, got ${data.id}`);
  return { file, data };
}

function validateCaseData(data, file = '') {
  const failures = [];
  const label = file ? rel(file) : data?.id || '<case>';
  if (data.schema !== 'pose-lab-case-v1') failures.push(`${label}: schema must be pose-lab-case-v1`);
  if (!data.id || !/^[a-z0-9][a-z0-9-]*$/.test(data.id)) failures.push(`${label}: id must be kebab-case`);
  if (!data.title) failures.push(`${label}: title is required`);
  if (!data.family) failures.push(`${label}: family is required`);
  if (!data.priority) failures.push(`${label}: priority is required`);
  if (!data.route?.kind) failures.push(`${label}: route.kind is required`);
  if (!data.route?.actor) failures.push(`${label}: route.actor is required`);
  if (!data.route?.clip) failures.push(`${label}: route.clip is required`);
  if (!Array.isArray(data.expectedVisibleBehavior) || data.expectedVisibleBehavior.length === 0) failures.push(`${label}: expectedVisibleBehavior must be nonempty`);
  if (!Array.isArray(data.contracts) || data.contracts.length === 0) failures.push(`${label}: contracts must be nonempty`);
  if (!Array.isArray(data.evidenceArtifacts)) failures.push(`${label}: evidenceArtifacts must be an array`);
  if (!Array.isArray(data.checks) || !data.checks.some((check) => check.kind === 'route')) failures.push(`${label}: checks must include a route check`);
  if (!Array.isArray(data.acceptance) || data.acceptance.length === 0) failures.push(`${label}: acceptance must be nonempty`);
  if (!Array.isArray(data.forbiddenProof) || data.forbiddenProof.length === 0) failures.push(`${label}: forbiddenProof must be nonempty`);
  return failures;
}

function validateCases(allCases) {
  const failures = [];
  const ids = new Set();
  for (const item of allCases) {
    if (ids.has(item.id)) failures.push(`duplicate case id: ${item.id}`);
    ids.add(item.id);
    const file = path.join(casesRoot, `${item.id}.json`);
    failures.push(...validateCaseData(item, fs.existsSync(file) ? file : ''));
    for (const contract of item.contracts || []) {
      const absolute = path.resolve(projectRoot, contract);
      if (!fs.existsSync(absolute)) failures.push(`${item.id}: missing contract ${contract}`);
    }
  }
  return {
    schema: 'pose-lab-case-validation-v1',
    generatedAt: new Date().toISOString(),
    cases: allCases.length,
    ok: failures.length === 0,
    failures,
  };
}

function routeFor(caseData) {
  const route = caseData.route || {};
  const args = [
    'tools/pose_lab_route.mjs',
    '--kind', route.kind || '',
    '--actor', route.actor || '',
    '--clip', route.clip || '',
    '--json',
  ];
  const output = execFileSync('node', args, { cwd: projectRoot, encoding: 'utf8' });
  return JSON.parse(output);
}

function buildUrl(caseData) {
  const route = caseData.route || {};
  const params = new URLSearchParams();
  if (route.mode) params.set('mode', route.mode);
  if (route.actor) params.set('actor', route.actor);
  if (route.clip) params.set('clip', route.clip);
  for (const [key, value] of Object.entries(route.query || {})) params.set(key, String(value));
  const query = params.toString();
  return `http://127.0.0.1:8798/pose-lab/pose-lab.html${query ? `?${query}` : ''}`;
}

function artifactStatus(caseData) {
  return (caseData.evidenceArtifacts || []).map((artifact) => {
    const absolute = path.resolve(projectRoot, artifact);
    const exists = fs.existsSync(absolute);
    const stat = exists ? fs.statSync(absolute) : null;
    return {
      path: artifact,
      exists,
      kind: stat?.isDirectory() ? 'directory' : 'file',
      sizeBytes: stat?.size || 0,
    };
  });
}

function runCommandCheck(check, enabled) {
  if (check.kind !== 'command') return { ...check, status: 'skipped', reason: 'not a command check' };
  if (!enabled && !check.default) return { ...check, status: 'skipped', reason: 'requires --run-checks' };
  const startedAt = new Date().toISOString();
  const result = spawnSync(check.command, {
    cwd: projectRoot,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    ...check,
    status: result.status === 0 ? 'passed' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
    stdoutTail: String(result.stdout || '').split(/\r?\n/).slice(-30).join('\n'),
    stderrTail: String(result.stderr || '').split(/\r?\n/).slice(-30).join('\n'),
  };
}

function verifyCase(caseData, options) {
  const outDir = path.join(options.outRoot, caseData.id, 'latest');
  fs.mkdirSync(outDir, { recursive: true });
  const route = routeFor(caseData);
  const artifacts = artifactStatus(caseData);
  const checks = (caseData.checks || []).map((check) => {
    if (check.kind === 'route') {
      return {
        ...check,
        status: route.route?.kind === caseData.route?.kind ? 'passed' : 'failed',
        routeKind: route.route?.kind || '',
      };
    }
    return runCommandCheck(check, options.runChecks);
  });

  const failedRequiredChecks = checks.filter((check) => check.required && check.status !== 'passed');
  const failedDefaultChecks = checks.filter((check) => check.default && check.status === 'failed');
  const missingArtifacts = artifacts.filter((artifact) => !artifact.exists);
  const verdict = failedRequiredChecks.length || failedDefaultChecks.length
    ? 'red'
    : missingArtifacts.length
      ? 'yellow'
      : 'green';
  const summary = {
    schema: 'pose-lab-case-verdict-v1',
    generatedAt: new Date().toISOString(),
    caseId: caseData.id,
    title: caseData.title,
    family: caseData.family,
    routeUrl: buildUrl(caseData),
    runChecks: options.runChecks,
    verdict,
    route,
    artifacts,
    checks,
    acceptance: caseData.acceptance || [],
    forbiddenProof: caseData.forbiddenProof || [],
  };
  fs.writeFileSync(path.join(outDir, 'route.json'), `${JSON.stringify(route, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'case_verdict.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'case_summary.md'), renderSummary(summary));
  return { outDir, summary };
}

function renderSummary(summary) {
  const lines = [];
  lines.push(`# ${summary.title}`);
  lines.push('');
  lines.push(`- Case: \`${summary.caseId}\``);
  lines.push(`- Family: \`${summary.family}\``);
  lines.push(`- Verdict: ${summary.verdict}`);
  lines.push(`- Run checks: ${summary.runChecks ? 'yes' : 'default-only'}`);
  lines.push(`- Route URL: ${summary.routeUrl}`);
  lines.push('');
  lines.push('## Artifacts');
  for (const artifact of summary.artifacts) {
    lines.push(`- ${artifact.exists ? 'present' : 'missing'}: \`${artifact.path}\``);
  }
  lines.push('');
  lines.push('## Checks');
  for (const check of summary.checks) {
    lines.push(`- ${check.status}: ${check.id}`);
  }
  lines.push('');
  lines.push('## Acceptance');
  for (const item of summary.acceptance) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Forbidden Proof');
  for (const item of summary.forbiddenProof) lines.push(`- ${item}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function latestVerdict(caseId) {
  const file = path.join(defaultOutRoot, caseId, 'latest', 'case_verdict.json');
  if (!fs.existsSync(file)) return { caseId, status: 'missing', verdict: 'unknown', path: rel(file) };
  try {
    const data = readJson(file);
    return {
      caseId,
      status: 'present',
      verdict: data.verdict || 'unknown',
      generatedAt: data.generatedAt || '',
      failedChecks: (data.checks || []).filter((check) => check.status === 'failed').map((check) => check.id),
      path: rel(file),
    };
  } catch (error) {
    return { caseId, status: 'invalid', verdict: 'unknown', error: error.message, path: rel(file) };
  }
}

function printList(cases, json) {
  if (json) {
    console.log(JSON.stringify({ schema: 'pose-lab-case-list-v1', cases }, null, 2));
    return;
  }
  for (const item of cases) {
    console.log(`${item.id}\t${item.priority || ''}\t${item.family || ''}\t${item.title || ''}`);
  }
}

const args = parseArgs(process.argv);

if (args.command === 'list') {
  printList(listCases(), args.json);
} else if (args.command === 'validate') {
  const cases = args.caseId ? [loadCase(args.caseId).data] : listCases();
  const validation = validateCases(cases);
  if (args.json) console.log(JSON.stringify(validation, null, 2));
  else if (validation.ok) console.log(`validated ${validation.cases} cases`);
  else {
    console.log(`case validation failed (${validation.failures.length})`);
    for (const failure of validation.failures) console.log(`- ${failure}`);
  }
  if (!validation.ok) process.exitCode = 1;
} else if (args.command === 'doctor') {
  const cases = listCases();
  const validation = validateCases(cases);
  const verdicts = cases.map((item) => latestVerdict(item.id));
  const report = {
    schema: 'pose-lab-case-doctor-v1',
    generatedAt: new Date().toISOString(),
    validation,
    verdicts,
    knownRedCases: verdicts.filter((item) => item.verdict === 'red').map((item) => item.caseId),
    missingVerdicts: verdicts.filter((item) => item.status === 'missing').map((item) => item.caseId),
    nextCommand: validation.ok
      ? 'node tools/pose_lab_doctor.mjs --json'
      : 'node tools/pose_lab_case.mjs validate --all',
  };
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`cases: ${cases.length}`);
    console.log(`validation: ${validation.ok ? 'ok' : 'failed'}`);
    for (const verdict of verdicts) console.log(`${verdict.caseId}\t${verdict.verdict}\t${verdict.status}`);
  }
  if (!validation.ok) process.exitCode = 1;
} else if (args.command === 'show') {
  const loaded = loadCase(args.caseId);
  console.log(JSON.stringify(loaded.data, null, 2));
} else if (args.command === 'route') {
  const loaded = loadCase(args.caseId);
  const route = routeFor(loaded.data);
  console.log(JSON.stringify(route, null, 2));
} else if (args.command === 'verify') {
  const loaded = loadCase(args.caseId);
  const result = verifyCase(loaded.data, args);
  const output = {
    ok: result.summary.verdict !== 'red',
    verdict: result.summary.verdict,
    outDir: rel(result.outDir),
    caseId: result.summary.caseId,
  };
  if (args.json) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`case: ${output.caseId}`);
    console.log(`verdict: ${output.verdict}`);
    console.log(`out: ${output.outDir}`);
  }
  if (!output.ok) process.exitCode = 1;
} else {
  throw new Error(`unknown command: ${args.command}`);
}
