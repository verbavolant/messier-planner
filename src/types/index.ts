export interface MessierObject {
  id: number;
  messier: string;
  ngc: string;
  name: string;
  type: string;
  constellation: string;
  ra: number;    // Right Ascension in decimal hours (0-24)
  dec: number;   // Declination in decimal degrees (-90 to +90)
  magnitude: number;
  size: number;  // Angular size in arcminutes (major axis)
}

export interface ObserverLocation {
  latitude: number;   // degrees, positive N
  longitude: number;  // degrees, positive E
  elevation: number;  // meters above sea level
}

export interface SessionConfig {
  date: string;              // ISO date string YYYY-MM-DD
  location: ObserverLocation;
  fovWidth: number;          // FOV width in degrees
  fovHeight: number;         // FOV height in degrees
  slewDelaySec: number;      // goto telescope slew time in seconds
  defaultExposureSec: number;// default exposure time per object
  startTime: string;         // HH:MM local time (user-specified start)
  minAltitude: number;       // minimum altitude in degrees (default 10)
}

export interface HorizonPoint {
  azimuth: number;    // 0-360 degrees
  elevation: number;  // degrees above mathematical horizon
}

export interface VisibilityWindow {
  riseTime: Date | null;  // null = already up at night start
  setTime: Date | null;   // null = still up at night end
  transitTime: Date;
  transitAltitude: number;
  maxAltitude: number;
}

export interface ScheduledObject {
  object: MessierObject;
  order: number;
  startTime: Date;
  endTime: Date;
  altitude: number;     // altitude at observation midpoint
  azimuth: number;      // azimuth at observation midpoint
  exposureSec: number;
  fovGroup: string;     // group ID if sharing FOV with others
  status: 'ok' | 'low' | 'setting' | 'not_visible';
  visibility: VisibilityWindow;
}

export interface ScheduleResult {
  nightStart: Date;         // astronomical twilight end
  nightEnd: Date;           // astronomical twilight start (dawn)
  scheduledObjects: ScheduledObject[];
  skippedObjects: MessierObject[];
  totalExposureMin: number;
  totalTimeMin: number;     // including slew
  endTime: Date;
  fitsBeforeDawn: boolean;
}

export type HorizonProfile = HorizonPoint[];
