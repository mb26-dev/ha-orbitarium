/*
 * Orbitarium card for Home Assistant
 * Live satellites (SGP4), stars, constellations, Sun, Moon and planets
 * rendered as a planetarium view above the Home Assistant location.
 */

import {
  DEG,
  TWO_PI,
  EARTH_MU,
  sgp4init,
  sgp4,
  jdFromMs,
  gmst,
  observerFrame,
  precessionMatrix,
  sunPosition,
  moonPosition,
  planetPositions,
  isSunlit,
  bvToColor,
} from "./orbitarium-core.js?v=1.2.0";
import {
  KIND_FLAT,
  isStationKind,
  satKind,
  satSprite,
  satPicture,
  BODY_FACTS,
  bodyPicture,
  moonPhaseName,
} from "./orbitarium-art.js?v=1.2.0";
import { loadEarth, renderEarth } from "./orbitarium-earth.js?v=1.2.0";

const CARD_VERSION = "1.4.0";
const GOLD = "#d4af37";
const WARP_STEPS = [-600, -120, -30, -5, 0, 1, 5, 30, 120, 600];
const CARDINALS = [
  ["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315],
];
const CATALOG_REFRESH_MS = 6 * 3600 * 1000;
// ---------------------------------------------------------------------------
// Shared data (one download for all card instances)
// ---------------------------------------------------------------------------

const SHARED = {
  sky: null,
  skyPromise: null,
  catalog: null,
  catalogPromise: null,
  catalogLoadedAt: 0,
  earth: null,
  earthPromise: null,
  earthRetryAt: 0,
};

async function apiGet(hass, path) {
  const resp = await hass.fetchWithAuth(`/api/orbitarium/${path}`);
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body && body.error) msg = body.error;
    } catch (_e) {
      /* ignore */
    }
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }
  return resp.json();
}

function prepareSky(raw) {
  const n = raw.stars.length;
  const vec = new Float64Array(n * 3);
  const mag = new Float32Array(n);
  const bucket = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const [ra, dec, m, bv] = raw.stars[i];
    const r = ra * DEG;
    const d = dec * DEG;
    const cd = Math.cos(d);
    vec[i * 3] = cd * Math.cos(r);
    vec[i * 3 + 1] = cd * Math.sin(r);
    vec[i * 3 + 2] = Math.sin(d);
    mag[i] = m;
    const b = bv === null || bv === undefined ? 0.6 : bv;
    bucket[i] = Math.max(0, Math.min(7, Math.round(((b + 0.3) / 2.1) * 7)));
  }
  // order by magnitude so bright stars are drawn last (on top)
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => mag[b] - mag[a]);
  const lines = [];
  for (const [abbr, pts] of raw.lines) {
    const v = pts.map(([ra, dec]) => {
      const r = ra * DEG;
      const d = dec * DEG;
      return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
    });
    lines.push({ abbr, v });
  }
  const cons = raw.constellations.map(([abbr, name, ra, dec, rank]) => {
    const r = ra * DEG;
    const d = dec * DEG;
    return { abbr, name, rank, v: [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)] };
  });
  const names = new Map();
  for (const [idx, name] of raw.names) names.set(idx, name);
  // land outlines as ECEF unit vectors, per polygon a list of rings
  const land = [];
  for (const poly of raw.land || []) {
    const rings = [];
    for (const flat of poly) {
      const n2 = flat.length / 2;
      const v = new Float32Array(n2 * 3);
      for (let k = 0; k < n2; k++) {
        const lo = flat[k * 2] * DEG;
        const la = flat[k * 2 + 1] * DEG;
        v[k * 3] = Math.cos(la) * Math.cos(lo);
        v[k * 3 + 1] = Math.cos(la) * Math.sin(lo);
        v[k * 3 + 2] = Math.sin(la);
      }
      rings.push(v);
    }
    land.push(rings);
  }
  // palette: 8 colour buckets x 6 alpha levels
  const palette = [];
  for (let b = 0; b < 8; b++) {
    const bv = (b / 7) * 2.1 - 0.3;
    const rgb = bvToColor(bv).replace("rgb(", "").replace(")", "");
    const row = [];
    for (let a = 0; a < 6; a++) row.push(`rgba(${rgb},${(0.25 + a * 0.15).toFixed(2)})`);
    palette.push(row);
  }
  return { n, vec, mag, bucket, order, lines, cons, names, palette, land };
}

function prepareCatalog(raw) {
  const rows = raw.sats || [];
  const n = rows.length;
  const recs = new Array(n);
  const names = new Array(n);
  const norad = new Int32Array(n);
  const group = new Uint8Array(n);
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    norad[i] = r[0];
    names[i] = r[1];
    group[i] = r[10] || 0;
    try {
      recs[i] = sgp4init({ epochJd: r[2], n: r[3], e: r[4], i: r[5], raan: r[6], argp: r[7], ma: r[8], bstar: r[9] });
      ok++;
    } catch (_e) {
      recs[i] = null;
    }
  }
  const tracked = new Set(raw.tracked || []);
  return { n, recs, names, norad, group, groups: raw.groups || [], tracked, updated: raw.updated, ok };
}

function loadSky(hass) {
  if (SHARED.sky) return Promise.resolve(SHARED.sky);
  if (!SHARED.skyPromise) {
    SHARED.skyPromise = apiGet(hass, "sky")
      .then((raw) => {
        SHARED.sky = prepareSky(raw);
        return SHARED.sky;
      })
      .finally(() => {
        SHARED.skyPromise = null;
      });
  }
  return SHARED.skyPromise;
}

function loadCatalog(hass, force = false) {
  const fresh = SHARED.catalog && Date.now() - SHARED.catalogLoadedAt < CATALOG_REFRESH_MS;
  if (fresh && !force) return Promise.resolve(SHARED.catalog);
  if (!SHARED.catalogPromise) {
    SHARED.catalogPromise = apiGet(hass, "catalog")
      .then((raw) => {
        SHARED.catalog = prepareCatalog(raw);
        SHARED.catalogLoadedAt = Date.now();
        return SHARED.catalog;
      })
      .finally(() => {
        SHARED.catalogPromise = null;
      });
  }
  return SHARED.catalogPromise;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function lerp(a, b, f) {
  return a + (b - a) * f;
}

function smooth(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function compass(azDeg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((azDeg % 360) + 360) % 360) / 22.5) % 16];
}

function hexToRgb(hex) {
  const h = (hex || "#ffffff").replace("#", "");
  const v = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

class OrbitariumCard extends HTMLElement {
  static getStubConfig() {
    return { view: "dome" };
  }

  static getConfigElement() {
    return document.createElement("orbitarium-card-editor");
  }

  setConfig(config) {
    this._config = {
      title: "Orbitarium",
      view: "dome",
      azimuth: 180,
      height: 440,
      fps: 30,
      star_limit: 6.0,
      show_constellations: true,
      show_constellation_names: true,
      show_labels: true,
      show_planets: true,
      show_ground: true,
      visible_only: false,
      satellite_icons: true,
      night_sky: false,
      groups: null,
      ...config,
    };
    this._fixedHeight = config.height !== undefined && config.height !== null && config.height !== "";
    if (this._view) this._resetView();
    if (this._els) this._resize();
  }

  // set by Home Assistant when the card is the only card of a panel view
  set isPanel(value) {
    const v = Boolean(value);
    if (v === this._isPanel) return;
    this._isPanel = v;
    if (this._els) this._resize();
  }

  get isPanel() {
    return Boolean(this._isPanel);
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: 8, min_columns: 6, min_rows: 5 };
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) {
      this._init();
    }
    this._maybeLoad();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (!this._onWinResize) this._onWinResize = () => { if (this._isPanel && this._els) this._resize(); };
    window.addEventListener("resize", this._onWinResize);
    if (this._built) this._start();
  }

  disconnectedCallback() {
    if (this._onWinResize) window.removeEventListener("resize", this._onWinResize);
    this._stop();
  }

  // ------------------------------------------------------------------ setup

  _init() {
    this._sim = { baseSim: Date.now(), baseReal: performance.now(), warp: 1, warpIdx: WARP_STEPS.indexOf(1) };
    this._resetView();
    this._hidden = new Set();
    if (Array.isArray(this._config.groups)) this._groupFilter = new Set(this._config.groups);
    this._showLines = this._config.show_constellations !== false;
    this._showLabels = this._config.show_labels !== false;
    this._visibleOnly = this._config.visible_only === true;
    this._forceNight = this._config.night_sky === true;
    this._selected = null;
    this._status = "Loading sky data ...";
    this._build();
    this._start();
  }

  _resetView() {
    const c = this._config || {};
    if (c.view === "horizon") {
      this._view = { az: Number(c.azimuth ?? 180), alt: 12, fov: 110, mode: "horizon" };
    } else if (c.view === "globe") {
      this._view = this._globeView();
    } else {
      this._view = { az: Number(c.azimuth ?? 180), alt: 90, fov: 182, mode: "dome" };
    }
    this._bgDirty = true;
  }

  _globeView() {
    const lat = Number(this._config?.latitude ?? this._hass?.config?.latitude ?? 0);
    const lon = Number(this._config?.longitude ?? this._hass?.config?.longitude ?? 0);
    return { az: 0, alt: 90, fov: 120, mode: "globe", glat: clamp(lat, -80, 80), glon: lon, gz: 1 };
  }

  _build() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          overflow: hidden;
          background: #070a12;
          border: 1px solid rgba(212,175,55,0.35);
          box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 6px 24px rgba(0,0,0,0.45);
        }
        .wrap { position: relative; width: 100%; height: 440px; container-type: inline-size; user-select: none; -webkit-user-select: none; }
        .wrap:fullscreen { height: 100vh !important; background: #000; }
        canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: pan-y; cursor: grab; }
        .wrap:fullscreen canvas { touch-action: none; }
        canvas.dragging { cursor: grabbing; }
        .hud { position: absolute; left: 0; right: 0; pointer-events: none; color: #ece4c8;
               font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif); }
        .top { top: 0; padding: 10px 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
               text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6); }
        .title { font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: ${GOLD}; font-weight: 600; white-space: nowrap; }
        .clock { font-size: 13px; margin-top: 2px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .sim { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 8px; font-size: 10px; letter-spacing: 0.08em;
               background: rgba(212,175,55,0.2); color: ${GOLD}; border: 1px solid rgba(212,175,55,0.5); vertical-align: 1px; }
        .stats { text-align: right; font-size: 12px; line-height: 1.5; font-variant-numeric: tabular-nums; }
        .stats b { color: ${GOLD}; font-weight: 600; }
        .bottom { bottom: 0; padding: 8px 10px 10px; pointer-events: none; }
        .row { display: flex; gap: 6px; align-items: center; pointer-events: auto; }
        .chips { overflow-x: auto; scrollbar-width: none; flex: 1 1 auto; min-width: 0; padding-bottom: 2px; }
        .chips::-webkit-scrollbar { display: none; }
        .controls { flex: 0 0 auto; }
        .row + .row { margin-top: 6px; }
        button { font: inherit; font-size: 11px; color: #ece4c8; background: rgba(20,24,34,0.82); border: 1px solid rgba(212,175,55,0.35);
                 border-radius: 14px; padding: 4px 9px; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; white-space: nowrap;
                 line-height: 16px; flex: 0 0 auto; }
        button:hover { border-color: rgba(212,175,55,0.8); }
        button.off { opacity: 0.45; }
        button.on { background: rgba(212,175,55,0.22); border-color: rgba(212,175,55,0.8); color: #fff3cc; }
        button.icon { padding: 3px 6px; }
        button ha-icon { --mdc-icon-size: 16px; color: ${GOLD}; }
        .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 8px; box-shadow: 0 0 6px currentColor; }
        .cnt { color: #9c947c; font-variant-numeric: tabular-nums; }
        .warp { min-width: 38px; text-align: center; font-size: 11px; color: ${GOLD}; font-variant-numeric: tabular-nums; }
        .info { position: absolute; left: 10px; bottom: 82px; width: min(300px, calc(100% - 20px)); box-sizing: border-box;
                background: rgba(10,13,22,0.9); border: 1px solid rgba(212,175,55,0.5); border-radius: 12px; padding: 10px 12px;
                color: #ece4c8; font-size: 12px; line-height: 1.55; display: none; pointer-events: auto;
                font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif); }
        .info.show { display: block; }
        .info .name { color: ${GOLD}; font-weight: 600; font-size: 13px; margin-bottom: 2px; padding-right: 20px; overflow-wrap: anywhere; }
        .info .grid { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 10px; }
        .info .grid span:nth-child(odd) { color: #9c947c; }
        .info .pic { display: block; width: 100%; height: 72px; object-fit: contain; margin: -2px 0 4px; }
        .info.body { width: min(360px, calc(100% - 20px)); max-height: calc(100% - 140px); overflow-y: auto; }
        .info .bhead { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; padding-right: 18px; }
        .info .bpic { width: 84px; height: 84px; flex: 0 0 84px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(0,0,0,0.6)); }
        .info .bpic.wide { width: 112px; flex-basis: 112px; }
        .info .bhead .name { font-size: 16px; }
        .info .sub { color: #9c947c; font-size: 12px; }
        .info .sep { height: 1px; background: rgba(212,175,55,0.3); margin: 8px 0; }
        .info .facts { font-size: 11.5px; }
        .info .note { margin-top: 8px; font-size: 11.5px; color: #d8cfb2; font-style: italic; }
        .info .close { position: absolute; right: 6px; top: 4px; border: none; background: none; color: #9c947c; font-size: 16px; padding: 2px 6px; }
        .msg { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 20px;
               color: #ece4c8; font-size: 13px; pointer-events: none; font-family: var(--ha-font-family-body, Roboto, system-ui, sans-serif); }
        .msg:empty { display: none; }
        @container (max-width: 480px) {
          .lbl { display: none; }
          button { padding: 4px 7px; }
          .info { font-size: 11px; line-height: 1.45; padding: 8px 10px; bottom: 76px; }
          .info .grid { grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr); column-gap: 8px; }
          .info .pic { height: 52px; }
          .info.body .bpic { width: 64px; height: 64px; flex-basis: 64px; }
          .info.body .bpic.wide { width: 90px; flex-basis: 90px; }
          .info.body .grid { grid-template-columns: auto minmax(0, 1fr); }
        }
        @media (max-width: 480px) {
          .top { padding: 8px 10px; }
          .clock { font-size: 12px; }
          .stats { font-size: 11px; }
          .info { bottom: 78px; }
        }
      </style>
      <ha-card>
        <div class="wrap">
          <canvas></canvas>
          <div class="hud top">
            <div>
              <div class="title"></div>
              <div class="clock"></div>
            </div>
            <div class="stats"></div>
          </div>
          <div class="info"></div>
          <div class="msg"></div>
          <div class="hud bottom">
            <div class="row chips"></div>
            <div class="row controls">
              <button class="icon" data-act="slower" title="Slower / reverse"><ha-icon icon="mdi:rewind"></ha-icon></button>
              <span class="warp"></span>
              <button class="icon" data-act="faster" title="Faster"><ha-icon icon="mdi:fast-forward"></ha-icon></button>
              <button data-act="now" title="Back to live time"><ha-icon icon="mdi:clock-outline"></ha-icon><span class="lbl">Now</span></button>
              <span style="flex:1 1 auto"></span>
              <button class="icon" data-act="night" title="Night sky (dark background)"><ha-icon icon="mdi:weather-night"></ha-icon></button>
              <button class="icon" data-act="zoomout" title="Zoom out"><ha-icon icon="mdi:magnify-minus-outline"></ha-icon></button>
              <button class="icon" data-act="zoomin" title="Zoom in"><ha-icon icon="mdi:magnify-plus-outline"></ha-icon></button>
              <button data-act="view" title="Switch view"><ha-icon icon="mdi:telescope"></ha-icon><span class="vlabel lbl"></span></button>
              <button class="icon" data-act="full" title="Fullscreen"><ha-icon icon="mdi:fullscreen"></ha-icon></button>
            </div>
          </div>
        </div>
      </ha-card>`;
    this._els = {
      wrap: root.querySelector(".wrap"),
      canvas: root.querySelector("canvas"),
      title: root.querySelector(".title"),
      clock: root.querySelector(".clock"),
      stats: root.querySelector(".stats"),
      chips: root.querySelector(".chips"),
      controls: root.querySelector(".controls"),
      warp: root.querySelector(".warp"),
      vlabel: root.querySelector(".vlabel"),
      info: root.querySelector(".info"),
      msg: root.querySelector(".msg"),
      full: root.querySelector('[data-act="full"]'),
      night: root.querySelector('[data-act="night"]'),
    };
    this._els.title.textContent = this._config.title || "";
    if (!document.fullscreenEnabled) this._els.full.style.display = "none";
    this._ctx = this._els.canvas.getContext("2d");
    this._bg = document.createElement("canvas");
    this._bgCtx = this._bg.getContext("2d");
    this._els.controls.addEventListener("click", (ev) => this._onControl(ev));
    this._els.chips.addEventListener("click", (ev) => this._onChip(ev));
    this._els.info.addEventListener("click", (ev) => {
      if (ev.target.classList.contains("close")) {
        this._selected = null;
        this._renderInfo();
      }
    });
    this._bindPointer();
    this._resizeObs = new ResizeObserver(() => this._resize());
    this._resizeObs.observe(this._els.wrap);
    this._visObs = new IntersectionObserver((entries) => {
      this._onScreen = entries.some((e) => e.isIntersecting);
    });
    this._visObs.observe(this._els.wrap);
    this._onScreen = true;
    this._built = true;
    this._updateControls();
    this._resize();
  }

  _start() {
    if (this._raf || !this._built) return;
    const loop = (ts) => {
      this._raf = requestAnimationFrame(loop);
      const minDt = 1000 / clamp(Number(this._config.fps) || 30, 5, 60);
      if (this._lastFrame && ts - this._lastFrame < minDt - 1) return;
      if (!this._onScreen || document.hidden) return;
      this._lastFrame = ts;
      try {
        this._frame();
      } catch (err) {
        // keep the loop alive, show the problem once
        if (!this._frameError) {
          this._frameError = true;
          console.error("orbitarium-card frame error", err);
        }
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  _resize() {
    const wrap = this._els.wrap;
    const width = wrap.clientWidth || 600;
    let height = Number(this._config.height) || 440;
    if (this._isPanel && !this._fixedHeight) {
      // panel view: fill the visible area below the HA toolbar
      const top = Math.max(0, wrap.getBoundingClientRect().top + window.scrollY);
      height = Math.max(360, window.innerHeight - top - 2);
    } else if (width < 520) height = Math.round(clamp(width * 1.08, 320, 560));
    if (!document.fullscreenElement) wrap.style.height = `${height}px`;
    const h = wrap.clientHeight || height;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this._w = width;
    this._h = h;
    this._dpr = dpr;
    this._els.canvas.width = Math.round(width * dpr);
    this._els.canvas.height = Math.round(h * dpr);
    this._bgDirty = true;
  }

  // ------------------------------------------------------------------ data

  _maybeLoad() {
    if (!this._hass || this._loading) return;
    const needSky = !SHARED.sky && !this._skyFailed;
    const needCat = !this._cat || Date.now() - (this._catLoadedAt || 0) > CATALOG_REFRESH_MS;
    const retryAt = this._retryAt || 0;
    if ((!needSky && !needCat) || Date.now() < retryAt) return;
    this._loading = true;
    const tasks = [];
    if (needCat) {
      tasks.push(
        loadCatalog(this._hass, !!this._cat).then((cat) => {
          this._setCatalog(cat);
        })
      );
    }
    if (needSky) {
      tasks.push(
        loadSky(this._hass).then((sky) => {
          this._sky = sky;
          this._bgDirty = true;
        })
      );
    }
    Promise.allSettled(tasks).then((results) => {
      this._loading = false;
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length) {
        const err = failed[0].reason;
        if (err && err.status === 404) {
          this._status = "Orbitarium integration is not set up. Add it under Settings > Devices & services.";
        } else {
          this._status = `Waiting for data: ${err && err.message ? err.message : err}`;
        }
        this._retryAt = Date.now() + 20000;
      } else {
        this._status = "";
      }
      if (SHARED.sky) this._sky = SHARED.sky;
      this._els.msg.textContent = this._cat ? "" : this._status;
    });
  }

  _setCatalog(cat) {
    this._selected = null;
    if (this._els) this._els.info.classList.remove("show");
    this._cat = cat;
    this._catLoadedAt = Date.now();
    const n = cat.n;
    this._pos = new Float64Array(n * 3);
    this._vel = new Float64Array(n * 3);
    this._sampleT = new Float64Array(n);
    this._valid = new Uint8Array(n);
    this._sx = new Float32Array(n).fill(-1e6);
    this._sy = new Float32Array(n).fill(-1e6);
    this._sa = new Float32Array(n);
    this._kind = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const g = cat.groups[cat.group[i]];
      this._kind[i] = satKind(g ? g.key : "", cat.names[i]);
    }
    this._cursor = 0;
    this._groupCounts = new Array(cat.groups.length).fill(0);
    for (let i = 0; i < n; i++) this._groupCounts[cat.group[i]]++;
    if (this._groupFilter) {
      this._hidden = new Set(cat.groups.map((g, i) => (this._groupFilter.has(g.key) ? -1 : i)).filter((i) => i >= 0));
    }
    this._groupRgb = cat.groups.map((g) => hexToRgb(g.color));
    // debris and rocket bodies: always small dots; debris never counts as visible
    this._groupDots = cat.groups.map((g) => g.dots === true);
    this._groupNoEye = cat.groups.map((g) => g.visible === false);
    this._groupStyles = cat.groups.map((g) => {
      const [r, gg, b] = hexToRgb(g.color);
      return {
        vis: `rgba(${r},${gg},${b},1)`,
        lit: `rgba(${r},${gg},${b},0.75)`,
        dim: `rgba(${Math.round(r * 0.45 + 40)},${Math.round(gg * 0.45 + 40)},${Math.round(b * 0.45 + 50)},0.45)`,
      };
    });
    this._propagateAll(this._simNow());
    this._renderChips();
    this._els.msg.textContent = "";
  }

  // ------------------------------------------------------------------ time

  _simNow() {
    const s = this._sim;
    return s.baseSim + (performance.now() - s.baseReal) * s.warp;
  }

  _setWarp(idx) {
    const now = this._simNow();
    this._sim.warpIdx = clamp(idx, 0, WARP_STEPS.length - 1);
    this._sim.warp = WARP_STEPS[this._sim.warpIdx];
    this._sim.baseSim = now;
    this._sim.baseReal = performance.now();
    this._updateControls();
  }

  _goLive() {
    this._sim = { baseSim: Date.now(), baseReal: performance.now(), warp: 1, warpIdx: WARP_STEPS.indexOf(1) };
    if (this._cat) this._propagateAll(this._simNow());
    this._updateControls();
  }

  // ------------------------------------------------------------ propagation

  _propagateOne(i, simMs, jd) {
    const rec = this._cat.recs[i];
    if (!rec) {
      this._valid[i] = 0;
      return;
    }
    const tsince = (jd - rec.epochJd) * 1440.0;
    if (!sgp4(rec, tsince, this._tmp || (this._tmp = new Float64Array(6)), 0)) {
      this._valid[i] = 0;
      return;
    }
    const t = this._tmp;
    const o = i * 3;
    this._pos[o] = t[0];
    this._pos[o + 1] = t[1];
    this._pos[o + 2] = t[2];
    this._vel[o] = t[3];
    this._vel[o + 1] = t[4];
    this._vel[o + 2] = t[5];
    this._sampleT[i] = simMs;
    this._valid[i] = 1;
  }

  _propagateAll(simMs) {
    if (!this._cat) return;
    const jd = jdFromMs(simMs);
    for (let i = 0; i < this._cat.n; i++) this._propagateOne(i, simMs, jd);
    this._lastFull = simMs;
  }

  _propagateSlice(simMs) {
    const n = this._cat.n;
    if (!n) return;
    const jd = jdFromMs(simMs);
    const t0 = performance.now();
    const budget = 4.0;
    let count = 0;
    while (count < n) {
      this._propagateOne(this._cursor, simMs, jd);
      this._cursor = (this._cursor + 1) % n;
      count++;
      if ((count & 127) === 0 && performance.now() - t0 > budget) break;
    }
  }

  // ------------------------------------------------------------ projection

  _camera() {
    const v = this._view;
    const az = v.az * DEG;
    const alt = v.alt * DEG;
    const f = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)];
    const r = [Math.cos(az), -Math.sin(az), 0];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const minDim = Math.min(this._w, this._h);
    const scale = minDim / 2 / (2 * Math.tan((v.fov * DEG) / 4));
    return { f, r, u, scale, cx: this._w / 2, cy: this._h / 2 };
  }

  /** project an ENU unit-ish vector; returns false if behind the camera */
  _project(e, n, up, cam, out) {
    const len = Math.sqrt(e * e + n * n + up * up);
    const x = (e * cam.r[0] + n * cam.r[1] + up * cam.r[2]) / len;
    const y = (e * cam.u[0] + n * cam.u[1] + up * cam.u[2]) / len;
    const z = (e * cam.f[0] + n * cam.f[1] + up * cam.f[2]) / len;
    if (z < -0.95) return false;
    const k = (2 / (1 + z)) * cam.scale;
    out[0] = cam.cx + k * x;
    out[1] = cam.cy - k * y;
    return true;
  }

  // -------------------------------------------------------------- the frame

  _frame() {
    if (!this._w || !this._h) return;
    const ctx = this._ctx;
    const dpr = this._dpr;
    const simMs = this._simNow();
    const jd = jdFromMs(simMs);
    const lat = Number(this._config.latitude ?? this._hass?.config?.latitude ?? 0);
    const lon = Number(this._config.longitude ?? this._hass?.config?.longitude ?? 0);
    const altKm = Number(this._hass?.config?.elevation || 0) / 1000;
    const theta = gmst(jd);
    const obs = observerFrame(lat, lon, altKm, theta);
    const cam = this._camera();
    this._lastCam = cam;
    const P = this._p || (this._p = new Float64Array(2));

    // Sun (equatorial of date) -> ENU
    const sun = sunPosition(jd);
    const sunEnu = this._toEnu(obs, sun.dir);
    const sunAlt = Math.asin(clamp(sunEnu[2], -1, 1)) / DEG;
    const globe = this._view.mode === "globe";
    // night sky switch: draw a dark sky, the real sun altitude still drives all counts
    const skyAlt = this._forceNight ? Math.min(sunAlt, -30) : sunAlt;
    const G = globe ? this._globeFrame(theta) : null;
    this._G = G;
    const now = performance.now();

    // ---------------- background (sky + ground) ----------------
    if (globe) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ctx.createRadialGradient(this._w / 2, this._h / 2, 0, this._w / 2, this._h / 2, Math.max(this._w, this._h) * 0.75);
      bg.addColorStop(0, "#0a1122");
      bg.addColorStop(1, "#010205");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, this._w, this._h);
    } else {
      const viewKey = `${this._w}x${this._h}|${this._view.az.toFixed(2)}|${this._view.alt.toFixed(2)}|${this._view.fov.toFixed(2)}|${this._forceNight ? 1 : 0}`;
      if (this._bgDirty || viewKey !== this._bgKey || now - (this._bgTime || 0) > (Math.abs(this._sim.warp) > 1 ? 250 : 5000)) {
        this._renderBackground(cam, sunEnu, skyAlt);
        this._bgKey = viewKey;
        this._bgTime = now;
        this._bgDirty = false;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this._bg, 0, 0, this._els.canvas.width, this._els.canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const dark = sunAlt < -6;
    const limMag = this._limitingMagnitude(globe ? -30 : skyAlt);

    // ---------------- globe ----------------
    if (globe) {
      this._starScreen = [];
      this._maybeLoadEarth();
      if (this._sky) this._drawGlobeStars(ctx, G, jd, theta, P);
      this._drawGlobe(ctx, G, sun.dir, theta, lat, lon);
    }

    // ---------------- stars / constellations ----------------
    if (this._sky && !globe) {
      const prec = this._precFor(jd);
      // combined matrix: ENU rows * precession  (J2000 -> ENU)
      const M = [
        this._rowTimes(obs.east, prec),
        this._rowTimes(obs.north, prec),
        this._rowTimes(obs.up, prec),
      ];
      if (this._showLines && this._config.show_constellations !== false) this._drawConstellations(ctx, cam, M, skyAlt);
      this._drawStars(ctx, cam, M, limMag, P);
    }

    // ---------------- solar system ----------------
    this._bodies = [];
    if (!globe && this._config.show_planets !== false) this._drawSolarSystem(ctx, cam, obs, jd, sun, sunEnu, sunAlt, limMag, P);

    // ---------------- horizon + cardinals ----------------
    if (!globe) this._drawHorizon(ctx, cam, P);

    // ---------------- satellites ----------------
    let above = 0;
    let visible = 0;
    if (this._cat) {
      // large jumps (time travel) -> full refresh
      if (Math.abs(simMs - (this._lastSimMs || simMs)) > 5 * 60 * 1000) this._propagateAll(simMs);
      this._propagateSlice(simMs);
      const counts = this._drawSatellites(ctx, cam, obs, sun.dir, dark, P, simMs, jd);
      above = counts[0];
      visible = counts[1];
    }
    this._lastSimMs = simMs;

    // ---------------- HUD ----------------
    this._updateHud(simMs, above, visible, sunAlt);
    if (this._selected && (!this._infoTime || now - this._infoTime > 500)) {
      this._renderInfo();
      this._infoTime = now;
    }
  }

  _toEnu(obs, v) {
    return [
      v[0] * obs.east[0] + v[1] * obs.east[1] + v[2] * obs.east[2],
      v[0] * obs.north[0] + v[1] * obs.north[1] + v[2] * obs.north[2],
      v[0] * obs.up[0] + v[1] * obs.up[1] + v[2] * obs.up[2],
    ];
  }

  _rowTimes(row, m) {
    return [
      row[0] * m[0][0] + row[1] * m[1][0] + row[2] * m[2][0],
      row[0] * m[0][1] + row[1] * m[1][1] + row[2] * m[2][1],
      row[0] * m[0][2] + row[1] * m[1][2] + row[2] * m[2][2],
    ];
  }

  _precFor(jd) {
    if (!this._prec || Math.abs(jd - this._precJd) > 1) {
      this._prec = precessionMatrix(jd);
      this._precJd = jd;
    }
    return this._prec;
  }

  _limitingMagnitude(sunAlt) {
    const base = Number(this._config.star_limit) || 6.0;
    let lim;
    if (sunAlt <= -18) lim = base;
    else if (sunAlt <= -6) lim = lerp(base, 3.5, (sunAlt + 18) / 12);
    else if (sunAlt <= 0) lim = lerp(3.5, 1.0, (sunAlt + 6) / 6);
    else lim = lerp(1.0, -1.5, clamp(sunAlt / 10, 0, 1));
    const zoomGain = Math.max(0, Math.log2(120 / this._view.fov)) * 0.7;
    return Math.min(lim + zoomGain, base + 1.5);
  }

  // ------------------------------------------------------------ background

  _renderBackground(cam, sunEnu, sunAlt) {
    const step = 4;
    const bw = Math.max(16, Math.ceil(this._w / step));
    const bh = Math.max(16, Math.ceil(this._h / step));
    if (this._bg.width !== bw || this._bg.height !== bh) {
      this._bg.width = bw;
      this._bg.height = bh;
      this._bgImg = this._bgCtx.createImageData(bw, bh);
    }
    const img = this._bgImg || (this._bgImg = this._bgCtx.createImageData(bw, bh));
    const d = img.data;
    const day = smooth(-10, 6, sunAlt);
    const twi = smooth(-18, -4, sunAlt) * (1 - smooth(2, 12, sunAlt));
    const groundOn = this._config.show_ground !== false;
    const sx = this._w / bw;
    const sy = this._h / bh;
    const { f, r, u, scale, cx, cy } = cam;
    let o = 0;
    for (let j = 0; j < bh; j++) {
      const b = (cy - (j + 0.5) * sy) / scale;
      for (let i = 0; i < bw; i++) {
        const a = ((i + 0.5) * sx - cx) / scale;
        const q = (a * a + b * b) / 4;
        const z = (1 - q) / (1 + q);
        const x = a / (1 + q);
        const y = b / (1 + q);
        const de = x * r[0] + y * u[0] + z * f[0];
        const dn = x * r[1] + y * u[1] + z * f[1];
        const du = x * r[2] + y * u[2] + z * f[2];
        // anti-aliased horizon: blend ground and sky over one background pixel
        const pixAng = (sx * (1 + z)) / (2 * scale);
        const tSky = groundOn ? smooth(-pixAng, pixAng, du) : 1;
        let R = 0;
        let G = 0;
        let B = 0;
        if (tSky < 1) {
          // ground: darker away from the horizon, faint warm tint at dusk
          const depth = clamp(-du * 3, 0, 1);
          const gr = lerp(14, 4, depth);
          R = gr + day * lerp(38, 18, depth) + twi * 10;
          G = gr + 2 + day * lerp(42, 22, depth) + twi * 5;
          B = gr + 4 + day * lerp(30, 14, depth);
        }
        if (tSky > 0) {
          const h = clamp(du, 0, 1);
          const hz = Math.pow(1 - h, 3);
          // night sky
          const nr = lerp(2, 10, hz);
          const ng = lerp(4, 18, hz);
          const nb = lerp(12, 38, hz);
          // day sky
          const dr = lerp(40, 150, hz);
          const dg = lerp(100, 195, hz);
          const db = lerp(190, 235, hz);
          let SR = lerp(nr, dr, day);
          let SG = lerp(ng, dg, day);
          let SB = lerp(nb, db, day);
          // glow around the sun
          const cosg = de * sunEnu[0] + dn * sunEnu[1] + du * sunEnu[2];
          const glow = Math.pow(clamp((cosg + 1) / 2, 0, 1), 8);
          if (twi > 0.001) {
            const tw = twi * glow * Math.pow(1 - h, 2.2);
            SR += 230 * tw;
            SG += 110 * tw;
            SB += 40 * tw;
            // blue hour on the opposite side
            SR += 10 * twi * hz;
            SG += 18 * twi * hz;
            SB += 45 * twi * hz;
          }
          if (day > 0.001) {
            const sg = Math.pow(clamp(cosg, 0, 1), 60) * day;
            SR += 120 * sg;
            SG += 110 * sg;
            SB += 80 * sg;
          }
          R = R * (1 - tSky) + SR * tSky;
          G = G * (1 - tSky) + SG * tSky;
          B = B * (1 - tSky) + SB * tSky;
        }
        d[o++] = R > 255 ? 255 : R;
        d[o++] = G > 255 ? 255 : G;
        d[o++] = B > 255 ? 255 : B;
        d[o++] = 255;
      }
    }
    this._bgCtx.putImageData(img, 0, 0);
  }

  // -------------------------------------------------------------- stars

  _drawStars(ctx, cam, M, limMag, P) {
    const sky = this._sky;
    const vec = sky.vec;
    const mag = sky.mag;
    const order = sky.order;
    const groundOn = this._config.show_ground !== false;
    this._starScreen = [];
    const named = this._showLabels ? [] : null;
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const m = mag[i];
      if (m > limMag) continue;
      const vx = vec[i * 3];
      const vy = vec[i * 3 + 1];
      const vz = vec[i * 3 + 2];
      const e = M[0][0] * vx + M[0][1] * vy + M[0][2] * vz;
      const n = M[1][0] * vx + M[1][1] * vy + M[1][2] * vz;
      const up = M[2][0] * vx + M[2][1] * vy + M[2][2] * vz;
      if (groundOn && up < -0.002) continue;
      if (!this._project(e, n, up, cam, P)) continue;
      const x = P[0];
      const y = P[1];
      if (x < -5 || y < -5 || x > this._w + 5 || y > this._h + 5) continue;
      const rel = limMag - m;
      const rad = clamp(0.4 + rel * 0.36, 0.4, 3.6);
      const alphaIdx = clamp(Math.floor(rel * 1.4), 0, 5);
      ctx.fillStyle = sky.palette[sky.bucket[i]][alphaIdx];
      if (rad < 1.0) {
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      } else {
        if (m < 1.0) {
          ctx.save();
          ctx.shadowColor = sky.palette[sky.bucket[i]][5];
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, TWO_PI);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, TWO_PI);
          ctx.fill();
        }
      }
      if (m < 3.5) this._starScreen.push([x, y, i]);
      if (named && sky.names.has(i) && m < (this._view.fov > 120 ? 1.3 : this._view.fov > 60 ? 2.0 : 2.6)) {
        named.push([x, y, sky.names.get(i)]);
      }
    }
    if (named && named.length) {
      ctx.font = "500 10px Roboto, system-ui, sans-serif";
      ctx.fillStyle = "rgba(200,215,240,0.75)";
      ctx.textBaseline = "middle";
      for (const [x, y, name] of named) ctx.fillText(name, x + 6, y + 1);
    }
  }

  _drawConstellations(ctx, cam, M, sunAlt) {
    const sky = this._sky;
    const groundOn = this._config.show_ground !== false;
    const strength = 1 - smooth(-6, 2, sunAlt) * 0.6;
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = `rgba(110,150,210,${(0.42 * strength).toFixed(3)})`;
    ctx.beginPath();
    const A = [0, 0];
    const B = [0, 0];
    const tr = (v) => [
      M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
      M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
      M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
    ];
    for (const line of sky.lines) {
      let prev = tr(line.v[0]);
      for (let k = 1; k < line.v.length; k++) {
        const cur = tr(line.v[k]);
        let p0 = prev;
        let p1 = cur;
        prev = cur;
        if (groundOn) {
          if (p0[2] < 0 && p1[2] < 0) continue;
          if (p0[2] < 0 || p1[2] < 0) {
            const t = p0[2] / (p0[2] - p1[2]);
            const c = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, 0];
            if (p0[2] < 0) p0 = c;
            else p1 = c;
          }
        }
        // subdivide long segments for the curved projection
        const dot = (p0[0] * p1[0] + p0[1] * p1[1] + p0[2] * p1[2]) /
          (Math.hypot(p0[0], p0[1], p0[2]) * Math.hypot(p1[0], p1[1], p1[2]));
        const ang = Math.acos(clamp(dot, -1, 1));
        const steps = Math.max(1, Math.ceil(ang / (6 * DEG)));
        let okPrev = this._project(p0[0], p0[1], p0[2], cam, A);
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t];
          const okCur = this._project(q[0], q[1], q[2], cam, B);
          if (okPrev && okCur && Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) < this._w) {
            ctx.moveTo(A[0], A[1]);
            ctx.lineTo(B[0], B[1]);
          }
          A[0] = B[0];
          A[1] = B[1];
          okPrev = okCur;
        }
      }
    }
    ctx.stroke();

    if (this._config.show_constellation_names !== false && this._showLabels) {
      const maxRank = this._view.fov > 140 ? 1 : this._view.fov > 70 ? 2 : 3;
      ctx.font = "600 9px Roboto, system-ui, sans-serif";
      ctx.fillStyle = `rgba(212,175,55,${(0.55 * strength).toFixed(3)})`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const c of sky.cons) {
        if (c.rank > maxRank) continue;
        const p = tr(c.v);
        if (groundOn && p[2] < 0.03) continue;
        if (!this._project(p[0], p[1], p[2], cam, A)) continue;
        if (A[0] < 0 || A[1] < 0 || A[0] > this._w || A[1] > this._h) continue;
        ctx.fillText(c.name.toUpperCase(), A[0], A[1]);
      }
      ctx.textAlign = "left";
    }
  }

  // -------------------------------------------------------- solar system

  _drawSolarSystem(ctx, cam, obs, jd, sun, sunEnu, sunAlt, limMag, P) {
    const groundOn = this._config.show_ground !== false;
    const pxPerRad = (ang) => ang * cam.scale; // approx near centre
    const labels = [];

    // planets
    for (const p of planetPositions(jd)) {
      if (p.mag > limMag + 1.5 && p.mag > -3.5) continue;
      const enu = this._toEnu(obs, p.dir);
      if (groundOn && enu[2] < -0.002) continue;
      if (!this._project(enu[0], enu[1], enu[2], cam, P)) continue;
      const rad = clamp(2.8 - p.mag * 0.35, 1.6, 4.5);
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(P[0], P[1], rad, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
      labels.push([P[0], P[1], p.name, rad]);
      this._bodies.push({ type: "planet", name: p.name, x: P[0], y: P[1], enu, mag: p.mag, dist: p.dist });
    }

    // Moon
    const moon = moonPosition(jd);
    const mEnu = this._toEnu(obs, moon.dir);
    if ((!groundOn || mEnu[2] > -0.01) && this._project(mEnu[0], mEnu[1], mEnu[2], cam, P)) {
      const rad = Math.max(7, pxPerRad(0.26 * DEG) * 2);
      const cosEl = sun.dir[0] * moon.dir[0] + sun.dir[1] * moon.dir[1] + sun.dir[2] * moon.dir[2];
      const illum = (1 - cosEl) / 2;
      // direction to the sun on screen
      const S = [0, 0];
      let angle = 0;
      const sOk = this._project(
        mEnu[0] + (sunEnu[0] - mEnu[0]) * 0.02,
        mEnu[1] + (sunEnu[1] - mEnu[1]) * 0.02,
        mEnu[2] + (sunEnu[2] - mEnu[2]) * 0.02,
        cam,
        S
      );
      if (sOk) angle = Math.atan2(S[1] - P[1], S[0] - P[0]);
      this._drawMoon(ctx, P[0], P[1], rad, illum, angle);
      labels.push([P[0], P[1], "Moon", rad]);
      this._bodies.push({ type: "moon", name: "Moon", x: P[0], y: P[1], enu: mEnu, illum, angle, dist: moon.dist });
    }

    // Sun
    if ((!groundOn || sunEnu[2] > -0.01) && this._project(sunEnu[0], sunEnu[1], sunEnu[2], cam, P)) {
      const rad = Math.max(8, pxPerRad(0.267 * DEG) * 2);
      const g = ctx.createRadialGradient(P[0], P[1], rad * 0.3, P[0], P[1], rad * 5);
      g.addColorStop(0, "rgba(255,248,220,0.9)");
      g.addColorStop(1, "rgba(255,230,160,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(P[0], P[1], rad * 5, 0, TWO_PI);
      ctx.fill();
      ctx.fillStyle = "#fffbe8";
      ctx.beginPath();
      ctx.arc(P[0], P[1], rad, 0, TWO_PI);
      ctx.fill();
      labels.push([P[0], P[1], "Sun", rad]);
      this._bodies.push({ type: "sun", name: "Sun", x: P[0], y: P[1], enu: sunEnu, dist: sun.dist });
    }

    if (this._showLabels) {
      ctx.font = "600 11px Roboto, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,236,190,0.9)";
      ctx.textBaseline = "middle";
      // place labels without overlap: try right, left, above, below of the body
      const boxes = labels.map(([x, y, , rad]) => [x - rad - 1, y - rad - 1, x + rad + 1, y + rad + 1]);
      const hit = (b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
      for (const [x, y, name, rad] of labels) {
        const tw = ctx.measureText(name).width;
        const gap = rad + 5;
        const cands = [
          [x + gap, y, "left"],
          [x - gap, y, "right"],
          [x, y - gap - 6, "center"],
          [x, y + gap + 6, "center"],
          [x + gap, y - 13, "left"],
          [x + gap, y + 13, "left"],
        ];
        let pick = cands[0];
        let box = null;
        for (const c of cands) {
          const x0 = c[2] === "left" ? c[0] : c[2] === "right" ? c[0] - tw : c[0] - tw / 2;
          const b = [x0 - 2, c[1] - 7, x0 + tw + 2, c[1] + 7];
          if (b[0] >= 2 && b[2] <= this._w - 2 && !hit(b)) {
            pick = c;
            box = b;
            break;
          }
        }
        if (!box) {
          const x0 = pick[0];
          box = [x0 - 2, pick[1] - 7, x0 + tw + 2, pick[1] + 7];
        }
        boxes.push(box);
        ctx.textAlign = pick[2];
        ctx.fillText(name, pick[0], pick[1]);
      }
      ctx.textAlign = "left";
    }
  }

  _drawMoon(ctx, x, y, r, illum, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // dark disc
    ctx.fillStyle = "rgba(40,42,48,0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.fill();
    // lit half towards +x (the sun) and the terminator ellipse
    const k = 2 * illum - 1; // -1 new .. +1 full
    ctx.fillStyle = "#f4f1e6";
    ctx.shadowColor = "rgba(255,250,230,0.6)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k < 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // --------------------------------------------------------------- globe

  /** camera for the globe view: Earth fixed (ECEF), seen from above glat/glon */
  _globeFrame(theta) {
    const v = this._view;
    const la = v.glat * DEG;
    const lo = v.glon * DEG;
    const view = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    const east = [-Math.sin(lo), Math.cos(lo), 0];
    const north = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
    const R = Math.min(this._w, this._h) * 0.3 * v.gz;
    return { view, east, north, R, k: R / 6371, cx: this._w / 2, cy: this._h / 2, c: Math.cos(theta), s: Math.sin(theta) };
  }

  /** ECI position (km) to screen; false when hidden behind the Earth */
  _globeProject(G, x, y, z, out, noHide) {
    const xe = G.c * x + G.s * y;
    const ye = -G.s * x + G.c * y;
    const X = xe * G.east[0] + ye * G.east[1] + z * G.east[2];
    const Y = xe * G.north[0] + ye * G.north[1] + z * G.north[2];
    const D = xe * G.view[0] + ye * G.view[1] + z * G.view[2];
    out[0] = G.cx + X * G.k;
    out[1] = G.cy - Y * G.k;
    if (noHide) return true;
    return !(D < 0 && X * X + Y * Y < 6371 * 6371);
  }

  _drawGlobeStars(ctx, G, jd, theta, P) {
    const sky = this._sky;
    const prec = this._precFor(jd);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    // J2000 -> ECEF rows
    const rowE = (row) => [
      row[0] * c + row[1] * s,
      -row[0] * s + row[1] * c,
      row[2],
    ];
    const pe = [rowE([prec[0][0], prec[1][0], prec[2][0]]), rowE([prec[0][1], prec[1][1], prec[2][1]]), rowE([prec[0][2], prec[1][2], prec[2][2]])];
    // pe[j] = ECEF image of J2000 axis j
    const S = Math.max(this._w, this._h) * 0.55;
    const R2 = G.R * G.R * 1.05;
    for (let k = 0; k < sky.order.length; k++) {
      const i = sky.order[k];
      const m = sky.mag[i];
      if (m > 5.2) continue;
      const vx = sky.vec[i * 3];
      const vy = sky.vec[i * 3 + 1];
      const vz = sky.vec[i * 3 + 2];
      const d0 = pe[0][0] * vx + pe[1][0] * vy + pe[2][0] * vz;
      const d1 = pe[0][1] * vx + pe[1][1] * vy + pe[2][1] * vz;
      const d2 = pe[0][2] * vx + pe[1][2] * vy + pe[2][2] * vz;
      const f = -(d0 * G.view[0] + d1 * G.view[1] + d2 * G.view[2]);
      if (f < 0.2) continue;
      const X = ((d0 * G.east[0] + d1 * G.east[1] + d2 * G.east[2]) / f) * S;
      const Y = ((d0 * G.north[0] + d1 * G.north[1] + d2 * G.north[2]) / f) * S;
      if (X * X + Y * Y < R2) continue;
      const x = G.cx + X;
      const y = G.cy - Y;
      if (x < 0 || y < 0 || x > this._w || y > this._h) continue;
      const rel = 5.2 - m;
      const rad = clamp(0.35 + rel * 0.3, 0.35, 2.4);
      ctx.fillStyle = sky.palette[sky.bucket[i]][clamp(Math.floor(rel * 1.2), 0, 5)];
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  _maybeLoadEarth() {
    if (SHARED.earth || SHARED.earthPromise || !this._hass || Date.now() < SHARED.earthRetryAt) return;
    SHARED.earthPromise = loadEarth(this._hass)
      .then((earth) => {
        SHARED.earth = earth;
        this._earthKey = null;
      })
      .catch(() => {
        // not downloaded yet or offline: keep the outline globe, try again later
        SHARED.earthRetryAt = Date.now() + 120000;
      })
      .finally(() => {
        SHARED.earthPromise = null;
      });
  }

  /** NASA imagery globe, re-rendered when the view or the sun moves */
  _globeTexture(G, sunE) {
    const size = clamp(Math.round(2 * G.R * Math.min(this._dpr, 1.5)), 64, 760);
    const key = `${size}|${G.view.map((x) => x.toFixed(4)).join(",")}|${sunE.map((x) => x.toFixed(3)).join(",")}`;
    if (this._earthCanvas && this._earthKey === key) return this._earthCanvas;
    this._earthCanvas = this._earthCanvas || document.createElement("canvas");
    renderEarth(this._earthCanvas, SHARED.earth, G, sunE, size);
    this._earthKey = key;
    return this._earthCanvas;
  }

  _drawGlobe(ctx, G, sunDir, theta, lat, lon) {
    const { cx, cy, R } = G;
    const earth = SHARED.earth;
    // atmosphere
    const ag = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.13);
    ag.addColorStop(0, "rgba(120,180,255,0.45)");
    ag.addColorStop(0.35, "rgba(80,140,255,0.16)");
    ag.addColorStop(1, "rgba(60,120,255,0)");
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.13, 0, TWO_PI);
    ctx.fill();
    if (earth) {
      const sunE0 = [sunDir[0] * G.c + sunDir[1] * G.s, -sunDir[0] * G.s + sunDir[1] * G.c, sunDir[2]];
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TWO_PI);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this._globeTexture(G, sunE0), cx - R, cy - R, 2 * R, 2 * R);
      ctx.restore();
      this._drawHome(ctx, G, lat, lon);
      return;
    }
    // ocean
    const og = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    og.addColorStop(0, "#245a9c");
    og.addColorStop(0.6, "#0f3166");
    og.addColorStop(1, "#06152e");
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TWO_PI);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TWO_PI);
    ctx.clip();

    // graticule every 30 degrees
    ctx.strokeStyle = "rgba(160,200,255,0.10)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const plot = (la, lo, first) => {
      const v0 = Math.cos(la) * Math.cos(lo);
      const v1 = Math.cos(la) * Math.sin(lo);
      const v2 = Math.sin(la);
      const D = v0 * G.view[0] + v1 * G.view[1] + v2 * G.view[2];
      const X = v0 * G.east[0] + v1 * G.east[1] + v2 * G.east[2];
      const Y = v0 * G.north[0] + v1 * G.north[1] + v2 * G.north[2];
      if (D < 0) return false;
      if (first) ctx.moveTo(cx + X * R, cy - Y * R);
      else ctx.lineTo(cx + X * R, cy - Y * R);
      return true;
    };
    for (let la = -60; la <= 60; la += 30) {
      let pen = false;
      for (let lo = -180; lo <= 180; lo += 4) pen = plot(la * DEG, lo * DEG, !pen) || false;
    }
    for (let lo = -180; lo < 180; lo += 30) {
      let pen = false;
      for (let la = -88; la <= 88; la += 4) pen = plot(la * DEG, lo * DEG, !pen) || false;
    }
    ctx.stroke();

    // land masses, faint
    const land = this._sky && this._sky.land;
    if (land && land.length) {
      ctx.fillStyle = "rgba(150,195,150,0.30)";
      ctx.strokeStyle = "rgba(200,235,200,0.38)";
      ctx.lineWidth = 0.8;
      ctx.lineJoin = "round";
      const vw = G.view;
      const ea = G.east;
      const no = G.north;
      for (const rings of land) {
        let front = false;
        ctx.beginPath();
        for (const v of rings) {
          const n = v.length / 3;
          for (let k = 0; k < n; k++) {
            const a = v[k * 3];
            const b = v[k * 3 + 1];
            const c = v[k * 3 + 2];
            const D = a * vw[0] + b * vw[1] + c * vw[2];
            let X = a * ea[0] + b * ea[1] + c * ea[2];
            let Y = a * no[0] + b * no[1] + c * no[2];
            if (D < 0) {
              // points on the far side are pushed onto the limb
              const h = Math.hypot(X, Y) || 1;
              X /= h;
              Y /= h;
            } else {
              front = true;
            }
            if (k === 0) ctx.moveTo(cx + X * R, cy - Y * R);
            else ctx.lineTo(cx + X * R, cy - Y * R);
          }
          ctx.closePath();
        }
        if (!front) continue;
        ctx.fill("evenodd");
        ctx.stroke();
      }
    }

    // night side
    const sunE = [sunDir[0] * G.c + sunDir[1] * G.s, -sunDir[0] * G.s + sunDir[1] * G.c, sunDir[2]];
    const shade = this._globeShade(G, sunE);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shade, cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();

    // limb highlight
    ctx.strokeStyle = "rgba(150,200,255,0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TWO_PI);
    ctx.stroke();

    this._drawHome(ctx, G, lat, lon);
  }

  _drawHome(ctx, G, lat, lon) {
    const { cx, cy, R } = G;
    // home marker
    const la = lat * DEG;
    const lo = lon * DEG;
    const h = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    const D = h[0] * G.view[0] + h[1] * G.view[1] + h[2] * G.view[2];
    if (D > 0) {
      const x = cx + (h[0] * G.east[0] + h[1] * G.east[1] + h[2] * G.east[2]) * R;
      const y = cy - (h[0] * G.north[0] + h[1] * G.north[1] + h[2] * G.north[2]) * R;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, TWO_PI);
      ctx.stroke();
      ctx.fillStyle = GOLD;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, TWO_PI);
      ctx.fill();
      if (this._showLabels) {
        ctx.font = "600 11px Roboto, system-ui, sans-serif";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,233,168,0.95)";
        ctx.fillText("Home", x + 10, y);
      }
    }
  }

  /** low resolution day/night overlay, cached while the view and sun stay put */
  _globeShade(G, sunE) {
    const size = clamp(Math.round(G.R / 2), 32, 260);
    const key = `${size}|${G.view.map((x) => x.toFixed(3)).join(",")}|${sunE.map((x) => x.toFixed(3)).join(",")}`;
    if (this._shade && this._shadeKey === key) return this._shade;
    const c = this._shade || document.createElement("canvas");
    c.width = size;
    c.height = size;
    const sctx = c.getContext("2d");
    const img = sctx.createImageData(size, size);
    const d = img.data;
    let o = 0;
    for (let j = 0; j < size; j++) {
      const y = 1 - ((j + 0.5) / size) * 2;
      for (let i = 0; i < size; i++) {
        const x = ((i + 0.5) / size) * 2 - 1;
        const q = x * x + y * y;
        let a = 0;
        if (q < 1) {
          const z = Math.sqrt(1 - q);
          const n0 = x * G.east[0] + y * G.north[0] + z * G.view[0];
          const n1 = x * G.east[1] + y * G.north[1] + z * G.view[1];
          const n2 = x * G.east[2] + y * G.north[2] + z * G.view[2];
          const dot = n0 * sunE[0] + n1 * sunE[1] + n2 * sunE[2];
          a = 0.66 * (1 - smooth(-0.1, 0.08, dot));
        }
        d[o++] = 2;
        d[o++] = 4;
        d[o++] = 14;
        d[o++] = Math.round(a * 255);
      }
    }
    sctx.putImageData(img, 0, 0);
    this._shade = c;
    this._shadeKey = key;
    return c;
  }

  // ------------------------------------------------------------- horizon

  _drawHorizon(ctx, cam, P) {
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(212,175,55,0.55)";
    ctx.beginPath();
    let started = false;
    let lastX = 0;
    for (let a = 0; a <= 360; a += 2) {
      const r = a * DEG;
      const ok = this._project(Math.sin(r), Math.cos(r), 0, cam, P);
      if (!ok) {
        started = false;
        continue;
      }
      if (!started || Math.abs(P[0] - lastX) > this._w / 2) {
        ctx.moveTo(P[0], P[1]);
        started = true;
      } else {
        ctx.lineTo(P[0], P[1]);
      }
      lastX = P[0];
    }
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [label, az] of CARDINALS) {
      const r = az * DEG;
      const elev = 2.5 * DEG;
      if (!this._project(Math.sin(r) * Math.cos(elev), Math.cos(r) * Math.cos(elev), Math.sin(elev), cam, P)) continue;
      if (P[0] < 8 || P[1] < 8 || P[0] > this._w - 8 || P[1] > this._h - 8) continue;
      ctx.fillStyle = label.length === 1 ? GOLD : "rgba(212,175,55,0.6)";
      ctx.font = label.length === 1 ? "700 13px Roboto, system-ui, sans-serif" : "600 10px Roboto, system-ui, sans-serif";
      ctx.fillText(label, P[0], P[1]);
    }
    ctx.restore();
  }

  // ----------------------------------------------------------- satellites

  _drawSatellites(ctx, cam, obs, sunDir, dark, P, simMs, jd) {
    const cat = this._cat;
    const n = cat.n;
    const pos = this._pos;
    const vel = this._vel;
    const st = this._sampleT;
    const valid = this._valid;
    const sx = this._sx;
    const sy = this._sy;
    const op = obs.pos;
    const E = obs.east;
    const N = obs.north;
    const U = obs.up;
    const groundOn = this._config.show_ground !== false;
    const hidden = this._hidden;
    const visibleOnly = this._visibleOnly;
    const groups = cat.groups.length;
    // buckets per group and state: 0 visible, 1 sunlit, 2 shadow
    const buckets = this._buckets || (this._buckets = []);
    for (let g = 0; g < groups * 3; g++) {
      if (!buckets[g]) buckets[g] = [];
      buckets[g].length = 0;
    }
    const labels = [];
    let above = 0;
    let visible = 0;
    const r = [0, 0, 0];
    const icons = this._config.satellite_icons !== false;
    const sa = this._sa;
    const G = this._G;
    const Q = this._q || (this._q = new Float64Array(2));
    for (let i = 0; i < n; i++) {
      sx[i] = -1e6;
      if (!valid[i]) continue;
      const o = i * 3;
      const dt = (simMs - st[i]) / 1000;
      const px = pos[o];
      const py = pos[o + 1];
      const pz = pos[o + 2];
      const rr = Math.sqrt(px * px + py * py + pz * pz);
      const ac = (-EARTH_MU / (rr * rr * rr)) * 0.5 * dt * dt;
      r[0] = px + vel[o] * dt + px * ac;
      r[1] = py + vel[o + 1] * dt + py * ac;
      r[2] = pz + vel[o + 2] * dt + pz * ac;
      const dx = r[0] - op[0];
      const dy = r[1] - op[1];
      const dz = r[2] - op[2];
      const up = dx * U[0] + dy * U[1] + dz * U[2];
      if (up <= 0 && groundOn && !G) continue;
      const g = cat.group[i];
      const lit = isSunlit(r, sunDir);
      // naked-eye visibility: sunlit, dark sky and not too far away (GEO/GNSS are far too faint)
      const eyeVisible = lit && dark && rr < 6371 + 2000 && !this._groupNoEye[g];
      if (up > 0) {
        above++;
        if (eyeVisible) visible++;
      }
      if (hidden.has(g)) continue;
      // in the globe view only satellites above the home horizon count as visible
      const state = lit ? (eyeVisible && (!G || up > 0) ? 0 : 1) : 2;
      if (visibleOnly && state !== 0 && !cat.tracked.has(cat.norad[i])) continue;
      if (G) {
        if (!this._globeProject(G, r[0], r[1], r[2], P)) continue;
      } else {
        const e = dx * E[0] + dy * E[1] + dz * E[2];
        const nn = dx * N[0] + dy * N[1] + dz * N[2];
        if (!this._project(e, nn, up, cam, P)) continue;
      }
      if (P[0] < -4 || P[1] < -4 || P[0] > this._w + 4 || P[1] > this._h + 4) continue;
      sx[i] = P[0];
      sy[i] = P[1];
      if (icons && G) {
        this._globeProject(G, r[0] + vel[o] * 20, r[1] + vel[o + 1] * 20, r[2] + vel[o + 2] * 20, Q, true);
        sa[i] = Math.atan2(Q[1] - P[1], Q[0] - P[0]);
      } else if (icons) {
        // screen heading: project the position 20 s ahead
        const ex = dx + vel[o] * 20;
        const ey = dy + vel[o + 1] * 20;
        const ez = dz + vel[o + 2] * 20;
        const e2 = ex * E[0] + ey * E[1] + ez * E[2];
        const n2 = ex * N[0] + ey * N[1] + ez * N[2];
        const u2 = ex * U[0] + ey * U[1] + ez * U[2];
        if (this._project(e2, n2, u2, cam, Q)) sa[i] = Math.atan2(Q[1] - P[1], Q[0] - P[0]);
      }
      buckets[g * 3 + state].push(i);
      if (cat.tracked.has(cat.norad[i])) labels.push(i);
    }

    // icons need a few hundred drawImage calls; fall back to dots when the
    // whole catalogue is on screen (ground hidden) to keep the frame budget
    let onScreen = 0;
    for (let b = 0; b < groups * 3; b++) if (!this._groupDots[Math.floor(b / 3)]) onScreen += buckets[b].length;
    const drawIcons = icons && onScreen <= 1800;
    if (drawIcons) this._drawSatIcons(ctx, buckets, groups);

    // draw: shadow first, then sunlit, then visible
    for (const state of [2, 1, 0]) {
      for (let g = 0; g < groups; g++) {
        const list = buckets[g * 3 + state];
        if (!list.length) continue;
        const style = this._groupStyles[g];
        ctx.fillStyle = state === 0 ? style.vis : state === 1 ? style.lit : style.dim;
        const dots = !drawIcons || this._groupDots[g];
        if (dots) {
          const s = (state === 0 ? 2.8 : state === 1 ? 2.2 : 1.6) * (G ? 0.7 : 1);
          const h = s / 2;
          for (let k = 0; k < list.length; k++) {
            const i = list[k];
            ctx.fillRect(sx[i] - h, sy[i] - h, s, s);
          }
        }
        if (state === 0 && dots) {
          // soft glow for naked-eye visible satellites
          ctx.save();
          ctx.globalAlpha = 0.18;
          for (let k = 0; k < list.length; k++) {
            const i = list[k];
            ctx.beginPath();
            ctx.arc(sx[i], sy[i], 4.5, 0, TWO_PI);
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }

    // selected satellite: orbit track
    if (this._selected && this._selected.type === "sat") {
      this._drawTrack(ctx, cam, obs, jd, P);
    }

    // tracked satellites: marker + label
    ctx.font = "600 11px Roboto, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (const i of labels) {
      const x = sx[i];
      const y = sy[i];
      let lx = 10;
      if (drawIcons) {
        const L = this._iconLength(this._kind[i], true);
        ctx.strokeStyle = "rgba(212,175,55,0.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, L * 0.62 + 3, 0, TWO_PI);
        ctx.stroke();
        lx = L * 0.62 + 8;
      } else {
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, TWO_PI);
        ctx.stroke();
        ctx.fillStyle = "#ffe9a8";
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, TWO_PI);
        ctx.fill();
      }
      if (this._showLabels) {
        ctx.fillStyle = "rgba(255,233,168,0.95)";
        ctx.fillText(this._shortName(cat.names[i]), x + lx, y);
      }
    }

    // selection ring
    if (this._selected && this._selected.type === "sat") {
      const i = this._selected.index;
      if (sx[i] > -1e5) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx[i], sy[i], 9, 0, TWO_PI);
        ctx.stroke();
        // tracked satellites already carry their name
        if (!cat.tracked.has(cat.norad[i])) {
          ctx.fillStyle = "#ffffff";
          ctx.fillText(this._shortName(cat.names[i]), sx[i] + 13, sy[i] - 10);
        }
      }
    }
    return [above, visible];
  }

  /** icon length in px for the current zoom */
  _iconLength(kind, tracked) {
    const zoom = this._view.mode === "globe" ? 0.85 * Math.pow(this._view.gz, 0.7) : Math.pow(120 / this._view.fov, 0.85);
    const small = Math.min(this._w, this._h) < 520 ? 0.85 : 1;
    const station = isStationKind(kind);
    let base = station ? 26 : kind === KIND_FLAT ? 11 : 12;
    if (tracked) base *= 1.15;
    const max = station ? 110 : 64;
    return Math.round(clamp(base * zoom * small, station ? 18 : 7, max));
  }

  _drawSatIcons(ctx, buckets, groups) {
    const cat = this._cat;
    const sx = this._sx;
    const sy = this._sy;
    const sa = this._sa;
    const kinds = this._kind;
    const dpr = this._dpr;
    const lens = [this._iconLength(0, false), this._iconLength(1, false), this._iconLength(2, true), this._iconLength(3, true)];
    const visLens = lens.map((l) => Math.round(l * 1.2));
    for (const state of [2, 1, 0]) {
      ctx.globalAlpha = state === 2 ? 0.38 : state === 1 ? 0.88 : 1;
      for (let g = 0; g < groups; g++) {
        const list = buckets[g * 3 + state];
        if (!list.length || this._groupDots[g]) continue;
        const color = cat.groups[g].color;
        for (let k = 0; k < list.length; k++) {
          const i = list[k];
          const kind = kinds[i];
          const tracked = cat.tracked.has(cat.norad[i]);
          const L = tracked ? this._iconLength(kind, true) : state === 0 ? visLens[kind] : lens[kind];
          const sp = satSprite(kind, color, L, dpr, state === 0 ? 2 : state === 1 ? 1 : 0);
          const a = sa[i];
          const c = Math.cos(a);
          const s = Math.sin(a);
          ctx.setTransform(c * dpr, s * dpr, -s * dpr, c * dpr, sx[i] * dpr, sy[i] * dpr);
          ctx.drawImage(sp.canvas, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _shortName(name) {
    const m = /^(.*?)\s*\((.*)\)$/.exec(name || "");
    if (m && m[1].length <= 4 && m[2]) return `${m[1]} (${m[2].charAt(0)}${m[2].slice(1).toLowerCase()})`;
    return name;
  }

  _drawTrack(ctx, cam, obs, jd, P) {
    const i = this._selected.index;
    const rec = this._cat.recs[i];
    if (!rec) return;
    const tmp = new Float64Array(6);
    const span = this._G ? 50 : 12; // minutes before/after
    const lat = Number(this._config.latitude ?? this._hass.config.latitude);
    const lon = Number(this._config.longitude ?? this._hass.config.longitude);
    const altKm = Number(this._hass.config.elevation || 0) / 1000;
    const past = [];
    const future = [];
    for (let m = -span; m <= span + 1e-9; m += this._G ? 1 : 0.25) {
      const jdm = jd + m / 1440;
      let pt = null;
      if (this._G && sgp4(rec, (jdm - rec.epochJd) * 1440, tmp, 0)) {
        const th = gmst(jdm);
        const G = { ...this._G, c: Math.cos(th), s: Math.sin(th) };
        if (this._globeProject(G, tmp[0], tmp[1], tmp[2], P)) pt = [P[0], P[1]];
      } else if (!this._G && sgp4(rec, (jdm - rec.epochJd) * 1440, tmp, 0)) {
        // the observer rotates with the earth
        const o2 = observerFrame(lat, lon, altKm, gmst(jdm));
        const dx = tmp[0] - o2.pos[0];
        const dy = tmp[1] - o2.pos[1];
        const dz = tmp[2] - o2.pos[2];
        const e = dx * o2.east[0] + dy * o2.east[1] + dz * o2.east[2];
        const n = dx * o2.north[0] + dy * o2.north[1] + dz * o2.north[2];
        const up = dx * o2.up[0] + dy * o2.up[1] + dz * o2.up[2];
        const rng = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if ((up / rng > -0.002 || this._config.show_ground === false) && this._project(e, n, up, cam, P)) pt = [P[0], P[1]];
      }
      if (m <= 0) past.push(pt);
      if (m >= 0) future.push(pt);
    }
    const stroke = (pts, style, dash) => {
      ctx.strokeStyle = style;
      ctx.setLineDash(dash);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      let prev = null;
      for (const pt of pts) {
        if (pt && prev && Math.abs(pt[0] - prev[0]) + Math.abs(pt[1] - prev[1]) < this._w / 2) {
          ctx.lineTo(pt[0], pt[1]);
        } else if (pt) {
          ctx.moveTo(pt[0], pt[1]);
        }
        prev = pt;
      }
      ctx.stroke();
    };
    stroke(past, "rgba(255,255,255,0.25)", [3, 4]);
    stroke(future, "rgba(255,255,255,0.6)", []);
    ctx.setLineDash([]);
  }

  // ----------------------------------------------------------------- HUD

  _updateHud(simMs, above, visible, sunAlt) {
    const tz = this._hass?.config?.time_zone;
    const sec = Math.floor(simMs / 1000);
    if (sec !== this._hudSec) {
      this._hudSec = sec;
      let txt;
      try {
        const narrow = this._w < 480;
        txt = new Intl.DateTimeFormat(this._hass?.locale?.language || "en", {
          weekday: narrow ? undefined : "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          second: "2-digit", hour12: false, timeZone: tz || undefined,
        }).format(new Date(simMs));
      } catch (_e) {
        txt = new Date(simMs).toLocaleString();
      }
      const live = this._sim.warp === 1 && Math.abs(simMs - Date.now()) < 3000;
      this._els.clock.innerHTML = `${escapeHtml(txt)}${live ? "" : `<span class="sim">${this._w < 480 ? "SIM" : "SIMULATED"}</span>`}`;
    }
    const key = `${above}|${visible}|${Math.round(sunAlt)}`;
    if (key !== this._statsKey) {
      this._statsKey = key;
      const sunTxt = sunAlt > 0 ? "Daylight" : sunAlt > -6 ? "Civil twilight" : sunAlt > -12 ? "Nautical twilight" : sunAlt > -18 ? "Astronomical twilight" : "Night";
      this._els.stats.innerHTML = this._cat
        ? this._w < 480
          ? `<div><b>${above}</b> up · <b>${visible}</b> visible</div><div style="color:#9c947c">${sunTxt}</div>`
          : `<div><b>${above}</b> above horizon</div><div><b>${visible}</b> visible to the eye</div><div style="color:#9c947c">${sunTxt}</div>`
        : `<div style="color:#9c947c">${sunTxt}</div>`;
    }
  }

  _renderChips() {
    if (!this._cat) return;
    const html = [];
    this._cat.groups.forEach((g, i) => {
      const off = this._hidden.has(i);
      html.push(
        `<button data-group="${i}" class="${off ? "off" : ""}"><span class="dot" style="background:${g.color};color:${g.color}"></span>${escapeHtml(g.name)} <span class="cnt">${this._groupCounts[i]}</span></button>`
      );
    });
    html.push(`<button data-toggle="visible" class="${this._visibleOnly ? "on" : ""}"><ha-icon icon="mdi:eye-outline"></ha-icon>Visible only</button>`);
    html.push(`<button data-toggle="lines" class="${this._showLines ? "on" : ""}"><ha-icon icon="mdi:vector-polyline"></ha-icon>Constellations</button>`);
    html.push(`<button data-toggle="labels" class="${this._showLabels ? "on" : ""}"><ha-icon icon="mdi:label-outline"></ha-icon>Labels</button>`);
    this._els.chips.innerHTML = html.join("");
  }

  _updateControls() {
    if (!this._els) return;
    const w = this._sim.warp;
    this._els.warp.textContent = w === 0 ? "pause" : `${w}x`;
    const next = { dome: "Horizon", horizon: "Globe", globe: "Dome" };
    this._els.vlabel.textContent = next[this._view.mode] || "Dome";
    if (this._els.night) {
      this._els.night.classList.toggle("on", !!this._forceNight);
      this._els.night.style.display = this._view.mode === "globe" ? "none" : "";
    }
  }

  _onChip(ev) {
    const btn = ev.target.closest("button");
    if (!btn) return;
    if (btn.dataset.group !== undefined) {
      const g = Number(btn.dataset.group);
      if (this._hidden.has(g)) this._hidden.delete(g);
      else this._hidden.add(g);
    } else if (btn.dataset.toggle === "visible") {
      this._visibleOnly = !this._visibleOnly;
    } else if (btn.dataset.toggle === "lines") {
      this._showLines = !this._showLines;
    } else if (btn.dataset.toggle === "labels") {
      this._showLabels = !this._showLabels;
    }
    this._renderChips();
  }

  _onControl(ev) {
    const btn = ev.target.closest("button");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "slower") this._setWarp(this._sim.warpIdx - 1);
    else if (act === "faster") this._setWarp(this._sim.warpIdx + 1);
    else if (act === "now") this._goLive();
    else if (act === "zoomin") this._zoom(1 / 1.35);
    else if (act === "zoomout") this._zoom(1.35);
    else if (act === "view") {
      const az = this._view.az || 180;
      if (this._view.mode === "dome") this._view = { az, alt: 12, fov: 110, mode: "horizon" };
      else if (this._view.mode === "horizon") this._view = this._globeView();
      else this._view = { az: Number(this._config.azimuth ?? 180), alt: 90, fov: 182, mode: "dome" };
      this._bgDirty = true;
      this._updateControls();
    } else if (act === "night") {
      this._forceNight = !this._forceNight;
      this._bgDirty = true;
      this._updateControls();
    } else if (act === "full") {
      if (document.fullscreenElement) document.exitFullscreen();
      else this._els.wrap.requestFullscreen?.().then(() => setTimeout(() => this._resize(), 100));
    }
  }

  _zoom(factor) {
    if (this._view.mode === "globe") this._view.gz = clamp(this._view.gz / factor, 0.25, 14);
    else this._view.fov = clamp(this._view.fov * factor, 8, 200);
  }

  // ------------------------------------------------------------- pointer

  _bindPointer() {
    const c = this._els.canvas;
    const pts = new Map();
    let drag = null;
    let pinch = null;
    c.addEventListener("pointerdown", (ev) => {
      c.setPointerCapture(ev.pointerId);
      pts.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
      this._active = true;
      if (pts.size === 1) {
        drag = { x: ev.offsetX, y: ev.offsetY, az: this._view.az, alt: this._view.alt, glat: this._view.glat, glon: this._view.glon, moved: false };
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), fov: this._view.fov, gz: this._view.gz };
        drag = null;
      }
    });
    c.addEventListener("pointermove", (ev) => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, [ev.offsetX, ev.offsetY]);
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d > 10 && this._view.mode === "globe") this._view.gz = clamp((pinch.gz * d) / pinch.d, 0.25, 14);
        else if (d > 10) this._view.fov = clamp((pinch.fov * pinch.d) / d, 8, 200);
        return;
      }
      if (!drag) return;
      const dx = ev.offsetX - drag.x;
      const dy = ev.offsetY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        drag.moved = true;
        c.classList.add("dragging");
      }
      if (!drag.moved) return;
      const degPerPx = this._view.fov / Math.min(this._w, this._h);
      if (this._view.mode === "globe") {
        const R = this._G ? this._G.R : Math.min(this._w, this._h) * 0.3;
        this._view.glon = drag.glon - (dx / R) / DEG;
        this._view.glat = clamp(drag.glat + (dy / R) / DEG, -85, 85);
        return;
      }
      if (this._view.mode === "dome" && this._view.alt > 89) {
        // rotate the dome around the zenith
        const cx = this._w / 2;
        const cy = this._h / 2;
        const a0 = Math.atan2(drag.y - cy, drag.x - cx);
        const a1 = Math.atan2(ev.offsetY - cy, ev.offsetX - cx);
        this._view.az = (((drag.az - (a1 - a0) / DEG) % 360) + 360) % 360;
      } else {
        this._view.az = (((drag.az - dx * degPerPx) % 360) + 360) % 360;
        this._view.alt = clamp(drag.alt + dy * degPerPx, -10, 90);
        if (this._view.mode === "dome") this._view.mode = "horizon";
      }
    });
    const end = (ev) => {
      const wasTap = drag && !drag.moved && pts.size === 1;
      pts.delete(ev.pointerId);
      if (pts.size < 2) pinch = null;
      c.classList.remove("dragging");
      if (wasTap && ev.type === "pointerup") this._pick(ev.offsetX, ev.offsetY, ev.pointerType === "touch" ? 22 : 12);
      if (pts.size === 0) drag = null;
      this._updateControls();
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => {
      this._active = false;
    });
    c.addEventListener(
      "wheel",
      (ev) => {
        if (!this._active && !ev.ctrlKey && !document.fullscreenElement) return;
        ev.preventDefault();
        this._zoom(Math.exp(ev.deltaY * 0.0012));
      },
      { passive: false }
    );
    document.addEventListener("fullscreenchange", () => setTimeout(() => this._resize(), 50));
  }

  _pick(x, y, radius) {
    let best = null;
    let bestD = radius * radius;
    if (this._cat) {
      const sx = this._sx;
      const sy = this._sy;
      for (let i = 0; i < this._cat.n; i++) {
        if (sx[i] < -1e5) continue;
        const d = (sx[i] - x) ** 2 + (sy[i] - y) ** 2;
        // prefer tracked satellites slightly
        const w = this._cat.tracked.has(this._cat.norad[i]) ? d * 0.5 : d;
        if (w < bestD) {
          bestD = w;
          best = { type: "sat", index: i };
        }
      }
    }
    for (const b of this._bodies || []) {
      const d = (b.x - x) ** 2 + (b.y - y) ** 2;
      if (d < bestD * 1.5) {
        bestD = d;
        best = { type: "body", body: b.name };
      }
    }
    if (!best && this._starScreen) {
      let bd = (radius * 0.9) ** 2;
      for (const [sx, sy, idx] of this._starScreen) {
        const d = (sx - x) ** 2 + (sy - y) ** 2;
        if (d < bd) {
          bd = d;
          best = { type: "star", index: idx };
        }
      }
    }
    this._selected = best;
    this._infoTime = 0;
    this._renderInfo();
  }

  // ---------------------------------------------------------------- info

  _bodyDir(name, jd) {
    if (name === "Sun") return sunPosition(jd).dir;
    if (name === "Moon") return moonPosition(jd).dir;
    const p = planetPositions(jd).find((x) => x.name === name);
    return p ? p.dir : null;
  }

  _moonWaxing(jd) {
    const ill = (t) => {
      const s = sunPosition(t).dir;
      const m = moonPosition(t).dir;
      return (1 - (s[0] * m[0] + s[1] * m[1] + s[2] * m[2])) / 2;
    };
    return ill(jd + 0.25) > ill(jd);
  }

  /** rise, set and culmination for the local calendar day of simMs */
  _riseSet(name, simMs) {
    const tz = this._hass?.config?.time_zone || undefined;
    let parts;
    try {
      parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
        .formatToParts(new Date(simMs))
        .reduce((a, p) => ((a[p.type] = p.value), a), {});
    } catch (_e) {
      const d = new Date(simMs);
      parts = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
    }
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    const offset = Math.round((asUtc - simMs) / 60000) * 60000;
    const midnight = Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset;
    const key = `${name}|${midnight}`;
    this._rsCache = this._rsCache || new Map();
    if (this._rsCache.has(key)) return this._rsCache.get(key);
    const lat = Number(this._config.latitude ?? this._hass.config.latitude);
    const lon = Number(this._config.longitude ?? this._hass.config.longitude);
    const h0 = (name === "Sun" ? -0.833 : name === "Moon" ? 0.125 : -0.567) * DEG;
    const step = 10 * 60000;
    const altAt = (ms) => {
      const jd = jdFromMs(ms);
      const dir = this._bodyDir(name, jd);
      const o = observerFrame(lat, lon, 0, gmst(jd));
      const u = dir[0] * o.up[0] + dir[1] * o.up[1] + dir[2] * o.up[2];
      return Math.asin(clamp(u, -1, 1)) - h0;
    };
    let rise = null;
    let set = null;
    let best = -Infinity;
    let bestT = null;
    let prev = altAt(midnight);
    if (prev > best) {
      best = prev;
      bestT = midnight;
    }
    for (let t = midnight + step; t <= midnight + 86400000; t += step) {
      const a = altAt(t);
      if (prev < 0 && a >= 0 && rise === null) rise = t - step + (step * -prev) / (a - prev);
      if (prev >= 0 && a < 0 && set === null) set = t - step + (step * prev) / (prev - a);
      if (a > best) {
        best = a;
        bestT = t;
      }
      prev = a;
    }
    const fmt = (ms) => {
      try {
        return new Intl.DateTimeFormat(this._hass?.locale?.language || "en", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date(ms));
      } catch (_e) {
        return new Date(ms).toTimeString().slice(0, 5);
      }
    };
    const allUp = rise === null && set === null && prev >= 0;
    const out = {
      rise: rise !== null ? fmt(rise) : allUp ? "up all day" : set !== null ? "rose yesterday" : "not today",
      set: set !== null ? fmt(set) : allUp ? "up all day" : rise !== null ? "after midnight" : "not today",
      transit: bestT !== null ? `${fmt(bestT)} · ${((best + h0) / DEG).toFixed(0)}°` : "-",
    };
    if (this._rsCache.size > 40) this._rsCache.clear();
    this._rsCache.set(key, out);
    return out;
  }

  _renderInfo() {
    const el = this._els.info;
    const sel = this._selected;
    if (!sel) {
      el.classList.remove("show");
      return;
    }
    const rows = [];
    let title = "";
    let picture = "";
    const simMs = this._simNow();
    const jd = jdFromMs(simMs);
    const lat = Number(this._config.latitude ?? this._hass.config.latitude);
    const lon = Number(this._config.longitude ?? this._hass.config.longitude);
    const obs = observerFrame(lat, lon, Number(this._hass.config.elevation || 0) / 1000, gmst(jd));
    const altaz = (enu) => {
      const len = Math.hypot(enu[0], enu[1], enu[2]);
      const alt = Math.asin(enu[2] / len) / DEG;
      let az = Math.atan2(enu[0], enu[1]) / DEG;
      if (az < 0) az += 360;
      return [alt, az];
    };
    if (sel.type === "sat") {
      const cat = this._cat;
      const i = sel.index;
      const rec = cat.recs[i];
      const t = new Float64Array(6);
      if (!rec || !sgp4(rec, (jd - rec.epochJd) * 1440, t, 0)) {
        this._selected = null;
        el.classList.remove("show");
        return;
      }
      const rel = [t[0] - obs.pos[0], t[1] - obs.pos[1], t[2] - obs.pos[2]];
      const enu = this._toEnu(obs, rel);
      const [alt, az] = altaz(enu);
      const range = Math.hypot(rel[0], rel[1], rel[2]);
      const height = Math.hypot(t[0], t[1], t[2]) - 6371;
      const speed = Math.hypot(t[3], t[4], t[5]) * 3600;
      const sun = sunPosition(jd);
      const lit = isSunlit([t[0], t[1], t[2]], sun.dir);
      const sunEnu = this._toEnu(obs, sun.dir);
      const darkSky = sunEnu[2] < Math.sin(-6 * DEG);
      const group = cat.groups[cat.group[i]];
      const noEye = !!group && group.visible === false;
      let status = lit ? (darkSky ? (noEye ? "Sunlit (too small for the eye)" : height < 2000 ? "Visible (sunlit, dark sky)" : "Sunlit (too far for the eye)") : "Sunlit (daylight sky)") : "In Earth's shadow";
      if (alt < 0) status = "Below the horizon";
      const ageDays = jd - rec.epochJd;
      title = cat.names[i];
      // no satellite drawing for debris and rocket bodies
      picture = group && group.dots ? "" : satPicture(this._kind[i], group ? group.color : GOLD);
      rows.push(["NORAD", String(cat.norad[i])]);
      rows.push(["Group", group ? group.name : "-"]);
      rows.push(["Elevation", `${alt.toFixed(1)}°`]);
      rows.push(["Azimuth", `${az.toFixed(1)}° ${compass(az)}`]);
      rows.push(["Range", `${Math.round(range).toLocaleString()} km`]);
      rows.push(["Altitude", `${Math.round(height).toLocaleString()} km`]);
      rows.push(["Speed", `${Math.round(speed).toLocaleString()} km/h`]);
      rows.push(["Status", status]);
      rows.push(["Data age", `${ageDays.toFixed(1)} days`]);
    } else if (sel.type === "star") {
      const sky = this._sky;
      const idx = sel.index;
      const v = [sky.vec[idx * 3], sky.vec[idx * 3 + 1], sky.vec[idx * 3 + 2]];
      const prec = this._precFor(jd);
      const vd = [
        prec[0][0] * v[0] + prec[0][1] * v[1] + prec[0][2] * v[2],
        prec[1][0] * v[0] + prec[1][1] * v[1] + prec[1][2] * v[2],
        prec[2][0] * v[0] + prec[2][1] * v[1] + prec[2][2] * v[2],
      ];
      const [alt, az] = altaz(this._toEnu(obs, vd));
      title = sky.names.get(idx) || "Star";
      rows.push(["Magnitude", sky.mag[idx].toFixed(2)]);
      rows.push(["Elevation", `${alt.toFixed(1)}°`]);
      rows.push(["Azimuth", `${az.toFixed(1)}° ${compass(az)}`]);
    } else if (sel.type === "body") {
      const b = (this._bodies || []).find((x) => x.name === sel.body);
      if (!b) {
        el.classList.remove("show");
        return;
      }
      const [alt, az] = altaz(b.enu);
      const info = BODY_FACTS[b.name] || { kind: "", facts: [], note: "" };
      const AU = 149597870.7;
      const km = b.type === "moon" ? b.dist : b.dist * AU;
      const lightS = km / 299792.458;
      const lightTxt = lightS < 120 ? `${lightS.toFixed(1)} s` : lightS < 7200 ? `${(lightS / 60).toFixed(1)} min` : `${(lightS / 3600).toFixed(1)} h`;
      let sub = info.kind;
      if (b.type === "moon") {
        const waxing = this._moonWaxing(jd);
        sub = `${moonPhaseName(b.illum, waxing)} · ${Math.round(b.illum * 100)} % lit`;
      }
      const rs = this._riseSet(b.name, simMs);
      const live = [
        ["Elevation", `${alt.toFixed(1)}°${alt < 0 ? " (below horizon)" : ""}`],
        ["Azimuth", `${az.toFixed(1)}° ${compass(az)}`],
        ["Distance", b.type === "moon" ? `${Math.round(km).toLocaleString()} km` : `${b.dist.toFixed(3)} AU · ${(km / 1e6).toFixed(1)} M km`],
        ["Light time", lightTxt],
      ];
      if (b.type === "planet") live.push(["Brightness", `mag ${b.mag.toFixed(1)}`]);
      live.push(["Rises", rs.rise], ["Sets", rs.set], ["Highest", rs.transit]);
      const pic = bodyPicture(b.name, b.illum, b.angle);
      const cell = ([k, v]) => `<span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span>`;
      el.innerHTML = `<button class="close" title="Close">×</button>
        <div class="bhead"><img class="bpic${b.name === "Saturn" ? " wide" : ""}" src="${pic}" alt="">
          <div><div class="name">${escapeHtml(b.name)}</div><div class="sub">${escapeHtml(sub)}</div></div></div>
        <div class="grid">${live.map(cell).join("")}</div>
        ${info.facts.length ? `<div class="sep"></div><div class="grid facts">${info.facts.map(cell).join("")}</div>` : ""}
        ${info.note ? `<div class="note">${escapeHtml(info.note)}</div>` : ""}`;
      el.classList.add("body");
      el.classList.add("show");
      return;
    }
    el.classList.remove("body");
    el.innerHTML = `<button class="close" title="Close">×</button>${picture ? `<img class="pic" src="${picture}" alt="">` : ""}<div class="name">${escapeHtml(title)}</div><div class="grid">${rows
      .map(([k, v]) => `<span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span>`)
      .join("")}</div>`;
    el.classList.add("show");
  }
}

// ---------------------------------------------------------------------------
// Minimal visual editor
// ---------------------------------------------------------------------------

class OrbitariumCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _render() {
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) =>
        ({
          title: "Title",
          view: "Start view",
          height: "Height in px (empty: 440, panel view: full screen)",
          fps: "Frames per second",
          star_limit: "Faintest star magnitude",
          show_constellations: "Constellation lines",
          show_labels: "Labels",
          show_planets: "Sun, Moon and planets",
          show_ground: "Hide objects below the horizon",
          visible_only: "Only naked-eye visible satellites",
          satellite_icons: "Satellite icons (off: small dots)",
          night_sky: "Always dark sky (night sky switch)",
        })[s.name] || s.name;
      this._form.addEventListener("value-changed", (ev) => {
        this._config = ev.detail.value;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: this._config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.schema = [
      { name: "title", selector: { text: {} } },
      {
        name: "view",
        selector: { select: { mode: "dropdown", options: [{ value: "dome", label: "Dome (whole sky)" }, { value: "horizon", label: "Horizon" }, { value: "globe", label: "Globe (Earth from space)" }] } },
      },
      { name: "height", selector: { number: { min: 250, max: 1200, step: 10, mode: "box" } } },
      { name: "fps", selector: { number: { min: 5, max: 60, step: 5, mode: "slider" } } },
      { name: "star_limit", selector: { number: { min: 2, max: 6.5, step: 0.5, mode: "slider" } } },
      { name: "show_constellations", selector: { boolean: {} } },
      { name: "show_labels", selector: { boolean: {} } },
      { name: "show_planets", selector: { boolean: {} } },
      { name: "show_ground", selector: { boolean: {} } },
      { name: "visible_only", selector: { boolean: {} } },
      { name: "satellite_icons", selector: { boolean: {} } },
      { name: "night_sky", selector: { boolean: {} } },
    ];
    this._form.data = {
      title: "Orbitarium", view: "dome", fps: 30, star_limit: 6, show_constellations: true,
      show_labels: true, show_planets: true, show_ground: true, visible_only: false, satellite_icons: true, night_sky: false, ...this._config,
    };
    if (this._hass) this._form.hass = this._hass;
  }
}

if (!customElements.get("orbitarium-card")) {
  customElements.define("orbitarium-card", OrbitariumCard);
  customElements.define("orbitarium-card-editor", OrbitariumCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "orbitarium-card",
    name: "Orbitarium",
    description: "Live satellites, stars, constellations and planets above your home.",
    preview: true,
    documentationURL: "https://github.com/mb26-dev/ha-orbitarium",
  });
  console.info(`%c ORBITARIUM-CARD %c ${CARD_VERSION} `, "color:#0b0f17;background:#d4af37;font-weight:700", "color:#d4af37;background:#0b0f17");
}
