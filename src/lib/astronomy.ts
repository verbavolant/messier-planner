/**
 * Astronomical calculation library based on Jean Meeus "Astronomical Algorithms"
 * All angles in radians internally, degrees in public API unless noted.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const HOURS2RAD = Math.PI / 12;

// ── Julian Date ──────────────────────────────────────────────────────────────

/** Convert a JS Date (UTC) to Julian Date */
export function dateToJD(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() +
    date.getUTCHours() / 24 +
    date.getUTCMinutes() / 1440 +
    date.getUTCSeconds() / 86400;

  let Y = y, M = m;
  if (M <= 2) { Y -= 1; M += 12; }

  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);

  return Math.floor(365.25 * (Y + 4716)) +
    Math.floor(30.6001 * (M + 1)) + d + B - 1524.5;
}

/** Julian centuries since J2000.0 */
export function julianCenturies(jd: number): number {
  return (jd - 2451545.0) / 36525.0;
}

// ── Sidereal Time ────────────────────────────────────────────────────────────

/** Greenwich Mean Sidereal Time in degrees (0-360) for a given JD */
export function gmst(jd: number): number {
  const T = julianCenturies(jd);
  let theta = 280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    T * T * T / 38710000.0;
  theta = ((theta % 360) + 360) % 360;
  return theta;
}

/** Local Sidereal Time in degrees for a given JD and longitude (degrees east) */
export function lst(jd: number, longitudeDeg: number): number {
  return ((gmst(jd) + longitudeDeg) % 360 + 360) % 360;
}

// ── Coordinate Transforms ────────────────────────────────────────────────────

export interface HorizontalCoords {
  altitude: number;  // degrees
  azimuth: number;   // degrees (0=N, 90=E, 180=S, 270=W)
}

/** Convert equatorial (RA hours, Dec degrees) to horizontal (alt/az degrees) */
export function equatorialToHorizontal(
  raHours: number,
  decDeg: number,
  jd: number,
  latDeg: number,
  lonDeg: number
): HorizontalCoords {
  const lstDeg = lst(jd, lonDeg);
  const ha = (lstDeg - raHours * 15 + 360) % 360; // hour angle in degrees

  const haRad = ha * DEG2RAD;
  const decRad = decDeg * DEG2RAD;
  const latRad = latDeg * DEG2RAD;

  const sinAlt = Math.sin(decRad) * Math.sin(latRad) +
    Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
  const alt = Math.asin(sinAlt);

  const cosAz = (Math.sin(decRad) - Math.sin(alt) * Math.sin(latRad)) /
    (Math.cos(alt) * Math.cos(latRad));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));

  if (Math.sin(haRad) > 0) {
    az = 2 * Math.PI - az;
  }

  return {
    altitude: alt * RAD2DEG,
    azimuth: az * RAD2DEG,
  };
}

// ── Solar Position (low precision, ~1° accuracy) ────────────────────────────

/** Sun's ecliptic longitude in degrees for a given JD */
export function sunEclipticLongitude(jd: number): number {
  const T = julianCenturies(jd);
  // Mean anomaly
  const M = (357.5291092 + 35999.0502909 * T) % 360;
  const Mrad = M * DEG2RAD;
  // Equation of center
  const C = 1.9146 * Math.sin(Mrad) + 0.02 * Math.sin(2 * Mrad) + 0.0003 * Math.sin(3 * Mrad);
  // Sun's mean longitude
  const L0 = (280.46646 + 36000.76983 * T) % 360;
  // Sun's true longitude
  const sunLon = ((L0 + C) % 360 + 360) % 360;
  return sunLon;
}

/** Sun's RA and Dec in decimal hours and degrees */
export function sunPosition(jd: number): { ra: number; dec: number } {
  const T = julianCenturies(jd);
  const sunLon = sunEclipticLongitude(jd) * DEG2RAD;
  // Obliquity of the ecliptic
  const eps = (23.439291 - 0.0130042 * T) * DEG2RAD;

  const ra = Math.atan2(Math.cos(eps) * Math.sin(sunLon), Math.cos(sunLon));
  const dec = Math.asin(Math.sin(eps) * Math.sin(sunLon));

  let raHours = ((ra * RAD2DEG / 15) + 24) % 24;
  return { ra: raHours, dec: dec * RAD2DEG };
}

/** Sun altitude at a given time and location */
export function sunAltitude(jd: number, latDeg: number, lonDeg: number): number {
  const sun = sunPosition(jd);
  const coords = equatorialToHorizontal(sun.ra, sun.dec, jd, latDeg, lonDeg);
  return coords.altitude;
}

// ── Twilight & Night ─────────────────────────────────────────────────────────

/**
 * Find the time when the sun crosses a given altitude.
 * Uses iterative bisection on the given night.
 * @param dateLocal - local date (YYYY-MM-DD) of the evening
 * @param latDeg - observer latitude
 * @param lonDeg - observer longitude
 * @param targetAlt - target sun altitude in degrees (e.g. -18 for astronomical twilight)
 * @param rising - true for dawn (morning), false for dusk (evening)
 * @param tzOffsetHours - timezone offset from UTC (e.g. +1 for CET)
 */
export function findSunAltitudeTime(
  dateLocal: string,
  latDeg: number,
  lonDeg: number,
  targetAlt: number,
  rising: boolean,
  tzOffsetHours: number
): Date | null {
  // Search window: for dusk, search from local noon to midnight
  // For dawn, search from midnight to next noon
  const parts = dateLocal.split('-').map(Number);
  const baseNoonUTC = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12 - tzOffsetHours, 0, 0));

  let startJD: number, endJD: number;
  if (!rising) {
    // Dusk: search from noon to midnight
    startJD = dateToJD(baseNoonUTC);
    endJD = startJD + 0.5;
  } else {
    // Dawn: search from midnight to next noon
    startJD = dateToJD(baseNoonUTC) + 0.5;
    endJD = startJD + 0.5;
  }

  // Bisection
  for (let i = 0; i < 50; i++) {
    const midJD = (startJD + endJD) / 2;
    const alt = sunAltitude(midJD, latDeg, lonDeg);

    if (!rising) {
      // Sun going down: if alt > target, move forward
      if (alt > targetAlt) startJD = midJD;
      else endJD = midJD;
    } else {
      // Sun going up: if alt < target, move forward
      if (alt < targetAlt) startJD = midJD;
      else endJD = midJD;
    }
  }

  const resultJD = (startJD + endJD) / 2;
  const resultDate = jdToDate(resultJD);

  // Verify the result is reasonable
  const alt = sunAltitude(resultJD, latDeg, lonDeg);
  if (Math.abs(alt - targetAlt) > 1) return null; // didn't converge

  return resultDate;
}

/** Convert JD back to a JS Date (UTC) */
export function jdToDate(jd: number): Date {
  const z = Math.floor(jd + 0.5);
  const f = jd + 0.5 - z;
  let A: number;
  if (z < 2299161) {
    A = z;
  } else {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    A = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const B = A + 1524;
  const C = Math.floor((B - 122.1) / 365.25);
  const D = Math.floor(365.25 * C);
  const E = Math.floor((B - D) / 30.6001);

  const day = B - D - Math.floor(30.6001 * E) + f;
  const month = E < 14 ? E - 1 : E - 13;
  const year = month > 2 ? C - 4716 : C - 4715;

  const dayInt = Math.floor(day);
  const dayFrac = day - dayInt;
  const hours = Math.floor(dayFrac * 24);
  const minutes = Math.floor((dayFrac * 24 - hours) * 60);
  const seconds = Math.floor(((dayFrac * 24 - hours) * 60 - minutes) * 60);

  return new Date(Date.UTC(year, month - 1, dayInt, hours, minutes, seconds));
}

/** Get astronomical night boundaries (sun at -18°) */
export function getAstronomicalNight(
  dateLocal: string,
  latDeg: number,
  lonDeg: number,
  tzOffsetHours: number
): { nightStart: Date; nightEnd: Date } | null {
  const dusk = findSunAltitudeTime(dateLocal, latDeg, lonDeg, -18, false, tzOffsetHours);
  const dawn = findSunAltitudeTime(dateLocal, latDeg, lonDeg, -18, true, tzOffsetHours);

  if (!dusk || !dawn) return null;
  return { nightStart: dusk, nightEnd: dawn };
}

// ── Rise / Set / Transit for DSOs ────────────────────────────────────────────

/**
 * Calculate rise, set, and transit times for a celestial object during a given night.
 * Uses iterative approach searching from nightStart to nightEnd.
 * @param minAltitude - minimum altitude to consider "risen" (degrees)
 */
export function getObjectVisibilityWindow(
  raHours: number,
  decDeg: number,
  nightStart: Date,
  nightEnd: Date,
  latDeg: number,
  lonDeg: number,
  minAltitude: number,
  horizonFn?: (azimuth: number) => number
): {
  riseTime: Date | null;
  setTime: Date | null;
  transitTime: Date;
  transitAltitude: number;
  isVisible: boolean;
  visibleStart: Date;
  visibleEnd: Date;
} {
  const jdStart = dateToJD(nightStart);
  const jdEnd = dateToJD(nightEnd);
  const steps = 200;
  const dt = (jdEnd - jdStart) / steps;

  let maxAlt = -90;
  let maxAltJD = jdStart;
  let riseJD: number | null = null;
  let setJD: number | null = null;
  let prevAbove = false;

  const altitudes: { jd: number; alt: number; az: number }[] = [];

  for (let i = 0; i <= steps; i++) {
    const jd = jdStart + i * dt;
    const coords = equatorialToHorizontal(raHours, decDeg, jd, latDeg, lonDeg);
    const effectiveMin = horizonFn ? Math.max(minAltitude, horizonFn(coords.azimuth)) : minAltitude;
    const above = coords.altitude >= effectiveMin;

    altitudes.push({ jd, alt: coords.altitude, az: coords.azimuth });

    if (coords.altitude > maxAlt) {
      maxAlt = coords.altitude;
      maxAltJD = jd;
    }

    if (i > 0) {
      if (above && !prevAbove && riseJD === null) {
        // Refine rise time with bisection
        riseJD = refineAltitudeCrossing(
          raHours, decDeg, jd - dt, jd, latDeg, lonDeg, effectiveMin, true
        );
      }
      if (!above && prevAbove && setJD === null) {
        // Refine set time
        setJD = refineAltitudeCrossing(
          raHours, decDeg, jd - dt, jd, latDeg, lonDeg, effectiveMin, false
        );
      }
    }
    prevAbove = above;
  }

  // Check if visible at all during the night
  const startCoords = equatorialToHorizontal(raHours, decDeg, jdStart, latDeg, lonDeg);
  const startEffMin = horizonFn ? Math.max(minAltitude, horizonFn(startCoords.azimuth)) : minAltitude;
  const visibleAtStart = startCoords.altitude >= startEffMin;

  const endCoords = equatorialToHorizontal(raHours, decDeg, jdEnd, latDeg, lonDeg);
  const endEffMin = horizonFn ? Math.max(minAltitude, horizonFn(endCoords.azimuth)) : minAltitude;
  const visibleAtEnd = endCoords.altitude >= endEffMin;

  const isVisible = maxAlt >= minAltitude;

  let visibleStart = nightStart;
  let visibleEnd = nightEnd;

  if (riseJD !== null) {
    visibleStart = jdToDate(riseJD);
  }
  if (setJD !== null) {
    visibleEnd = jdToDate(setJD);
  }

  // If it rises and sets, but set is before rise (circumpolar dip below horizon mid-night)
  if (riseJD !== null && setJD !== null && setJD < riseJD) {
    // Object is visible at start, sets, then rises again
    // Use the earlier window (before set) or later window (after rise)
    // For marathon planning, we'll report both, but use the simpler model
  }

  return {
    riseTime: riseJD !== null ? jdToDate(riseJD) : (visibleAtStart ? null : null),
    setTime: setJD !== null ? jdToDate(setJD) : (visibleAtEnd ? null : null),
    transitTime: jdToDate(maxAltJD),
    transitAltitude: maxAlt,
    isVisible,
    visibleStart: isVisible ? visibleStart : nightStart,
    visibleEnd: isVisible ? visibleEnd : nightStart,
  };
}

/** Refine an altitude crossing via bisection */
function refineAltitudeCrossing(
  raHours: number,
  decDeg: number,
  jdLow: number,
  jdHigh: number,
  latDeg: number,
  lonDeg: number,
  targetAlt: number,
  _rising: boolean
): number {
  for (let i = 0; i < 30; i++) {
    const mid = (jdLow + jdHigh) / 2;
    const coords = equatorialToHorizontal(raHours, decDeg, mid, latDeg, lonDeg);
    if (coords.altitude >= targetAlt) {
      jdHigh = mid;
    } else {
      jdLow = mid;
    }
  }
  return (jdLow + jdHigh) / 2;
}

// ── Angular Separation ───────────────────────────────────────────────────────

/** Angular separation between two sky positions in degrees */
export function angularSeparation(
  ra1Hours: number, dec1Deg: number,
  ra2Hours: number, dec2Deg: number
): number {
  const ra1 = ra1Hours * HOURS2RAD;
  const dec1 = dec1Deg * DEG2RAD;
  const ra2 = ra2Hours * HOURS2RAD;
  const dec2 = dec2Deg * DEG2RAD;

  const cosD = Math.sin(dec1) * Math.sin(dec2) +
    Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2);
  return Math.acos(Math.max(-1, Math.min(1, cosD))) * RAD2DEG;
}

// ── Slew time estimate ───────────────────────────────────────────────────────

/** Estimate slew angle between two positions (degrees) */
export function slewAngle(
  ra1Hours: number, dec1Deg: number,
  ra2Hours: number, dec2Deg: number
): number {
  return angularSeparation(ra1Hours, dec1Deg, ra2Hours, dec2Deg);
}

// ── Timezone estimation ──────────────────────────────────────────────────────

/** Estimate timezone offset from longitude (rough, for default) */
export function estimateTimezoneOffset(longitudeDeg: number): number {
  return Math.round(longitudeDeg / 15);
}

/** Get local timezone offset in hours (from browser) */
export function getLocalTimezoneOffset(): number {
  return -new Date().getTimezoneOffset() / 60;
}

// ── Suggested exposure time ──────────────────────────────────────────────────

/** Suggest exposure time in seconds based on magnitude and type */
export function suggestExposure(magnitude: number, type: string): number {
  // Base exposure for mag 8 objects
  let base = 120; // 2 minutes

  // Adjust for magnitude (brighter = shorter)
  if (magnitude <= 5) base = 30;
  else if (magnitude <= 6) base = 45;
  else if (magnitude <= 7) base = 60;
  else if (magnitude <= 8) base = 90;
  else if (magnitude <= 9) base = 120;
  else if (magnitude <= 10) base = 180;
  else base = 240;

  // Nebulae need more time for detail
  if (type.toLowerCase().includes('nebula')) {
    base = Math.round(base * 1.5);
  }

  // Galaxies with low surface brightness
  if (type.toLowerCase().includes('galaxy') && magnitude > 9) {
    base = Math.round(base * 1.3);
  }

  return base;
}
