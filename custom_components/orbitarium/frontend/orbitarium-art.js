/*
 * Orbitarium artwork: satellites, Sun, Moon and planets.
 * All pictures are original drawings rendered with the canvas API at runtime.
 */

const TWO_PI = Math.PI * 2;

// ---------------------------------------------------------------------------
// Satellite artwork (original vector drawings, rendered once into sprites)
// ---------------------------------------------------------------------------

export const KIND_GENERIC = 0;
export const KIND_FLAT = 1; // flat-panel broadband satellites: Starlink, OneWeb, Kuiper
export const KIND_STATION = 2; // International Space Station
export const KIND_TIANGONG = 3; // Chinese space station (T-shaped)

// aspect ratio (height / length) of each drawing
export const KIND_ASPECT = [0.5, 0.42, 0.78, 0.74];

export function isStationKind(kind) {
  return kind === KIND_STATION || kind === KIND_TIANGONG;
}

export function satKind(groupKey, name) {
  const n = (name || "").toUpperCase();
  if (/^ISS \(ZARYA\)|^ISS$/.test(n)) return KIND_STATION;
  if (/TIANHE|^CSS/.test(n)) return KIND_TIANGONG;
  if (groupKey === "starlink" || groupKey === "oneweb" || groupKey === "kuiper") return KIND_FLAT;
  if (/^STARLINK|^ONEWEB|^KUIPER/.test(n)) return KIND_FLAT;
  return KIND_GENERIC;
}

function solarPanel(ctx, x, y, w, h, cells, warm) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  if (warm) {
    g.addColorStop(0, "#e0a13c");
    g.addColorStop(1, "#8a5a18");
  } else {
    g.addColorStop(0, "#2d5bb8");
    g.addColorStop(1, "#0e214f");
  }
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = warm ? "rgba(255,226,160,0.55)" : "rgba(140,180,255,0.55)";
  ctx.lineWidth = Math.max(0.6, h * 0.05);
  ctx.beginPath();
  const horizontal = w >= h;
  const n = Math.max(2, cells);
  for (let i = 1; i < n; i++) {
    if (horizontal) {
      const xx = x + (w * i) / n;
      ctx.moveTo(xx, y);
      ctx.lineTo(xx, y + h);
    } else {
      const yy = y + (h * i) / n;
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
    }
  }
  if (horizontal) {
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
  } else {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(225,232,245,0.9)";
  ctx.lineWidth = Math.max(0.6, h * 0.06);
  ctx.strokeRect(x, y, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function metalFill(ctx, x0, y0, x1, y1, light, dark) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  return g;
}

/** draw a satellite of the given kind, centred at 0,0, length L along +x */
function drawSatArt(ctx, kind, L) {
  ctx.lineJoin = "round";
  if (kind === KIND_FLAT) {
    // flat chassis with one long solar wing (Starlink style)
    const bh = L * 0.36;
    const bx = -L * 0.5;
    const bw = L * 0.22;
    ctx.fillStyle = metalFill(ctx, bx, -bh / 2, bx + bw, bh / 2, "#f4f6fa", "#8d96a3");
    ctx.fillRect(bx, -bh / 2, bw, bh);
    ctx.strokeStyle = "#5d6673";
    ctx.lineWidth = Math.max(0.6, L * 0.015);
    ctx.strokeRect(bx, -bh / 2, bw, bh);
    // phased-array antennas on the chassis
    ctx.fillStyle = "#c9ced6";
    const ah = bh * 0.22;
    ctx.fillRect(bx + bw * 0.18, -bh * 0.36, bw * 0.64, ah);
    ctx.fillRect(bx + bw * 0.18, bh * 0.14, bw * 0.64, ah);
    // boom
    ctx.strokeStyle = "#cfd5df";
    ctx.lineWidth = Math.max(0.8, L * 0.025);
    ctx.beginPath();
    ctx.moveTo(bx + bw, 0);
    ctx.lineTo(-L * 0.22, 0);
    ctx.stroke();
    // solar wing
    solarPanel(ctx, -L * 0.22, -L * 0.14, L * 0.72, L * 0.28, 8, false);
    return;
  }
  if (kind === KIND_STATION) {
    // long truss with two pairs of big wings on each end and a module stack
    const H = L * KIND_ASPECT[KIND_STATION];
    ctx.fillStyle = metalFill(ctx, 0, -L * 0.03, 0, L * 0.03, "#eef1f5", "#9aa2ad");
    ctx.fillRect(-L * 0.5, -L * 0.025, L, L * 0.05);
    const wingW = L * 0.085;
    const wingH = H * 0.44;
    for (const xc of [-0.42, -0.3, 0.3, 0.42]) {
      const x = xc * L - wingW / 2;
      solarPanel(ctx, x, -L * 0.03 - wingH, wingW, wingH, 6, true);
      solarPanel(ctx, x, L * 0.03, wingW, wingH, 6, true);
    }
    // radiators
    ctx.fillStyle = "#f2f4f7";
    ctx.fillRect(-L * 0.17, L * 0.04, L * 0.07, H * 0.22);
    ctx.fillRect(L * 0.1, L * 0.04, L * 0.07, H * 0.22);
    // pressurised modules
    const mw = L * 0.07;
    ctx.fillStyle = metalFill(ctx, -mw, 0, mw, 0, "#ffffff", "#a9b0ba");
    ctx.beginPath();
    roundRect(ctx, -mw / 2, -H * 0.42, mw, H * 0.84, mw / 2);
    ctx.fill();
    ctx.beginPath();
    roundRect(ctx, -L * 0.12, -mw / 2 - L * 0.06, L * 0.24, mw, mw / 2);
    ctx.fill();
    ctx.strokeStyle = "#6b737e";
    ctx.lineWidth = Math.max(0.5, L * 0.008);
    ctx.stroke();
    return;
  }
  if (kind === KIND_TIANGONG) {
    // T-shaped station: core module along x, two lab modules along y,
    // each lab carrying a long pair of flexible solar wings
    const H = L * KIND_ASPECT[KIND_TIANGONG];
    const cw = L * 0.085;
    // lab modules (vertical)
    ctx.fillStyle = metalFill(ctx, -cw, 0, cw, 0, "#ffffff", "#a7aeb8");
    ctx.beginPath();
    roundRect(ctx, -cw / 2, -H * 0.36, cw, H * 0.72, cw / 2);
    ctx.fill();
    // wings at both lab ends
    for (const sy of [-1, 1]) {
      const y = sy * H * 0.36;
      ctx.strokeStyle = "#d6dbe3";
      ctx.lineWidth = Math.max(0.8, L * 0.02);
      ctx.beginPath();
      ctx.moveTo(-L * 0.46, y);
      ctx.lineTo(L * 0.46, y);
      ctx.stroke();
      solarPanel(ctx, -L * 0.5, y - L * 0.055, L * 0.4, L * 0.11, 7, false);
      solarPanel(ctx, L * 0.1, y - L * 0.055, L * 0.4, L * 0.11, 7, false);
    }
    // core module (horizontal) with its own small wings
    ctx.fillStyle = metalFill(ctx, 0, -cw, 0, cw, "#ffffff", "#a7aeb8");
    ctx.beginPath();
    roundRect(ctx, -L * 0.07, -cw / 2, L * 0.34, cw, cw / 2);
    ctx.fill();
    ctx.strokeStyle = "#6b737e";
    ctx.lineWidth = Math.max(0.5, L * 0.008);
    ctx.stroke();
    solarPanel(ctx, L * 0.14, -cw / 2 - L * 0.13, L * 0.06, L * 0.12, 3, false);
    solarPanel(ctx, L * 0.14, cw / 2 + L * 0.01, L * 0.06, L * 0.12, 3, false);
    // docking hub
    ctx.fillStyle = "#e9edf2";
    ctx.beginPath();
    ctx.arc(-L * 0.07, 0, cw * 0.75, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();
    return;
  }
  // generic: gold foil bus, two wings, dish
  const bs = L * 0.22;
  ctx.fillStyle = metalFill(ctx, -bs / 2, -bs / 2, bs / 2, bs / 2, "#f3d27a", "#8f6b1c");
  ctx.fillRect(-bs / 2, -bs / 2, bs, bs);
  ctx.strokeStyle = "#5e4610";
  ctx.lineWidth = Math.max(0.6, L * 0.015);
  ctx.strokeRect(-bs / 2, -bs / 2, bs, bs);
  ctx.strokeStyle = "#d6dbe3";
  ctx.lineWidth = Math.max(0.8, L * 0.025);
  ctx.beginPath();
  ctx.moveTo(-L * 0.5 + L * 0.34, 0);
  ctx.lineTo(L * 0.5 - L * 0.34, 0);
  ctx.stroke();
  solarPanel(ctx, -L * 0.5, -L * 0.11, L * 0.3, L * 0.22, 4, false);
  solarPanel(ctx, L * 0.2, -L * 0.11, L * 0.3, L * 0.22, 4, false);
  // antenna dish
  ctx.fillStyle = "#f5f6f8";
  ctx.beginPath();
  ctx.ellipse(0, -bs / 2 - L * 0.04, L * 0.08, L * 0.035, 0, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = "#7d8591";
  ctx.lineWidth = Math.max(0.5, L * 0.01);
  ctx.stroke();
}

const SPRITES = new Map();

/** sprite with a soft aura in the group colour, cached per kind/colour/size/dpr */
export function satSprite(kind, color, L, dpr, glow) {
  const key = `${kind}|${color}|${L}|${dpr}|${glow}`;
  let sp = SPRITES.get(key);
  if (sp) return sp;
  const H = L * KIND_ASPECT[kind];
  const pad = Math.ceil(L * (glow === 2 ? 0.5 : 0.3)) + 2;
  const w = Math.ceil(L + pad * 2);
  const h = Math.ceil(H + pad * 2);
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.translate(w / 2, h / 2);
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow === 2 ? Math.max(8, L * 0.7) : Math.max(3, L * 0.25);
    if (glow === 2) {
      // naked-eye visible: double aura so it reads like a bright point of light
      drawSatArt(ctx, kind, L);
    }
  }
  drawSatArt(ctx, kind, L);
  ctx.shadowBlur = 0;
  if (glow) {
    // second pass keeps the artwork crisp on top of its aura
    drawSatArt(ctx, kind, L);
  }
  sp = { canvas: c, w, h };
  if (SPRITES.size > 400) SPRITES.clear();
  SPRITES.set(key, sp);
  return sp;
}

const PICTURES = new Map();

/** larger picture for the info panel, as a data URL */
export function satPicture(kind, color) {
  const key = `${kind}|${color}`;
  if (PICTURES.has(key)) return PICTURES.get(key);
  const L = 150;
  const H = L * KIND_ASPECT[kind];
  const w = 220;
  const h = Math.ceil(H + 40);
  const c = document.createElement("canvas");
  c.width = w * 2;
  c.height = h * 2;
  const ctx = c.getContext("2d");
  ctx.scale(2, 2);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.18);
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  drawSatArt(ctx, kind, L);
  ctx.shadowBlur = 0;
  drawSatArt(ctx, kind, L);
  const url = c.toDataURL("image/png");
  PICTURES.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------
// Sun, Moon and planets: rendered portraits (original artwork) and facts
// ---------------------------------------------------------------------------

export const BODY_FACTS = {
  Sun: {
    kind: "Star (G2V)",
    facts: [["Diameter", "1,392,700 km"], ["Surface", "about 5,500 °C"], ["Core", "about 15 million °C"], ["Rotation", "25 to 35 days"]],
    note: "Sunlight needs about 8 minutes and 20 seconds to reach Earth.",
  },
  Moon: {
    kind: "Natural satellite",
    facts: [["Diameter", "3,474 km"], ["Orbit", "27.3 days"], ["Phase cycle", "29.5 days"], ["Gravity", "16 % of Earth"]],
    note: "The Moon always shows the same side to Earth.",
  },
  Mercury: {
    kind: "Planet",
    facts: [["Diameter", "4,879 km"], ["Year", "88 days"], ["Day", "176 Earth days"], ["Moons", "0"], ["Temperature", "-173 to 427 °C"]],
    note: "The smallest planet and the closest to the Sun, never far from it in our sky.",
  },
  Venus: {
    kind: "Planet",
    facts: [["Diameter", "12,104 km"], ["Year", "225 days"], ["Rotation", "243 days, retrograde"], ["Moons", "0"], ["Surface", "about 464 °C"]],
    note: "Thick clouds of sulphuric acid make it the brightest planet in our sky.",
  },
  Mars: {
    kind: "Planet",
    facts: [["Diameter", "6,779 km"], ["Year", "687 days"], ["Day", "24 h 37 min"], ["Moons", "2"], ["Temperature", "about -63 °C"]],
    note: "Home of Olympus Mons, the largest volcano in the solar system.",
  },
  Jupiter: {
    kind: "Gas giant",
    facts: [["Diameter", "139,820 km"], ["Year", "11.9 years"], ["Day", "9 h 56 min"], ["Moons", "95+"], ["Cloud tops", "about -110 °C"]],
    note: "The Great Red Spot is a storm larger than Earth.",
  },
  Saturn: {
    kind: "Gas giant",
    facts: [["Diameter", "116,460 km"], ["Year", "29.4 years"], ["Day", "10 h 33 min"], ["Moons", "270+"], ["Cloud tops", "about -140 °C"]],
    note: "Its rings are mostly ice and are only tens of metres thick.",
  },
  Uranus: {
    kind: "Ice giant",
    facts: [["Diameter", "50,724 km"], ["Year", "84 years"], ["Day", "17 h 14 min"], ["Moons", "28+"], ["Cloud tops", "about -195 °C"]],
    note: "It rolls around the Sun on its side, tilted by 98°.",
  },
  Neptune: {
    kind: "Ice giant",
    facts: [["Diameter", "49,244 km"], ["Year", "165 years"], ["Day", "16 h 6 min"], ["Moons", "16"], ["Cloud tops", "about -200 °C"]],
    note: "The windiest planet, with storms up to 2,000 km/h.",
  },
};

function seeded(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shadeSphere(ctx, r, light, dark) {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TWO_PI);
  ctx.fill();
}

function limbDarken(ctx, r, strength) {
  const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.35, 0, 0, r * 1.02);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.75, `rgba(0,0,0,${(strength * 0.35).toFixed(3)})`);
  g.addColorStop(1, `rgba(0,0,0,${strength.toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TWO_PI);
  ctx.fill();
}

function bands(ctx, r, list, rnd, wave) {
  // list of [y from -1..1, height, colour, alpha]
  for (const [y, hgt, col, a] of list) {
    ctx.fillStyle = col;
    ctx.globalAlpha = a;
    ctx.beginPath();
    const y0 = y * r;
    const hh = hgt * r;
    ctx.moveTo(-r, y0);
    for (let x = -r; x <= r; x += r / 10) ctx.lineTo(x, y0 + Math.sin(x / r * 6 + rnd() * 2) * wave * r);
    ctx.lineTo(r, y0 + hh);
    for (let x = r; x >= -r; x -= r / 10) ctx.lineTo(x, y0 + hh + Math.sin(x / r * 5 + rnd() * 2) * wave * r);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function craters(ctx, r, rnd, count, maxR, dark, light) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * TWO_PI;
    const d = Math.sqrt(rnd()) * r * 0.92;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const cr = (0.2 + rnd() * 0.8) * maxR * (1 - (d / r) * 0.35);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(x, y, cr, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.arc(x - cr * 0.25, y - cr * 0.25, cr * 0.55, 0, TWO_PI);
    ctx.fill();
  }
}

function blobs(ctx, r, spots, color) {
  // spots: [x, y, rx, ry, rot, alpha] in units of r
  ctx.fillStyle = color;
  for (const [x, y, rx, ry, rot, a] of spots) {
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.ellipse(x * r, y * r, rx * r, ry * r, rot, 0, TWO_PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBodyArt(ctx, name, r, illum, angle) {
  const rnd = seeded(name.length * 7919 + name.charCodeAt(0) * 31);
  ctx.save();
  if (name === "Sun") {
    ctx.shadowColor = "rgba(255,190,60,0.9)";
    ctx.shadowBlur = r * 0.5;
    shadeSphere(ctx, r, "#fffbe0", "#ff9a10");
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.clip();
    for (let i = 0; i < 260; i++) {
      const a = rnd() * TWO_PI;
      const d = Math.sqrt(rnd()) * r;
      ctx.fillStyle = rnd() > 0.5 ? "rgba(255,255,230,0.12)" : "rgba(200,90,0,0.10)";
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.02 + rnd() * 0.04), 0, TWO_PI);
      ctx.fill();
    }
    blobs(ctx, r, [[0.3, -0.15, 0.05, 0.035, 0, 0.75], [0.38, -0.1, 0.03, 0.02, 0, 0.7], [-0.35, 0.25, 0.035, 0.025, 0, 0.6]], "#5a2600");
    const lg = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
    lg.addColorStop(0, "rgba(255,120,0,0)");
    lg.addColorStop(1, "rgba(200,70,0,0.55)");
    ctx.fillStyle = lg;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TWO_PI);
  ctx.save();
  ctx.clip();
  if (name === "Moon") {
    shadeSphere(ctx, r, "#e7e3da", "#9b968d");
    blobs(ctx, r, [
      [-0.32, -0.38, 0.26, 0.22, 0.3, 0.55], // Imbrium
      [0.05, -0.3, 0.16, 0.15, 0, 0.55], // Serenitatis
      [0.18, 0.0, 0.2, 0.17, 0.4, 0.5], // Tranquillitatis
      [0.6, -0.12, 0.12, 0.1, 0, 0.6], // Crisium
      [-0.6, 0.05, 0.28, 0.45, 0.2, 0.42], // Procellarum
      [0.35, 0.28, 0.12, 0.1, 0, 0.45], // Fecunditatis
      [0.15, 0.25, 0.1, 0.12, 0, 0.4], // Nectaris
      [-0.25, 0.4, 0.18, 0.12, 0, 0.35], // Nubium
    ], "#6c6862");
    craters(ctx, r, rnd, 26, r * 0.06, "rgba(90,86,80,0.35)", "rgba(255,255,250,0.18)");
    // Tycho with faint rays
    ctx.strokeStyle = "rgba(255,255,250,0.18)";
    ctx.lineWidth = r * 0.012;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(-0.1 * r, 0.62 * r);
      ctx.lineTo(-0.1 * r + Math.cos(a) * r * 0.5, 0.62 * r + Math.sin(a) * r * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,250,0.85)";
    ctx.beginPath();
    ctx.arc(-0.1 * r, 0.62 * r, r * 0.035, 0, TWO_PI);
    ctx.fill();
    limbDarken(ctx, r, 0.35);
    if (illum !== undefined && illum < 0.995) {
      // current phase: dark part of the disc
      ctx.save();
      ctx.rotate(angle || 0);
      const k = 2 * illum - 1;
      ctx.fillStyle = "rgba(8,10,16,0.88)";
      ctx.beginPath();
      ctx.arc(0, 0, r + 1, Math.PI / 2, -Math.PI / 2, false);
      ctx.ellipse(0, 0, Math.abs(k) * r, r + 1, 0, -Math.PI / 2, Math.PI / 2, k > 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else if (name === "Mercury") {
    shadeSphere(ctx, r, "#c8c2b8", "#6a645c");
    blobs(ctx, r, [[0.2, -0.2, 0.3, 0.2, 0.5, 0.25], [-0.3, 0.3, 0.25, 0.18, 0, 0.2]], "#59544d");
    craters(ctx, r, rnd, 70, r * 0.09, "rgba(70,66,60,0.45)", "rgba(240,236,228,0.22)");
    limbDarken(ctx, r, 0.6);
  } else if (name === "Venus") {
    shadeSphere(ctx, r, "#fff3d0", "#c79a52");
    ctx.save();
    ctx.rotate(-0.35);
    bands(ctx, r * 1.3, [
      [-0.8, 0.22, "#fff8e2", 0.35], [-0.45, 0.18, "#e2bc78", 0.3], [-0.1, 0.25, "#fff5da", 0.3],
      [0.25, 0.2, "#d9ae66", 0.3], [0.55, 0.25, "#fff1cc", 0.3],
    ], rnd, 0.05);
    ctx.restore();
    limbDarken(ctx, r, 0.45);
  } else if (name === "Mars") {
    shadeSphere(ctx, r, "#f08a52", "#8b3518");
    blobs(ctx, r, [
      [0.15, 0.05, 0.25, 0.12, 0.3, 0.45], [-0.3, -0.05, 0.3, 0.1, -0.2, 0.4], [0.0, 0.32, 0.4, 0.09, 0.1, 0.35],
      [0.4, -0.25, 0.12, 0.2, 0.6, 0.35], [-0.2, 0.45, 0.2, 0.07, 0, 0.3],
    ], "#6a2a14");
    blobs(ctx, r, [[0.0, -0.92, 0.42, 0.16, 0, 0.92]], "#fbf5ee");
    blobs(ctx, r, [[0.1, 0.95, 0.25, 0.08, 0, 0.6]], "#f4ece2");
    limbDarken(ctx, r, 0.5);
  } else if (name === "Jupiter") {
    shadeSphere(ctx, r, "#f4e6cc", "#b08a62");
    bands(ctx, r, [
      [-1.0, 0.22, "#a98a6c", 0.55], [-0.72, 0.12, "#e8d8bc", 0.6], [-0.58, 0.16, "#b27a52", 0.65],
      [-0.4, 0.2, "#f6ecd8", 0.7], [-0.18, 0.14, "#c08458", 0.7], [-0.02, 0.18, "#f3e5c8", 0.6],
      [0.16, 0.16, "#b5764c", 0.7], [0.34, 0.12, "#eadcc2", 0.6], [0.48, 0.14, "#a87c5c", 0.55],
      [0.66, 0.34, "#cdb89c", 0.5],
    ], rnd, 0.015);
    blobs(ctx, r, [[0.32, 0.27, 0.17, 0.085, 0, 0.9]], "#c4532c");
    blobs(ctx, r, [[0.32, 0.27, 0.1, 0.045, 0, 0.6]], "#e07a4a");
    limbDarken(ctx, r, 0.55);
  } else if (name === "Saturn") {
    shadeSphere(ctx, r, "#f6e6b8", "#b8955a");
    bands(ctx, r, [
      [-1.0, 0.3, "#b9a074", 0.5], [-0.62, 0.15, "#ead6a2", 0.5], [-0.42, 0.14, "#cfae72", 0.55],
      [-0.2, 0.28, "#f4e4b8", 0.5], [0.12, 0.14, "#d2b07a", 0.5], [0.3, 0.2, "#ecd9a8", 0.45],
      [0.55, 0.45, "#c6a876", 0.45],
    ], rnd, 0.008);
    limbDarken(ctx, r, 0.5);
  } else if (name === "Uranus") {
    shadeSphere(ctx, r, "#d6f6f8", "#4fa6b6");
    bands(ctx, r, [[-0.5, 0.25, "#bfeef2", 0.25], [0.2, 0.3, "#8fd2dc", 0.2]], rnd, 0.005);
    limbDarken(ctx, r, 0.45);
  } else {
    // Neptune
    shadeSphere(ctx, r, "#7aa8ff", "#1a3388");
    bands(ctx, r, [[-0.55, 0.2, "#5a86e8", 0.35], [0.05, 0.22, "#3f68cf", 0.35], [0.45, 0.25, "#2c4fb0", 0.35]], rnd, 0.01);
    blobs(ctx, r, [[-0.2, -0.15, 0.16, 0.08, 0, 0.7]], "#152a6e");
    blobs(ctx, r, [[-0.12, -0.3, 0.14, 0.03, -0.2, 0.75], [0.3, 0.3, 0.12, 0.025, 0.2, 0.6]], "#eef4ff");
    limbDarken(ctx, r, 0.5);
  }
  ctx.restore();
  // soft rim light
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = Math.max(1, r * 0.02);
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, TWO_PI);
  ctx.stroke();
  ctx.restore();
}

function drawSaturnRings(ctx, r, front) {
  ctx.save();
  ctx.scale(1, 0.32);
  ctx.rotate(0);
  const rings = [
    [1.24, 1.52, "rgba(214,196,150,0.55)"],
    [1.55, 1.9, "rgba(232,214,168,0.85)"],
    [1.94, 2.2, "rgba(200,182,140,0.7)"],
  ];
  for (const [r0, r1, col] of rings) {
    ctx.fillStyle = col;
    ctx.beginPath();
    if (front) {
      ctx.arc(0, 0, r1 * r, 0, Math.PI, false);
      ctx.arc(0, 0, r0 * r, Math.PI, 0, true);
    } else {
      ctx.arc(0, 0, r1 * r, Math.PI, TWO_PI, false);
      ctx.arc(0, 0, r0 * r, TWO_PI, Math.PI, true);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const BODY_PICTURES = new Map();

/** portrait of a solar system body as a data URL; the Moon shows its phase */
export function bodyPicture(name, illum, angle) {
  const phaseKey = name === "Moon" ? `|${Math.round((illum || 0) * 40)}|${Math.round((angle || 0) * 8)}` : "";
  const key = name + phaseKey;
  if (BODY_PICTURES.has(key)) return BODY_PICTURES.get(key);
  const W = name === "Saturn" ? 200 : 140;
  const H = 140;
  const r = name === "Saturn" ? 42 : name === "Sun" ? 50 : 56;
  const c = document.createElement("canvas");
  c.width = W * 2;
  c.height = H * 2;
  const ctx = c.getContext("2d");
  ctx.scale(2, 2);
  ctx.translate(W / 2, H / 2);
  if (name === "Saturn") {
    ctx.rotate(-0.32);
    drawSaturnRings(ctx, r, false);
    drawBodyArt(ctx, name, r);
    drawSaturnRings(ctx, r, true);
  } else {
    drawBodyArt(ctx, name, r, illum, angle);
  }
  const url = c.toDataURL("image/png");
  if (BODY_PICTURES.size > 60) BODY_PICTURES.clear();
  BODY_PICTURES.set(key, url);
  return url;
}

export function moonPhaseName(illum, waxing) {
  if (illum < 0.03) return "New Moon";
  if (illum > 0.97) return "Full Moon";
  if (illum < 0.47) return waxing ? "Waxing crescent" : "Waning crescent";
  if (illum <= 0.53) return waxing ? "First quarter" : "Last quarter";
  return waxing ? "Waxing gibbous" : "Waning gibbous";
}
