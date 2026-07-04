export const SENSE_SYNTHESIS_SCHEMA = 'pose-lab-sense-synthesis-v1';

function bool(value) {
  return value === true;
}

function hasPng(value) {
  return typeof value === 'string' && value.endsWith('.png');
}

function checkValue(capture, key) {
  return capture?.evaluation?.checks?.[key] === true;
}

function metricValue(capture, key) {
  return Number(capture?.cloudTelemetry?.visualFollow?.screenMetrics?.[key]);
}

function failuresFromMissing(required, predicate) {
  return required.filter((entry) => !predicate(entry));
}

function truthLayer({ physical = 'unknown', visual = 'unknown', perceptual = 'unknown', behavioral = 'unknown' } = {}) {
  return { physical, visual, perceptual, behavioral };
}

function landingSense(capture) {
  const failures = [];
  const checks = capture?.evaluation?.checks || {};
  if (!bool(capture?.accepted)) failures.push('landing capture is not accepted by route/UI checks');
  for (const key of ['routeSelected', 'autoLoadedMeshyFromColdUrl', 'manualActorSelectionRequiredFalse', 'reviewClipInventoryVisible', 'reviewClipNotCollapsedToWalkingOnly', 'realWeaponVisible']) {
    if (!bool(checks[key])) failures.push(`landing missing ${key}`);
  }
  if (!hasPng(capture?.screenshot)) failures.push('landing screenshot PNG is missing');
  return {
    schema: SENSE_SYNTHESIS_SCHEMA,
    captureId: capture?.id || 'landing',
    question: 'Can a human reviewer trust this hosted review surface without manual repair?',
    expectedVisibleRelationship: 'Hosted Meshy review route cold-loads the actor, exposes the review clip inventory, and shows the real weapon surface.',
    observedVisibleRelationship: failures.length ? 'review surface is not trustworthy yet' : 'review surface reads as usable without manual actor selection',
    verdict: failures.length ? 'human-red' : 'human-green',
    vocabulary: failures.length ? ['visual no-op', 'metric-green / human-red'] : ['plausible'],
    truth: truthLayer({
      physical: failures.length ? 'route/UI proof incomplete' : 'route/UI proof present',
      visual: failures.length ? 'hosted screenshot cannot be accepted' : 'hosted screenshot is present and review route is visible',
      perceptual: failures.length ? 'reviewer cannot trust the page state' : 'reviewer can believe the page is showing the intended actor state',
      behavioral: failures.length ? 'do not wake or promote' : 'review may continue to T-pose and Ready',
    }),
    checks: {
      screenshotPresent: hasPng(capture?.screenshot),
      coldLoadedActor: bool(checks.autoLoadedMeshyFromColdUrl),
      manualSelectionNotRequired: bool(checks.manualActorSelectionRequiredFalse),
      clipInventoryVisible: bool(checks.reviewClipInventoryVisible),
      visibleUiTruthAccepted: bool(checks.visibleUiTruthAccepted),
    },
    supportingMetrics: {
      loadMs: Number(capture?.loadMs || 0),
      loadWarning: bool(checks.loadWarning),
    },
    failures,
  };
}

function tposeSense(capture) {
  const failures = [];
  const requiredChecks = [
    'routeSelected',
    'autoLoadedMeshyFromColdUrl',
    'manualActorSelectionRequiredFalse',
    'actorSelected',
    'clipSelected',
    'acceptedHiltOracle',
    'acceptedAttachmentRotation',
    'realWeaponVisible',
    'hiltPinnedToSocket',
    'tposeWristRelationshipAccepted',
    'defaultSurfaceAccepted',
  ];
  for (const key of failuresFromMissing(requiredChecks, (key) => checkValue(capture, key))) failures.push(`T-pose missing ${key}`);
  if (!hasPng(capture?.screenshot)) failures.push('T-pose screenshot PNG is missing');
  if (!hasPng(capture?.relationshipCloseup)) failures.push('T-pose relationship closeup PNG is missing');
  if (!hasPng(capture?.humanReadScreenshot)) failures.push('T-pose marker-free human-read screenshot PNG is missing');
  return {
    schema: SENSE_SYNTHESIS_SCHEMA,
    captureId: capture?.id || 'tpose',
    question: 'Does the reference T-pose read as the weapon being held by the character?',
    expectedVisibleRelationship: 'The reference hand/arm owns the hilt and the blade projects from the authored grip region.',
    observedVisibleRelationship: failures.length ? 'T-pose does not yet prove a human-visible held reference' : 'T-pose reads as a stable hand-owned reference saber pose',
    verdict: failures.length ? 'human-red' : 'human-green',
    vocabulary: failures.length ? ['wrong-owner', 'disconnected', 'metric-green / human-red'] : ['held', 'pinned', 'plausible'],
    truth: truthLayer({
      physical: failures.length ? 'FK/manual baseline proof incomplete' : 'FK/manual baseline proof present',
      visual: failures.length ? 'screenshot or closeup cannot prove the wrist/saber relationship' : 'screenshot and closeup show the reference weapon relationship',
      perceptual: failures.length ? 'viewer cannot confidently believe the hand owns the weapon' : 'viewer can believe the hand/arm owns the weapon in the reference pose',
      behavioral: failures.length ? 'do not accept this as a baseline' : 'baseline can be used as comparison for Ready',
    }),
    checks: {
      screenshotPresent: hasPng(capture?.screenshot),
      closeupPresent: hasPng(capture?.relationshipCloseup),
      humanReadScreenshotPresent: hasPng(capture?.humanReadScreenshot),
      acceptedManualHilt: checkValue(capture, 'acceptedHiltOracle'),
      acceptedManualRotation: checkValue(capture, 'acceptedAttachmentRotation'),
      realWeaponVisible: checkValue(capture, 'realWeaponVisible'),
      heldByHandRead: checkValue(capture, 'tposeWristRelationshipAccepted') && checkValue(capture, 'defaultSurfaceAccepted'),
      routeTruth: checkValue(capture, 'autoLoadedMeshyFromColdUrl') && checkValue(capture, 'manualActorSelectionRequiredFalse'),
    },
    supportingMetrics: {
      hiltPinnedToSocket: checkValue(capture, 'hiltPinnedToSocket'),
      visibleUiTruthAccepted: checkValue(capture, 'visibleUiTruthAccepted'),
    },
    failures,
  };
}

function readySense(capture) {
  const failures = [];
  const requiredChecks = [
    'routeSelected',
    'autoLoadedMeshyFromColdUrl',
    'manualActorSelectionRequiredFalse',
    'actorSelected',
    'clipSelected',
    'realWeaponVisible',
    'parentChain',
    'displayStableInSocket',
    'modelStableInDisplay',
    'hiltPinnedToSocket',
    'handLocalGripOffsetVisible',
    'hiltAwayFromRawHand',
    'readyHandOrientationSane',
    'readyBladeNotPointingDownThroughBody',
    'tipMoves',
    'tipTracksHand',
    'socketForwardBladeAxisSane',
    'readyVisualRelationshipAccepted',
  ];
  for (const key of failuresFromMissing(requiredChecks, (key) => checkValue(capture, key))) failures.push(`Ready missing ${key}`);
  if (!hasPng(capture?.screenshot)) failures.push('Ready screenshot PNG is missing');
  if (!hasPng(capture?.relationshipCloseup)) failures.push('Ready relationship closeup PNG is missing');
  if (!hasPng(capture?.humanReadScreenshot)) failures.push('Ready marker-free human-read screenshot PNG is missing');
  if (!hasPng(capture?.contactSheet)) failures.push('Ready visual-follow contact sheet PNG is missing');
  const tipRight = metricValue(capture, 'maxTipRightFromAppliedHiltPx');
  const tipDrop = metricValue(capture, 'maxTipDropFromAppliedHiltPx');
  if (!Number.isFinite(tipRight) || tipRight < 24) failures.push(`Ready blade does not visibly project from hilt: maxTipRightFromAppliedHiltPx=${capture?.cloudTelemetry?.visualFollow?.screenMetrics?.maxTipRightFromAppliedHiltPx}`);
  if (!Number.isFinite(tipDrop) || tipDrop > 12) failures.push(`Ready blade drop from hilt is too large for a confident grip read: maxTipDropFromAppliedHiltPx=${capture?.cloudTelemetry?.visualFollow?.screenMetrics?.maxTipDropFromAppliedHiltPx}`);
  return {
    schema: SENSE_SYNTHESIS_SCHEMA,
    captureId: capture?.id || 'ready',
    question: 'Does the viewer believe the weapon is held by the posed hand?',
    expectedVisibleRelationship: 'The hand owns the hilt, the hilt is away from the raw wrist, and the blade projects naturally from the fist.',
    observedVisibleRelationship: failures.length ? 'Ready does not yet read as a confident hand-held saber' : 'Ready reads as a hand-owned saber with a plausible hilt and blade axis',
    verdict: failures.length ? 'human-red' : 'human-green',
    vocabulary: failures.length ? ['wrong-owner', 'wrist-broken', 'disconnected', 'metric-green / human-red'] : ['held', 'pinned', 'confident grip', 'plausible'],
    truth: truthLayer({
      physical: failures.length ? 'FK/route/metric support incomplete' : 'FK/route/metric support present',
      visual: failures.length ? 'screenshot/closeup/follow strip do not prove the hand-hilt-blade relationship' : 'screenshot/closeup/follow strip show a stable hand-hilt-blade relationship',
      perceptual: failures.length ? 'viewer cannot believe the posed hand owns the weapon' : 'viewer can believe the posed hand owns the weapon',
      behavioral: failures.length ? 'do not wake or report green' : 'ready for human review wake',
    }),
    checks: {
      screenshotPresent: hasPng(capture?.screenshot),
      closeupPresent: hasPng(capture?.relationshipCloseup),
      humanReadScreenshotPresent: hasPng(capture?.humanReadScreenshot),
      contactSheetPresent: hasPng(capture?.contactSheet),
      routeTruth: checkValue(capture, 'autoLoadedMeshyFromColdUrl') && checkValue(capture, 'manualActorSelectionRequiredFalse'),
      realWeaponVisible: checkValue(capture, 'realWeaponVisible'),
      pureFkSupport: checkValue(capture, 'parentChain') && checkValue(capture, 'displayStableInSocket') && checkValue(capture, 'modelStableInDisplay'),
      hiltHeldAwayFromWrist: checkValue(capture, 'hiltAwayFromRawHand') && checkValue(capture, 'handLocalGripOffsetVisible'),
      bladeProjectsFromGrip: checkValue(capture, 'readyBladeNotPointingDownThroughBody') && Number.isFinite(tipRight) && tipRight >= 24 && Number.isFinite(tipDrop) && tipDrop <= 12,
      visibleFollowMotion: checkValue(capture, 'tipMoves') && checkValue(capture, 'tipTracksHand'),
      heldByHandRead: checkValue(capture, 'readyVisualRelationshipAccepted') && checkValue(capture, 'hiltPinnedToSocket') && checkValue(capture, 'hiltAwayFromRawHand'),
    },
    supportingMetrics: {
      maxHandToAppliedHiltPx: capture?.cloudTelemetry?.visualFollow?.screenMetrics?.maxHandToAppliedHiltPx ?? null,
      maxTipRightFromAppliedHiltPx: capture?.cloudTelemetry?.visualFollow?.screenMetrics?.maxTipRightFromAppliedHiltPx ?? null,
      maxTipDropFromAppliedHiltPx: capture?.cloudTelemetry?.visualFollow?.screenMetrics?.maxTipDropFromAppliedHiltPx ?? null,
      basketFrontErrorDeg: capture?.cloudTelemetry?.weapon?.weapon?.basketFrontErrorDeg ?? null,
      socketForwardToBladeErrorDeg: capture?.cloudTelemetry?.weapon?.weapon?.socketForwardToBladeErrorDeg ?? null,
      relativeDrift: capture?.cloudTelemetry?.visualFollow?.relativeDrift || null,
    },
    failures,
  };
}

export function synthesizeCaptureSense(capture = {}) {
  if (capture.id === 'landing') return landingSense(capture);
  if (capture.id === 'tpose') return tposeSense(capture);
  if (capture.id === 'ready') return readySense(capture);
  return {
    schema: SENSE_SYNTHESIS_SCHEMA,
    captureId: capture?.id || '',
    question: 'No Sense Synthesis rule exists for this capture.',
    expectedVisibleRelationship: '',
    observedVisibleRelationship: '',
    verdict: 'not-applicable',
    vocabulary: [],
    truth: truthLayer(),
    checks: {},
    supportingMetrics: {},
    failures: [],
  };
}

export function synthesizeEvidenceSense(evidence = {}) {
  const captures = (evidence.captures || [])
    .filter((capture) => ['landing', 'tpose', 'ready'].includes(capture.id))
    .map((capture) => capture.senseSynthesis || synthesizeCaptureSense(capture));
  const failures = captures.flatMap((capture) => (capture.failures || []).map((failure) => `${capture.captureId}: ${failure}`));
  if (evidence.humanRedBuild) {
    const issues = Array.isArray(evidence.humanRedBuild.issues) ? evidence.humanRedBuild.issues.join('; ') : 'human red build';
    failures.push(`AUTHORITY_REVOKED_FALSE_GREEN: human red-build veto contradicts generated evidence: ${issues}`);
  }
  const byId = Object.fromEntries(captures.map((capture) => [capture.captureId, capture]));
  for (const id of ['landing', 'tpose', 'ready']) {
    if (!byId[id]) failures.push(`missing ${id} Sense Synthesis verdict`);
    else if (byId[id].schema !== SENSE_SYNTHESIS_SCHEMA) failures.push(`${id} Sense Synthesis schema mismatch`);
    else if (byId[id].verdict !== 'human-green') failures.push(`${id} Sense Synthesis verdict is ${byId[id].verdict}`);
  }
  return {
    schema: SENSE_SYNTHESIS_SCHEMA,
    aggregate: true,
    question: 'Do the hosted screenshots make a human believe the Meshy saber is held in T-pose and Ready?',
    verdict: failures.length ? 'human-red' : 'human-green',
    captures,
    truth: truthLayer({
      physical: failures.length ? 'supporting evidence incomplete or contradictory' : 'supporting evidence is complete',
      visual: failures.length ? 'one or more screenshots cannot be accepted' : 'T-pose and Ready screenshots are accepted by the sense gate',
      perceptual: failures.length ? 'viewer belief is not established' : 'viewer belief is established for hand-owned weapon',
      behavioral: failures.length ? 'do not promote or wake as green' : 'artifact can be used for final human review',
    }),
    failures,
  };
}
