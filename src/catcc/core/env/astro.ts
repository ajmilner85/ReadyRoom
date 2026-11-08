/**
 * Low-precision sun and moon positions (Astronomical Almanac formulas, ~0.01° sun, ~0.3° moon):
 * plenty for the Light / Case panel (handoff §9.1).
 */
const D = Math.PI / 180;
const n360 = (a: number) => ((a % 360) + 360) % 360;

function jdDays(d: Date): number {
  return d.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
}

function altitude(d: Date, lat: number, lon: number, raDeg: number, decDeg: number): number {
  const n = jdDays(d);
  const gmst = n360(280.46061837 + 360.98564736629 * n);
  const H = (gmst + lon - raDeg) * D;
  const s = Math.sin(lat * D) * Math.sin(decDeg * D) + Math.cos(lat * D) * Math.cos(decDeg * D) * Math.cos(H);
  return Math.asin(Math.max(-1, Math.min(1, s))) / D;
}

function eclToEq(lambda: number, beta: number, n: number): { ra: number; dec: number } {
  const eps = (23.439 - 0.0000004 * n) * D;
  const l = lambda * D;
  const b = beta * D;
  const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l)) / D;
  const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l)) / D;
  return { ra: n360(ra), dec };
}

function sunEcl(n: number): number {
  const L = n360(280.46 + 0.9856474 * n);
  const g = n360(357.528 + 0.9856003 * n) * D;
  return n360(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
}

/** Sun elevation, degrees (geometric, no refraction). */
export function sunAltitude(d: Date, lat: number, lon: number): number {
  const n = jdDays(d);
  const { ra, dec } = eclToEq(sunEcl(n), 0, n);
  return altitude(d, lat, lon, ra, dec);
}

function moonEcl(n: number): { lambda: number; beta: number } {
  const L = 218.316 + 13.176396 * n;
  const M = (134.963 + 13.064993 * n) * D;
  const F = (93.272 + 13.22935 * n) * D;
  return { lambda: n360(L + 6.289 * Math.sin(M)), beta: 5.128 * Math.sin(F) };
}

/** Moon elevation (degrees, topocentric approx.) and illuminated fraction 0..1. */
export function moon(d: Date, lat: number, lon: number): { alt: number; illum: number } {
  const n = jdDays(d);
  const { lambda, beta } = moonEcl(n);
  const { ra, dec } = eclToEq(lambda, beta, n);
  const geo = altitude(d, lat, lon, ra, dec);
  const alt = geo - 0.95 * Math.cos(geo * D); // horizontal parallax
  const elong = Math.acos(Math.cos(beta * D) * Math.cos((lambda - sunEcl(n)) * D));
  return { alt, illum: (1 - Math.cos(elong)) / 2 };
}

export interface LightDay {
  /** sampled sun elevation from `from` for 24 h */
  samples: { t: Date; sun: number }[];
  sunset?: Date;
  sunrise?: Date;
  moonrise?: Date;
  moonIllum: number;
}

/** Sun/moon events over the 24 h starting at `from` (sunrise/sunset at -0.833°, moonrise at +0.125°). */
export function lightDay(from: Date, lat: number, lon: number, stepMin = 5): LightDay {
  const samples: { t: Date; sun: number }[] = [];
  let sunset: Date | undefined;
  let sunrise: Date | undefined;
  let moonrise: Date | undefined;
  let prevSun: number | undefined;
  let prevMoon: number | undefined;
  const steps = (24 * 60) / stepMin;
  for (let i = 0; i <= steps; i++) {
    const t = new Date(from.getTime() + i * stepMin * 60_000);
    const s = sunAltitude(t, lat, lon);
    const m = moon(t, lat, lon).alt;
    samples.push({ t, sun: s });
    if (prevSun !== undefined) {
      const lerp = (a: number, b: number, lvl: number) => new Date(t.getTime() - stepMin * 60_000 * (1 - (lvl - a) / (b - a)));
      if (!sunset && prevSun >= -0.833 && s < -0.833) sunset = lerp(prevSun, s, -0.833);
      if (!sunrise && prevSun < -0.833 && s >= -0.833) sunrise = lerp(prevSun, s, -0.833);
      if (!moonrise && prevMoon! < 0.125 && m >= 0.125) moonrise = lerp(prevMoon!, m, 0.125);
    }
    prevSun = s;
    prevMoon = m;
  }
  return { samples, sunset, sunrise, moonrise, moonIllum: moon(moonrise ?? from, lat, lon).illum };
}
