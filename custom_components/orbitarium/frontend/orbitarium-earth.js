/*
 * Orbitarium Earth imagery for the globe view.
 * Day side: NASA Blue Marble Next Generation, night side: NASA Black Marble
 * (both NASA Earth Observatory). The images are downloaded by the integration
 * and served from Home Assistant; this module decodes them and renders the
 * lit globe pixel by pixel.
 */

const TEX_W = 2048;
const TEX_H = 1024;

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

async function decode(blob) {
  let source;
  if (typeof createImageBitmap === "function") {
    source = await createImageBitmap(blob);
  } else {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      img.src = url;
    });
  }
  const c = document.createElement("canvas");
  c.width = TEX_W;
  c.height = TEX_H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, TEX_W, TEX_H);
  if (source.close) source.close();
  return ctx.getImageData(0, 0, TEX_W, TEX_H).data;
}

/** download both images through the authenticated API and decode them */
export async function loadEarth(hass) {
  const get = async (kind) => {
    const resp = await hass.fetchWithAuth(`/api/orbitarium/earth/${kind}`);
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    return decode(await resp.blob());
  };
  const [day, night] = await Promise.all([get("day"), get("night").catch(() => null)]);
  return { w: TEX_W, h: TEX_H, day, night };
}

/**
 * Render the globe into `canvas` (size x size pixels).
 * G: globe frame (view/east/north unit vectors in ECEF), sunE: sun direction in ECEF.
 */
export function renderEarth(canvas, earth, G, sunE, size) {
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const { w, h, day, night } = earth;
  const E = G.east;
  const N = G.north;
  const V = G.view;
  const inv2pi = 1 / (2 * Math.PI);
  const invPi = 1 / Math.PI;
  let o = 0;
  for (let j = 0; j < size; j++) {
    const y = 1 - ((j + 0.5) / size) * 2;
    for (let i = 0; i < size; i++, o += 4) {
      const x = ((i + 0.5) / size) * 2 - 1;
      const q = x * x + y * y;
      if (q >= 1) continue;
      const z = Math.sqrt(1 - q);
      const n0 = x * E[0] + y * N[0] + z * V[0];
      const n1 = x * E[1] + y * N[1] + z * V[1];
      const n2 = x * E[2] + y * N[2] + z * V[2];
      const lat = Math.asin(n2 > 1 ? 1 : n2 < -1 ? -1 : n2);
      const lon = Math.atan2(n1, n0);
      let u = ((lon * inv2pi + 0.5) * w) | 0;
      let v = ((0.5 - lat * invPi) * h) | 0;
      if (u >= w) u = w - 1;
      if (v >= h) v = h - 1;
      if (v < 0) v = 0;
      const t = (v * w + u) * 4;
      const dot = n0 * sunE[0] + n1 * sunE[1] + n2 * sunE[2];
      // day weight with a soft terminator, simple diffuse light on the day side
      const dayF = smooth(-0.12, 0.08, dot);
      const light = 0.35 + 0.75 * Math.min(1, Math.max(0, dot * 1.3 + 0.12));
      const k = dayF * light;
      let R = day[t] * k;
      let Gc = day[t + 1] * k;
      let B = day[t + 2] * k;
      if (night) {
        const nf = (1 - dayF) * 1.25;
        R += night[t] * nf;
        Gc += night[t + 1] * nf;
        B += night[t + 2] * nf;
      } else {
        B += 18 * (1 - dayF);
      }
      // thin atmosphere towards the limb, brighter on the day side
      const rim = Math.pow(1 - z, 2.2);
      const a = rim * (0.25 + 0.5 * dayF);
      R = R * (1 - a) + 110 * a;
      Gc = Gc * (1 - a) + 165 * a;
      B = B * (1 - a) + 255 * a;
      d[o] = R > 255 ? 255 : R;
      d[o + 1] = Gc > 255 ? 255 : Gc;
      d[o + 2] = B > 255 ? 255 : B;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
