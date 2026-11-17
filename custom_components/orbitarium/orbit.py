"""Orbit math for Orbitarium.

SGP4 near-earth formulation (WGS72) ported from the Vallado reference
implementation. Deep-space objects are propagated with the same secular
model without lunar-solar terms (good enough for visibility checks).
Also contains a low precision Sun model, observer geometry and a pass
predictor. Pure Python, no external dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
import math

DEG = math.pi / 180.0
TWO_PI = 2.0 * math.pi

MU = 398600.8
RE = 6378.135
XKE = 60.0 / math.sqrt((RE * RE * RE) / MU)
VKMPERSEC = RE * XKE / 60.0
TUMIN = 1.0 / XKE
J2 = 0.001082616
J3 = -0.00000253881
J4 = -0.00000165597
J3OJ2 = J3 / J2
X2O3 = 2.0 / 3.0


class SatRec:
    """Initialised SGP4 record."""

    __slots__ = (
        "epoch_jd", "bstar", "ecco", "inclo", "nodeo", "argpo", "mo", "no",
        "isimp", "aycof", "con41", "cc1", "cc4", "cc5", "d2", "d3", "d4",
        "delmo", "eta", "argpdot", "omgcof", "sinmao", "t2cof", "t3cof",
        "t4cof", "t5cof", "x1mth2", "x7thm1", "mdot", "nodedot", "xlcof",
        "xmcof", "nodecf", "deep",
    )

    def __init__(self, epoch_jd: float, n_rev_day: float, ecc: float, inc_deg: float,
                 raan_deg: float, argp_deg: float, ma_deg: float, bstar: float) -> None:
        self.epoch_jd = epoch_jd
        self.bstar = bstar
        self.ecco = ecc
        self.inclo = inc_deg * DEG
        self.nodeo = raan_deg * DEG
        self.argpo = argp_deg * DEG
        self.mo = ma_deg * DEG
        self.no = n_rev_day / (1440.0 / TWO_PI)
        self.isimp = 0
        self.deep = False
        for name in ("aycof", "con41", "cc1", "cc4", "cc5", "d2", "d3", "d4", "delmo",
                     "eta", "argpdot", "omgcof", "sinmao", "t2cof", "t3cof", "t4cof",
                     "t5cof", "x1mth2", "x7thm1", "mdot", "nodedot", "xlcof", "xmcof",
                     "nodecf"):
            setattr(self, name, 0.0)
        self._init()

    def _init(self) -> None:
        ss = 78.0 / RE + 1.0
        qzms2ttemp = (120.0 - 78.0) / RE
        qzms2t = qzms2ttemp ** 4

        ecco = self.ecco
        eccsq = ecco * ecco
        omeosq = 1.0 - eccsq
        rteosq = math.sqrt(omeosq)
        cosio = math.cos(self.inclo)
        cosio2 = cosio * cosio
        ak = (XKE / self.no) ** X2O3
        d1 = 0.75 * J2 * (3.0 * cosio2 - 1.0) / (rteosq * omeosq)
        del_prime = d1 / (ak * ak)
        adel = ak * (1.0 - del_prime * del_prime - del_prime * (1.0 / 3.0 + 134.0 * del_prime * del_prime / 81.0))
        del_prime = d1 / (adel * adel)
        self.no = self.no / (1.0 + del_prime)
        ao = (XKE / self.no) ** X2O3
        sinio = math.sin(self.inclo)
        po = ao * omeosq
        con42 = 1.0 - 5.0 * cosio2
        self.con41 = -con42 - cosio2 - cosio2
        posq = po * po
        rp = ao * (1.0 - ecco)

        if rp < 220.0 / RE + 1.0:
            self.isimp = 1
        sfour = ss
        qzms24 = qzms2t
        perige = (rp - 1.0) * RE
        if perige < 156.0:
            sfour = perige - 78.0
            if perige < 98.0:
                sfour = 20.0
            qzms24 = ((120.0 - sfour) / RE) ** 4
            sfour = sfour / RE + 1.0
        pinvsq = 1.0 / posq
        tsi = 1.0 / (ao - sfour)
        self.eta = ao * ecco * tsi
        etasq = self.eta * self.eta
        eeta = ecco * self.eta
        psisq = abs(1.0 - etasq)
        coef = qzms24 * tsi ** 4
        coef1 = coef / psisq ** 3.5
        cc2 = coef1 * self.no * (ao * (1.0 + 1.5 * etasq + eeta * (4.0 + etasq))
                                 + 0.375 * J2 * tsi / psisq * self.con41 * (8.0 + 3.0 * etasq * (8.0 + etasq)))
        self.cc1 = self.bstar * cc2
        cc3 = 0.0
        if ecco > 1.0e-4:
            cc3 = -2.0 * coef * tsi * J3OJ2 * self.no * sinio / ecco
        self.x1mth2 = 1.0 - cosio2
        self.cc4 = 2.0 * self.no * coef1 * ao * omeosq * (
            self.eta * (2.0 + 0.5 * etasq) + ecco * (0.5 + 2.0 * etasq)
            - J2 * tsi / (ao * psisq) * (
                -3.0 * self.con41 * (1.0 - 2.0 * eeta + etasq * (1.5 - 0.5 * eeta))
                + 0.75 * self.x1mth2 * (2.0 * etasq - eeta * (1.0 + etasq)) * math.cos(2.0 * self.argpo)))
        self.cc5 = 2.0 * coef1 * ao * omeosq * (1.0 + 2.75 * (etasq + eeta) + eeta * etasq)
        cosio4 = cosio2 * cosio2
        temp1 = 1.5 * J2 * pinvsq * self.no
        temp2 = 0.5 * temp1 * J2 * pinvsq
        temp3 = -0.46875 * J4 * pinvsq * pinvsq * self.no
        self.mdot = (self.no + 0.5 * temp1 * rteosq * self.con41
                     + 0.0625 * temp2 * rteosq * (13.0 - 78.0 * cosio2 + 137.0 * cosio4))
        self.argpdot = (-0.5 * temp1 * con42 + 0.0625 * temp2 * (7.0 - 114.0 * cosio2 + 395.0 * cosio4)
                        + temp3 * (3.0 - 36.0 * cosio2 + 49.0 * cosio4))
        xhdot1 = -temp1 * cosio
        self.nodedot = xhdot1 + (0.5 * temp2 * (4.0 - 19.0 * cosio2) + 2.0 * temp3 * (3.0 - 7.0 * cosio2)) * cosio
        self.omgcof = self.bstar * cc3 * math.cos(self.argpo)
        self.xmcof = 0.0
        if ecco > 1.0e-4:
            self.xmcof = -X2O3 * coef * self.bstar / eeta
        self.nodecf = 3.5 * omeosq * xhdot1 * self.cc1
        self.t2cof = 1.5 * self.cc1
        if abs(cosio + 1.0) > 1.5e-12:
            self.xlcof = -0.25 * J3OJ2 * sinio * (3.0 + 5.0 * cosio) / (1.0 + cosio)
        else:
            self.xlcof = -0.25 * J3OJ2 * sinio * (3.0 + 5.0 * cosio) / 1.5e-12
        self.aycof = -0.5 * J3OJ2 * sinio
        delmotemp = 1.0 + self.eta * math.cos(self.mo)
        self.delmo = delmotemp ** 3
        self.sinmao = math.sin(self.mo)
        self.x7thm1 = 7.0 * cosio2 - 1.0

        if TWO_PI / self.no >= 225.0:
            self.deep = True
            self.isimp = 1

        if self.isimp != 1:
            cc1sq = self.cc1 * self.cc1
            self.d2 = 4.0 * ao * tsi * cc1sq
            temp = self.d2 * tsi * self.cc1 / 3.0
            self.d3 = (17.0 * ao + sfour) * temp
            self.d4 = 0.5 * temp * ao * tsi * (221.0 * ao + 31.0 * sfour) * self.cc1
            self.t3cof = self.d2 + 2.0 * cc1sq
            self.t4cof = 0.25 * (3.0 * self.d3 + self.cc1 * (12.0 * self.d2 + 10.0 * cc1sq))
            self.t5cof = 0.2 * (3.0 * self.d4 + 12.0 * self.cc1 * self.d3 + 6.0 * self.d2 * self.d2
                                + 15.0 * cc1sq * (2.0 * self.d2 + cc1sq))

    def propagate(self, tsince: float) -> tuple[float, float, float, float, float, float] | None:
        """Position (km) and velocity (km/s) in TEME, tsince in minutes."""
        t = tsince
        xmdf = self.mo + self.mdot * t
        argpdf = self.argpo + self.argpdot * t
        nodedf = self.nodeo + self.nodedot * t
        argpm = argpdf
        mm = xmdf
        t2 = t * t
        nodem = nodedf + self.nodecf * t2
        tempa = 1.0 - self.cc1 * t
        tempe = self.bstar * self.cc4 * t
        templ = self.t2cof * t2
        if self.isimp != 1:
            delomg = self.omgcof * t
            delmtemp = 1.0 + self.eta * math.cos(xmdf)
            delm = self.xmcof * (delmtemp ** 3 - self.delmo)
            temp = delomg + delm
            mm = xmdf + temp
            argpm = argpdf - temp
            t3 = t2 * t
            t4 = t3 * t
            tempa = tempa - self.d2 * t2 - self.d3 * t3 - self.d4 * t4
            tempe += self.bstar * self.cc5 * (math.sin(mm) - self.sinmao)
            templ = templ + self.t3cof * t3 + t4 * (self.t4cof + t * self.t5cof)
        nm = self.no
        em = self.ecco
        inclm = self.inclo
        if nm <= 0.0:
            return None
        am = (XKE / nm) ** X2O3 * tempa * tempa
        if am <= 0.0:
            return None
        nm = XKE / am ** 1.5
        em -= tempe
        if em >= 1.0 or em < -0.001:
            return None
        if em < 1.0e-6:
            em = 1.0e-6
        mm += self.no * templ
        xlm = mm + argpm + nodem
        nodem = math.fmod(nodem, TWO_PI)
        argpm = math.fmod(argpm, TWO_PI)
        xlm = math.fmod(xlm, TWO_PI)
        mm = math.fmod(xlm - argpm - nodem, TWO_PI)

        sinip = math.sin(inclm)
        cosip = math.cos(inclm)
        ep = em
        axnl = ep * math.cos(argpm)
        temp = 1.0 / (am * (1.0 - ep * ep))
        aynl = ep * math.sin(argpm) + temp * self.aycof
        xl = mm + argpm + nodem + temp * self.xlcof * axnl

        u = math.fmod(xl - nodem, TWO_PI)
        eo1 = u
        tem5 = 9999.9
        ktr = 1
        sineo1 = coseo1 = 0.0
        while abs(tem5) >= 1.0e-12 and ktr <= 10:
            sineo1 = math.sin(eo1)
            coseo1 = math.cos(eo1)
            tem5 = 1.0 - coseo1 * axnl - sineo1 * aynl
            tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / tem5
            if abs(tem5) >= 0.95:
                tem5 = 0.95 if tem5 > 0.0 else -0.95
            eo1 += tem5
            ktr += 1

        ecose = axnl * coseo1 + aynl * sineo1
        esine = axnl * sineo1 - aynl * coseo1
        el2 = axnl * axnl + aynl * aynl
        pl = am * (1.0 - el2)
        if pl < 0.0:
            return None
        rl = am * (1.0 - ecose)
        rdotl = math.sqrt(am) * esine / rl
        rvdotl = math.sqrt(pl) / rl
        betal = math.sqrt(1.0 - el2)
        temp = esine / (1.0 + betal)
        sinu = am / rl * (sineo1 - aynl - axnl * temp)
        cosu = am / rl * (coseo1 - axnl + aynl * temp)
        su = math.atan2(sinu, cosu)
        sin2u = (cosu + cosu) * sinu
        cos2u = 1.0 - 2.0 * sinu * sinu
        temp = 1.0 / pl
        temp1 = 0.5 * J2 * temp
        temp2 = temp1 * temp

        mrt = rl * (1.0 - 1.5 * temp2 * betal * self.con41) + 0.5 * temp1 * self.x1mth2 * cos2u
        if mrt < 1.0:
            return None
        su -= 0.25 * temp2 * self.x7thm1 * sin2u
        xnode = nodem + 1.5 * temp2 * cosip * sin2u
        xinc = inclm + 1.5 * temp2 * cosip * sinip * cos2u
        mvt = rdotl - nm * temp1 * self.x1mth2 * sin2u / XKE
        rvdot = rvdotl + nm * temp1 * (self.x1mth2 * cos2u + 1.5 * self.con41) / XKE

        sinsu = math.sin(su)
        cossu = math.cos(su)
        snod = math.sin(xnode)
        cnod = math.cos(xnode)
        sini = math.sin(xinc)
        cosi = math.cos(xinc)
        xmx = -snod * cosi
        xmy = cnod * cosi
        ux = xmx * sinsu + cnod * cossu
        uy = xmy * sinsu + snod * cossu
        uz = sini * sinsu
        vx = xmx * cossu - cnod * sinsu
        vy = xmy * cossu - snod * sinsu
        vz = sini * cossu
        return (
            mrt * ux * RE, mrt * uy * RE, mrt * uz * RE,
            (mvt * ux + rvdot * vx) * VKMPERSEC,
            (mvt * uy + rvdot * vy) * VKMPERSEC,
            (mvt * uz + rvdot * vz) * VKMPERSEC,
        )

    def position_at_jd(self, jd: float) -> tuple[float, float, float] | None:
        res = self.propagate((jd - self.epoch_jd) * 1440.0)
        if res is None:
            return None
        return res[0], res[1], res[2]


def gmst(jd: float) -> float:
    """Greenwich mean sidereal time in radians (IAU-82)."""
    tut1 = (jd - 2451545.0) / 36525.0
    temp = (-6.2e-6 * tut1 ** 3 + 0.093104 * tut1 * tut1
            + (876600.0 * 3600 + 8640184.812866) * tut1 + 67310.54841)
    temp = math.fmod(temp * DEG / 240.0, TWO_PI)
    if temp < 0.0:
        temp += TWO_PI
    return temp


def jd_from_unix(ts: float) -> float:
    return ts / 86400.0 + 2440587.5


def unix_from_jd(jd: float) -> float:
    return (jd - 2440587.5) * 86400.0


def sun_direction(jd: float) -> tuple[float, float, float]:
    """Unit vector to the Sun, equatorial of date."""
    n = jd - 2451545.0
    t = n / 36525.0
    lon_mean = (280.460 + 0.9856474 * n) * DEG
    g = (357.528 + 0.9856003 * n) * DEG
    lam = lon_mean + (1.915 * math.sin(g) + 0.020 * math.sin(2 * g)) * DEG
    eps = (23.439291 - 0.0130042 * t) * DEG
    return (math.cos(lam), math.sin(lam) * math.cos(eps), math.sin(lam) * math.sin(eps))


@dataclass
class Observer:
    """Observer on the WGS84 ellipsoid."""

    lat: float
    lon: float
    alt_km: float = 0.0

    def frame(self, jd: float):
        a = 6378.137
        f = 1 / 298.257223563
        e2 = f * (2 - f)
        lat = self.lat * DEG
        lst = gmst(jd) + self.lon * DEG
        sl = math.sin(lat)
        cl = math.cos(lat)
        n = a / math.sqrt(1 - e2 * sl * sl)
        rxy = (n + self.alt_km) * cl
        cs = math.cos(lst)
        sn = math.sin(lst)
        pos = (rxy * cs, rxy * sn, (n * (1 - e2) + self.alt_km) * sl)
        up = (cl * cs, cl * sn, sl)
        east = (-sn, cs, 0.0)
        north = (-sl * cs, -sl * sn, cl)
        return pos, east, north, up


def look_angles(frame, r) -> tuple[float, float, float]:
    """Elevation (deg), azimuth (deg) and range (km) of inertial position r."""
    pos, east, north, up = frame
    dx = r[0] - pos[0]
    dy = r[1] - pos[1]
    dz = r[2] - pos[2]
    e = dx * east[0] + dy * east[1] + dz * east[2]
    n = dx * north[0] + dy * north[1] + dz * north[2]
    u = dx * up[0] + dy * up[1] + dz * up[2]
    rng = math.sqrt(e * e + n * n + u * u)
    el = math.asin(max(-1.0, min(1.0, u / rng))) / DEG
    az = math.atan2(e, n) / DEG
    if az < 0:
        az += 360.0
    return el, az, rng


def sun_elevation(frame, sun) -> float:
    _, _, _, up = frame
    return math.asin(max(-1.0, min(1.0, sun[0] * up[0] + sun[1] * up[1] + sun[2] * up[2]))) / DEG


def is_sunlit(r, sun) -> bool:
    proj = r[0] * sun[0] + r[1] * sun[1] + r[2] * sun[2]
    if proj > 0:
        return True
    px = r[0] - proj * sun[0]
    py = r[1] - proj * sun[1]
    pz = r[2] - proj * sun[2]
    return px * px + py * py + pz * pz > 6371.0 * 6371.0


COMPASS = ("N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
           "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW")


def compass(az: float) -> str:
    return COMPASS[int((az % 360.0) / 22.5 + 0.5) % 16]


@dataclass
class Pass:
    """A pass of a satellite over the observer."""

    start: float
    end: float
    max_time: float
    max_elevation: float
    start_azimuth: float
    max_azimuth: float
    end_azimuth: float
    visible: bool
    visible_start: float | None
    visible_end: float | None


def _state(sat: SatRec, obs: Observer, ts: float):
    jd = jd_from_unix(ts)
    r = sat.position_at_jd(jd)
    if r is None:
        return None
    frame = obs.frame(jd)
    el, az, _ = look_angles(frame, r)
    return el, az, r, frame, jd


def _refine(sat: SatRec, obs: Observer, t_lo: float, t_hi: float, min_el: float) -> float:
    """Bisection for the elevation crossing between t_lo (below) and t_hi (above) or reverse."""
    s_lo = _state(sat, obs, t_lo)
    lo_above = s_lo is not None and s_lo[0] >= min_el
    for _ in range(12):
        mid = (t_lo + t_hi) / 2.0
        s = _state(sat, obs, mid)
        above = s is not None and s[0] >= min_el
        if above == lo_above:
            t_lo = mid
        else:
            t_hi = mid
    return (t_lo + t_hi) / 2.0


def find_passes(sat: SatRec, obs: Observer, start_ts: float, hours: float = 72.0,
                min_el: float = 10.0, step: float = 30.0, limit: int = 20) -> list[Pass]:
    """Predict passes above min_el, including naked-eye visibility."""
    passes: list[Pass] = []
    t = start_ts
    end_ts = start_ts + hours * 3600.0
    prev = _state(sat, obs, t)
    prev_above = prev is not None and prev[0] >= min_el
    pass_start = t if prev_above else None
    while t < end_ts and len(passes) < limit:
        t_next = t + step
        cur = _state(sat, obs, t_next)
        cur_above = cur is not None and cur[0] >= min_el
        if cur_above and not prev_above:
            pass_start = _refine(sat, obs, t, t_next, min_el)
        elif prev_above and not cur_above and pass_start is not None:
            pass_end = _refine(sat, obs, t, t_next, min_el)
            passes.append(_describe(sat, obs, pass_start, pass_end, min_el))
            pass_start = None
        prev_above = cur_above
        t = t_next
    return passes


def _describe(sat: SatRec, obs: Observer, start: float, end: float, min_el: float) -> Pass:
    n = max(8, int((end - start) / 10.0))
    best_el = -90.0
    best_t = start
    best_az = 0.0
    vis_start = None
    vis_end = None
    start_az = end_az = 0.0
    for k in range(n + 1):
        ts = start + (end - start) * k / n
        s = _state(sat, obs, ts)
        if s is None:
            continue
        el, az, r, frame, jd = s
        if k == 0:
            start_az = az
        end_az = az
        if el > best_el:
            best_el, best_t, best_az = el, ts, az
        sun = sun_direction(jd)
        if is_sunlit(r, sun) and sun_elevation(frame, sun) <= -6.0:
            if vis_start is None:
                vis_start = ts
            vis_end = ts
    return Pass(
        start=start, end=end, max_time=best_t, max_elevation=best_el,
        start_azimuth=start_az, max_azimuth=best_az, end_azimuth=end_az,
        visible=vis_start is not None, visible_start=vis_start, visible_end=vis_end,
    )
