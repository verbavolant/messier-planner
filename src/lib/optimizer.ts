/**
 * Messier Marathon Optimizer
 *
 * Optimizes the observation order to maximize the number of objects
 * captured in a single night, considering:
 * - Visibility windows (rise/set during the night)
 * - FOV grouping (multiple objects in one frame)
 * - Setting objects priority (observe before they set)
 * - Rising objects scheduling (wait for them to rise)
 * - Slew time minimization
 */

import type { MessierObject, SessionConfig, ScheduledObject, ScheduleResult, HorizonProfile } from '../types';
import {
  dateToJD, equatorialToHorizontal, getAstronomicalNight,
  getObjectVisibilityWindow, angularSeparation, suggestExposure,
  getLocalTimezoneOffset
} from './astronomy';
import { createHorizonFunction } from './horizonProfile';

interface ObjectWindow {
  object: MessierObject;
  visibleStart: Date;
  visibleEnd: Date;
  transitTime: Date;
  transitAltitude: number;
  isVisible: boolean;
  windowMinutes: number;
  exposureSec: number;
  fovGroupId: string;
}

/**
 * Check if two objects fit within a rectangular FOV.
 * Uses RA/Dec differences accounting for cos(dec) correction on RA.
 */
function fitsInRectFOV(
  ra1: number, dec1: number,
  ra2: number, dec2: number,
  fovWidth: number, fovHeight: number
): boolean {
  const avgDec = (dec1 + dec2) / 2;
  const cosDec = Math.cos(avgDec * Math.PI / 180);
  // RA difference in degrees, corrected for declination
  const deltaRA = Math.abs(ra1 - ra2) * 15 * cosDec; // hours -> degrees * cos(dec)
  const deltaDec = Math.abs(dec1 - dec2);
  // Check both orientations (landscape and portrait)
  return (deltaRA <= fovWidth / 2 && deltaDec <= fovHeight / 2) ||
         (deltaRA <= fovHeight / 2 && deltaDec <= fovWidth / 2);
}

/**
 * Find groups of Messier objects that fit within a single rectangular FOV.
 */
function findFOVGroups(
  objects: MessierObject[],
  fovWidth: number,
  fovHeight: number
): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  const assigned = new Set<number>();

  for (let i = 0; i < objects.length; i++) {
    if (assigned.has(objects[i].id)) continue;

    const group = [objects[i].id];
    assigned.add(objects[i].id);

    for (let j = i + 1; j < objects.length; j++) {
      if (assigned.has(objects[j].id)) continue;

      // Check if this object fits within the rectangular FOV
      // centered on the group's centroid
      const fitsInGroup = group.every(memberId => {
        const member = objects.find(o => o.id === memberId)!;
        return fitsInRectFOV(
          member.ra, member.dec,
          objects[j].ra, objects[j].dec,
          fovWidth, fovHeight
        );
      });

      if (fitsInGroup) {
        group.push(objects[j].id);
        assigned.add(objects[j].id);
      }
    }

    if (group.length > 1) {
      for (const id of group) {
        groups.set(id, group);
      }
    }
  }

  return groups;
}

/**
 * Score an object for scheduling priority at a given time.
 * Higher score = should be observed sooner.
 */
function scoreObject(
  win: ObjectWindow,
  currentTime: Date,
  lastRa: number | null,
  lastDec: number | null,
  nightEnd: Date
): number {
  const now = currentTime.getTime();
  const setTime = win.visibleEnd.getTime();
  const nightEndMs = nightEnd.getTime();

  // Time remaining before object sets (minutes)
  const timeToSet = (setTime - now) / 60000;

  // Time remaining in the night (minutes)
  const nightRemaining = (nightEndMs - now) / 60000;

  // Urgency: objects setting soon get very high priority
  // Objects that set within their exposure time + margin are critical
  const marginMin = (win.exposureSec + 60) / 60; // exposure + 1 min margin
  let urgency = 0;
  if (timeToSet < marginMin * 2) {
    urgency = 1000; // critical - must observe now
  } else if (timeToSet < 30) {
    urgency = 500 - timeToSet * 10;
  } else if (timeToSet < 60) {
    urgency = 200 - timeToSet * 2;
  } else if (timeToSet < nightRemaining * 0.3) {
    urgency = 100 - timeToSet;
  }

  // Slew penalty: prefer nearby objects
  let slewPenalty = 0;
  if (lastRa !== null && lastDec !== null) {
    const sep = angularSeparation(lastRa, lastDec, win.object.ra, win.object.dec);
    slewPenalty = sep * 2; // 2 points per degree of slew
  }

  // Wait penalty: if object hasn't risen yet
  let waitPenalty = 0;
  if (win.visibleStart.getTime() > now) {
    const waitMin = (win.visibleStart.getTime() - now) / 60000;
    waitPenalty = waitMin * 5; // strongly penalize waiting
  }

  // Window narrowness bonus: narrow-window objects should be prioritized
  const windowBonus = Math.max(0, 60 - win.windowMinutes) * 2;

  return urgency + windowBonus - slewPenalty - waitPenalty;
}

/**
 * Main optimization function.
 * Returns an optimized schedule for observing Messier objects.
 */
export function optimizeSchedule(
  objects: MessierObject[],
  config: SessionConfig,
  horizonProfile: HorizonProfile,
  exposureOverrides: Map<number, number>
): ScheduleResult {
  const tzOffset = getLocalTimezoneOffset();
  const horizonFn = createHorizonFunction(horizonProfile);

  // Step 1: Calculate astronomical night
  const night = getAstronomicalNight(
    config.date, config.location.latitude, config.location.longitude, tzOffset
  );

  if (!night) {
    return {
      nightStart: new Date(),
      nightEnd: new Date(),
      scheduledObjects: [],
      skippedObjects: [...objects],
      totalExposureMin: 0,
      totalTimeMin: 0,
      endTime: new Date(),
      fitsBeforeDawn: true,
    };
  }

  // Use user-specified start time if later than astronomical night start
  let effectiveStart = night.nightStart;
  if (config.startTime) {
    const [h, m] = config.startTime.split(':').map(Number);
    const userStart = new Date(night.nightStart);
    userStart.setHours(h, m, 0, 0);
    if (userStart.getTime() < night.nightStart.getTime() - 12 * 3600000) {
      userStart.setDate(userStart.getDate() + 1);
    }
    if (userStart.getTime() > effectiveStart.getTime()) {
      effectiveStart = userStart;
    }
  }

  // Step 2: Calculate visibility windows for all objects
  const windows: ObjectWindow[] = [];
  const fovGroups = findFOVGroups(objects, config.fovWidth, config.fovHeight);

  for (const obj of objects) {
    const vis = getObjectVisibilityWindow(
      obj.ra, obj.dec,
      effectiveStart, night.nightEnd,
      config.location.latitude, config.location.longitude,
      config.minAltitude,
      horizonFn
    );

    if (!vis.isVisible) continue;

    const windowMs = vis.visibleEnd.getTime() - vis.visibleStart.getTime();
    const windowMinutes = windowMs / 60000;

    const exposure = Math.max(1, exposureOverrides.get(obj.id) ??
      suggestExposure(obj.magnitude, obj.type));

    const group = fovGroups.get(obj.id);
    const fovGroupId = group ? `G${Math.min(...group)}` : '';

    windows.push({
      object: obj,
      visibleStart: vis.visibleStart,
      visibleEnd: vis.visibleEnd,
      transitTime: vis.transitTime,
      transitAltitude: vis.transitAltitude,
      isVisible: true,
      windowMinutes,
      exposureSec: exposure,
      fovGroupId,
    });
  }

  // Step 3: Dynamic greedy scheduling
  // At each step, pick the best available object at current time
  const scheduled: ScheduledObject[] = [];
  const used = new Set<number>();
  let currentTime = new Date(effectiveStart);
  let lastRa: number | null = null;
  let lastDec: number | null = null;

  const maxIterations = windows.length * 2; // safety limit
  let iterations = 0;

  while (iterations < maxIterations && currentTime.getTime() < night.nightEnd.getTime()) {
    iterations++;

    // Find all candidate objects visible now or soon
    const candidates: { win: ObjectWindow; score: number }[] = [];

    for (const win of windows) {
      if (used.has(win.object.id)) continue;

      // Object must be observable: either visible now, or rises within 15 min
      const now = currentTime.getTime();
      const maxWait = 15 * 60 * 1000; // 15 minutes max wait

      if (win.visibleEnd.getTime() <= now) continue; // already set
      if (win.visibleStart.getTime() > now + maxWait) continue; // rises too late

      const observeStart = new Date(Math.max(now, win.visibleStart.getTime()));
      const slewEnd = new Date(observeStart.getTime() + config.slewDelaySec * 1000);
      const observeEnd = new Date(slewEnd.getTime() + win.exposureSec * 1000);

      // Must finish before it sets and before dawn
      if (observeEnd.getTime() > win.visibleEnd.getTime()) continue;
      if (observeEnd.getTime() > night.nightEnd.getTime()) continue;

      // Verify altitude at midpoint
      const midTime = new Date(slewEnd.getTime() + win.exposureSec * 500);
      const jdMid = dateToJD(midTime);
      const coords = equatorialToHorizontal(
        win.object.ra, win.object.dec, jdMid,
        config.location.latitude, config.location.longitude
      );
      const effectiveMinAlt = Math.max(config.minAltitude, horizonFn(coords.azimuth));
      if (coords.altitude < effectiveMinAlt) continue;

      const score = scoreObject(win, currentTime, lastRa, lastDec, night.nightEnd);
      candidates.push({ win, score });
    }

    if (candidates.length === 0) {
      // No candidate available now - advance time to next rising object
      let nextRise = Infinity;
      for (const win of windows) {
        if (used.has(win.object.id)) continue;
        if (win.visibleStart.getTime() > currentTime.getTime()) {
          nextRise = Math.min(nextRise, win.visibleStart.getTime());
        }
      }

      if (nextRise === Infinity || nextRise >= night.nightEnd.getTime()) {
        break; // no more objects to schedule
      }

      currentTime = new Date(nextRise);
      continue;
    }

    // Pick the best candidate
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0].win;

    const observeStart = new Date(Math.max(
      currentTime.getTime(),
      best.visibleStart.getTime()
    ));
    const slewEnd = new Date(observeStart.getTime() + config.slewDelaySec * 1000);
    const observeEnd = new Date(slewEnd.getTime() + best.exposureSec * 1000);

    const midTime = new Date(slewEnd.getTime() + best.exposureSec * 500);
    const jdMid = dateToJD(midTime);
    const coords = equatorialToHorizontal(
      best.object.ra, best.object.dec, jdMid,
      config.location.latitude, config.location.longitude
    );

    // Determine status
    let status: 'ok' | 'low' | 'setting' | 'not_visible' = 'ok';
    if (coords.altitude < 20) status = 'low';
    const timeToSet = (best.visibleEnd.getTime() - observeEnd.getTime()) / 60000;
    if (timeToSet < 15) status = 'setting';

    scheduled.push({
      object: best.object,
      order: scheduled.length + 1,
      startTime: slewEnd,
      endTime: observeEnd,
      altitude: coords.altitude,
      azimuth: coords.azimuth,
      exposureSec: best.exposureSec,
      fovGroup: best.fovGroupId,
      status,
      visibility: {
        riseTime: best.visibleStart.getTime() > effectiveStart.getTime() ? best.visibleStart : null,
        setTime: best.visibleEnd.getTime() < night.nightEnd.getTime() ? best.visibleEnd : null,
        transitTime: best.transitTime,
        transitAltitude: best.transitAltitude,
        maxAltitude: best.transitAltitude,
      },
    });

    used.add(best.object.id);
    lastRa = best.object.ra;
    lastDec = best.object.dec;
    currentTime = observeEnd;

    // Mark FOV group members as captured
    const group = fovGroups.get(best.object.id);
    if (group) {
      for (const memberId of group) {
        if (memberId !== best.object.id && !used.has(memberId)) {
          const memberObj = objects.find(o => o.id === memberId);
          const memberWin = windows.find(w => w.object.id === memberId);
          if (memberObj && memberWin) {
            const memberCoords = equatorialToHorizontal(
              memberObj.ra, memberObj.dec, jdMid,
              config.location.latitude, config.location.longitude
            );
            const memberMinAlt = Math.max(config.minAltitude, horizonFn(memberCoords.azimuth));
            if (memberCoords.altitude >= memberMinAlt) {
              scheduled.push({
                object: memberObj,
                order: scheduled.length + 1,
                startTime: slewEnd,
                endTime: observeEnd,
                altitude: memberCoords.altitude,
                azimuth: memberCoords.azimuth,
                exposureSec: 0,
                fovGroup: best.fovGroupId,
                status: 'ok',
                visibility: {
                  riseTime: memberWin.visibleStart.getTime() > effectiveStart.getTime() ? memberWin.visibleStart : null,
                  setTime: memberWin.visibleEnd.getTime() < night.nightEnd.getTime() ? memberWin.visibleEnd : null,
                  transitTime: memberWin.transitTime,
                  transitAltitude: memberWin.transitAltitude,
                  maxAltitude: memberWin.transitAltitude,
                },
              });
              used.add(memberId);
            }
          }
        }
      }
    }
  }

  // Step 4: Second pass - try to fill any gaps with missed objects
  // Check if any remaining objects can be squeezed in during gaps
  for (const win of windows) {
    if (used.has(win.object.id)) continue;

    // Find a gap where this object could fit
    for (let i = 0; i < scheduled.length - 1; i++) {
      const gapStart = scheduled[i].endTime.getTime();
      const gapEnd = scheduled[i + 1].startTime.getTime() - config.slewDelaySec * 1000;
      const gapMs = gapEnd - gapStart;

      if (gapMs < (win.exposureSec + config.slewDelaySec) * 1000) continue;

      const tryTime = new Date(gapStart + config.slewDelaySec * 1000);
      if (tryTime.getTime() < win.visibleStart.getTime()) continue;
      if (tryTime.getTime() + win.exposureSec * 1000 > win.visibleEnd.getTime()) continue;

      const jd = dateToJD(tryTime);
      const coords = equatorialToHorizontal(
        win.object.ra, win.object.dec, jd,
        config.location.latitude, config.location.longitude
      );
      const minAlt = Math.max(config.minAltitude, horizonFn(coords.azimuth));
      if (coords.altitude < minAlt) continue;

      let status: 'ok' | 'low' | 'setting' | 'not_visible' = 'ok';
      if (coords.altitude < 20) status = 'low';

      scheduled.splice(i + 1, 0, {
        object: win.object,
        order: 0,
        startTime: tryTime,
        endTime: new Date(tryTime.getTime() + win.exposureSec * 1000),
        altitude: coords.altitude,
        azimuth: coords.azimuth,
        exposureSec: win.exposureSec,
        fovGroup: win.fovGroupId,
        status,
        visibility: {
          riseTime: win.visibleStart.getTime() > effectiveStart.getTime() ? win.visibleStart : null,
          setTime: win.visibleEnd.getTime() < night.nightEnd.getTime() ? win.visibleEnd : null,
          transitTime: win.transitTime,
          transitAltitude: win.transitAltitude,
          maxAltitude: win.transitAltitude,
        },
      });
      used.add(win.object.id);
      break;
    }
  }

  // Re-number
  scheduled.forEach((s, i) => { s.order = i + 1; });

  // Calculate totals
  const totalExposureSec = scheduled.reduce((sum, s) => sum + s.exposureSec, 0);
  const lastEnd = scheduled.length > 0 ? scheduled[scheduled.length - 1].endTime : effectiveStart;

  const skipped = objects.filter(o => !used.has(o.id));

  return {
    nightStart: effectiveStart,
    nightEnd: night.nightEnd,
    scheduledObjects: scheduled,
    skippedObjects: skipped,
    totalExposureMin: totalExposureSec / 60,
    totalTimeMin: (lastEnd.getTime() - effectiveStart.getTime()) / 60000,
    endTime: lastEnd,
    fitsBeforeDawn: lastEnd.getTime() <= night.nightEnd.getTime(),
  };
}
