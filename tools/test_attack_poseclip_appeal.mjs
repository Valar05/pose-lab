import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(projectRoot, 'assets', 'pose_indexes', 'ares_sf2_attack_batch_manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const failures = [];

function reductionFor(attack) {
  const reductionPath = path.join(projectRoot, attack.reduction);
  return JSON.parse(fs.readFileSync(reductionPath, 'utf8'));
}

function poseclipFor(attack) {
  const poseclipPath = path.join(projectRoot, attack.poseclip.split('?')[0]);
  const payload = JSON.parse(fs.readFileSync(poseclipPath, 'utf8'));
  return payload.clip || payload;
}

function segmentEasing(clip, fromTag, toTag) {
  return (clip.userData?.segmentEasing || []).find((segment) => segment.fromTag === fromTag && segment.toTag === toTag)?.easing;
}

function frameMap(reduction) {
  return new Map(reduction.spriteFrames.map((frame) => [frame.tag, frame]));
}

function framesByTag(reduction, tag) {
  return reduction.spriteFrames.filter((frame) => frame.tag === tag);
}

function sourceTimes(reduction) {
  return reduction.spriteFrames.map((frame) => Number(frame.sourceTime.toFixed(5)));
}

function sampleTrackAtFrame(track, frame) {
  const time = Number((frame / 60).toFixed(5));
  const index = track.times.findIndex((entry) => Math.abs(Number(entry) - time) < 0.0002);
  if (index < 0) return null;
  const stride = track.type === 'vector' ? 3 : track.type === 'quaternion' ? 4 : 1;
  return track.values.slice(index * stride, (index + 1) * stride).map(Number);
}

function distance(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return Math.sqrt(a.reduce((total, value, index) => total + ((value - b[index]) ** 2), 0));
}

function bakedPoseDistance(clip, fromFrame, toFrame) {
  let total = 0;
  const parts = [];
  for (const track of clip.tracks || []) {
    if (!/\.(position|quaternion)$/.test(track.name)) continue;
    const delta = distance(sampleTrackAtFrame(track, fromFrame), sampleTrackAtFrame(track, toFrame));
    if (delta <= 0.0001) continue;
    const weighted = delta * (track.name.endsWith('.position') ? 0.08 : 1);
    total += weighted;
    parts.push({ name: track.name, weighted, delta });
  }
  parts.sort((a, b) => b.weighted - a.weighted);
  return { total, parts };
}

function assertBakedPoseDistance(attackName, clip, fromFrame, toFrame, minDistance, label) {
  const measured = bakedPoseDistance(clip, fromFrame, toFrame);
  if (measured.total < minDistance) {
    const top = measured.parts.slice(0, 4).map((part) => `${part.name}=${part.weighted.toFixed(2)}`).join(', ');
    failures.push(`${attackName}: ${label} baked pose delta ${measured.total.toFixed(3)} is below ${minDistance.toFixed(3)}; top changes: ${top || 'none'}`);
  }
  return measured;
}

for (const attack of manifest.attacks || []) {
  const reduction = reductionFor(attack);
  const clip = poseclipFor(attack);
  const frames = frameMap(reduction);
  const anticipation = frames.get('anticipation');
  const contact = frames.get('contact');
  const recoil = frames.get('recoil');

  if (!anticipation || !contact || !recoil) {
    failures.push(`${attack.attackName}: missing anticipation/contact/recoil in reduction`);
    continue;
  }

  const recoilGap = recoil.spriteFrame - contact.spriteFrame;
  if (recoilGap < 2) {
    failures.push(`${attack.attackName}: contact hold/recoil window is ${recoilGap} frames; expected >= 2`);
  }

  const laterStrikeFrames = reduction.spriteFrames.filter((frame) => ['lift', 'apex', 'snap', 'contact'].includes(frame.tag));
  const maxStrikeReach = Math.max(...laterStrikeFrames.map((frame) => Number(frame.reach || 0)));
  const reachDelta = Number((maxStrikeReach - anticipation.reach).toFixed(5));
  const motionDelta = Number(Math.abs(contact.motionTotal - anticipation.motionTotal).toFixed(5));
  const minReachDelta = attack.attackName === 'Headbutt' ? 0.16 : 0.45;
  if (reachDelta < minReachDelta) {
    failures.push(`${attack.attackName}: strike phases do not advance enough from preload anticipation (reachDelta=${reachDelta.toFixed(3)} motionDelta=${motionDelta.toFixed(3)}); expected >= ${minReachDelta.toFixed(2)}`);
  }

  assertBakedPoseDistance(attack.attackName, clip, anticipation.spriteFrame, contact.spriteFrame, 3.0, 'anticipation->contact');

  if (frames.has('windup')) {
    const windup = frames.get('windup');
    assertBakedPoseDistance(attack.attackName, clip, windup.spriteFrame, anticipation.spriteFrame, 2.4, 'windup->anticipation');
  }

  if (attack.attackName === 'AxeKick') {
    const holds = framesByTag(reduction, 'contactHold');
    const times = sourceTimes(reduction);
    const anticipationHold = frames.get('anticipationHold');
    const lift = frames.get('lift');
    const apex = frames.get('apex');
    const apexHold = frames.get('apexHold');
    const snap = frames.get('snap');
    const recoverySettle = frames.get('recoverySettle');
    if (!anticipationHold) failures.push(`${attack.attackName}: missing held preload anticipation frame`);
    if (!lift) failures.push(`${attack.attackName}: missing lift bridge after preload anticipation`);
    if (!apex) failures.push(`${attack.attackName}: missing above-head apex after preload anticipation`);
    if (!apexHold) failures.push(`${attack.attackName}: missing 1-2 frame apex hang before the drop`);
    if (anticipation.spriteFrame > 9) failures.push(`${attack.attackName}: preload anticipation appears too late at sprite frame ${anticipation.spriteFrame}; expected <= 9`);
    if (anticipation.effectorHeight > -0.25 || anticipation.effectorExtension > 0.85) {
      failures.push(`${attack.attackName}: anticipation is not the low loaded/backward foot pose; got height ${anticipation.effectorHeight} extension ${anticipation.effectorExtension}`);
    }
    if (anticipationHold && anticipationHold.spriteFrame - anticipation.spriteFrame < 5) {
      failures.push(`${attack.attackName}: preload anticipation is held ${anticipationHold.spriteFrame - anticipation.spriteFrame} frames; expected >= 5`);
    }
    if (anticipationHold && anticipationHold.spriteFrame - anticipation.spriteFrame > 7) {
      failures.push(`${attack.attackName}: preload anticipation is held ${anticipationHold.spriteFrame - anticipation.spriteFrame} frames; expected <= 7 so it does not feel like a pose display`);
    }
    if (anticipationHold && anticipationHold.sourceTime <= anticipation.sourceTime) {
      failures.push(`${attack.attackName}: anticipationHold should move through the preload source window, got ${anticipation.sourceTime}->${anticipationHold.sourceTime}`);
    }
    if (anticipationHold && anticipationHold.sourceTime - anticipation.sourceTime > 0.05) {
      failures.push(`${attack.attackName}: moving hold advances too far through source (${anticipation.sourceTime}->${anticipationHold.sourceTime}); expected a small preload settle`);
    }
    if (lift && lift.effectorHeight <= anticipation.effectorHeight + 0.55) {
      failures.push(`${attack.attackName}: lift does not visibly raise the preloaded leg; anticipation=${anticipation.effectorHeight} lift=${lift.effectorHeight}`);
    }
    if (apex && lift && apex.effectorHeight <= lift.effectorHeight + 0.25) {
      failures.push(`${attack.attackName}: apex does not continue the lift into the above-head pose; lift=${lift.effectorHeight} apex=${apex.effectorHeight}`);
    }
    if (apex && apex.spriteFrame > 17) failures.push(`${attack.attackName}: apex is too late at frame ${apex.spriteFrame}; expected <= 17 for faster lift`);
    if (apexHold && apex) {
      const apexHang = apexHold.spriteFrame - apex.spriteFrame;
      if (apexHang < 1 || apexHang > 2) failures.push(`${attack.attackName}: apex hang should be 1-2 frames, got ${apexHang}`);
      if (apexHold.sourceTime !== apex.sourceTime) failures.push(`${attack.attackName}: apexHold should freeze the apex source pose, got ${apex.sourceTime}->${apexHold.sourceTime}`);
    }
    if (snap && apexHold) {
      const snapDrop = snap.spriteFrame - apexHold.spriteFrame;
      if (snapDrop > 3) failures.push(`${attack.attackName}: downward snap is too slow after apex hold (${snapDrop} frames); expected <= 3`);
    }
    if (contact && snap) {
      const impactGap = contact.spriteFrame - snap.spriteFrame;
      if (impactGap < 1 || impactGap > 2) failures.push(`${attack.attackName}: impact should land 1-2 frames after snap, got ${impactGap}`);
      if (Number(snap.sourceTime.toFixed(5)) !== 0.4) {
        failures.push(`${attack.attackName}: snap should preserve the pre-impact travel frame at 0.40000s, got ${snap.sourceTime}`);
      }
      if (Number(contact.sourceTime.toFixed(5)) !== 0.43333) {
        failures.push(`${attack.attackName}: contact should preserve the authored upper-body strike frame at 0.43333s, got ${contact.sourceTime}`);
      }
    }
    if (holds[0] && Number(holds[0].sourceTime.toFixed(5)) !== 0.43333) {
      failures.push(`${attack.attackName}: contactHold should freeze the authored upper-body strike frame at 0.43333s, got ${holds[0].sourceTime}`);
    }
    if (recoil && Number(recoil.sourceTime.toFixed(5)) !== 0.53333) {
      failures.push(`${attack.attackName}: recoil should enter the dragged-back recovery window at 0.53333s, got ${recoil.sourceTime}`);
    }
    if (recoverySettle && Number(recoverySettle.sourceTime.toFixed(5)) !== 0.66667) {
      failures.push(`${attack.attackName}: recoverySettle should preserve the later dragged-back recovery frame at 0.66667s, got ${recoverySettle.sourceTime}`);
    }
    if (recoil && contact && recoil.spriteFrame - contact.spriteFrame < 8) failures.push(`${attack.attackName}: recovery still starts too late; expected recoil within 8+ frames after contact, got ${recoil.spriteFrame - contact.spriteFrame}`);
    if (!recoverySettle) failures.push(`${attack.attackName}: recovery is still collapsed; expected recoverySettle between recoil and settle`);
    if (recoverySettle && recoil && recoverySettle.spriteFrame - recoil.spriteFrame < 3) failures.push(`${attack.attackName}: recoverySettle should leave room for a dragged-back moving hold after recoil`);
    if (anticipationHold && lift) assertBakedPoseDistance(attack.attackName, clip, anticipationHold.spriteFrame, lift.spriteFrame, 3.0, 'anticipationHold->lift');
    if (lift && apex) assertBakedPoseDistance(attack.attackName, clip, lift.spriteFrame, apex.spriteFrame, 2.2, 'lift->apex');
    if (!holds.length) failures.push(`${attack.attackName}: missing explicit contactHold frame`);
    if (holds[0] && holds[0].spriteFrame - contact.spriteFrame > 7) {
      failures.push(`${attack.attackName}: contact is held ${holds[0].spriteFrame - contact.spriteFrame} frames; expected <= 7 so recovery can actually read`);
    }
    if (holds[0] && holds[0].spriteFrame - contact.spriteFrame < 4) {
      failures.push(`${attack.attackName}: contact is held only ${holds[0].spriteFrame - contact.spriteFrame} frames; expected >= 4 to keep the hit readable`);
    }
    if (!times.includes(0.16667) || !times.includes(0.2) || !times.includes(0.26667) || !times.includes(0.36667) || !times.includes(0.43333)) {
      failures.push(`${attack.attackName}: reduction does not preserve moving-preload/lift/apex/chop source cluster`);
    }
    if (times.filter((time) => time === 0.36667).length < 2) {
      failures.push(`${attack.attackName}: apex source pose is not held for a readable hang`);
    }
    if (apex && apex.effectorHeight < 0.8) {
      failures.push(`${attack.attackName}: expected above-head apex after preload, got ${apex.effectorHeight}`);
    }
  }

  if (attack.attackName === 'FrontKick') {
    const holds = framesByTag(reduction, 'contactHold');
    const recoilSettle = frames.get('recoilSettle');
    const extensionFrames = contact.spriteFrame - anticipation.spriteFrame;
    const contactFreezeFrames = holds[0] ? holds[0].spriteFrame - contact.spriteFrame : 0;
    const retractFrames = recoilSettle && holds[0] ? recoilSettle.spriteFrame - holds[0].spriteFrame : 0;
    if (contact.spriteFrame > 14) failures.push(`${attack.attackName}: contact lands too late for a ballistic front kick (${contact.spriteFrame}); expected <= 14`);
    if (holds[0] && contactFreezeFrames > 1) failures.push(`${attack.attackName}: contact hold is too long for a ballistic front kick (${contactFreezeFrames} frames); expected <= 1`);
    if (extensionFrames > 5) failures.push(`${attack.attackName}: extension path is still too visible (${extensionFrames} frames); expected <= 5`);
    if (retractFrames && retractFrames <= extensionFrames) failures.push(`${attack.attackName}: retraction should get more timing budget than extension (${retractFrames} vs ${extensionFrames})`);
    if (Number(contact.sourceTime.toFixed(5)) !== 0.36667) failures.push(`${attack.attackName}: contact should preserve the explosive extension frame at 0.36667, got ${contact.sourceTime}`);
    if (recoil && Number(recoil.sourceTime.toFixed(5)) !== 0.5) failures.push(`${attack.attackName}: recoil should preserve the retraction start frame at 0.50000, got ${recoil.sourceTime}`);
    if (!recoilSettle) failures.push(`${attack.attackName}: missing recoilSettle for visible snap-back`);
    if (recoilSettle && Number(recoilSettle.sourceTime.toFixed(5)) !== 0.56667) failures.push(`${attack.attackName}: recoilSettle should preserve the visible retract frame at 0.56667, got ${recoilSettle.sourceTime}`);
  }

  if (attack.attackName === 'LowBackKick') {
    const windup = frames.get('windup');
    const anticipationHold = frames.get('anticipationHold');
    const holds = framesByTag(reduction, 'contactHold');
    const times = sourceTimes(reduction);
    if (!windup) failures.push(`${attack.attackName}: missing explicit early chamber windup before anticipation`);
    if (!anticipationHold) failures.push(`${attack.attackName}: missing explicit held chamber before contact`);
    if (windup && Number(windup.sourceTime.toFixed(5)) !== 0.16667) failures.push(`${attack.attackName}: windup should preserve the earlier heavy coil at 0.16667, got ${windup.sourceTime}`);
    if (Number(anticipation.sourceTime.toFixed(5)) !== 0.23333) failures.push(`${attack.attackName}: anticipation should preserve the heavier chamber at 0.23333, got ${anticipation.sourceTime}`);
    if (anticipationHold && Number(anticipationHold.sourceTime.toFixed(5)) !== 0.26667) failures.push(`${attack.attackName}: anticipationHold should settle into the denser chamber at 0.26667, got ${anticipationHold.sourceTime}`);
    if (anticipationHold && anticipationHold.spriteFrame - anticipation.spriteFrame < 3) failures.push(`${attack.attackName}: held chamber is too brief (${anticipationHold.spriteFrame - anticipation.spriteFrame} frames); expected >= 3`);
    if (anticipation.effectorHeight > -0.72) failures.push(`${attack.attackName}: anticipation is already too extended/high for a heavy chamber (height ${anticipation.effectorHeight})`);
    if (holds[0] && Number(holds[0].sourceTime.toFixed(5)) !== 0.33333) failures.push(`${attack.attackName}: contactHold should freeze the authored strike frame at 0.33333, got ${holds[0].sourceTime}`);
    if (!times.includes(0.16667) || !times.includes(0.23333) || !times.includes(0.26667) || !times.includes(0.33333)) failures.push(`${attack.attackName}: reduction does not preserve the heavier chamber cluster`);
  }

  if (attack.attackName === 'AxleKick') {
    const holds = framesByTag(reduction, 'contactHold');
    const snapFrames = framesByTag(reduction, 'snap');
    const times = sourceTimes(reduction);
    const easing = segmentEasing(clip, 'anticipation', 'snap') || segmentEasing(clip, 'anticipation', 'contact');
    if (snapFrames.length !== 1) failures.push(`${attack.attackName}: expected one source-composition snap frame, got ${snapFrames.length}`);
    if (!holds.length) failures.push(`${attack.attackName}: missing explicit contactHold frame`);
    if (holds[0] && holds[0].spriteFrame - contact.spriteFrame < 4) {
      failures.push(`${attack.attackName}: contact is held ${holds[0].spriteFrame - contact.spriteFrame} frames; expected >= 4`);
    }
    if (!times.includes(0.3) || !times.includes(0.4) || !times.includes(0.43333)) {
      failures.push(`${attack.attackName}: reduction does not preserve original anticipation/snap/contact source burst`);
    }
    if (easing === 'holdThenCut') failures.push(`${attack.attackName}: still hard-cuts through the source burst instead of preserving it`);
  }

  if (attack.attackStyle === 'kick' && attack.attackName !== 'FrontKick') {
    const kickHolds = framesByTag(reduction, 'contactHold');
    if (!kickHolds.length) {
      failures.push(`${attack.attackName}: kick reduction is missing explicit contactHold frame`);
    } else if (kickHolds[0].spriteFrame - contact.spriteFrame < 4) {
      failures.push(`${attack.attackName}: kick contact is held ${kickHolds[0].spriteFrame - contact.spriteFrame} frames; expected >= 4`);
    }
    if (typeof anticipation.reach !== 'number' || typeof contact.reach !== 'number') {
      failures.push(`${attack.attackName}: missing numeric forward reach on kick anchors`);
    }
    if (attack.attackName !== 'AxeKick' && anticipation.description.includes('full leg extension')) {
      failures.push(`${attack.attackName}: anticipation is already described as full leg extension`);
    }
  }
}

if (failures.length) {
  throw new Error(failures.join('\n'));
}

console.log('PASS test_attack_poseclip_appeal');
console.log(JSON.stringify({
  attacks: manifest.attacks.length,
  policy: 'sample baked poseclips and require readable windup, anticipation, contact, and held contact frames',
}, null, 2));
