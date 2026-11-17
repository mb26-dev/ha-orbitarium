/*
 * Orbitarium - core math
 * SGP4 (near-earth formulation, WGS72) ported from the Vallado reference
 * implementation via satellite.js (MIT). Deep-space objects (period >= 225 min)
 * are propagated with the same secular J2 model without lunar-solar terms,
 * which is accurate enough for a sky visualisation.
 * Also contains low precision Sun, Moon and planet positions and the
 * coordinate transforms used by the card.
 */

export const DEG = Math.PI / 180;
export const TWO_PI = Math.PI * 2;

// WGS72 constants (as used by SGP4)
const MU = 398600.8;
const RE = 6378.135;
const XKE = 60.0 / Math.sqrt((RE * RE * RE) / MU);
const VKMPERSEC = (RE * XKE) / 60.0;
const TUMIN = 1.0 / XKE;
const J2 = 0.001082616;
const J3 = -0.00000253881;
const J4 = -0.00000165597;
const J3OJ2 = J3 / J2;
const X2O3 = 2.0 / 3.0;
export const EARTH_RADIUS = RE;
export const EARTH_MU = MU;

/**
 * Initialise a satellite record from mean elements.
 * el: { epochJd, n (rev/day), e, i (deg), raan (deg), argp (deg), ma (deg), bstar }
 */
export function sgp4init(el) {
  const s = {
    epochJd: el.epochJd,
    bstar: el.bstar,
    ecco: el.e,
    inclo: el.i * DEG,
    nodeo: el.raan * DEG,
    argpo: el.argp * DEG,
    mo: el.ma * DEG,
    no: el.n / (1440.0 / TWO_PI),
    isimp: 0,
    error: 0,
    aycof: 0, con41: 0, cc1: 0, cc4: 0, cc5: 0, d2: 0, d3: 0, d4: 0,
    delmo: 0, eta: 0, argpdot: 0, omgcof: 0, sinmao: 0, t2cof: 0, t3cof: 0,
    t4cof: 0, t5cof: 0, x1mth2: 0, x7thm1: 0, mdot: 0, nodedot: 0, xlcof: 0,
    xmcof: 0, nodecf: 0,
  };

  const ss = 78.0 / RE + 1.0;
  const qzms2ttemp = (120.0 - 78.0) / RE;
  const qzms2t = qzms2ttemp * qzms2ttemp * qzms2ttemp * qzms2ttemp;

  // ---- initl ----
  const ecco = s.ecco;
  const eccsq = ecco * ecco;
  const omeosq = 1.0 - eccsq;
  const rteosq = Math.sqrt(omeosq);
  const cosio = Math.cos(s.inclo);
  const cosio2 = cosio * cosio;
  const ak = Math.pow(XKE / s.no, X2O3);
  const d1 = (0.75 * J2 * (3.0 * cosio2 - 1.0)) / (rteosq * omeosq);
  let delPrime = d1 / (ak * ak);
  const adel = ak * (1.0 - delPrime * delPrime - delPrime * (1.0 / 3.0 + (134.0 * delPrime * delPrime) / 81.0));
  delPrime = d1 / (adel * adel);
  s.no = s.no / (1.0 + delPrime);
  const ao = Math.pow(XKE / s.no, X2O3);
  const sinio = Math.sin(s.inclo);
  const po = ao * omeosq;
  const con42 = 1.0 - 5.0 * cosio2;
  s.con41 = -con42 - cosio2 - cosio2;
  const posq = po * po;
  const rp = ao * (1.0 - ecco);

  s.a = Math.pow(s.no * TUMIN, -2.0 / 3.0);

  if (omeosq >= 0.0 || s.no >= 0.0) {
    if (rp < 220.0 / RE + 1.0) s.isimp = 1;
    let sfour = ss;
    let qzms24 = qzms2t;
    const perige = (rp - 1.0) * RE;
    if (perige < 156.0) {
      sfour = perige - 78.0;
      if (perige < 98.0) sfour = 20.0;
      const qzms24temp = (120.0 - sfour) / RE;
      qzms24 = qzms24temp * qzms24temp * qzms24temp * qzms24temp;
      sfour = sfour / RE + 1.0;
    }
    const pinvsq = 1.0 / posq;
    const tsi = 1.0 / (ao - sfour);
    s.eta = ao * ecco * tsi;
    const etasq = s.eta * s.eta;
    const eeta = ecco * s.eta;
    const psisq = Math.abs(1.0 - etasq);
    const coef = qzms24 * Math.pow(tsi, 4.0);
    const coef1 = coef / Math.pow(psisq, 3.5);
    const cc2 = coef1 * s.no * (ao * (1.0 + 1.5 * etasq + eeta * (4.0 + etasq)) +
      ((0.375 * J2 * tsi) / psisq) * s.con41 * (8.0 + 3.0 * etasq * (8.0 + etasq)));
    s.cc1 = s.bstar * cc2;
    let cc3 = 0.0;
    if (ecco > 1.0e-4) cc3 = (-2.0 * coef * tsi * J3OJ2 * s.no * sinio) / ecco;
    s.x1mth2 = 1.0 - cosio2;
    s.cc4 = 2.0 * s.no * coef1 * ao * omeosq * (s.eta * (2.0 + 0.5 * etasq) + ecco * (0.5 + 2.0 * etasq) -
      ((J2 * tsi) / (ao * psisq)) * (-3.0 * s.con41 * (1.0 - 2.0 * eeta + etasq * (1.5 - 0.5 * eeta)) +
        0.75 * s.x1mth2 * (2.0 * etasq - eeta * (1.0 + etasq)) * Math.cos(2.0 * s.argpo)));
    s.cc5 = 2.0 * coef1 * ao * omeosq * (1.0 + 2.75 * (etasq + eeta) + eeta * etasq);
    const cosio4 = cosio2 * cosio2;
    const temp1 = 1.5 * J2 * pinvsq * s.no;
    const temp2 = 0.5 * temp1 * J2 * pinvsq;
    const temp3 = -0.46875 * J4 * pinvsq * pinvsq * s.no;
    s.mdot = s.no + 0.5 * temp1 * rteosq * s.con41 + 0.0625 * temp2 * rteosq * (13.0 - 78.0 * cosio2 + 137.0 * cosio4);
    s.argpdot = -0.5 * temp1 * con42 + 0.0625 * temp2 * (7.0 - 114.0 * cosio2 + 395.0 * cosio4) +
      temp3 * (3.0 - 36.0 * cosio2 + 49.0 * cosio4);
    const xhdot1 = -temp1 * cosio;
    s.nodedot = xhdot1 + (0.5 * temp2 * (4.0 - 19.0 * cosio2) + 2.0 * temp3 * (3.0 - 7.0 * cosio2)) * cosio;
    s.omgcof = s.bstar * cc3 * Math.cos(s.argpo);
    s.xmcof = 0.0;
    if (ecco > 1.0e-4) s.xmcof = (-X2O3 * coef * s.bstar) / eeta;
    s.nodecf = 3.5 * omeosq * xhdot1 * s.cc1;
    s.t2cof = 1.5 * s.cc1;
    if (Math.abs(cosio + 1.0) > 1.5e-12) {
      s.xlcof = (-0.25 * J3OJ2 * sinio * (3.0 + 5.0 * cosio)) / (1.0 + cosio);
    } else {
      s.xlcof = (-0.25 * J3OJ2 * sinio * (3.0 + 5.0 * cosio)) / 1.5e-12;
    }
    s.aycof = -0.5 * J3OJ2 * sinio;
    const delmotemp = 1.0 + s.eta * Math.cos(s.mo);
    s.delmo = delmotemp * delmotemp * delmotemp;
    s.sinmao = Math.sin(s.mo);
    s.x7thm1 = 7.0 * cosio2 - 1.0;

    // deep space: simplified (no lunar-solar terms), use simple drag model
    if (TWO_PI / s.no >= 225.0) {
      s.deep = true;
      s.isimp = 1;
    }

    if (s.isimp !== 1) {
      const cc1sq = s.cc1 * s.cc1;
      s.d2 = 4.0 * ao * tsi * cc1sq;
      const temp = (s.d2 * tsi * s.cc1) / 3.0;
      s.d3 = (17.0 * ao + sfour) * temp;
      s.d4 = 0.5 * temp * ao * tsi * (221.0 * ao + 31.0 * sfour) * s.cc1;
      s.t3cof = s.d2 + 2.0 * cc1sq;
      s.t4cof = 0.25 * (3.0 * s.d3 + s.cc1 * (12.0 * s.d2 + 10.0 * cc1sq));
      s.t5cof = 0.2 * (3.0 * s.d4 + 12.0 * s.cc1 * s.d3 + 6.0 * s.d2 * s.d2 + 15.0 * cc1sq * (2.0 * s.d2 + cc1sq));
    }
  }
  return s;
}

/**
 * Propagate. tsince in minutes from epoch.
 * Writes TEME position (km) and velocity (km/s) into out[off..off+5].
 * Returns true on success.
 */
export function sgp4(s, tsince, out, off) {
  const t = tsince;
  const xmdf = s.mo + s.mdot * t;
  const argpdf = s.argpo + s.argpdot * t;
  const nodedf = s.nodeo + s.nodedot * t;
  let argpm = argpdf;
  let mm = xmdf;
  const t2 = t * t;
  let nodem = nodedf + s.nodecf * t2;
  let tempa = 1.0 - s.cc1 * t;
  let tempe = s.bstar * s.cc4 * t;
  let templ = s.t2cof * t2;

  if (s.isimp !== 1) {
    const delomg = s.omgcof * t;
    const delmtemp = 1.0 + s.eta * Math.cos(xmdf);
    const delm = s.xmcof * (delmtemp * delmtemp * delmtemp - s.delmo);
    const temp = delomg + delm;
    mm = xmdf + temp;
    argpm = argpdf - temp;
    const t3 = t2 * t;
    const t4 = t3 * t;
    tempa = tempa - s.d2 * t2 - s.d3 * t3 - s.d4 * t4;
    tempe += s.bstar * s.cc5 * (Math.sin(mm) - s.sinmao);
    templ = templ + s.t3cof * t3 + t4 * (s.t4cof + t * s.t5cof);
  }
  let nm = s.no;
  let em = s.ecco;
  const inclm = s.inclo;
  if (nm <= 0.0) return false;
  const am = Math.pow(XKE / nm, X2O3) * tempa * tempa;
  nm = XKE / Math.pow(am, 1.5);
  em -= tempe;
  if (em >= 1.0 || em < -0.001) return false;
  if (em < 1.0e-6) em = 1.0e-6;
  mm += s.no * templ;
  let xlm = mm + argpm + nodem;
  nodem %= TWO_PI;
  argpm %= TWO_PI;
  xlm %= TWO_PI;
  mm = (xlm - argpm - nodem) % TWO_PI;

  const sinip = Math.sin(inclm);
  const cosip = Math.cos(inclm);
  const ep = em;
  const argpp = argpm;
  const nodep = nodem;
  const mp = mm;

  const axnl = ep * Math.cos(argpp);
  let temp = 1.0 / (am * (1.0 - ep * ep));
  const aynl = ep * Math.sin(argpp) + temp * s.aycof;
  const xl = mp + argpp + nodep + temp * s.xlcof * axnl;

  const u = (xl - nodep) % TWO_PI;
  let eo1 = u;
  let tem5 = 9999.9;
  let ktr = 1;
  let sineo1 = 0;
  let coseo1 = 0;
  while (Math.abs(tem5) >= 1.0e-12 && ktr <= 10) {
    sineo1 = Math.sin(eo1);
    coseo1 = Math.cos(eo1);
    tem5 = 1.0 - coseo1 * axnl - sineo1 * aynl;
    tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / tem5;
    if (Math.abs(tem5) >= 0.95) tem5 = tem5 > 0.0 ? 0.95 : -0.95;
    eo1 += tem5;
    ktr += 1;
  }

  const ecose = axnl * coseo1 + aynl * sineo1;
  const esine = axnl * sineo1 - aynl * coseo1;
  const el2 = axnl * axnl + aynl * aynl;
  const pl = am * (1.0 - el2);
  if (pl < 0.0) return false;
  const rl = am * (1.0 - ecose);
  const rdotl = (Math.sqrt(am) * esine) / rl;
  const rvdotl = Math.sqrt(pl) / rl;
  const betal = Math.sqrt(1.0 - el2);
  temp = esine / (1.0 + betal);
  const sinu = (am / rl) * (sineo1 - aynl - axnl * temp);
  const cosu = (am / rl) * (coseo1 - axnl + aynl * temp);
  let su = Math.atan2(sinu, cosu);
  const sin2u = (cosu + cosu) * sinu;
  const cos2u = 1.0 - 2.0 * sinu * sinu;
  temp = 1.0 / pl;
  const temp1 = 0.5 * J2 * temp;
  const temp2 = temp1 * temp;

  const mrt = rl * (1.0 - 1.5 * temp2 * betal * s.con41) + 0.5 * temp1 * s.x1mth2 * cos2u;
  if (mrt < 1.0) return false;
  su -= 0.25 * temp2 * s.x7thm1 * sin2u;
  const xnode = nodep + 1.5 * temp2 * cosip * sin2u;
  const xinc = inclm + 1.5 * temp2 * cosip * sinip * cos2u;
  const mvt = rdotl - (nm * temp1 * s.x1mth2 * sin2u) / XKE;
  const rvdot = rvdotl + (nm * temp1 * (s.x1mth2 * cos2u + 1.5 * s.con41)) / XKE;

  const sinsu = Math.sin(su);
  const cossu = Math.cos(su);
  const snod = Math.sin(xnode);
  const cnod = Math.cos(xnode);
  const sini = Math.sin(xinc);
  const cosi = Math.cos(xinc);
  const xmx = -snod * cosi;
  const xmy = cnod * cosi;
  const ux = xmx * sinsu + cnod * cossu;
  const uy = xmy * sinsu + snod * cossu;
  const uz = sini * sinsu;
  const vx = xmx * cossu - cnod * sinsu;
  const vy = xmy * cossu - snod * sinsu;
  const vz = sini * cossu;

  out[off] = mrt * ux * RE;
  out[off + 1] = mrt * uy * RE;
  out[off + 2] = mrt * uz * RE;
  out[off + 3] = (mvt * ux + rvdot * vx) * VKMPERSEC;
  out[off + 4] = (mvt * uy + rvdot * vy) * VKMPERSEC;
  out[off + 5] = (mvt * uz + rvdot * vz) * VKMPERSEC;
  return true;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export function jdFromMs(ms) {
  return ms / 86400000.0 + 2440587.5;
}

/** Greenwich mean sidereal time (IAU-82, as used by SGP4), radians */
export function gmst(jdut1) {
  const tut1 = (jdut1 - 2451545.0) / 36525.0;
  let temp = -6.2e-6 * tut1 * tut1 * tut1 + 0.093104 * tut1 * tut1 +
    (876600.0 * 3600 + 8640184.812866) * tut1 + 67310.54841;
  temp = ((temp * DEG) / 240.0) % TWO_PI;
  if (temp < 0.0) temp += TWO_PI;
  return temp;
}

// ---------------------------------------------------------------------------
// Observer
// ---------------------------------------------------------------------------

/**
 * Observer frame in the inertial (TEME/ECI of date) system for sidereal angle theta.
 * Returns position (km) and local east/north/up unit vectors.
 */
export function observerFrame(latDeg, lonDeg, altKm, theta) {
  const a = 6378.137;
  const f = 1 / 298.257223563;
  const e2 = f * (2 - f);
  const lat = latDeg * DEG;
  const lst = theta + lonDeg * DEG;
  const sl = Math.sin(lat);
  const cl = Math.cos(lat);
  const N = a / Math.sqrt(1 - e2 * sl * sl);
  const rxy = (N + altKm) * cl;
  const cs = Math.cos(lst);
  const sn = Math.sin(lst);
  return {
    pos: [rxy * cs, rxy * sn, (N * (1 - e2) + altKm) * sl],
    up: [cl * cs, cl * sn, sl],
    east: [-sn, cs, 0],
    north: [-sl * cs, -sl * sn, cl],
  };
}

/** Convert an inertial direction vector to [east, north, up] components */
export function toEnu(frame, v) {
  return [
    v[0] * frame.east[0] + v[1] * frame.east[1] + v[2] * frame.east[2],
    v[0] * frame.north[0] + v[1] * frame.north[1] + v[2] * frame.north[2],
    v[0] * frame.up[0] + v[1] * frame.up[1] + v[2] * frame.up[2],
  ];
}

/** Unit vector (equatorial, of date) from RA/Dec in radians */
export function radecToVec(ra, dec) {
  const cd = Math.cos(dec);
  return [cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec)];
}

/** Alt/az (radians, az from north through east) from ENU vector */
export function enuToAltAz(enu) {
  const r = Math.hypot(enu[0], enu[1], enu[2]);
  const alt = Math.asin(Math.max(-1, Math.min(1, enu[2] / r)));
  let az = Math.atan2(enu[0], enu[1]);
  if (az < 0) az += TWO_PI;
  return { alt, az };
}

// ---------------------------------------------------------------------------
// Precession (J2000 -> mean equator of date), IAU 1976, compact form
// ---------------------------------------------------------------------------

export function precessionMatrix(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const asec = DEG / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * asec;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * asec;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * asec;
  const cz = Math.cos(zeta), sz = Math.sin(zeta);
  const cZ = Math.cos(z), sZ = Math.sin(z);
  const ct = Math.cos(theta), st = Math.sin(theta);
  return [
    [cZ * ct * cz - sZ * sz, -cZ * ct * sz - sZ * cz, -cZ * st],
    [sZ * ct * cz + cZ * sz, -sZ * ct * sz + cZ * cz, -sZ * st],
    [st * cz, -st * sz, ct],
  ];
}

export function matVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

// ---------------------------------------------------------------------------
// Sun, Moon, planets (low precision, equatorial of date)
// ---------------------------------------------------------------------------

function obliquity(T) {
  return (23.439291 - 0.0130042 * T) * DEG;
}

function eclToEq(lon, lat, eps) {
  const cl = Math.cos(lat);
  const x = cl * Math.cos(lon);
  const y = cl * Math.sin(lon);
  const z = Math.sin(lat);
  return [x, y * Math.cos(eps) - z * Math.sin(eps), y * Math.sin(eps) + z * Math.cos(eps)];
}

/** Sun: unit vector (equatorial of date) and distance in AU */
export function sunPosition(jd) {
  const n = jd - 2451545.0;
  const T = n / 36525.0;
  const L = (280.460 + 0.9856474 * n) * DEG;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const dist = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return { dir: eclToEq(lambda, 0, obliquity(T)), dist };
}

/** Moon: unit vector (equatorial of date), distance km, ecliptic longitude */
export function moonPosition(jd) {
  const d = jd - 2451545.0;
  const T = d / 36525.0;
  const Lp = (218.316 + 13.176396 * d) * DEG;
  const M = (134.963 + 13.064993 * d) * DEG;
  const F = (93.272 + 13.229350 * d) * DEG;
  const D = (297.850 + 12.190749 * d) * DEG;
  const Ms = (357.529 + 0.98560028 * d) * DEG;
  const lon = Lp + (6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) +
    0.214 * Math.sin(2 * M) - 0.186 * Math.sin(Ms) - 0.114 * Math.sin(2 * F)) * DEG;
  const lat = (5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) + 0.278 * Math.sin(M - F) +
    0.173 * Math.sin(2 * D - F)) * DEG;
  const dist = 385001 - 20905 * Math.cos(M) - 3699 * Math.cos(2 * D - M) - 2956 * Math.cos(2 * D);
  return { dir: eclToEq(lon, lat, obliquity(T)), dist, lon };
}

// JPL approximate Keplerian elements (valid 1800-2050), J2000 ecliptic
// a (AU), e, I, L, long.peri, long.node (deg) and rates per century
const PLANETS = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
    0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081, -0.4, "#c9b8a4"],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
    0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418, -4.4, "#fff3d6"],
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
    0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0, 0, "#ffffff"],
  mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
    0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343, -1.0, "#ff9a6b"],
  jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
    -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106, -2.3, "#f3dfb8"],
  saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
    -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794, 0.5, "#f0d58c"],
  uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503,
    -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589, 5.7, "#b8f0f0"],
  neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574,
    0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664, 7.8, "#8fa8ff"],
};

function heliocentric(p, T) {
  const a = p[0] + p[6] * T;
  const e = p[1] + p[7] * T;
  const I = (p[2] + p[8] * T) * DEG;
  const L = p[3] + p[9] * T;
  const wbar = p[4] + p[10] * T;
  const node = (p[5] + p[11] * T) * DEG;
  const w = wbar * DEG - node;
  let M = ((L - wbar) % 360) * DEG;
  if (M > Math.PI) M -= TWO_PI;
  if (M < -Math.PI) M += TWO_PI;
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w);
  const cO = Math.cos(node), sO = Math.sin(node);
  const cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

/** Planets: list of {key, name, dir (equatorial of date), mag, color} */
export function planetPositions(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  const earth = heliocentric(PLANETS.earth, T);
  const eps0 = 23.43928 * DEG;
  const prec = precessionMatrix(jd);
  const out = [];
  for (const key of Object.keys(PLANETS)) {
    if (key === "earth") continue;
    const p = PLANETS[key];
    const h = heliocentric(p, T);
    const g = [h[0] - earth[0], h[1] - earth[1], h[2] - earth[2]];
    // ecliptic J2000 -> equatorial J2000
    const eq = [g[0], g[1] * Math.cos(eps0) - g[2] * Math.sin(eps0), g[1] * Math.sin(eps0) + g[2] * Math.cos(eps0)];
    const dist = Math.hypot(eq[0], eq[1], eq[2]);
    const dir = matVec(prec, [eq[0] / dist, eq[1] / dist, eq[2] / dist]);
    out.push({ key, name: key.charAt(0).toUpperCase() + key.slice(1), dir, mag: p[12], color: p[13], dist });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Satellite illumination
// ---------------------------------------------------------------------------

/** True if the inertial position r (km) is in sunlight (cylindrical shadow) */
export function isSunlit(r, sunDir) {
  const proj = r[0] * sunDir[0] + r[1] * sunDir[1] + r[2] * sunDir[2];
  if (proj > 0) return true;
  const px = r[0] - proj * sunDir[0];
  const py = r[1] - proj * sunDir[1];
  const pz = r[2] - proj * sunDir[2];
  return px * px + py * py + pz * pz > 6371.0 * 6371.0;
}

/** B-V color index to an RGB css color */
export function bvToColor(bv) {
  const b = Math.max(-0.4, Math.min(2.0, Number.isFinite(bv) ? bv : 0.6));
  const stops = [
    [-0.4, [155, 178, 255]], [0.0, [202, 216, 255]], [0.3, [248, 247, 255]],
    [0.6, [255, 244, 234]], [0.9, [255, 226, 192]], [1.3, [255, 204, 150]],
    [2.0, [255, 170, 110]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [b0, c0] = stops[i];
    const [b1, c1] = stops[i + 1];
    if (b <= b1) {
      const f = (b - b0) / (b1 - b0);
      return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * f)},${Math.round(c0[1] + (c1[1] - c0[1]) * f)},${Math.round(c0[2] + (c1[2] - c0[2]) * f)})`;
    }
  }
  return "rgb(255,170,110)";
}
