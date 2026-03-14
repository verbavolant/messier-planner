import type { HorizonPoint, HorizonProfile } from '../types';

/**
 * Parse a CSV file with horizon profile data.
 * Expected format: azimuth,elevation (degrees)
 * First row may be a header (detected automatically).
 */
export function parseHorizonCSV(csvText: string): HorizonProfile {
  const lines = csvText.trim().split('\n');
  const points: HorizonPoint[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split(/[,;\t]+/);
    if (parts.length < 2) continue;

    const az = parseFloat(parts[0]);
    const el = parseFloat(parts[1]);

    // Skip header row
    if (isNaN(az) || isNaN(el)) continue;

    if (az >= 0 && az <= 360 && el >= 0 && el <= 90) {
      points.push({ azimuth: az, elevation: el });
    }
  }

  // Sort by azimuth
  points.sort((a, b) => a.azimuth - b.azimuth);

  return points;
}

/**
 * Create a function that returns the minimum elevation (horizon obstruction)
 * at any given azimuth, using linear interpolation between profile points.
 * Returns 0 if no profile is loaded.
 */
export function createHorizonFunction(profile: HorizonProfile): (azimuth: number) => number {
  if (profile.length === 0) {
    return () => 0;
  }

  return (azimuth: number): number => {
    const az = ((azimuth % 360) + 360) % 360;

    // Find surrounding points
    let lower = profile[profile.length - 1]; // wrap around
    let upper = profile[0];

    for (let i = 0; i < profile.length; i++) {
      if (profile[i].azimuth >= az) {
        upper = profile[i];
        lower = i > 0 ? profile[i - 1] : profile[profile.length - 1];
        break;
      }
      if (i === profile.length - 1) {
        lower = profile[i];
        upper = profile[0];
      }
    }

    // Handle wrap-around at 0/360
    let lowerAz = lower.azimuth;
    let upperAz = upper.azimuth;

    if (upperAz < lowerAz) {
      // Wrap around
      if (az >= lowerAz) {
        upperAz += 360;
      } else {
        lowerAz -= 360;
      }
    }

    const range = upperAz - lowerAz;
    if (range === 0) return lower.elevation;

    const t = (az - lowerAz) / range;
    return lower.elevation + t * (upper.elevation - lower.elevation);
  };
}

/**
 * Generate a sample horizon profile CSV for testing
 */
export function generateSampleHorizonCSV(): string {
  const lines = ['azimuth,elevation'];
  for (let az = 0; az <= 350; az += 10) {
    // Simulate some trees/buildings on the horizon
    let el = 0;
    if (az >= 30 && az <= 60) el = 15; // trees NE
    else if (az >= 170 && az <= 200) el = 10; // building S
    else if (az >= 300 && az <= 330) el = 5; // hill NW
    else el = 2; // minimal obstruction
    lines.push(`${az},${el}`);
  }
  return lines.join('\n');
}
