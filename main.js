"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PdfInkPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian9 = require("obsidian");

// src/brush.ts
var REGION_LABELS = {
  free: "\u6D82\u62B9",
  rect: "\u77E9\u5F62",
  lasso: "\u5957\u7D22"
};
var SCOPE_LABELS = {
  partial: "\u53EA\u64E6\u9009\u4E2D",
  whole: "\u6574\u7B14\u5220\u9664"
};
var NAMED_COLORS = [
  ["#000000", "\u9ED1"],
  ["#1e1e1e", "\u9ED1"],
  ["#434343", "\u6DF1\u7070"],
  ["#868e96", "\u7070"],
  ["#e03131", "\u7EA2"],
  ["#9c2b2b", "\u6DF1\u7EA2"],
  ["#e64980", "\u7C89"],
  ["#f08c00", "\u6A59"],
  ["#ffd43b", "\u9EC4"],
  ["#cdaa2d", "\u82A5\u672B"],
  ["#2f9e44", "\u7EFF"],
  ["#5f961d", "\u6A44\u6984"],
  ["#15aabf", "\u9752"],
  ["#1971c2", "\u84DD"],
  ["#1c3f94", "\u6DF1\u84DD"],
  ["#7048e8", "\u7D2B"],
  ["#8b5a2b", "\u68D5"]
];
function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let body = match[1];
  if (body.length === 3) {
    body = body.split("").map((char) => char + char).join("");
  }
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16)
  ];
}
function colorName(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let best = hex;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [value, label] of NAMED_COLORS) {
    const target = hexToRgb(value);
    if (!target) continue;
    const distance2 = (rgb[0] - target[0]) ** 2 + (rgb[1] - target[1]) ** 2 + (rgb[2] - target[2]) ** 2;
    if (distance2 < bestDistance) {
      bestDistance = distance2;
      best = label;
    }
  }
  return best;
}
function formatWidth(widthPx) {
  const rounded = Math.round(widthPx * 10) / 10;
  return String(rounded);
}
function autoPresetName(color, widthPx) {
  return `${colorName(color)} \xB7 ${formatWidth(widthPx)}`;
}
function eraserPresetName(region, widthPx) {
  return `${REGION_LABELS[region]} \xB7 ${formatWidth(widthPx)}`;
}
function clonePresets(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((entry) => entry && typeof entry === "object").map((entry) => ({ ...entry }));
}

// src/controller.ts
var import_obsidian4 = require("obsidian");

// src/util.ts
var REFERENCE_PAGE_WIDTH = 816;
function uid(prefix) {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}
function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// src/doc.ts
var DOC_VERSION = 1;
var MAX_POLYGON_VALUES = 3 * 64;
var KINDS = [
  "pen",
  "highlighter",
  "eraser",
  "eraser-rect",
  "eraser-lasso",
  "line",
  "arrow",
  "rect",
  "ellipse",
  "polygon"
];
function isShapeKind(kind) {
  return kind === "line" || kind === "arrow" || kind === "rect" || kind === "ellipse" || kind === "polygon";
}
function createLayer(name) {
  return {
    id: uid("l"),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    strokes: []
  };
}
function createDoc(filePath) {
  const layer = createLayer("\u56FE\u5C42 1");
  return {
    version: DOC_VERSION,
    file: filePath,
    layers: [layer],
    activeLayerId: layer.id,
    updated: Date.now()
  };
}
function findLayer(doc, id) {
  if (!id) return null;
  return doc.layers.find((layer) => layer.id === id) ?? null;
}
function getActiveLayer(doc) {
  const layer = findLayer(doc, doc.activeLayerId);
  if (layer) return layer;
  const fallback = doc.layers[doc.layers.length - 1] ?? null;
  if (fallback) doc.activeLayerId = fallback.id;
  return fallback;
}
function sanitizeRings(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rings = [];
  for (const ringRaw of raw) {
    if (!Array.isArray(ringRaw)) return null;
    const ring = [];
    for (const value of ringRaw) {
      if (!isFiniteNumber(value)) return null;
      ring.push(value);
    }
    if (ring.length % 2 !== 0 || ring.length < 6) continue;
    rings.push(ring);
  }
  return rings.length > 0 ? rings : null;
}
function toKind(raw) {
  return typeof raw === "string" && KINDS.includes(raw) ? raw : "pen";
}
function sanitizeStroke(raw, pageFallback) {
  if (!raw || typeof raw !== "object") return null;
  const value = raw;
  const pointsRaw = value.points;
  const rings = sanitizeRings(value.rings);
  if (!Array.isArray(pointsRaw) && !rings) return null;
  const points = [];
  if (Array.isArray(pointsRaw)) {
    for (const entry of pointsRaw) {
      if (!isFiniteNumber(entry)) return null;
      points.push(entry);
    }
    if (points.length % 3 !== 0 || points.length < 3) return null;
  }
  if (rings && points.length === 0) {
  } else if (!Array.isArray(pointsRaw)) {
    return null;
  }
  const kind = toKind(value.kind ?? value.tool);
  if (rings) {
  } else if (kind === "polygon") {
    if (points.length < 9) return null;
    if (points.length > MAX_POLYGON_VALUES) points.length = MAX_POLYGON_VALUES;
  } else if (isShapeKind(kind) || kind === "eraser-rect") {
    if (points.length < 6) return null;
    points.length = 6;
  }
  const page = isFiniteNumber(value.page) && value.page >= 1 ? Math.floor(value.page) : pageFallback;
  const color = typeof value.color === "string" && value.color ? value.color : "#1e1e1e";
  const width = isFiniteNumber(value.width) && value.width > 0 ? value.width : 3e-3;
  const opacity = isFiniteNumber(value.opacity) ? clamp(value.opacity, 0, 1) : 1;
  return {
    id: typeof value.id === "string" && value.id ? value.id : uid("s"),
    kind,
    page,
    color,
    width,
    opacity,
    points,
    ...value.fill === true ? { fill: true } : {},
    ...rings ? { rings } : {}
  };
}
function normalizeDoc(raw, filePath) {
  const doc = createDoc(filePath);
  if (!raw || typeof raw !== "object") return doc;
  const value = raw;
  const layersRaw = value.layers;
  if (Array.isArray(layersRaw)) {
    const layers = [];
    for (const layerRaw of layersRaw) {
      if (!layerRaw || typeof layerRaw !== "object") continue;
      const layerValue = layerRaw;
      const layer = {
        id: typeof layerValue.id === "string" && layerValue.id ? layerValue.id : uid("l"),
        name: typeof layerValue.name === "string" && layerValue.name ? layerValue.name : `\u56FE\u5C42 ${layers.length + 1}`,
        visible: layerValue.visible !== false,
        locked: layerValue.locked === true,
        opacity: isFiniteNumber(layerValue.opacity) ? clamp(layerValue.opacity, 0, 1) : 1,
        strokes: []
      };
      if (Array.isArray(layerValue.strokes)) {
        for (const strokeRaw of layerValue.strokes) {
          const stroke = sanitizeStroke(strokeRaw, 1);
          if (stroke) layer.strokes.push(stroke);
        }
      }
      layers.push(layer);
    }
    if (layers.length > 0) doc.layers = layers;
  }
  const activeId = typeof value.activeLayerId === "string" ? value.activeLayerId : null;
  doc.activeLayerId = findLayer(doc, activeId)?.id ?? doc.layers[doc.layers.length - 1]?.id ?? null;
  doc.updated = isFiniteNumber(value.updated) ? value.updated : Date.now();
  return doc;
}

// src/history.ts
var History = class {
  constructor(limit = 200) {
    this.past = [];
    this.future = [];
    this.limit = limit;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  get undoLabel() {
    return this.past[this.past.length - 1]?.label ?? "";
  }
  get redoLabel() {
    return this.future[this.future.length - 1]?.label ?? "";
  }
  push(entry) {
    this.past.push(entry);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  }
  undo() {
    const entry = this.past.pop();
    if (!entry) return false;
    entry.undo();
    this.future.push(entry);
    return true;
  }
  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    entry.redo();
    this.past.push(entry);
    return true;
  }
  clear() {
    this.past.length = 0;
    this.future.length = 0;
  }
};

// node_modules/clipper2-ts/dist/Core.js
var ClipType;
(function(ClipType2) {
  ClipType2[ClipType2["NoClip"] = 0] = "NoClip";
  ClipType2[ClipType2["Intersection"] = 1] = "Intersection";
  ClipType2[ClipType2["Union"] = 2] = "Union";
  ClipType2[ClipType2["Difference"] = 3] = "Difference";
  ClipType2[ClipType2["Xor"] = 4] = "Xor";
})(ClipType || (ClipType = {}));
var PathType;
(function(PathType2) {
  PathType2[PathType2["Subject"] = 0] = "Subject";
  PathType2[PathType2["Clip"] = 1] = "Clip";
})(PathType || (PathType = {}));
var FillRule;
(function(FillRule2) {
  FillRule2[FillRule2["EvenOdd"] = 0] = "EvenOdd";
  FillRule2[FillRule2["NonZero"] = 1] = "NonZero";
  FillRule2[FillRule2["Positive"] = 2] = "Positive";
  FillRule2[FillRule2["Negative"] = 3] = "Negative";
})(FillRule || (FillRule = {}));
var PointInPolygonResult;
(function(PointInPolygonResult2) {
  PointInPolygonResult2[PointInPolygonResult2["IsOn"] = 0] = "IsOn";
  PointInPolygonResult2[PointInPolygonResult2["IsInside"] = 1] = "IsInside";
  PointInPolygonResult2[PointInPolygonResult2["IsOutside"] = 2] = "IsOutside";
})(PointInPolygonResult || (PointInPolygonResult = {}));
var maxSafeInteger = Number.MAX_SAFE_INTEGER;
var maxDeltaForSafeProduct = Math.floor(Math.sqrt(maxSafeInteger));
function isSafeProduct(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b))
    return false;
  if (a === 0 || b === 0)
    return true;
  return Math.abs(a) <= maxSafeInteger / Math.abs(b);
}
function isSafeSum(a, b) {
  return Math.abs(a) + Math.abs(b) <= maxSafeInteger;
}
function safeMultiplyDifference(a, b, c, d) {
  if (isSafeProduct(a, b) && isSafeProduct(c, d)) {
    const prod1 = a * b;
    const prod2 = c * d;
    if (isSafeSum(prod1, prod2)) {
      return prod1 - prod2;
    }
  }
  if (Number.isSafeInteger(a) && Number.isSafeInteger(b) && Number.isSafeInteger(c) && Number.isSafeInteger(d)) {
    return Number(BigInt(a) * BigInt(b) - BigInt(c) * BigInt(d));
  }
  return a * b - c * d;
}
function safeMultiplySum(a, b, c, d) {
  if (isSafeProduct(a, b) && isSafeProduct(c, d)) {
    const prod1 = a * b;
    const prod2 = c * d;
    if (isSafeSum(prod1, prod2)) {
      return prod1 + prod2;
    }
  }
  if (Number.isSafeInteger(a) && Number.isSafeInteger(b) && Number.isSafeInteger(c) && Number.isSafeInteger(d)) {
    return Number(BigInt(a) * BigInt(b) + BigInt(c) * BigInt(d));
  }
  return a * b + c * d;
}
var B0 = BigInt(0);
var B2 = BigInt(2);
var B4 = BigInt(4);
var B64 = BigInt(64);
var UINT64_MASK = BigInt("0xFFFFFFFFFFFFFFFF");
var IC_MaxInt64 = BigInt("9223372036854775807");
var IC_MaxCoord = Number(IC_MaxInt64 / B4);
var IC_Invalid64 = Number(IC_MaxInt64);
var IC_floatingPointTolerance = 1e-12;
var IC_defaultMinimumEdgeLength = 0.1;
var IC_maxCoordForSafeAreaProduct = Math.floor(maxDeltaForSafeProduct / 2);
var IC_maxCoordForSafeCrossSq = Math.floor(Math.sqrt(Math.sqrt(maxSafeInteger / 4)));
function maxSafeCoordinateForScale(scale) {
  if (!Number.isFinite(scale)) {
    throw new RangeError("Scale must be a finite number");
  }
  const absScale = Math.abs(scale);
  if (absScale === 0)
    return Number.POSITIVE_INFINITY;
  return maxSafeInteger / absScale;
}
function checkSafeScaleValue(value, maxAbs, context) {
  if (!Number.isFinite(value) || Math.abs(value) > maxAbs) {
    throw new RangeError(`Scaled coordinate exceeds Number.MAX_SAFE_INTEGER in ${context}`);
  }
}
function ensureSafeInteger(value, context) {
  if (!Number.isFinite(value) || Math.abs(value) > maxSafeInteger) {
    throw new RangeError(`Coordinate exceeds Number.MAX_SAFE_INTEGER in ${context}`);
  }
}
function crossProduct(pt1, pt2, pt3) {
  const a = pt2.x - pt1.x;
  const b = pt3.y - pt2.y;
  const c = pt2.y - pt1.y;
  const d = pt3.x - pt2.x;
  if (Math.abs(a) < maxDeltaForSafeProduct && Math.abs(b) < maxDeltaForSafeProduct && Math.abs(c) < maxDeltaForSafeProduct && Math.abs(d) < maxDeltaForSafeProduct) {
    return a * b - c * d;
  }
  return safeMultiplyDifference(a, b, c, d);
}
function crossProductSign(pt1, pt2, pt3) {
  const a = pt2.x - pt1.x;
  const b = pt3.y - pt2.y;
  const c = pt2.y - pt1.y;
  const d = pt3.x - pt2.x;
  if (Math.abs(a) < maxDeltaForSafeProduct && Math.abs(b) < maxDeltaForSafeProduct && Math.abs(c) < maxDeltaForSafeProduct && Math.abs(d) < maxDeltaForSafeProduct) {
    const prod1 = a * b;
    const prod2 = c * d;
    return prod1 > prod2 ? 1 : prod1 < prod2 ? -1 : 0;
  }
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(c) || !Number.isSafeInteger(d)) {
    const prod1 = a * b;
    const prod2 = c * d;
    return prod1 > prod2 ? 1 : prod1 < prod2 ? -1 : 0;
  }
  const bigProd1 = BigInt(a) * BigInt(b);
  const bigProd2 = BigInt(c) * BigInt(d);
  if (bigProd1 === bigProd2)
    return 0;
  return bigProd1 > bigProd2 ? 1 : -1;
}
function checkPrecision(precision) {
  if (precision < -8 || precision > 8) {
    throw new Error("Error: Precision is out of range.");
  }
}
function isAlmostZero(value) {
  return Math.abs(value) <= IC_floatingPointTolerance;
}
function triSign(x) {
  return x < 0 ? -1 : x > 0 ? 1 : 0;
}
function multiplyUInt64(a, b) {
  const aBig = BigInt(a);
  const bBig = BigInt(b);
  const res = aBig * bBig;
  return {
    lo64: res & UINT64_MASK,
    hi64: res >> B64
  };
}
function productsAreEqual(a, b, c, d) {
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const absC = Math.abs(c);
  const absD = Math.abs(d);
  if (absA < maxDeltaForSafeProduct && absB < maxDeltaForSafeProduct && absC < maxDeltaForSafeProduct && absD < maxDeltaForSafeProduct) {
    return a * b === c * d;
  }
  const signAb = (a < 0 ? -1 : a > 0 ? 1 : 0) * (b < 0 ? -1 : b > 0 ? 1 : 0);
  const signCd = (c < 0 ? -1 : c > 0 ? 1 : 0) * (d < 0 ? -1 : d > 0 ? 1 : 0);
  if (signAb !== signCd)
    return false;
  if (signAb === 0)
    return true;
  if (!Number.isSafeInteger(absA) || !Number.isSafeInteger(absB) || !Number.isSafeInteger(absC) || !Number.isSafeInteger(absD)) {
    return a * b === c * d;
  }
  const bigA = BigInt(absA);
  const bigB = BigInt(absB);
  const bigC = BigInt(absC);
  const bigD = BigInt(absD);
  return bigA * bigB === bigC * bigD;
}
function isCollinear(pt1, sharedPt, pt2) {
  const a = sharedPt.x - pt1.x;
  const b = pt2.y - sharedPt.y;
  const c = sharedPt.y - pt1.y;
  const d = pt2.x - sharedPt.x;
  return productsAreEqual(a, b, c, d);
}
function dotProduct(pt1, pt2, pt3) {
  const a = pt2.x - pt1.x;
  const b = pt3.x - pt2.x;
  const c = pt2.y - pt1.y;
  const d = pt3.y - pt2.y;
  if (Math.abs(a) < maxDeltaForSafeProduct && Math.abs(b) < maxDeltaForSafeProduct && Math.abs(c) < maxDeltaForSafeProduct && Math.abs(d) < maxDeltaForSafeProduct) {
    return a * b + c * d;
  }
  return safeMultiplySum(a, b, c, d);
}
function dotProductSign(pt1, pt2, pt3) {
  const a = pt2.x - pt1.x;
  const b = pt3.x - pt2.x;
  const c = pt2.y - pt1.y;
  const d = pt3.y - pt2.y;
  if (Math.abs(a) < maxDeltaForSafeProduct && Math.abs(b) < maxDeltaForSafeProduct && Math.abs(c) < maxDeltaForSafeProduct && Math.abs(d) < maxDeltaForSafeProduct) {
    const sum = a * b + c * d;
    return sum > 0 ? 1 : sum < 0 ? -1 : 0;
  }
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(c) || !Number.isSafeInteger(d)) {
    const sum = a * b + c * d;
    return sum > 0 ? 1 : sum < 0 ? -1 : 0;
  }
  const bigSum = BigInt(a) * BigInt(b) + BigInt(c) * BigInt(d);
  if (bigSum === B0)
    return 0;
  return bigSum > B0 ? 1 : -1;
}
function icArea(path) {
  const cnt = path.length;
  if (cnt < 3)
    return 0;
  let allSmall = true;
  for (let i = 0; i < cnt && allSmall; i++) {
    const pt = path[i];
    if (Math.abs(pt.x) >= IC_maxCoordForSafeAreaProduct || Math.abs(pt.y) >= IC_maxCoordForSafeAreaProduct) {
      allSmall = false;
    }
  }
  let prevPt = path[cnt - 1];
  if (allSmall) {
    let total = 0;
    for (const pt of path) {
      total += (prevPt.y + pt.y) * (prevPt.x - pt.x);
      prevPt = pt;
    }
    return total * 0.5;
  }
  let totalBig = B0;
  for (const pt of path) {
    const sum = prevPt.y + pt.y;
    const diff = prevPt.x - pt.x;
    if (Number.isSafeInteger(sum) && Number.isSafeInteger(diff)) {
      totalBig += BigInt(sum) * BigInt(diff);
    } else if (Number.isSafeInteger(prevPt.y) && Number.isSafeInteger(pt.y) && Number.isSafeInteger(prevPt.x) && Number.isSafeInteger(pt.x)) {
      const sumBig = BigInt(prevPt.y) + BigInt(pt.y);
      const diffBig = BigInt(prevPt.x) - BigInt(pt.x);
      totalBig += sumBig * diffBig;
    } else {
      totalBig += BigInt(Math.round(sum * diff));
    }
    prevPt = pt;
  }
  return Number(totalBig) * 0.5;
}
function crossProductD(vec1, vec2) {
  return vec1.y * vec2.x - vec2.y * vec1.x;
}
function dotProductD(vec1, vec2) {
  return vec1.x * vec2.x + vec1.y * vec2.y;
}
function roundToEven(value) {
  const r = Math.round(value);
  if (value === r - 0.5 && (r & 1) !== 0)
    return r - 1;
  return r;
}
function checkCastInt64(val) {
  if (val >= IC_MaxCoord || val <= -IC_MaxCoord)
    return IC_Invalid64;
  return Math.round(val);
}
function getLineIntersectPt(ln1a, ln1b, ln2a, ln2b) {
  const dy1 = ln1b.y - ln1a.y;
  const dx1 = ln1b.x - ln1a.x;
  const dy2 = ln2b.y - ln2a.y;
  const dx2 = ln2b.x - ln2a.x;
  const det = safeMultiplyDifference(dy1, dx2, dy2, dx1);
  if (det === 0) {
    return null;
  }
  const t = safeMultiplyDifference(ln1a.x - ln2a.x, dy2, ln1a.y - ln2a.y, dx2) / det;
  if (t <= 0) {
    return { x: ln1a.x, y: ln1a.y, z: ln1a.z || 0 };
  } else if (t >= 1) {
    return { x: ln1b.x, y: ln1b.y, z: ln1b.z || 0 };
  } else {
    return {
      x: Math.trunc(ln1a.x + t * dx1),
      y: Math.trunc(ln1a.y + t * dy1),
      z: 0
    };
  }
}
function getLineIntersectPtD(ln1a, ln1b, ln2a, ln2b) {
  const dy1 = ln1b.y - ln1a.y;
  const dx1 = ln1b.x - ln1a.x;
  const dy2 = ln2b.y - ln2a.y;
  const dx2 = ln2b.x - ln2a.x;
  const det = dy1 * dx2 - dy2 * dx1;
  if (det === 0) {
    return { success: false, ip: { x: 0, y: 0, z: 0 } };
  }
  const t = ((ln1a.x - ln2a.x) * dy2 - (ln1a.y - ln2a.y) * dx2) / det;
  let ip;
  if (t <= 0) {
    ip = { ...ln1a, z: 0 };
  } else if (t >= 1) {
    ip = { ...ln1b, z: 0 };
  } else {
    ip = {
      x: ln1a.x + t * dx1,
      y: ln1a.y + t * dy1,
      z: 0
    };
  }
  return { success: true, ip };
}
function segsIntersect(seg1a, seg1b, seg2a, seg2b, inclusive = false) {
  if (!inclusive) {
    const s1 = crossProductSign(seg1a, seg2a, seg2b);
    const s2 = crossProductSign(seg1b, seg2a, seg2b);
    const s3 = crossProductSign(seg2a, seg1a, seg1b);
    const s4 = crossProductSign(seg2b, seg1a, seg1b);
    return s1 !== 0 && s2 !== 0 && s1 !== s2 && (s3 !== 0 && s4 !== 0 && s3 !== s4);
  }
  const res1 = crossProductSign(seg1a, seg2a, seg2b);
  const res2 = crossProductSign(seg1b, seg2a, seg2b);
  if (res1 !== 0 && res1 === res2)
    return false;
  const res3 = crossProductSign(seg2a, seg1a, seg1b);
  const res4 = crossProductSign(seg2b, seg1a, seg1b);
  if (res3 !== 0 && res3 === res4)
    return false;
  return res1 !== 0 || res2 !== 0 || res3 !== 0 || res4 !== 0;
}
function icGetBounds(path) {
  if (path.length === 0)
    return { left: 0, top: 0, right: 0, bottom: 0 };
  const result = {
    left: Number.MAX_SAFE_INTEGER,
    top: Number.MAX_SAFE_INTEGER,
    right: Number.MIN_SAFE_INTEGER,
    bottom: Number.MIN_SAFE_INTEGER
  };
  for (const pt of path) {
    if (pt.x < result.left)
      result.left = pt.x;
    if (pt.x > result.right)
      result.right = pt.x;
    if (pt.y < result.top)
      result.top = pt.y;
    if (pt.y > result.bottom)
      result.bottom = pt.y;
  }
  return result.left === Number.MAX_SAFE_INTEGER ? { left: 0, top: 0, right: 0, bottom: 0 } : result;
}
function getClosestPtOnSegment(offPt, seg1, seg2) {
  if (seg1.x === seg2.x && seg1.y === seg2.y)
    return { x: seg1.x, y: seg1.y, z: 0 };
  const dx = seg2.x - seg1.x;
  const dy = seg2.y - seg1.y;
  const q = safeMultiplySum(offPt.x - seg1.x, dx, offPt.y - seg1.y, dy) / safeMultiplySum(dx, dx, dy, dy);
  const qClamped = q < 0 ? 0 : q > 1 ? 1 : q;
  return {
    // use Math.round to match the C# MidpointRounding.ToEven behavior
    x: Math.round(seg1.x + qClamped * dx),
    y: Math.round(seg1.y + qClamped * dy),
    z: 0
  };
}
function icPointInPolygon(pt, polygon) {
  const len = polygon.length;
  let start = 0;
  if (len < 3)
    return PointInPolygonResult.IsOutside;
  while (start < len && polygon[start].y === pt.y)
    start++;
  if (start === len)
    return PointInPolygonResult.IsOutside;
  let isAbove = polygon[start].y < pt.y;
  const startingAbove = isAbove;
  let val = 0;
  let i = start + 1;
  let end = len;
  while (true) {
    if (i === end) {
      if (end === 0 || start === 0)
        break;
      end = start;
      i = 0;
    }
    if (isAbove) {
      while (i < end && polygon[i].y < pt.y)
        i++;
    } else {
      while (i < end && polygon[i].y > pt.y)
        i++;
    }
    if (i === end)
      continue;
    const curr = polygon[i];
    const prev = i > 0 ? polygon[i - 1] : polygon[len - 1];
    if (curr.y === pt.y) {
      if (curr.x === pt.x || curr.y === prev.y && pt.x < prev.x !== pt.x < curr.x) {
        return PointInPolygonResult.IsOn;
      }
      i++;
      if (i === start)
        break;
      continue;
    }
    if (pt.x < curr.x && pt.x < prev.x) {
    } else if (pt.x > prev.x && pt.x > curr.x) {
      val = 1 - val;
    } else {
      const cps2 = crossProductSign(prev, curr, pt);
      if (cps2 === 0)
        return PointInPolygonResult.IsOn;
      if (cps2 < 0 === isAbove)
        val = 1 - val;
    }
    isAbove = !isAbove;
    i++;
  }
  if (isAbove === startingAbove) {
    return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
  }
  if (i === len)
    i = 0;
  const cps = i === 0 ? crossProductSign(polygon[len - 1], polygon[0], pt) : crossProductSign(polygon[i - 1], polygon[i], pt);
  if (cps === 0)
    return PointInPolygonResult.IsOn;
  if (cps < 0 === isAbove)
    val = 1 - val;
  return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
}
function path2ContainsPath1(path1, path2) {
  let pip = PointInPolygonResult.IsOn;
  for (const pt of path1) {
    switch (icPointInPolygon(pt, path2)) {
      case PointInPolygonResult.IsOutside:
        if (pip === PointInPolygonResult.IsOutside)
          return false;
        pip = PointInPolygonResult.IsOutside;
        break;
      case PointInPolygonResult.IsInside:
        if (pip === PointInPolygonResult.IsInside)
          return true;
        pip = PointInPolygonResult.IsInside;
        break;
      default:
        break;
    }
  }
  const mp = icGetBounds(path1);
  let midX, midY;
  if (Number.isSafeInteger(mp.left) && Number.isSafeInteger(mp.right) && Math.abs(mp.left) + Math.abs(mp.right) > Number.MAX_SAFE_INTEGER) {
    midX = Number((BigInt(mp.left) + BigInt(mp.right)) / B2);
    midY = Number((BigInt(mp.top) + BigInt(mp.bottom)) / B2);
  } else {
    midX = Math.round((mp.left + mp.right) / 2);
    midY = Math.round((mp.top + mp.bottom) / 2);
  }
  const midPt = { x: midX, y: midY };
  return icPointInPolygon(midPt, path2) !== PointInPolygonResult.IsOutside;
}
var InternalClipper = {
  MaxInt64: IC_MaxInt64,
  MaxCoord: IC_MaxCoord,
  max_coord: IC_MaxCoord,
  min_coord: -IC_MaxCoord,
  Invalid64: IC_Invalid64,
  floatingPointTolerance: IC_floatingPointTolerance,
  defaultMinimumEdgeLength: IC_defaultMinimumEdgeLength,
  maxCoordForSafeAreaProduct: IC_maxCoordForSafeAreaProduct,
  maxCoordForSafeCrossSq: IC_maxCoordForSafeCrossSq,
  maxSafeCoordinateForScale,
  checkSafeScaleValue,
  ensureSafeInteger,
  crossProduct,
  crossProductSign,
  checkPrecision,
  isAlmostZero,
  triSign,
  multiplyUInt64,
  productsAreEqual,
  isCollinear,
  dotProduct,
  dotProductSign,
  area: icArea,
  crossProductD,
  dotProductD,
  roundToEven,
  checkCastInt64,
  getLineIntersectPt,
  getLineIntersectPtD,
  segsIntersect,
  getBounds: icGetBounds,
  getClosestPtOnSegment,
  pointInPolygon: icPointInPolygon,
  path2ContainsPath1
};
var Point64Utils = {
  create(x = 0, y = 0, z = 0) {
    return { x: Math.round(x), y: Math.round(y), z };
  },
  fromPointD(pt) {
    InternalClipper.ensureSafeInteger(pt.x, "Point64Utils.fromPointD");
    InternalClipper.ensureSafeInteger(pt.y, "Point64Utils.fromPointD");
    return { x: Math.round(pt.x), y: Math.round(pt.y), z: pt.z || 0 };
  },
  scale(pt, scale) {
    return {
      x: Math.round(pt.x * scale),
      y: Math.round(pt.y * scale),
      z: pt.z || 0
    };
  },
  equals(a, b) {
    return a.x === b.x && a.y === b.y;
  },
  add(a, b) {
    if (Number.isSafeInteger(a.x) && Number.isSafeInteger(b.x) && Number.isSafeInteger(a.y) && Number.isSafeInteger(b.y)) {
      const sumX = a.x + b.x;
      const sumY = a.y + b.y;
      if (Number.isSafeInteger(sumX) && Number.isSafeInteger(sumY)) {
        return { x: sumX, y: sumY, z: 0 };
      }
      return {
        x: Number(BigInt(a.x) + BigInt(b.x)),
        y: Number(BigInt(a.y) + BigInt(b.y)),
        z: 0
      };
    }
    return { x: a.x + b.x, y: a.y + b.y, z: 0 };
  },
  subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: 0 };
  },
  toString(pt) {
    if (pt.z !== void 0 && pt.z !== 0) {
      return `${pt.x},${pt.y},${pt.z} `;
    }
    return `${pt.x},${pt.y} `;
  }
};
var PointDUtils = {
  create(x = 0, y = 0, z = 0) {
    return { x, y, z };
  },
  fromPoint64(pt) {
    return { x: pt.x, y: pt.y, z: pt.z || 0 };
  },
  scale(pt, scale) {
    return { x: pt.x * scale, y: pt.y * scale, z: pt.z || 0 };
  },
  equals(a, b) {
    return InternalClipper.isAlmostZero(a.x - b.x) && InternalClipper.isAlmostZero(a.y - b.y);
  },
  negate(pt) {
    pt.x = -pt.x;
    pt.y = -pt.y;
  },
  toString(pt, precision = 2) {
    if (pt.z !== void 0 && pt.z !== 0) {
      return `${pt.x.toFixed(precision)},${pt.y.toFixed(precision)},${pt.z}`;
    }
    return `${pt.x.toFixed(precision)},${pt.y.toFixed(precision)}`;
  }
};
var Rect64Utils = {
  create(l = 0, t = 0, r = 0, b = 0) {
    return { left: l, top: t, right: r, bottom: b };
  },
  createInvalid() {
    return {
      left: Number.MAX_SAFE_INTEGER,
      top: Number.MAX_SAFE_INTEGER,
      right: Number.MIN_SAFE_INTEGER,
      bottom: Number.MIN_SAFE_INTEGER
    };
  },
  width(rect) {
    return rect.right - rect.left;
  },
  height(rect) {
    return rect.bottom - rect.top;
  },
  isEmpty(rect) {
    return rect.bottom <= rect.top || rect.right <= rect.left;
  },
  isValid(rect) {
    return rect.left < Number.MAX_SAFE_INTEGER;
  },
  midPoint(rect) {
    if (Number.isSafeInteger(rect.left) && Number.isSafeInteger(rect.right) && Math.abs(rect.left) + Math.abs(rect.right) > Number.MAX_SAFE_INTEGER) {
      const midX = Number((BigInt(rect.left) + BigInt(rect.right)) / B2);
      const midY = Number((BigInt(rect.top) + BigInt(rect.bottom)) / B2);
      return { x: midX, y: midY };
    }
    return {
      x: Math.round((rect.left + rect.right) / 2),
      y: Math.round((rect.top + rect.bottom) / 2)
    };
  },
  contains(rect, pt) {
    return pt.x > rect.left && pt.x < rect.right && pt.y > rect.top && pt.y < rect.bottom;
  },
  containsRect(rect, rec) {
    return rec.left >= rect.left && rec.right <= rect.right && rec.top >= rect.top && rec.bottom <= rect.bottom;
  },
  intersects(rect, rec) {
    return Math.max(rect.left, rec.left) <= Math.min(rect.right, rec.right) && Math.max(rect.top, rec.top) <= Math.min(rect.bottom, rec.bottom);
  },
  asPath(rect) {
    return [
      { x: rect.left, y: rect.top, z: 0 },
      { x: rect.right, y: rect.top, z: 0 },
      { x: rect.right, y: rect.bottom, z: 0 },
      { x: rect.left, y: rect.bottom, z: 0 }
    ];
  }
};
var RectDUtils = {
  create(l = 0, t = 0, r = 0, b = 0) {
    return { left: l, top: t, right: r, bottom: b };
  },
  createInvalid() {
    return {
      left: Number.MAX_VALUE,
      top: Number.MAX_VALUE,
      right: -Number.MAX_VALUE,
      bottom: -Number.MAX_VALUE
    };
  },
  width(rect) {
    return rect.right - rect.left;
  },
  height(rect) {
    return rect.bottom - rect.top;
  },
  isEmpty(rect) {
    return rect.bottom <= rect.top || rect.right <= rect.left;
  },
  midPoint(rect) {
    return {
      x: (rect.left + rect.right) / 2,
      y: (rect.top + rect.bottom) / 2
    };
  },
  contains(rect, pt) {
    return pt.x > rect.left && pt.x < rect.right && pt.y > rect.top && pt.y < rect.bottom;
  },
  containsRect(rect, rec) {
    return rec.left >= rect.left && rec.right <= rect.right && rec.top >= rect.top && rec.bottom <= rect.bottom;
  },
  intersects(rect, rec) {
    return Math.max(rect.left, rec.left) < Math.min(rect.right, rec.right) && Math.max(rect.top, rec.top) < Math.min(rect.bottom, rec.bottom);
  },
  asPath(rect) {
    return [
      { x: rect.left, y: rect.top, z: 0 },
      { x: rect.right, y: rect.top, z: 0 },
      { x: rect.right, y: rect.bottom, z: 0 },
      { x: rect.left, y: rect.bottom, z: 0 }
    ];
  }
};
var InvalidRect64 = Object.freeze(Rect64Utils.createInvalid());
var InvalidRectD = Object.freeze(RectDUtils.createInvalid());

// node_modules/clipper2-ts/dist/Engine.js
var B02 = BigInt(0);
var B22 = BigInt(2);
var B42 = BigInt(4);
var VertexFlags;
(function(VertexFlags2) {
  VertexFlags2[VertexFlags2["None"] = 0] = "None";
  VertexFlags2[VertexFlags2["OpenStart"] = 1] = "OpenStart";
  VertexFlags2[VertexFlags2["OpenEnd"] = 2] = "OpenEnd";
  VertexFlags2[VertexFlags2["LocalMax"] = 4] = "LocalMax";
  VertexFlags2[VertexFlags2["LocalMin"] = 8] = "LocalMin";
})(VertexFlags || (VertexFlags = {}));
var ScanlineHeap = class {
  constructor() {
    __publicField(this, "data", []);
  }
  push(value) {
    this.data.push(value);
    this.siftUp(this.data.length - 1);
  }
  pop() {
    if (this.data.length === 0)
      return null;
    const max = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return max;
  }
  clear() {
    this.data.length = 0;
  }
  // Hole-sift: lift the value once, shift parents/children, then place.
  // Avoids temporary array allocation from destructuring swap on every step.
  siftUp(index) {
    const val = this.data[index];
    while (index > 0) {
      const parent = index - 1 >> 1;
      if (this.data[parent] >= val)
        break;
      this.data[index] = this.data[parent];
      index = parent;
    }
    this.data[index] = val;
  }
  siftDown(index) {
    const length = this.data.length;
    const val = this.data[index];
    while (true) {
      const left = (index << 1) + 1;
      if (left >= length)
        break;
      const right = left + 1;
      let child = left;
      if (right < length && this.data[right] > this.data[left])
        child = right;
      if (this.data[child] <= val)
        break;
      this.data[index] = this.data[child];
      index = child;
    }
    this.data[index] = val;
  }
};
var Vertex = class {
  constructor(pt, flags, prev) {
    __publicField(this, "pt");
    __publicField(this, "next", null);
    __publicField(this, "prev", null);
    __publicField(this, "flags");
    this.pt = pt;
    this.flags = flags;
    this.prev = prev;
  }
};
var LocalMinima = class {
  constructor(vertex, polytype, isOpen = false) {
    __publicField(this, "vertex");
    __publicField(this, "polytype");
    __publicField(this, "isOpen");
    this.vertex = vertex;
    this.polytype = polytype;
    this.isOpen = isOpen;
  }
  equals(other) {
    return other !== null && this.vertex === other.vertex;
  }
};
function createIntersectNode(pt, edge1, edge2) {
  return { pt, edge1, edge2 };
}
var OutPt = class {
  constructor(pt, outrec) {
    __publicField(this, "pt");
    __publicField(this, "next");
    __publicField(this, "prev");
    __publicField(this, "outrec");
    __publicField(this, "horz");
    this.pt = pt;
    this.outrec = outrec;
    this.next = this;
    this.prev = this;
    this.horz = null;
  }
};
var JoinWith;
(function(JoinWith2) {
  JoinWith2[JoinWith2["None"] = 0] = "None";
  JoinWith2[JoinWith2["Left"] = 1] = "Left";
  JoinWith2[JoinWith2["Right"] = 2] = "Right";
})(JoinWith || (JoinWith = {}));
var HorzPosition;
(function(HorzPosition2) {
  HorzPosition2[HorzPosition2["Bottom"] = 0] = "Bottom";
  HorzPosition2[HorzPosition2["Middle"] = 1] = "Middle";
  HorzPosition2[HorzPosition2["Top"] = 2] = "Top";
})(HorzPosition || (HorzPosition = {}));
var OutRec = class {
  constructor() {
    __publicField(this, "idx", 0);
    __publicField(this, "owner", null);
    __publicField(this, "frontEdge", null);
    __publicField(this, "backEdge", null);
    __publicField(this, "pts", null);
    __publicField(this, "polypath", null);
    __publicField(this, "bounds", { left: 0, top: 0, right: 0, bottom: 0 });
    __publicField(this, "path", []);
    __publicField(this, "isOpen", false);
    __publicField(this, "splits", null);
    __publicField(this, "recursiveSplit", null);
  }
};
var HorzSegment = class {
  constructor(op) {
    __publicField(this, "leftOp");
    __publicField(this, "rightOp");
    __publicField(this, "leftToRight");
    this.leftOp = op;
    this.rightOp = null;
    this.leftToRight = true;
  }
};
var HorzJoin = class {
  constructor(ltor, rtol) {
    __publicField(this, "op1");
    __publicField(this, "op2");
    this.op1 = ltor;
    this.op2 = rtol;
  }
};
function compareHorzSegments(hs1, hs2) {
  if (hs1.rightOp === null) {
    return hs2.rightOp === null ? 0 : 1;
  }
  if (hs2.rightOp === null)
    return -1;
  return hs1.leftOp.pt.x - hs2.leftOp.pt.x;
}
function compareIntersectNodes(a, b) {
  if (a.pt.y !== b.pt.y)
    return a.pt.y > b.pt.y ? -1 : 1;
  if (a.pt.x !== b.pt.x)
    return a.pt.x < b.pt.x ? -1 : 1;
  if (a.edge1.curX !== b.edge1.curX)
    return a.edge1.curX < b.edge1.curX ? -1 : 1;
  return a.edge2.curX < b.edge2.curX ? -1 : a.edge2.curX > b.edge2.curX ? 1 : 0;
}
var Active = class {
  constructor() {
    __publicField(this, "bot", { x: 0, y: 0 });
    __publicField(this, "top", { x: 0, y: 0 });
    __publicField(this, "curX", 0);
    // current (updated at every new scanline) - keep as number but ensure integer precision
    __publicField(this, "dx", 0);
    __publicField(this, "windDx", 0);
    // 1 or -1 depending on winding direction
    __publicField(this, "windCount", 0);
    __publicField(this, "windCount2", 0);
    // winding count of the opposite polytype
    __publicField(this, "outrec", null);
    // AEL: 'active edge list' (Vatti's AET - active edge table)
    //     a linked list of all edges (from left to right) that are present
    //     (or 'active') within the current scanbeam (a horizontal 'beam' that
    //     sweeps from bottom to top over the paths in the clipping operation).
    __publicField(this, "prevInAEL", null);
    __publicField(this, "nextInAEL", null);
    // SEL: 'sorted edge list' (Vatti's ST - sorted table)
    //     linked list used when sorting edges into their new positions at the
    //     top of scanbeams, but also (re)used to process horizontals.
    __publicField(this, "prevInSEL", null);
    __publicField(this, "nextInSEL", null);
    __publicField(this, "jump", null);
    __publicField(this, "vertexTop", null);
    __publicField(this, "localMin", null);
    // the bottom of an edge 'bound' (also Vatti)
    __publicField(this, "isLeftBound", false);
    __publicField(this, "joinWith", JoinWith.None);
  }
};
var ClipperEngine = {
  addLocMin(vert, polytype, isOpen, minimaList) {
    if ((vert.flags & VertexFlags.LocalMin) !== VertexFlags.None)
      return;
    vert.flags |= VertexFlags.LocalMin;
    const lm = new LocalMinima(vert, polytype, isOpen);
    minimaList.push(lm);
  },
  addPathsToVertexList(paths, polytype, isOpen, minimaList, vertexList) {
    for (let i = 0, len = paths.length; i < len; i++) {
      const path = paths[i];
      let v0 = null;
      let prevV = null;
      let prevPt = null;
      for (let j = 0, len2 = path.length; j < len2; j++) {
        const pt = path[j];
        if (v0 === null) {
          v0 = new Vertex(pt, VertexFlags.None, null);
          vertexList.push(v0);
          prevV = v0;
          prevPt = pt;
        } else if (!(prevPt.x === pt.x && prevPt.y === pt.y)) {
          const currV2 = new Vertex(pt, VertexFlags.None, prevV);
          prevV.next = currV2;
          prevV = currV2;
          prevPt = pt;
        }
      }
      if (prevV?.prev == null)
        continue;
      if (!isOpen && prevV.pt.x === v0.pt.x && prevV.pt.y === v0.pt.y)
        prevV = prevV.prev;
      prevV.next = v0;
      v0.prev = prevV;
      if (!isOpen && prevV.next === prevV)
        continue;
      let goingUp;
      if (isOpen) {
        let currV2 = v0.next;
        while (currV2 !== v0 && currV2.pt.y === v0.pt.y)
          currV2 = currV2.next;
        goingUp = currV2.pt.y <= v0.pt.y;
        if (goingUp) {
          v0.flags = VertexFlags.OpenStart;
          ClipperEngine.addLocMin(v0, polytype, true, minimaList);
        } else {
          v0.flags = VertexFlags.OpenStart | VertexFlags.LocalMax;
        }
      } else {
        prevV = v0.prev;
        while (prevV !== v0 && prevV.pt.y === v0.pt.y)
          prevV = prevV.prev;
        if (prevV === v0)
          continue;
        goingUp = prevV.pt.y > v0.pt.y;
      }
      const goingUp0 = goingUp;
      prevV = v0;
      let currV = v0.next;
      while (currV !== v0) {
        if (currV.pt.y > prevV.pt.y && goingUp) {
          prevV.flags |= VertexFlags.LocalMax;
          goingUp = false;
        } else if (currV.pt.y < prevV.pt.y && !goingUp) {
          goingUp = true;
          ClipperEngine.addLocMin(prevV, polytype, isOpen, minimaList);
        }
        prevV = currV;
        currV = currV.next;
      }
      if (isOpen) {
        prevV.flags |= VertexFlags.OpenEnd;
        if (goingUp)
          prevV.flags |= VertexFlags.LocalMax;
        else
          ClipperEngine.addLocMin(prevV, polytype, isOpen, minimaList);
      } else if (goingUp !== goingUp0) {
        if (goingUp0)
          ClipperEngine.addLocMin(prevV, polytype, false, minimaList);
        else
          prevV.flags |= VertexFlags.LocalMax;
      }
    }
  }
};
var PolyPathBase = class {
  constructor(parent = null) {
    __publicField(this, "parent");
    __publicField(this, "children", []);
    this.parent = parent;
  }
  get isHole() {
    return this.getIsHole();
  }
  getLevel() {
    let result = 0;
    let pp = this.parent;
    while (pp !== null) {
      ++result;
      pp = pp.parent;
    }
    return result;
  }
  get level() {
    return this.getLevel();
  }
  getIsHole() {
    const lvl = this.getLevel();
    return lvl !== 0 && (lvl & 1) === 0;
  }
  get count() {
    return this.children.length;
  }
  clear() {
    this.children.length = 0;
  }
  toStringInternal(idx, level) {
    let result = "";
    const padding = "  ".repeat(level);
    const plural = this.children.length === 1 ? "" : "s";
    if ((level & 1) === 0) {
      result += `${padding}+- hole (${idx}) contains ${this.children.length} nested polygon${plural}.
`;
    } else {
      result += `${padding}+- polygon (${idx}) contains ${this.children.length} hole${plural}.
`;
    }
    for (let i = 0; i < this.count; i++) {
      if (this.children[i].count > 0) {
        result += this.children[i].toStringInternal(i, level + 1);
      }
    }
    return result;
  }
  toString() {
    if (this.level > 0)
      return "";
    const plural = this.children.length === 1 ? "" : "s";
    let result = `Polytree with ${this.children.length} polygon${plural}.
`;
    for (let i = 0; i < this.count; i++) {
      if (this.children[i].count > 0) {
        result += this.children[i].toStringInternal(i, 1);
      }
    }
    return result + "\n";
  }
};
var PolyPath64 = class _PolyPath64 extends PolyPathBase {
  // polytree root's polygon == null
  constructor(parent = null) {
    super(parent);
    __publicField(this, "polygon", null);
  }
  get poly() {
    return this.polygon;
  }
  addChild(p) {
    const newChild = new _PolyPath64(this);
    newChild.polygon = p;
    this.children.push(newChild);
    return newChild;
  }
  child(index) {
    if (index < 0 || index >= this.children.length) {
      throw new Error("Index out of range");
    }
    return this.children[index];
  }
  area() {
    let result = this.polygon === null ? 0 : Clipper.area(this.polygon);
    for (const child of this.children) {
      result += child.area();
    }
    return result;
  }
};
var PolyTree64 = class extends PolyPath64 {
};
var _ClipperBase = class _ClipperBase {
  constructor() {
    __publicField(this, "cliptype", ClipType.NoClip);
    __publicField(this, "fillrule", FillRule.EvenOdd);
    __publicField(this, "actives", null);
    __publicField(this, "sel", null);
    __publicField(this, "minimaList", []);
    __publicField(this, "intersectList", []);
    __publicField(this, "vertexList", []);
    __publicField(this, "outrecList", []);
    __publicField(this, "scanlineHeap", new ScanlineHeap());
    __publicField(this, "scanlineSet", /* @__PURE__ */ new Set());
    // For very small inputs, a heap + set can cost more than it saves.
    // Use an array-based scanline mode initially, and upgrade to heap+set
    // automatically if the scanline list grows beyond a threshold.
    __publicField(this, "scanlineArr", []);
    __publicField(this, "useScanlineArray", false);
    __publicField(this, "horzSegList", []);
    __publicField(this, "horzJoinList", []);
    __publicField(this, "currentLocMin", 0);
    __publicField(this, "currentBotY", 0);
    // True when every active edge's curX already equals topX(edge, topY) for the
    // scanbeam top being processed (set by buildIntersectList when the SEL scan
    // finds no inversions, i.e. no intersections; consumed by doTopOfScanbeam).
    __publicField(this, "curXValidAtTop", false);
    __publicField(this, "isSortedMinimaList", false);
    __publicField(this, "hasOpenPaths", false);
    __publicField(this, "usingPolytree", false);
    __publicField(this, "succeeded", false);
    // Cache Z callback for the duration of an execute to avoid repeated virtual calls
    // to getZCallback() in hot paths.
    __publicField(this, "zCallbackInternal");
    __publicField(this, "preserveCollinear", true);
    __publicField(this, "reverseSolution", false);
  }
  // Z-coordinate callback support
  // Override in subclasses (Clipper64/ClipperD) to provide callback
  getZCallback() {
    return void 0;
  }
  xyEqual(pt1, pt2) {
    return pt1.x === pt2.x && pt1.y === pt2.y;
  }
  setZ(ae1, ae2, intersectPt) {
    const zCallback = this.zCallbackInternal;
    if (!zCallback)
      return;
    if (_ClipperBase.getPolyType(ae1) === PathType.Subject) {
      if (this.xyEqual(intersectPt, ae1.bot)) {
        intersectPt.z = ae1.bot.z ?? 0;
      } else if (this.xyEqual(intersectPt, ae1.top)) {
        intersectPt.z = ae1.top.z ?? 0;
      } else if (this.xyEqual(intersectPt, ae2.bot)) {
        intersectPt.z = ae2.bot.z ?? 0;
      } else if (this.xyEqual(intersectPt, ae2.top)) {
        intersectPt.z = ae2.top.z ?? 0;
      } else {
        intersectPt.z = 0;
      }
      zCallback(ae1.bot, ae1.top, ae2.bot, ae2.top, intersectPt);
    } else {
      if (this.xyEqual(intersectPt, ae2.bot)) {
        intersectPt.z = ae2.bot.z ?? 0;
      } else if (this.xyEqual(intersectPt, ae2.top)) {
        intersectPt.z = ae2.top.z ?? 0;
      } else if (this.xyEqual(intersectPt, ae1.bot)) {
        intersectPt.z = ae1.bot.z ?? 0;
      } else if (this.xyEqual(intersectPt, ae1.top)) {
        intersectPt.z = ae1.top.z ?? 0;
      } else {
        intersectPt.z = 0;
      }
      zCallback(ae2.bot, ae2.top, ae1.bot, ae1.top, intersectPt);
    }
  }
  // Helper functions
  static isOdd(val) {
    return (val & 1) !== 0;
  }
  static isHotEdge(ae) {
    return ae.outrec != null;
  }
  static isOpen(ae) {
    return _ClipperBase.openPathsEnabled && ae.localMin.isOpen;
  }
  static isOpenEnd(ae) {
    return _ClipperBase.openPathsEnabled && ae.localMin.isOpen && _ClipperBase.isOpenEndVertex(ae.vertexTop);
  }
  static isOpenEndVertex(v) {
    return (v.flags & (VertexFlags.OpenStart | VertexFlags.OpenEnd)) !== VertexFlags.None;
  }
  static getPrevHotEdge(ae) {
    let prev = ae.prevInAEL;
    if (!_ClipperBase.openPathsEnabled) {
      while (prev !== null && !_ClipperBase.isHotEdge(prev)) {
        prev = prev.prevInAEL;
      }
      return prev;
    }
    while (prev !== null && (prev.localMin.isOpen || !_ClipperBase.isHotEdge(prev))) {
      prev = prev.prevInAEL;
    }
    return prev;
  }
  static isFront(ae) {
    return ae === ae.outrec.frontEdge;
  }
  /*******************************************************************************
  *  Dx:                             0(90deg)                                    *
  *                                  |                                           *
  *               +inf (180deg) <--- o ---> -inf (0deg)                          *
  *******************************************************************************/
  static getDx(pt1, pt2) {
    const dy = pt2.y - pt1.y;
    if (dy !== 0) {
      return (pt2.x - pt1.x) / dy;
    }
    return pt2.x > pt1.x ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  }
  static topX(ae, currentY) {
    if (currentY === ae.top.y || ae.top.x === ae.bot.x)
      return ae.top.x;
    if (currentY === ae.bot.y)
      return ae.bot.x;
    return InternalClipper.roundToEven(ae.bot.x + ae.dx * (currentY - ae.bot.y));
  }
  static isHorizontal(ae) {
    return ae.dx === Number.NEGATIVE_INFINITY || ae.dx === Number.POSITIVE_INFINITY;
  }
  static isHeadingRightHorz(ae) {
    return ae.dx === Number.NEGATIVE_INFINITY;
  }
  static isHeadingLeftHorz(ae) {
    return ae.dx === Number.POSITIVE_INFINITY;
  }
  static getPolyType(ae) {
    return ae.localMin.polytype;
  }
  static isSamePolyType(ae1, ae2) {
    return ae1.localMin.polytype === ae2.localMin.polytype;
  }
  static setDx(ae) {
    ae.dx = _ClipperBase.getDx(ae.bot, ae.top);
  }
  static nextVertex(ae) {
    return ae.windDx > 0 ? ae.vertexTop.next : ae.vertexTop.prev;
  }
  static prevPrevVertex(ae) {
    return ae.windDx > 0 ? ae.vertexTop.prev.prev : ae.vertexTop.next.next;
  }
  static isMaximaVertex(v) {
    return (v.flags & VertexFlags.LocalMax) !== VertexFlags.None;
  }
  static isMaximaEdge(ae) {
    return (ae.vertexTop.flags & VertexFlags.LocalMax) !== VertexFlags.None;
  }
  static getMaximaPair(ae) {
    let ae2 = ae.nextInAEL;
    while (ae2 !== null) {
      if (ae2.vertexTop === ae.vertexTop)
        return ae2;
      ae2 = ae2.nextInAEL;
    }
    return null;
  }
  // optimization (not in C# reference): fast bounding box overlap check for segment intersection
  boundingBoxesOverlap(p1, p2, p3, p4) {
    const min1x = p1.x < p2.x ? p1.x : p2.x;
    const max2x = p3.x > p4.x ? p3.x : p4.x;
    if (max2x < min1x)
      return false;
    const max1x = p1.x > p2.x ? p1.x : p2.x;
    const min2x = p3.x < p4.x ? p3.x : p4.x;
    if (max1x < min2x)
      return false;
    const min1y = p1.y < p2.y ? p1.y : p2.y;
    const max2y = p3.y > p4.y ? p3.y : p4.y;
    if (max2y < min1y)
      return false;
    const max1y = p1.y > p2.y ? p1.y : p2.y;
    const min2y = p3.y < p4.y ? p3.y : p4.y;
    return max1y >= min2y;
  }
  clearSolutionOnly() {
    while (this.actives !== null)
      this.deleteFromAEL(this.actives);
    this.scanlineHeap.clear();
    this.scanlineSet.clear();
    this.scanlineArr.length = 0;
    this.disposeIntersectNodes();
    this.outrecList.length = 0;
    this.horzSegList.length = 0;
    this.horzJoinList.length = 0;
  }
  clear() {
    this.clearSolutionOnly();
    this.minimaList.length = 0;
    this.vertexList.length = 0;
    this.currentLocMin = 0;
    this.isSortedMinimaList = false;
    this.hasOpenPaths = false;
  }
  reset() {
    if (!this.isSortedMinimaList) {
      this.minimaList.sort((a, b) => b.vertex.pt.y - a.vertex.pt.y);
      this.isSortedMinimaList = true;
    }
    this.scanlineHeap.clear();
    this.scanlineSet.clear();
    this.scanlineArr.length = 0;
    this.useScanlineArray = this.minimaList.length <= 16;
    for (let i = this.minimaList.length - 1; i >= 0; i--) {
      this.insertScanline(this.minimaList[i].vertex.pt.y);
    }
    this.currentBotY = 0;
    this.currentLocMin = 0;
    this.actives = null;
    this.sel = null;
    this.curXValidAtTop = false;
    this.succeeded = true;
  }
  upgradeScanlineStructureFromArray() {
    const arr = this.scanlineArr;
    for (let i = 0, len = arr.length; i < len; i++) {
      const y = arr[i];
      this.scanlineSet.add(y);
      this.scanlineHeap.push(y);
    }
    arr.length = 0;
    this.useScanlineArray = false;
  }
  insertScanline(y) {
    if (this.useScanlineArray) {
      const arr = this.scanlineArr;
      for (let i = 0, len = arr.length; i < len; i++) {
        if (arr[i] === y)
          return;
      }
      arr.push(y);
      if (arr.length > 64)
        this.upgradeScanlineStructureFromArray();
      return;
    }
    if (this.scanlineSet.has(y))
      return;
    this.scanlineSet.add(y);
    this.scanlineHeap.push(y);
  }
  // Returns the next scanline Y value, or null if empty.
  // Avoids allocating a wrapper object on every call in the main sweep loop.
  popScanline() {
    if (this.useScanlineArray) {
      const arr = this.scanlineArr;
      const len = arr.length;
      if (len === 0)
        return null;
      let bestIdx = 0;
      let bestY = arr[0];
      for (let i = 1; i < len; i++) {
        const v = arr[i];
        if (v > bestY) {
          bestY = v;
          bestIdx = i;
        }
      }
      arr[bestIdx] = arr[len - 1];
      arr.pop();
      return bestY;
    }
    const y = this.scanlineHeap.pop();
    if (y === null)
      return null;
    this.scanlineSet.delete(y);
    return y;
  }
  hasLocMinAtY(y) {
    return this.currentLocMin < this.minimaList.length && this.minimaList[this.currentLocMin].vertex.pt.y === y;
  }
  popLocalMinima() {
    return this.minimaList[this.currentLocMin++];
  }
  addPath(path, polytype, isOpen = false) {
    const tmp = [path];
    this.addPaths(tmp, polytype, isOpen);
  }
  addPaths(paths, polytype, isOpen = false) {
    if (isOpen)
      this.hasOpenPaths = true;
    this.isSortedMinimaList = false;
    ClipperEngine.addPathsToVertexList(paths, polytype, isOpen, this.minimaList, this.vertexList);
  }
  addReuseableData(reuseableData) {
    if (reuseableData["minimaList"].length === 0)
      return;
    this.isSortedMinimaList = false;
    for (const lm of reuseableData["minimaList"]) {
      this.minimaList.push(new LocalMinima(lm.vertex, lm.polytype, lm.isOpen));
      if (lm.isOpen)
        this.hasOpenPaths = true;
    }
  }
  deleteFromAEL(ae) {
    const prev = ae.prevInAEL;
    const next = ae.nextInAEL;
    if (prev === null && next === null && ae !== this.actives)
      return;
    if (prev !== null) {
      prev.nextInAEL = next;
    } else {
      this.actives = next;
    }
    if (next !== null)
      next.prevInAEL = prev;
  }
  getBounds() {
    const bounds2 = {
      left: Number.MAX_SAFE_INTEGER,
      top: Number.MAX_SAFE_INTEGER,
      right: Number.MIN_SAFE_INTEGER,
      bottom: Number.MIN_SAFE_INTEGER
    };
    for (const t of this.vertexList) {
      let v = t;
      do {
        if (v.pt.x < bounds2.left)
          bounds2.left = v.pt.x;
        if (v.pt.x > bounds2.right)
          bounds2.right = v.pt.x;
        if (v.pt.y < bounds2.top)
          bounds2.top = v.pt.y;
        if (v.pt.y > bounds2.bottom)
          bounds2.bottom = v.pt.y;
        v = v.next;
      } while (v !== t);
    }
    return Rect64Utils.isEmpty(bounds2) ? { left: 0, top: 0, right: 0, bottom: 0 } : bounds2;
  }
  executeInternal(ct, fillRule) {
    if (ct === ClipType.NoClip)
      return;
    _ClipperBase.openPathsEnabled = this.hasOpenPaths;
    this.zCallbackInternal = this.getZCallback();
    this.fillrule = fillRule;
    this.cliptype = ct;
    this.reset();
    let y = this.popScanline();
    if (y === null)
      return;
    while (this.succeeded) {
      this.insertLocalMinimaIntoAEL(y);
      let ae;
      while ((ae = this.popHorz()) !== null)
        this.doHorizontal(ae);
      if (this.horzSegList.length > 0) {
        this.convertHorzSegsToJoins();
        this.horzSegList.length = 0;
      }
      this.currentBotY = y;
      const nextY = this.popScanline();
      if (nextY === null)
        break;
      y = nextY;
      this.doIntersections(y);
      this.doTopOfScanbeam(y);
      while ((ae = this.popHorz()) !== null)
        this.doHorizontal(ae);
    }
    if (this.succeeded)
      this.processHorzJoins();
  }
  insertLocalMinimaIntoAEL(botY) {
    while (this.hasLocMinAtY(botY)) {
      const localMinima = this.popLocalMinima();
      let leftBound;
      if ((localMinima.vertex.flags & VertexFlags.OpenStart) !== VertexFlags.None) {
        leftBound = null;
      } else {
        leftBound = new Active();
        leftBound.bot = localMinima.vertex.pt;
        leftBound.curX = localMinima.vertex.pt.x;
        leftBound.windDx = -1;
        leftBound.vertexTop = localMinima.vertex.prev;
        leftBound.top = localMinima.vertex.prev.pt;
        leftBound.outrec = null;
        leftBound.localMin = localMinima;
        _ClipperBase.setDx(leftBound);
      }
      let rightBound;
      if ((localMinima.vertex.flags & VertexFlags.OpenEnd) !== VertexFlags.None) {
        rightBound = null;
      } else {
        rightBound = new Active();
        rightBound.bot = localMinima.vertex.pt;
        rightBound.curX = localMinima.vertex.pt.x;
        rightBound.windDx = 1;
        rightBound.vertexTop = localMinima.vertex.next;
        rightBound.top = localMinima.vertex.next.pt;
        rightBound.outrec = null;
        rightBound.localMin = localMinima;
        _ClipperBase.setDx(rightBound);
      }
      if (leftBound !== null && rightBound !== null) {
        if (_ClipperBase.isHorizontal(leftBound)) {
          if (_ClipperBase.isHeadingRightHorz(leftBound)) {
            const tmp = leftBound;
            leftBound = rightBound;
            rightBound = tmp;
          }
        } else if (_ClipperBase.isHorizontal(rightBound)) {
          if (_ClipperBase.isHeadingLeftHorz(rightBound)) {
            const tmp = leftBound;
            leftBound = rightBound;
            rightBound = tmp;
          }
        } else if (leftBound.dx < rightBound.dx) {
          const tmp = leftBound;
          leftBound = rightBound;
          rightBound = tmp;
        }
      } else if (leftBound === null) {
        leftBound = rightBound;
        rightBound = null;
      }
      let contributing;
      leftBound.isLeftBound = true;
      this.insertLeftEdge(leftBound);
      if (!_ClipperBase.openPathsEnabled) {
        this.setWindCountForClosedPathEdge(leftBound);
        contributing = this.isContributingClosed(leftBound);
      } else if (_ClipperBase.isOpen(leftBound)) {
        this.setWindCountForOpenPathEdge(leftBound);
        contributing = this.isContributingOpen(leftBound);
      } else {
        this.setWindCountForClosedPathEdge(leftBound);
        contributing = this.isContributingClosed(leftBound);
      }
      if (rightBound !== null) {
        rightBound.windCount = leftBound.windCount;
        rightBound.windCount2 = leftBound.windCount2;
        this.insertRightEdge(leftBound, rightBound);
        if (contributing) {
          this.addLocalMinPoly(leftBound, rightBound, leftBound.bot, true);
          if (!_ClipperBase.isHorizontal(leftBound)) {
            this.checkJoinLeft(leftBound, leftBound.bot);
          }
        }
        while (rightBound.nextInAEL !== null && this.isValidAelOrder(rightBound.nextInAEL, rightBound)) {
          this.intersectEdges(rightBound, rightBound.nextInAEL, rightBound.bot);
          this.swapPositionsInAEL(rightBound, rightBound.nextInAEL);
        }
        if (_ClipperBase.isHorizontal(rightBound)) {
          this.pushHorz(rightBound);
        } else {
          this.checkJoinRight(rightBound, rightBound.bot);
          this.insertScanline(rightBound.top.y);
        }
      } else if (contributing && _ClipperBase.openPathsEnabled) {
        this.startOpenPath(leftBound, leftBound.bot);
      }
      if (_ClipperBase.isHorizontal(leftBound)) {
        this.pushHorz(leftBound);
      } else {
        this.insertScanline(leftBound.top.y);
      }
    }
  }
  pushHorz(ae) {
    ae.nextInSEL = this.sel;
    this.sel = ae;
  }
  popHorz() {
    const ae = this.sel;
    if (ae === null)
      return null;
    this.sel = this.sel.nextInSEL;
    return ae;
  }
  doHorizontal(horz) {
    if (!_ClipperBase.openPathsEnabled) {
      this.doHorizontalClosed(horz);
      return;
    }
    const horzIsOpen = _ClipperBase.isOpen(horz);
    const y = horz.bot.y;
    const vertexMax = horzIsOpen ? this.getCurrYMaximaVertexOpen(horz) : this.getCurrYMaximaVertex(horz);
    const { isLeftToRight, leftX, rightX } = this.resetHorzDirection(horz, vertexMax);
    let leftX2 = leftX;
    let rightX2 = rightX;
    if (_ClipperBase.isHotEdge(horz)) {
      const op = this.addOutPt(horz, { x: horz.curX, y });
      this.addToHorzSegList(op);
    }
    while (true) {
      let ae = isLeftToRight ? horz.nextInAEL : horz.prevInAEL;
      while (ae !== null) {
        if (ae.vertexTop === vertexMax) {
          if (_ClipperBase.isHotEdge(horz) && this.isJoined(ae))
            this.split(ae, ae.top);
          if (_ClipperBase.isHotEdge(horz)) {
            while (horz.vertexTop !== vertexMax) {
              this.addOutPt(horz, horz.top);
              this.updateEdgeIntoAEL(horz);
            }
            if (isLeftToRight) {
              this.addLocalMaxPoly(horz, ae, horz.top);
            } else {
              this.addLocalMaxPoly(ae, horz, horz.top);
            }
          }
          this.deleteFromAEL(ae);
          this.deleteFromAEL(horz);
          return;
        }
        if (vertexMax !== horz.vertexTop || _ClipperBase.isOpenEnd(horz)) {
          if (isLeftToRight && ae.curX > rightX2 || !isLeftToRight && ae.curX < leftX2)
            break;
          if (ae.curX === horz.top.x && !_ClipperBase.isHorizontal(ae)) {
            const pt2 = _ClipperBase.nextVertex(horz).pt;
            if (_ClipperBase.isOpen(ae) && !_ClipperBase.isSamePolyType(ae, horz) && !_ClipperBase.isHotEdge(ae)) {
              if (isLeftToRight && _ClipperBase.topX(ae, pt2.y) > pt2.x || !isLeftToRight && _ClipperBase.topX(ae, pt2.y) < pt2.x)
                break;
            } else if (isLeftToRight && _ClipperBase.topX(ae, pt2.y) >= pt2.x || !isLeftToRight && _ClipperBase.topX(ae, pt2.y) <= pt2.x)
              break;
          }
        }
        const pt = { x: ae.curX, y };
        if (isLeftToRight) {
          this.intersectEdges(horz, ae, pt);
          this.swapPositionsInAEL(horz, ae);
          this.checkJoinLeft(ae, pt);
          horz.curX = ae.curX;
          ae = horz.nextInAEL;
        } else {
          this.intersectEdges(ae, horz, pt);
          this.swapPositionsInAEL(ae, horz);
          this.checkJoinRight(ae, pt);
          horz.curX = ae.curX;
          ae = horz.prevInAEL;
        }
        if (_ClipperBase.isHotEdge(horz)) {
          this.addToHorzSegList(this.getLastOp(horz));
        }
      }
      if (horzIsOpen && _ClipperBase.isOpenEnd(horz)) {
        if (_ClipperBase.isHotEdge(horz)) {
          this.addOutPt(horz, horz.top);
          if (_ClipperBase.isFront(horz)) {
            horz.outrec.frontEdge = null;
          } else {
            horz.outrec.backEdge = null;
          }
          horz.outrec = null;
        }
        this.deleteFromAEL(horz);
        return;
      }
      if (_ClipperBase.nextVertex(horz).pt.y !== horz.top.y) {
        break;
      }
      if (_ClipperBase.isHotEdge(horz)) {
        this.addOutPt(horz, horz.top);
      }
      this.updateEdgeIntoAEL(horz);
      const resetResult = this.resetHorzDirection(horz, vertexMax);
      leftX2 = resetResult.leftX;
      rightX2 = resetResult.rightX;
    }
    if (_ClipperBase.isHotEdge(horz)) {
      const op = this.addOutPt(horz, horz.top);
      this.addToHorzSegList(op);
    }
    this.updateEdgeIntoAEL(horz);
  }
  // Closed-path-only horizontal processing (no open-path branching).
  doHorizontalClosed(horz) {
    const y = horz.bot.y;
    const vertexMax = this.getCurrYMaximaVertex(horz);
    const { isLeftToRight, leftX, rightX } = this.resetHorzDirection(horz, vertexMax);
    let leftX2 = leftX;
    let rightX2 = rightX;
    if (_ClipperBase.isHotEdge(horz)) {
      const op = this.addOutPt(horz, { x: horz.curX, y });
      this.addToHorzSegList(op);
    }
    while (true) {
      let ae = isLeftToRight ? horz.nextInAEL : horz.prevInAEL;
      while (ae !== null) {
        if (ae.vertexTop === vertexMax) {
          if (_ClipperBase.isHotEdge(horz) && this.isJoined(ae))
            this.split(ae, ae.top);
          if (_ClipperBase.isHotEdge(horz)) {
            while (horz.vertexTop !== vertexMax) {
              this.addOutPt(horz, horz.top);
              this.updateEdgeIntoAEL(horz);
            }
            if (isLeftToRight) {
              this.addLocalMaxPoly(horz, ae, horz.top);
            } else {
              this.addLocalMaxPoly(ae, horz, horz.top);
            }
          }
          this.deleteFromAEL(ae);
          this.deleteFromAEL(horz);
          return;
        }
        if (vertexMax !== horz.vertexTop) {
          if (isLeftToRight && ae.curX > rightX2 || !isLeftToRight && ae.curX < leftX2)
            break;
          if (ae.curX === horz.top.x && !_ClipperBase.isHorizontal(ae)) {
            const nextPt = _ClipperBase.nextVertex(horz).pt;
            const tx = _ClipperBase.topX(ae, nextPt.y);
            if (isLeftToRight && tx >= nextPt.x || !isLeftToRight && tx <= nextPt.x)
              break;
          }
        }
        const pt = { x: ae.curX, y };
        if (isLeftToRight) {
          this.intersectEdges(horz, ae, pt);
          this.swapPositionsInAEL(horz, ae);
          this.checkJoinLeft(ae, pt);
          horz.curX = ae.curX;
          ae = horz.nextInAEL;
        } else {
          this.intersectEdges(ae, horz, pt);
          this.swapPositionsInAEL(ae, horz);
          this.checkJoinRight(ae, pt);
          horz.curX = ae.curX;
          ae = horz.prevInAEL;
        }
        if (_ClipperBase.isHotEdge(horz)) {
          this.addToHorzSegList(this.getLastOp(horz));
        }
      }
      if (_ClipperBase.nextVertex(horz).pt.y !== horz.top.y) {
        break;
      }
      if (_ClipperBase.isHotEdge(horz)) {
        this.addOutPt(horz, horz.top);
      }
      this.updateEdgeIntoAEL(horz);
      const resetResult = this.resetHorzDirection(horz, vertexMax);
      leftX2 = resetResult.leftX;
      rightX2 = resetResult.rightX;
    }
    if (_ClipperBase.isHotEdge(horz)) {
      const op = this.addOutPt(horz, horz.top);
      this.addToHorzSegList(op);
    }
    this.updateEdgeIntoAEL(horz);
  }
  convertHorzSegsToJoins() {
    const list = this.horzSegList;
    let k = 0;
    for (let i = 0, len = list.length; i < len; i++) {
      const hs = list[i];
      if (this.updateHorzSegment(hs))
        list[k++] = hs;
    }
    if (k < 2)
      return;
    list.length = k;
    this.horzSegList.sort(compareHorzSegments);
    for (let i = 0; i < k - 1; i++) {
      const hs1 = this.horzSegList[i];
      for (let j = i + 1; j < k; j++) {
        const hs2 = this.horzSegList[j];
        if (hs2.leftOp.pt.x >= hs1.rightOp.pt.x || hs2.leftToRight === hs1.leftToRight || hs2.rightOp.pt.x <= hs1.leftOp.pt.x)
          continue;
        const currY = hs1.leftOp.pt.y;
        if (hs1.leftToRight) {
          while (hs1.leftOp.next.pt.y === currY && hs1.leftOp.next.pt.x <= hs2.leftOp.pt.x)
            hs1.leftOp = hs1.leftOp.next;
          while (hs2.leftOp.prev.pt.y === currY && hs2.leftOp.prev.pt.x <= hs1.leftOp.pt.x)
            hs2.leftOp = hs2.leftOp.prev;
          const join = new HorzJoin(this.duplicateOp(hs1.leftOp, true), this.duplicateOp(hs2.leftOp, false));
          this.horzJoinList.push(join);
        } else {
          while (hs1.leftOp.prev.pt.y === currY && hs1.leftOp.prev.pt.x <= hs2.leftOp.pt.x)
            hs1.leftOp = hs1.leftOp.prev;
          while (hs2.leftOp.next.pt.y === currY && hs2.leftOp.next.pt.x <= hs1.leftOp.pt.x)
            hs2.leftOp = hs2.leftOp.next;
          const join = new HorzJoin(this.duplicateOp(hs2.leftOp, true), this.duplicateOp(hs1.leftOp, false));
          this.horzJoinList.push(join);
        }
      }
    }
  }
  updateHorzSegment(hs) {
    const op = hs.leftOp;
    const outrec = this.getRealOutRec(op.outrec);
    const outrecHasEdges = outrec.frontEdge !== null;
    const currY = op.pt.y;
    let opP = op;
    let opN = op;
    if (outrecHasEdges) {
      const opA = outrec.pts;
      const opZ = opA.next;
      while (opP !== opZ && opP.prev.pt.y === currY)
        opP = opP.prev;
      while (opN !== opA && opN.next.pt.y === currY)
        opN = opN.next;
    } else {
      while (opP.prev !== opN && opP.prev.pt.y === currY)
        opP = opP.prev;
      while (opN.next !== opP && opN.next.pt.y === currY)
        opN = opN.next;
    }
    const result = this.setHorzSegHeadingForward(hs, opP, opN) && hs.leftOp.horz === null;
    if (result) {
      hs.leftOp.horz = hs;
    } else {
      hs.rightOp = null;
    }
    return result;
  }
  setHorzSegHeadingForward(hs, opP, opN) {
    if (opP.pt.x === opN.pt.x)
      return false;
    if (opP.pt.x < opN.pt.x) {
      hs.leftOp = opP;
      hs.rightOp = opN;
      hs.leftToRight = true;
    } else {
      hs.leftOp = opN;
      hs.rightOp = opP;
      hs.leftToRight = false;
    }
    return true;
  }
  duplicateOp(op, insertAfter) {
    const result = new OutPt(op.pt, op.outrec);
    if (insertAfter) {
      result.next = op.next;
      result.next.prev = result;
      result.prev = op;
      op.next = result;
    } else {
      result.prev = op.prev;
      result.prev.next = result;
      result.next = op;
      op.prev = result;
    }
    return result;
  }
  getRealOutRec(outRec) {
    while (outRec !== null && outRec.pts === null) {
      outRec = outRec.owner;
    }
    return outRec;
  }
  doIntersections(y) {
    if (this.buildIntersectList(y)) {
      this.processIntersectList();
      this.disposeIntersectNodes();
    }
  }
  doTopOfScanbeam(y) {
    const curXValid = this.curXValidAtTop;
    this.curXValidAtTop = false;
    this.sel = null;
    let ae = this.actives;
    while (ae !== null) {
      if (ae.top.y === y) {
        ae.curX = ae.top.x;
        if (_ClipperBase.isMaximaEdge(ae)) {
          ae = this.doMaxima(ae);
          continue;
        } else {
          if (_ClipperBase.isHotEdge(ae))
            this.addOutPt(ae, ae.top);
          this.updateEdgeIntoAEL(ae);
          if (_ClipperBase.isHorizontal(ae)) {
            this.pushHorz(ae);
          }
        }
      } else if (!curXValid) {
        ae.curX = _ClipperBase.topX(ae, y);
      }
      ae = ae.nextInAEL;
    }
  }
  processHorzJoins() {
    for (const j of this.horzJoinList) {
      const or1 = this.getRealOutRec(j.op1.outrec);
      const or2 = this.getRealOutRec(j.op2.outrec);
      const op1b = j.op1.next;
      const op2b = j.op2.prev;
      j.op1.next = j.op2;
      j.op2.prev = j.op1;
      op1b.prev = op2b;
      op2b.next = op1b;
      if (or1 === or2) {
        const or2New = this.newOutRec();
        or2New.pts = op1b;
        this.fixOutRecPts(or2New);
        if (or1.pts.outrec === or2New) {
          or1.pts = j.op1;
          or1.pts.outrec = or1;
        }
        if (this.usingPolytree) {
          if (this.path1InsidePath2(or1.pts, or2New.pts)) {
            [or2New.pts, or1.pts] = [or1.pts, or2New.pts];
            this.fixOutRecPts(or1);
            this.fixOutRecPts(or2New);
            or2New.owner = or1;
          } else if (this.path1InsidePath2(or2New.pts, or1.pts)) {
            or2New.owner = or1;
          } else {
            or2New.owner = or1.owner;
          }
          if (or1.splits === null)
            or1.splits = [];
          or1.splits.push(or2New.idx);
        } else {
          or2New.owner = or1;
        }
      } else {
        or2.pts = null;
        if (this.usingPolytree) {
          this.setOwner(or2, or1);
          this.moveSplits(or2, or1);
        } else {
          or2.owner = or1;
        }
      }
    }
  }
  fixOutRecPts(outrec) {
    let op = outrec.pts;
    do {
      op.outrec = outrec;
      op = op.next;
    } while (op !== outrec.pts);
  }
  path1InsidePath2(op1, op2) {
    let pip = PointInPolygonResult.IsOn;
    let op = op1;
    do {
      switch (this.pointInOpPolygon(op.pt, op2)) {
        case PointInPolygonResult.IsOutside:
          if (pip === PointInPolygonResult.IsOutside)
            return false;
          pip = PointInPolygonResult.IsOutside;
          break;
        case PointInPolygonResult.IsInside:
          if (pip === PointInPolygonResult.IsInside)
            return true;
          pip = PointInPolygonResult.IsInside;
          break;
        default:
          break;
      }
      op = op.next;
    } while (op !== op1);
    return InternalClipper.path2ContainsPath1(this.getCleanPath(op1), this.getCleanPath(op2));
  }
  pointInOpPolygon(pt, op) {
    if (op === op.next || op.prev === op.next) {
      return PointInPolygonResult.IsOutside;
    }
    let op2 = op;
    do {
      if (op.pt.y !== pt.y)
        break;
      op = op.next;
    } while (op !== op2);
    if (op.pt.y === pt.y)
      return PointInPolygonResult.IsOutside;
    let isAbove = op.pt.y < pt.y;
    const startingAbove = isAbove;
    let val = 0;
    op2 = op.next;
    while (op2 !== op) {
      if (isAbove) {
        while (op2 !== op && op2.pt.y < pt.y)
          op2 = op2.next;
      } else {
        while (op2 !== op && op2.pt.y > pt.y)
          op2 = op2.next;
      }
      if (op2 === op)
        break;
      if (op2.pt.y === pt.y) {
        if (op2.pt.x === pt.x || op2.pt.y === op2.prev.pt.y && pt.x < op2.prev.pt.x !== pt.x < op2.pt.x)
          return PointInPolygonResult.IsOn;
        op2 = op2.next;
        if (op2 === op)
          break;
        continue;
      }
      if (op2.pt.x <= pt.x || op2.prev.pt.x <= pt.x) {
        if (op2.prev.pt.x < pt.x && op2.pt.x < pt.x) {
          val = 1 - val;
        } else {
          const d = InternalClipper.crossProductSign(op2.prev.pt, op2.pt, pt);
          if (d === 0)
            return PointInPolygonResult.IsOn;
          if (d < 0 === isAbove)
            val = 1 - val;
        }
      }
      isAbove = !isAbove;
      op2 = op2.next;
    }
    if (isAbove === startingAbove)
      return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
    {
      const d = InternalClipper.crossProductSign(op2.prev.pt, op2.pt, pt);
      if (d === 0)
        return PointInPolygonResult.IsOn;
      if (d < 0 === isAbove)
        val = 1 - val;
    }
    return val === 0 ? PointInPolygonResult.IsOutside : PointInPolygonResult.IsInside;
  }
  getCleanPath(op) {
    const result = [];
    let op2 = op;
    while (op2.next !== op && (op2.pt.x === op2.next.pt.x && op2.pt.x === op2.prev.pt.x || op2.pt.y === op2.next.pt.y && op2.pt.y === op2.prev.pt.y))
      op2 = op2.next;
    result.push(op2.pt);
    let prevOp = op2;
    op2 = op2.next;
    while (op2 !== op) {
      if ((op2.pt.x !== op2.next.pt.x || op2.pt.x !== prevOp.pt.x) && (op2.pt.y !== op2.next.pt.y || op2.pt.y !== prevOp.pt.y)) {
        result.push(op2.pt);
        prevOp = op2;
      }
      op2 = op2.next;
    }
    return result;
  }
  moveSplits(fromOr, toOr) {
    if (fromOr.splits === null)
      return;
    if (toOr.splits === null)
      toOr.splits = [];
    for (const i of fromOr.splits) {
      if (i !== toOr.idx) {
        toOr.splits.push(i);
      }
    }
    fromOr.splits = null;
  }
  buildIntersectList(topY) {
    if (this.actives?.nextInAEL === null)
      return false;
    if (!this.adjustCurrXAndCopyToSEL(topY)) {
      this.curXValidAtTop = true;
      return false;
    }
    let left = this.sel;
    while (left !== null && left.jump !== null) {
      let prevBase = null;
      while (left !== null && left.jump !== null) {
        let currBase = left;
        let right = left.jump;
        let lEnd = right;
        const rEnd = right?.jump || null;
        left.jump = rEnd;
        while (left !== lEnd && right !== rEnd) {
          if (right.curX < left.curX) {
            let tmp = right.prevInSEL;
            while (true) {
              this.addNewIntersectNode(tmp, right, topY);
              if (tmp === left)
                break;
              tmp = tmp.prevInSEL;
            }
            tmp = right;
            right = this.extractFromSEL(tmp);
            lEnd = right;
            if (left !== null)
              this.insert1Before2InSEL(tmp, left);
            if (left !== currBase)
              continue;
            currBase = tmp;
            currBase.jump = rEnd;
            if (prevBase === null) {
              this.sel = currBase;
            } else {
              prevBase.jump = currBase;
            }
          } else {
            left = left.nextInSEL;
          }
        }
        prevBase = currBase;
        left = rEnd;
      }
      left = this.sel;
    }
    return this.intersectList.length > 0;
  }
  processIntersectList() {
    this.intersectList.sort(compareIntersectNodes);
    for (let i = 0; i < this.intersectList.length; ++i) {
      if (!this.edgesAdjacentInAEL(this.intersectList[i])) {
        let j = i + 1;
        while (!this.edgesAdjacentInAEL(this.intersectList[j]))
          j++;
        [this.intersectList[j], this.intersectList[i]] = [this.intersectList[i], this.intersectList[j]];
      }
      const node = this.intersectList[i];
      this.intersectEdges(node.edge1, node.edge2, node.pt);
      this.swapPositionsInAEL(node.edge1, node.edge2);
      node.edge1.curX = node.pt.x;
      node.edge2.curX = node.pt.x;
      this.checkJoinLeft(node.edge2, node.pt, true);
      this.checkJoinRight(node.edge1, node.pt, true);
    }
  }
  edgesAdjacentInAEL(inode) {
    return inode.edge1.nextInAEL === inode.edge2 || inode.edge1.prevInAEL === inode.edge2;
  }
  // Returns true if any adjacent pair is inverted at topY (i.e. at least one
  // intersection exists within this scanbeam).
  adjustCurrXAndCopyToSEL(topY) {
    let ae = this.actives;
    this.sel = ae;
    let prevX = Number.NEGATIVE_INFINITY;
    let inverted = false;
    while (ae !== null) {
      ae.prevInSEL = ae.prevInAEL;
      ae.nextInSEL = ae.nextInAEL;
      ae.jump = ae.nextInSEL;
      const x = _ClipperBase.topX(ae, topY);
      ae.curX = x;
      if (x < prevX)
        inverted = true;
      prevX = x;
      ae = ae.nextInAEL;
    }
    return inverted;
  }
  doMaxima(ae) {
    const prevE = ae.prevInAEL;
    let nextE = ae.nextInAEL;
    if (_ClipperBase.isOpenEnd(ae)) {
      if (_ClipperBase.isHotEdge(ae))
        this.addOutPt(ae, ae.top);
      if (_ClipperBase.isHorizontal(ae))
        return nextE;
      if (_ClipperBase.isHotEdge(ae)) {
        if (_ClipperBase.isFront(ae)) {
          ae.outrec.frontEdge = null;
        } else {
          ae.outrec.backEdge = null;
        }
        ae.outrec = null;
      }
      this.deleteFromAEL(ae);
      return nextE;
    }
    const maxPair = _ClipperBase.getMaximaPair(ae);
    if (maxPair === null)
      return nextE;
    if (this.isJoined(ae))
      this.split(ae, ae.top);
    if (this.isJoined(maxPair))
      this.split(maxPair, maxPair.top);
    while (nextE !== maxPair) {
      this.intersectEdges(ae, nextE, ae.top);
      this.swapPositionsInAEL(ae, nextE);
      nextE = ae.nextInAEL;
    }
    if (_ClipperBase.isOpen(ae)) {
      if (_ClipperBase.isHotEdge(ae)) {
        this.addLocalMaxPoly(ae, maxPair, ae.top);
      }
      this.deleteFromAEL(maxPair);
      this.deleteFromAEL(ae);
      return prevE !== null ? prevE.nextInAEL : this.actives;
    }
    if (_ClipperBase.isHotEdge(ae)) {
      this.addLocalMaxPoly(ae, maxPair, ae.top);
    }
    this.deleteFromAEL(ae);
    this.deleteFromAEL(maxPair);
    return prevE !== null ? prevE.nextInAEL : this.actives;
  }
  updateEdgeIntoAEL(ae) {
    ae.bot = ae.top;
    ae.vertexTop = _ClipperBase.nextVertex(ae);
    ae.top = ae.vertexTop.pt;
    ae.curX = ae.bot.x;
    _ClipperBase.setDx(ae);
    if (this.isJoined(ae))
      this.split(ae, ae.bot);
    if (_ClipperBase.isHorizontal(ae)) {
      if (!_ClipperBase.openPathsEnabled) {
        this.trimHorz(ae, this.preserveCollinear);
      } else if (!_ClipperBase.isOpen(ae)) {
        this.trimHorz(ae, this.preserveCollinear);
      }
      return;
    }
    this.insertScanline(ae.top.y);
    this.checkJoinLeft(ae, ae.bot);
    this.checkJoinRight(ae, ae.bot, true);
  }
  trimHorz(horzEdge, preserveCollinear) {
    let wasTrimmed = false;
    let pt = _ClipperBase.nextVertex(horzEdge).pt;
    while (pt.y === horzEdge.top.y) {
      if (preserveCollinear && pt.x < horzEdge.top.x !== horzEdge.bot.x < horzEdge.top.x) {
        break;
      }
      horzEdge.vertexTop = _ClipperBase.nextVertex(horzEdge);
      horzEdge.top = pt;
      wasTrimmed = true;
      if (_ClipperBase.isMaximaVertex(horzEdge.vertexTop))
        break;
      pt = _ClipperBase.nextVertex(horzEdge).pt;
    }
    if (wasTrimmed)
      _ClipperBase.setDx(horzEdge);
  }
  addToHorzSegList(op) {
    if (op.outrec.isOpen)
      return;
    this.horzSegList.push(new HorzSegment(op));
  }
  addNewIntersectNode(ae1, ae2, topY) {
    let ip = InternalClipper.getLineIntersectPt(ae1.bot, ae1.top, ae2.bot, ae2.top);
    if (ip === null) {
      ip = { x: ae1.curX, y: topY };
    }
    if (ip.y > this.currentBotY || ip.y < topY) {
      const absDx1 = Math.abs(ae1.dx);
      const absDx2 = Math.abs(ae2.dx);
      if (absDx1 > 100 && absDx2 > 100) {
        if (absDx1 > absDx2) {
          ip = InternalClipper.getClosestPtOnSegment(ip, ae1.bot, ae1.top);
        } else {
          ip = InternalClipper.getClosestPtOnSegment(ip, ae2.bot, ae2.top);
        }
      } else if (absDx1 > 100) {
        ip = InternalClipper.getClosestPtOnSegment(ip, ae1.bot, ae1.top);
      } else if (absDx2 > 100) {
        ip = InternalClipper.getClosestPtOnSegment(ip, ae2.bot, ae2.top);
      } else {
        if (ip.y < topY)
          ip.y = topY;
        else
          ip.y = this.currentBotY;
        if (absDx1 < absDx2)
          ip.x = _ClipperBase.topX(ae1, ip.y);
        else
          ip.x = _ClipperBase.topX(ae2, ip.y);
      }
    }
    const node = createIntersectNode(ip, ae1, ae2);
    this.intersectList.push(node);
  }
  extractFromSEL(ae) {
    const res = ae.nextInSEL;
    if (res !== null) {
      res.prevInSEL = ae.prevInSEL;
    }
    ae.prevInSEL.nextInSEL = res;
    return res;
  }
  insert1Before2InSEL(ae1, ae2) {
    ae1.prevInSEL = ae2.prevInSEL;
    if (ae1.prevInSEL !== null) {
      ae1.prevInSEL.nextInSEL = ae1;
    }
    ae1.nextInSEL = ae2;
    ae2.prevInSEL = ae1;
  }
  getCurrYMaximaVertexOpen(ae) {
    let result = ae.vertexTop;
    if (ae.windDx > 0) {
      while (result.next.pt.y === result.pt.y && (result.flags & (VertexFlags.OpenEnd | VertexFlags.LocalMax)) === VertexFlags.None)
        result = result.next;
    } else {
      while (result.prev.pt.y === result.pt.y && (result.flags & (VertexFlags.OpenEnd | VertexFlags.LocalMax)) === VertexFlags.None)
        result = result.prev;
    }
    if (!_ClipperBase.isMaximaVertex(result))
      result = null;
    return result;
  }
  getCurrYMaximaVertex(ae) {
    let result = ae.vertexTop;
    if (ae.windDx > 0) {
      while (result.next.pt.y === result.pt.y)
        result = result.next;
    } else {
      while (result.prev.pt.y === result.pt.y)
        result = result.prev;
    }
    if (!_ClipperBase.isMaximaVertex(result))
      result = null;
    return result;
  }
  resetHorzDirection(horz, vertexMax) {
    if (horz.bot.x === horz.top.x) {
      const leftX = horz.curX;
      const rightX = horz.curX;
      let ae = horz.nextInAEL;
      while (ae !== null && ae.vertexTop !== vertexMax)
        ae = ae.nextInAEL;
      return { isLeftToRight: ae !== null, leftX, rightX };
    }
    if (horz.curX < horz.top.x) {
      return { isLeftToRight: true, leftX: horz.curX, rightX: horz.top.x };
    } else {
      return { isLeftToRight: false, leftX: horz.top.x, rightX: horz.curX };
    }
  }
  getLastOp(hotEdge) {
    const outrec = hotEdge.outrec;
    return hotEdge === outrec.frontEdge ? outrec.pts : outrec.pts.next;
  }
  insertLeftEdge(ae) {
    if (this.actives === null) {
      ae.prevInAEL = null;
      ae.nextInAEL = null;
      this.actives = ae;
    } else if (!this.isValidAelOrder(this.actives, ae)) {
      ae.prevInAEL = null;
      ae.nextInAEL = this.actives;
      this.actives.prevInAEL = ae;
      this.actives = ae;
    } else {
      let ae2 = this.actives;
      while (ae2.nextInAEL !== null && this.isValidAelOrder(ae2.nextInAEL, ae)) {
        ae2 = ae2.nextInAEL;
      }
      if (ae2.joinWith === JoinWith.Right)
        ae2 = ae2.nextInAEL;
      ae.nextInAEL = ae2.nextInAEL;
      if (ae2.nextInAEL !== null)
        ae2.nextInAEL.prevInAEL = ae;
      ae.prevInAEL = ae2;
      ae2.nextInAEL = ae;
    }
  }
  insertRightEdge(ae1, ae2) {
    ae2.nextInAEL = ae1.nextInAEL;
    if (ae1.nextInAEL !== null)
      ae1.nextInAEL.prevInAEL = ae2;
    ae2.prevInAEL = ae1;
    ae1.nextInAEL = ae2;
  }
  setWindCountForOpenPathEdge(ae) {
    let ae2 = this.actives;
    if (this.fillrule === FillRule.EvenOdd) {
      let cnt1 = 0, cnt2 = 0;
      while (ae2 !== ae) {
        if (_ClipperBase.getPolyType(ae2) === PathType.Clip) {
          cnt2++;
        } else if (!_ClipperBase.isOpen(ae2)) {
          cnt1++;
        }
        ae2 = ae2.nextInAEL;
      }
      ae.windCount = _ClipperBase.isOdd(cnt1) ? 1 : 0;
      ae.windCount2 = _ClipperBase.isOdd(cnt2) ? 1 : 0;
    } else {
      while (ae2 !== ae) {
        if (_ClipperBase.getPolyType(ae2) === PathType.Clip) {
          ae.windCount2 += ae2.windDx;
        } else if (!_ClipperBase.isOpen(ae2)) {
          ae.windCount += ae2.windDx;
        }
        ae2 = ae2.nextInAEL;
      }
    }
  }
  setWindCountForClosedPathEdge(ae) {
    let ae2 = ae.prevInAEL;
    const pt = _ClipperBase.getPolyType(ae);
    if (!_ClipperBase.openPathsEnabled) {
      while (ae2 !== null && _ClipperBase.getPolyType(ae2) !== pt)
        ae2 = ae2.prevInAEL;
      if (ae2 === null) {
        ae.windCount = ae.windDx;
        ae2 = this.actives;
      } else if (this.fillrule === FillRule.EvenOdd) {
        ae.windCount = ae.windDx;
        ae.windCount2 = ae2.windCount2;
        ae2 = ae2.nextInAEL;
      } else {
        if (ae2.windCount * ae2.windDx < 0) {
          if (Math.abs(ae2.windCount) > 1) {
            if (ae2.windDx * ae.windDx < 0) {
              ae.windCount = ae2.windCount;
            } else {
              ae.windCount = ae2.windCount + ae.windDx;
            }
          } else {
            ae.windCount = ae.windDx;
          }
        } else {
          if (ae2.windDx * ae.windDx < 0) {
            ae.windCount = ae2.windCount;
          } else {
            ae.windCount = ae2.windCount + ae.windDx;
          }
        }
        ae.windCount2 = ae2.windCount2;
        ae2 = ae2.nextInAEL;
      }
      if (this.fillrule === FillRule.EvenOdd) {
        while (ae2 !== ae) {
          if (_ClipperBase.getPolyType(ae2) !== pt) {
            ae.windCount2 = ae.windCount2 === 0 ? 1 : 0;
          }
          ae2 = ae2.nextInAEL;
        }
      } else {
        while (ae2 !== ae) {
          if (_ClipperBase.getPolyType(ae2) !== pt) {
            ae.windCount2 += ae2.windDx;
          }
          ae2 = ae2.nextInAEL;
        }
      }
      return;
    }
    while (ae2 !== null && (_ClipperBase.getPolyType(ae2) !== pt || _ClipperBase.isOpen(ae2)))
      ae2 = ae2.prevInAEL;
    if (ae2 === null) {
      ae.windCount = ae.windDx;
      ae2 = this.actives;
    } else if (this.fillrule === FillRule.EvenOdd) {
      ae.windCount = ae.windDx;
      ae.windCount2 = ae2.windCount2;
      ae2 = ae2.nextInAEL;
    } else {
      if (ae2.windCount * ae2.windDx < 0) {
        if (Math.abs(ae2.windCount) > 1) {
          if (ae2.windDx * ae.windDx < 0) {
            ae.windCount = ae2.windCount;
          } else {
            ae.windCount = ae2.windCount + ae.windDx;
          }
        } else {
          ae.windCount = _ClipperBase.isOpen(ae) ? 1 : ae.windDx;
        }
      } else {
        if (ae2.windDx * ae.windDx < 0) {
          ae.windCount = ae2.windCount;
        } else {
          ae.windCount = ae2.windCount + ae.windDx;
        }
      }
      ae.windCount2 = ae2.windCount2;
      ae2 = ae2.nextInAEL;
    }
    if (this.fillrule === FillRule.EvenOdd) {
      while (ae2 !== ae) {
        if (_ClipperBase.getPolyType(ae2) !== pt && !_ClipperBase.isOpen(ae2)) {
          ae.windCount2 = ae.windCount2 === 0 ? 1 : 0;
        }
        ae2 = ae2.nextInAEL;
      }
    } else {
      while (ae2 !== ae) {
        if (_ClipperBase.getPolyType(ae2) !== pt && !_ClipperBase.isOpen(ae2)) {
          ae.windCount2 += ae2.windDx;
        }
        ae2 = ae2.nextInAEL;
      }
    }
  }
  isContributingOpen(ae) {
    let isInClip, isInSubj;
    switch (this.fillrule) {
      case FillRule.Positive:
        isInSubj = ae.windCount > 0;
        isInClip = ae.windCount2 > 0;
        break;
      case FillRule.Negative:
        isInSubj = ae.windCount < 0;
        isInClip = ae.windCount2 < 0;
        break;
      default:
        isInSubj = ae.windCount !== 0;
        isInClip = ae.windCount2 !== 0;
        break;
    }
    switch (this.cliptype) {
      case ClipType.Intersection:
        return isInClip;
      case ClipType.Union:
        return !isInSubj && !isInClip;
      default:
        return !isInClip;
    }
  }
  isContributingClosed(ae) {
    switch (this.fillrule) {
      case FillRule.Positive:
        if (ae.windCount !== 1)
          return false;
        break;
      case FillRule.Negative:
        if (ae.windCount !== -1)
          return false;
        break;
      case FillRule.NonZero:
        if (Math.abs(ae.windCount) !== 1)
          return false;
        break;
    }
    switch (this.cliptype) {
      case ClipType.Intersection:
        return this.fillrule === FillRule.Positive ? ae.windCount2 > 0 : this.fillrule === FillRule.Negative ? ae.windCount2 < 0 : ae.windCount2 !== 0;
      case ClipType.Union:
        return this.fillrule === FillRule.Positive ? ae.windCount2 <= 0 : this.fillrule === FillRule.Negative ? ae.windCount2 >= 0 : ae.windCount2 === 0;
      case ClipType.Difference: {
        const result = this.fillrule === FillRule.Positive ? ae.windCount2 <= 0 : this.fillrule === FillRule.Negative ? ae.windCount2 >= 0 : ae.windCount2 === 0;
        return _ClipperBase.getPolyType(ae) === PathType.Subject ? result : !result;
      }
      case ClipType.Xor:
        return true;
      // XOr is always contributing unless open
      default:
        return false;
    }
  }
  addLocalMinPoly(ae1, ae2, pt, isNew = false) {
    const outrec = this.newOutRec();
    ae1.outrec = outrec;
    ae2.outrec = outrec;
    if (_ClipperBase.isOpen(ae1)) {
      outrec.owner = null;
      outrec.isOpen = true;
      if (ae1.windDx > 0) {
        this.setSides(outrec, ae1, ae2);
      } else {
        this.setSides(outrec, ae2, ae1);
      }
    } else {
      outrec.isOpen = false;
      const prevHotEdge = _ClipperBase.getPrevHotEdge(ae1);
      if (prevHotEdge !== null) {
        if (this.usingPolytree) {
          this.setOwner(outrec, prevHotEdge.outrec);
        }
        outrec.owner = prevHotEdge.outrec;
        if (this.outrecIsAscending(prevHotEdge) === isNew) {
          this.setSides(outrec, ae2, ae1);
        } else {
          this.setSides(outrec, ae1, ae2);
        }
      } else {
        outrec.owner = null;
        if (isNew) {
          this.setSides(outrec, ae1, ae2);
        } else {
          this.setSides(outrec, ae2, ae1);
        }
      }
    }
    const op = new OutPt(pt, outrec);
    outrec.pts = op;
    return op;
  }
  outrecIsAscending(hotEdge) {
    return hotEdge === hotEdge.outrec.frontEdge;
  }
  newOutRec() {
    const result = new OutRec();
    result.idx = this.outrecList.length;
    this.outrecList.push(result);
    return result;
  }
  startOpenPath(ae, pt) {
    const outrec = this.newOutRec();
    outrec.isOpen = true;
    if (ae.windDx > 0) {
      outrec.frontEdge = ae;
      outrec.backEdge = null;
    } else {
      outrec.frontEdge = null;
      outrec.backEdge = ae;
    }
    ae.outrec = outrec;
    const op = new OutPt(pt, outrec);
    outrec.pts = op;
    return op;
  }
  checkJoinLeft(ae, pt, checkCurrX = false) {
    const prev = ae.prevInAEL;
    if (prev === null)
      return;
    if (!checkCurrX && ae.curX !== prev.curX)
      return;
    if (!_ClipperBase.isHotEdge(ae) || !_ClipperBase.isHotEdge(prev) || _ClipperBase.isHorizontal(ae) || _ClipperBase.isHorizontal(prev) || _ClipperBase.isOpen(ae) || _ClipperBase.isOpen(prev))
      return;
    if ((pt.y < ae.top.y + 2 || pt.y < prev.top.y + 2) && // avoid trivial joins
    (ae.bot.y > pt.y || prev.bot.y > pt.y))
      return;
    if (checkCurrX) {
      if (this.perpendicDistFromLineSqrdGreaterThanQuarter(pt, prev.bot, prev.top))
        return;
    }
    if (!InternalClipper.isCollinear(ae.top, pt, prev.top))
      return;
    if (ae.outrec.idx === prev.outrec.idx) {
      this.addLocalMaxPoly(prev, ae, pt);
    } else if (ae.outrec.idx < prev.outrec.idx) {
      this.joinOutrecPaths(ae, prev);
    } else {
      this.joinOutrecPaths(prev, ae);
    }
    prev.joinWith = JoinWith.Right;
    ae.joinWith = JoinWith.Left;
  }
  checkJoinRight(ae, pt, checkCurrX = false) {
    const next = ae.nextInAEL;
    if (next === null)
      return;
    if (!checkCurrX && ae.curX !== next.curX)
      return;
    if (!_ClipperBase.isHotEdge(ae) || !_ClipperBase.isHotEdge(next) || _ClipperBase.isHorizontal(ae) || _ClipperBase.isHorizontal(next) || _ClipperBase.isOpen(ae) || _ClipperBase.isOpen(next))
      return;
    if ((pt.y < ae.top.y + 2 || pt.y < next.top.y + 2) && // avoid trivial joins
    (ae.bot.y > pt.y || next.bot.y > pt.y))
      return;
    if (checkCurrX) {
      if (this.perpendicDistFromLineSqrdGreaterThanQuarter(pt, next.bot, next.top))
        return;
    }
    if (!InternalClipper.isCollinear(ae.top, pt, next.top))
      return;
    if (ae.outrec.idx === next.outrec.idx) {
      this.addLocalMaxPoly(ae, next, pt);
    } else if (ae.outrec.idx < next.outrec.idx) {
      this.joinOutrecPaths(ae, next);
    } else {
      this.joinOutrecPaths(next, ae);
    }
    ae.joinWith = JoinWith.Right;
    next.joinWith = JoinWith.Left;
  }
  perpendicDistFromLineSqrdGreaterThanQuarter(pt, line1, line2) {
    const a = pt.x - line1.x;
    const b = pt.y - line1.y;
    const c = line2.x - line1.x;
    const d = line2.y - line1.y;
    if (c === 0 && d === 0)
      return false;
    const maxCoord = InternalClipper.maxCoordForSafeCrossSq;
    if (Math.abs(a) < maxCoord && Math.abs(b) < maxCoord && Math.abs(c) < maxCoord && Math.abs(d) < maxCoord) {
      const cross2 = a * d - c * b;
      return cross2 * cross2 / (c * c + d * d) > 0.25;
    }
    if (Number.isSafeInteger(a) && Number.isSafeInteger(b) && Number.isSafeInteger(c) && Number.isSafeInteger(d)) {
      const cross2 = BigInt(a) * BigInt(d) - BigInt(c) * BigInt(b);
      const crossSq = cross2 * cross2;
      const denom = BigInt(c) * BigInt(c) + BigInt(d) * BigInt(d);
      return B42 * crossSq > denom;
    }
    const cross = a * d - c * b;
    return cross * cross / (c * c + d * d) > 0.25;
  }
  intersectEdges(ae1, ae2, pt) {
    let resultOp;
    if (this.hasOpenPaths && (_ClipperBase.isOpen(ae1) || _ClipperBase.isOpen(ae2))) {
      if (_ClipperBase.isOpen(ae1) && _ClipperBase.isOpen(ae2))
        return;
      if (_ClipperBase.isOpen(ae2)) {
        const tmp = ae1;
        ae1 = ae2;
        ae2 = tmp;
      }
      if (this.isJoined(ae2))
        this.split(ae2, pt);
      if (this.cliptype === ClipType.Union) {
        if (!_ClipperBase.isHotEdge(ae2))
          return;
      } else if (ae2.localMin.polytype === PathType.Subject)
        return;
      switch (this.fillrule) {
        case FillRule.Positive:
          if (ae2.windCount !== 1)
            return;
          break;
        case FillRule.Negative:
          if (ae2.windCount !== -1)
            return;
          break;
        default:
          if (Math.abs(ae2.windCount) !== 1)
            return;
          break;
      }
      if (_ClipperBase.isHotEdge(ae1)) {
        resultOp = this.addOutPt(ae1, pt);
        this.setZ(ae1, ae2, resultOp.pt);
        if (_ClipperBase.isFront(ae1)) {
          ae1.outrec.frontEdge = null;
        } else {
          ae1.outrec.backEdge = null;
        }
        ae1.outrec = null;
      } else if (pt.x === ae1.localMin.vertex.pt.x && pt.y === ae1.localMin.vertex.pt.y && !_ClipperBase.isOpenEndVertex(ae1.localMin.vertex)) {
        const ae3 = this.findEdgeWithMatchingLocMin(ae1);
        if (ae3 !== null && _ClipperBase.isHotEdge(ae3)) {
          ae1.outrec = ae3.outrec;
          if (ae1.windDx > 0) {
            this.setSides(ae3.outrec, ae1, ae3);
          } else {
            this.setSides(ae3.outrec, ae3, ae1);
          }
          return;
        }
        resultOp = this.startOpenPath(ae1, pt);
      } else {
        resultOp = this.startOpenPath(ae1, pt);
      }
      this.setZ(ae1, ae2, resultOp.pt);
      return;
    }
    if (this.isJoined(ae1))
      this.split(ae1, pt);
    if (this.isJoined(ae2))
      this.split(ae2, pt);
    let oldE1WindCount, oldE2WindCount;
    if (ae1.localMin.polytype === ae2.localMin.polytype) {
      if (this.fillrule === FillRule.EvenOdd) {
        oldE1WindCount = ae1.windCount;
        ae1.windCount = ae2.windCount;
        ae2.windCount = oldE1WindCount;
      } else {
        if (ae1.windCount + ae2.windDx === 0) {
          ae1.windCount = -ae1.windCount;
        } else {
          ae1.windCount += ae2.windDx;
        }
        if (ae2.windCount - ae1.windDx === 0) {
          ae2.windCount = -ae2.windCount;
        } else {
          ae2.windCount -= ae1.windDx;
        }
      }
    } else {
      if (this.fillrule !== FillRule.EvenOdd) {
        ae1.windCount2 += ae2.windDx;
      } else {
        ae1.windCount2 = ae1.windCount2 === 0 ? 1 : 0;
      }
      if (this.fillrule !== FillRule.EvenOdd) {
        ae2.windCount2 -= ae1.windDx;
      } else {
        ae2.windCount2 = ae2.windCount2 === 0 ? 1 : 0;
      }
    }
    switch (this.fillrule) {
      case FillRule.Positive:
        oldE1WindCount = ae1.windCount;
        oldE2WindCount = ae2.windCount;
        break;
      case FillRule.Negative:
        oldE1WindCount = -ae1.windCount;
        oldE2WindCount = -ae2.windCount;
        break;
      default:
        oldE1WindCount = Math.abs(ae1.windCount);
        oldE2WindCount = Math.abs(ae2.windCount);
        break;
    }
    const e1WindCountIs0or1 = oldE1WindCount === 0 || oldE1WindCount === 1;
    const e2WindCountIs0or1 = oldE2WindCount === 0 || oldE2WindCount === 1;
    if (!_ClipperBase.isHotEdge(ae1) && !e1WindCountIs0or1 || !_ClipperBase.isHotEdge(ae2) && !e2WindCountIs0or1)
      return;
    if (_ClipperBase.isHotEdge(ae1) && _ClipperBase.isHotEdge(ae2)) {
      if (oldE1WindCount !== 0 && oldE1WindCount !== 1 || oldE2WindCount !== 0 && oldE2WindCount !== 1 || ae1.localMin.polytype !== ae2.localMin.polytype && this.cliptype !== ClipType.Xor) {
        resultOp = this.addLocalMaxPoly(ae1, ae2, pt);
        if (resultOp)
          this.setZ(ae1, ae2, resultOp.pt);
      } else if (_ClipperBase.isFront(ae1) || ae1.outrec === ae2.outrec) {
        resultOp = this.addLocalMaxPoly(ae1, ae2, pt);
        if (resultOp)
          this.setZ(ae1, ae2, resultOp.pt);
        const op2 = this.addLocalMinPoly(ae1, ae2, pt);
        this.setZ(ae1, ae2, op2.pt);
      } else {
        resultOp = this.addOutPt(ae1, pt);
        this.setZ(ae1, ae2, resultOp.pt);
        const op2 = this.addOutPt(ae2, pt);
        this.setZ(ae1, ae2, op2.pt);
        this.swapOutrecs(ae1, ae2);
      }
    } else if (_ClipperBase.isHotEdge(ae1)) {
      resultOp = this.addOutPt(ae1, pt);
      this.setZ(ae1, ae2, resultOp.pt);
      this.swapOutrecs(ae1, ae2);
    } else if (_ClipperBase.isHotEdge(ae2)) {
      resultOp = this.addOutPt(ae2, pt);
      this.setZ(ae1, ae2, resultOp.pt);
      this.swapOutrecs(ae1, ae2);
    } else {
      let e1Wc2, e2Wc2;
      switch (this.fillrule) {
        case FillRule.Positive:
          e1Wc2 = ae1.windCount2;
          e2Wc2 = ae2.windCount2;
          break;
        case FillRule.Negative:
          e1Wc2 = -ae1.windCount2;
          e2Wc2 = -ae2.windCount2;
          break;
        default:
          e1Wc2 = Math.abs(ae1.windCount2);
          e2Wc2 = Math.abs(ae2.windCount2);
          break;
      }
      if (!_ClipperBase.isSamePolyType(ae1, ae2)) {
        resultOp = this.addLocalMinPoly(ae1, ae2, pt);
        this.setZ(ae1, ae2, resultOp.pt);
      } else if (oldE1WindCount === 1 && oldE2WindCount === 1) {
        resultOp = null;
        switch (this.cliptype) {
          case ClipType.Union:
            if (e1Wc2 > 0 && e2Wc2 > 0)
              return;
            resultOp = this.addLocalMinPoly(ae1, ae2, pt);
            break;
          case ClipType.Difference:
            if (_ClipperBase.getPolyType(ae1) === PathType.Clip && e1Wc2 > 0 && e2Wc2 > 0 || _ClipperBase.getPolyType(ae1) === PathType.Subject && e1Wc2 <= 0 && e2Wc2 <= 0) {
              resultOp = this.addLocalMinPoly(ae1, ae2, pt);
            }
            break;
          case ClipType.Xor:
            resultOp = this.addLocalMinPoly(ae1, ae2, pt);
            break;
          default:
            if (e1Wc2 <= 0 || e2Wc2 <= 0)
              return;
            resultOp = this.addLocalMinPoly(ae1, ae2, pt);
            break;
        }
        if (resultOp)
          this.setZ(ae1, ae2, resultOp.pt);
      }
    }
  }
  swapPositionsInAEL(ae1, ae2) {
    const next = ae2.nextInAEL;
    if (next !== null)
      next.prevInAEL = ae1;
    const prev = ae1.prevInAEL;
    if (prev !== null)
      prev.nextInAEL = ae2;
    ae2.prevInAEL = prev;
    ae2.nextInAEL = ae1;
    ae1.prevInAEL = ae2;
    ae1.nextInAEL = next;
    if (ae2.prevInAEL === null)
      this.actives = ae2;
  }
  isValidAelOrder(resident, newcomer) {
    if (newcomer.curX !== resident.curX) {
      return newcomer.curX > resident.curX;
    }
    const d = InternalClipper.crossProductSign(resident.top, newcomer.bot, newcomer.top);
    if (d !== 0)
      return d < 0;
    if (!_ClipperBase.isMaximaEdge(resident) && resident.top.y > newcomer.top.y) {
      return InternalClipper.crossProductSign(newcomer.bot, resident.top, _ClipperBase.nextVertex(resident).pt) <= 0;
    }
    if (!_ClipperBase.isMaximaEdge(newcomer) && newcomer.top.y > resident.top.y) {
      return InternalClipper.crossProductSign(newcomer.bot, newcomer.top, _ClipperBase.nextVertex(newcomer).pt) >= 0;
    }
    const y = newcomer.bot.y;
    const newcomerIsLeft = newcomer.isLeftBound;
    if (resident.bot.y !== y || resident.localMin.vertex.pt.y !== y) {
      return newcomer.isLeftBound;
    }
    if (resident.isLeftBound !== newcomerIsLeft) {
      return newcomerIsLeft;
    }
    if (InternalClipper.isCollinear(_ClipperBase.prevPrevVertex(resident).pt, resident.bot, resident.top))
      return true;
    return InternalClipper.crossProductSign(_ClipperBase.prevPrevVertex(resident).pt, newcomer.bot, _ClipperBase.prevPrevVertex(newcomer).pt) > 0 === newcomerIsLeft;
  }
  isJoined(e) {
    return e.joinWith !== JoinWith.None;
  }
  split(e, currPt) {
    if (e.joinWith === JoinWith.Right) {
      e.joinWith = JoinWith.None;
      e.nextInAEL.joinWith = JoinWith.None;
      this.addLocalMinPoly(e, e.nextInAEL, currPt, true);
    } else {
      e.joinWith = JoinWith.None;
      e.prevInAEL.joinWith = JoinWith.None;
      this.addLocalMinPoly(e.prevInAEL, e, currPt, true);
    }
  }
  setSides(outrec, startEdge, endEdge) {
    outrec.frontEdge = startEdge;
    outrec.backEdge = endEdge;
  }
  findEdgeWithMatchingLocMin(e) {
    let result = e.nextInAEL;
    while (result !== null) {
      if (result.localMin?.equals(e.localMin))
        return result;
      if (!_ClipperBase.isHorizontal(result) && !(e.bot.x === result.bot.x && e.bot.y === result.bot.y))
        result = null;
      else
        result = result.nextInAEL;
    }
    result = e.prevInAEL;
    while (result !== null) {
      if (result.localMin?.equals(e.localMin))
        return result;
      if (!_ClipperBase.isHorizontal(result) && !(e.bot.x === result.bot.x && e.bot.y === result.bot.y))
        return null;
      result = result.prevInAEL;
    }
    return result;
  }
  addOutPt(ae, pt) {
    const outrec = ae.outrec;
    const toFront = _ClipperBase.isFront(ae);
    const opFront = outrec.pts;
    const opBack = opFront.next;
    if (toFront && pt.x === opFront.pt.x && pt.y === opFront.pt.y) {
      return opFront;
    } else if (!toFront && pt.x === opBack.pt.x && pt.y === opBack.pt.y) {
      return opBack;
    }
    const newOp = new OutPt(pt, outrec);
    opBack.prev = newOp;
    newOp.prev = opFront;
    newOp.next = opBack;
    opFront.next = newOp;
    if (toFront)
      outrec.pts = newOp;
    return newOp;
  }
  addLocalMaxPoly(ae1, ae2, pt) {
    if (this.isJoined(ae1))
      this.split(ae1, pt);
    if (this.isJoined(ae2))
      this.split(ae2, pt);
    if (_ClipperBase.isFront(ae1) === _ClipperBase.isFront(ae2)) {
      if (_ClipperBase.isOpenEnd(ae1)) {
        this.swapFrontBackSides(ae1.outrec);
      } else if (_ClipperBase.isOpenEnd(ae2)) {
        this.swapFrontBackSides(ae2.outrec);
      } else {
        this.succeeded = false;
        return null;
      }
    }
    const result = this.addOutPt(ae1, pt);
    if (ae1.outrec === ae2.outrec) {
      const outrec = ae1.outrec;
      outrec.pts = result;
      if (this.usingPolytree) {
        const e = _ClipperBase.getPrevHotEdge(ae1);
        if (e === null) {
          outrec.owner = null;
        } else {
          this.setOwner(outrec, e.outrec);
        }
      }
      this.uncoupleOutRec(ae1);
    } else if (_ClipperBase.isOpen(ae1)) {
      if (ae1.windDx < 0) {
        this.joinOutrecPaths(ae1, ae2);
      } else {
        this.joinOutrecPaths(ae2, ae1);
      }
    } else if (ae1.outrec.idx < ae2.outrec.idx) {
      this.joinOutrecPaths(ae1, ae2);
    } else {
      this.joinOutrecPaths(ae2, ae1);
    }
    return result;
  }
  swapFrontBackSides(outrec) {
    const ae2 = outrec.frontEdge;
    outrec.frontEdge = outrec.backEdge;
    outrec.backEdge = ae2;
    outrec.pts = outrec.pts.next;
  }
  setOwner(outrec, newOwner) {
    while (newOwner.owner !== null && newOwner.owner.pts === null) {
      newOwner.owner = newOwner.owner.owner;
    }
    let tmp = newOwner;
    while (tmp !== null && tmp !== outrec) {
      tmp = tmp.owner;
    }
    if (tmp !== null) {
      newOwner.owner = outrec.owner;
    }
    outrec.owner = newOwner;
  }
  uncoupleOutRec(ae) {
    const outrec = ae.outrec;
    if (outrec === null)
      return;
    outrec.frontEdge.outrec = null;
    outrec.backEdge.outrec = null;
    outrec.frontEdge = null;
    outrec.backEdge = null;
  }
  joinOutrecPaths(ae1, ae2) {
    const p1Start = ae1.outrec.pts;
    const p2Start = ae2.outrec.pts;
    const p1End = p1Start.next;
    const p2End = p2Start.next;
    if (_ClipperBase.isFront(ae1)) {
      p2End.prev = p1Start;
      p1Start.next = p2End;
      p2Start.next = p1End;
      p1End.prev = p2Start;
      ae1.outrec.pts = p2Start;
      ae1.outrec.frontEdge = ae2.outrec.frontEdge;
      if (ae1.outrec.frontEdge !== null) {
        ae1.outrec.frontEdge.outrec = ae1.outrec;
      }
    } else {
      p1End.prev = p2Start;
      p2Start.next = p1End;
      p1Start.next = p2End;
      p2End.prev = p1Start;
      ae1.outrec.backEdge = ae2.outrec.backEdge;
      if (ae1.outrec.backEdge !== null) {
        ae1.outrec.backEdge.outrec = ae1.outrec;
      }
    }
    ae2.outrec.frontEdge = null;
    ae2.outrec.backEdge = null;
    ae2.outrec.pts = null;
    this.setOwner(ae2.outrec, ae1.outrec);
    if (_ClipperBase.isOpenEnd(ae1)) {
      ae2.outrec.pts = ae1.outrec.pts;
      ae1.outrec.pts = null;
    }
    ae1.outrec = null;
    ae2.outrec = null;
  }
  swapOutrecs(ae1, ae2) {
    const or1 = ae1.outrec;
    const or2 = ae2.outrec;
    if (or1 === or2) {
      const ae = or1.frontEdge;
      or1.frontEdge = or1.backEdge;
      or1.backEdge = ae;
      return;
    }
    if (or1 !== null) {
      if (ae1 === or1.frontEdge) {
        or1.frontEdge = ae2;
      } else {
        or1.backEdge = ae2;
      }
    }
    if (or2 !== null) {
      if (ae2 === or2.frontEdge) {
        or2.frontEdge = ae1;
      } else {
        or2.backEdge = ae1;
      }
    }
    ae1.outrec = or2;
    ae2.outrec = or1;
  }
  disposeIntersectNodes() {
    this.intersectList.length = 0;
  }
  static ptsReallyClose(pt1, pt2) {
    return Math.abs(pt1.x - pt2.x) < 2 && Math.abs(pt1.y - pt2.y) < 2;
  }
  static isVerySmallTriangle(op) {
    return op.next.next === op.prev && (_ClipperBase.ptsReallyClose(op.prev.pt, op.next.pt) || _ClipperBase.ptsReallyClose(op.pt, op.next.pt) || _ClipperBase.ptsReallyClose(op.pt, op.prev.pt));
  }
  static buildPath(op, reverse, isOpen, path) {
    if (op === null || op.next === op || !isOpen && op.next === op.prev)
      return false;
    path.length = 0;
    let lastPt;
    let op2;
    if (reverse) {
      lastPt = op.pt;
      op2 = op.prev;
    } else {
      op = op.next;
      lastPt = op.pt;
      op2 = op.next;
    }
    path.push(lastPt);
    while (op2 !== op) {
      if (!(op2.pt.x === lastPt.x && op2.pt.y === lastPt.y)) {
        lastPt = op2.pt;
        path.push(lastPt);
      }
      if (reverse) {
        op2 = op2.prev;
      } else {
        op2 = op2.next;
      }
    }
    return path.length !== 3 || isOpen || !_ClipperBase.isVerySmallTriangle(op2);
  }
  buildPaths(solutionClosed, solutionOpen) {
    solutionClosed.length = 0;
    solutionOpen.length = 0;
    let i = 0;
    while (i < this.outrecList.length) {
      const outrec = this.outrecList[i++];
      if (outrec.pts === null)
        continue;
      const path = [];
      if (outrec.isOpen) {
        if (_ClipperBase.buildPath(outrec.pts, this.reverseSolution, true, path)) {
          solutionOpen.push(path);
        }
      } else {
        this.cleanCollinear(outrec);
        if (_ClipperBase.buildPath(outrec.pts, this.reverseSolution, false, path)) {
          solutionClosed.push(path);
        }
      }
    }
    return true;
  }
  buildTree(polytree, solutionOpen) {
    polytree.clear();
    solutionOpen.length = 0;
    let i = 0;
    while (i < this.outrecList.length) {
      const outrec = this.outrecList[i++];
      if (outrec.pts === null)
        continue;
      if (outrec.isOpen) {
        const openPath = [];
        if (_ClipperBase.buildPath(outrec.pts, this.reverseSolution, true, openPath)) {
          solutionOpen.push(openPath);
        }
        continue;
      }
      if (this.checkBounds(outrec)) {
        this.recursiveCheckOwners(outrec, polytree);
      }
    }
  }
  checkBounds(outrec) {
    if (outrec.pts === null)
      return false;
    if (!Rect64Utils.isEmpty(outrec.bounds))
      return true;
    this.cleanCollinear(outrec);
    if (outrec.pts === null || !_ClipperBase.buildPath(outrec.pts, this.reverseSolution, false, outrec.path)) {
      return false;
    }
    outrec.bounds = InternalClipper.getBounds(outrec.path);
    return true;
  }
  recursiveCheckOwners(outrec, polypath) {
    if (outrec.polypath !== null || Rect64Utils.isEmpty(outrec.bounds))
      return;
    while (outrec.owner !== null) {
      if (outrec.owner.splits !== null && this.checkSplitOwner(outrec, outrec.owner.splits))
        break;
      if (outrec.owner.pts !== null && this.checkBounds(outrec.owner) && // Fast reject: a container must contain the child's bounds.
      this.containsRect(outrec.owner.bounds, outrec.bounds) && this.path1InsidePath2(outrec.pts, outrec.owner.pts))
        break;
      outrec.owner = outrec.owner.owner;
    }
    if (outrec.owner !== null) {
      if (outrec.owner.polypath === null) {
        this.recursiveCheckOwners(outrec.owner, polypath);
      }
      outrec.polypath = outrec.owner.polypath.addChild(outrec.path);
    } else {
      outrec.polypath = polypath.addChild(outrec.path);
    }
  }
  cleanCollinear(outrec) {
    outrec = this.getRealOutRec(outrec);
    if (outrec === null || outrec.isOpen)
      return;
    if (!this.isValidClosedPath(outrec.pts)) {
      outrec.pts = null;
      return;
    }
    let startOp = outrec.pts;
    let op2 = startOp;
    while (true) {
      if (op2 !== null && InternalClipper.isCollinear(op2.prev.pt, op2.pt, op2.next.pt) && (op2.pt.x === op2.prev.pt.x && op2.pt.y === op2.prev.pt.y || op2.pt.x === op2.next.pt.x && op2.pt.y === op2.next.pt.y || !this.preserveCollinear || InternalClipper.dotProductSign(op2.prev.pt, op2.pt, op2.next.pt) < 0)) {
        if (op2 === outrec.pts) {
          outrec.pts = op2.prev;
        }
        op2 = this.disposeOutPt(op2);
        if (!this.isValidClosedPath(op2)) {
          outrec.pts = null;
          return;
        }
        startOp = op2;
        continue;
      }
      if (op2 === null)
        break;
      op2 = op2.next;
      if (op2 === startOp)
        break;
    }
    this.fixSelfIntersects(outrec);
  }
  isValidClosedPath(op) {
    return op !== null && op.next !== op && (op.next !== op.prev || !_ClipperBase.isVerySmallTriangle(op));
  }
  disposeOutPt(op) {
    const result = op.next === op ? null : op.next;
    op.prev.next = op.next;
    op.next.prev = op.prev;
    return result;
  }
  fixSelfIntersects(outrec) {
    let op2 = outrec.pts;
    if (op2.prev === op2.next.next) {
      return;
    }
    while (true) {
      if (op2.next && op2.next.next && this.boundingBoxesOverlap(op2.prev.pt, op2.pt, op2.next.pt, op2.next.next.pt) && InternalClipper.segsIntersect(op2.prev.pt, op2.pt, op2.next.pt, op2.next.next.pt)) {
        if (op2 === outrec.pts || op2.next === outrec.pts) {
          outrec.pts = outrec.pts.prev;
        }
        this.doSplitOp(outrec, op2);
        if (outrec.pts === null)
          return;
        op2 = outrec.pts;
        if (op2.prev === op2.next.next)
          break;
        continue;
      }
      op2 = op2.next;
      if (op2 === outrec.pts)
        break;
    }
  }
  doSplitOp(outrec, splitOp) {
    const prevOp = splitOp.prev;
    const nextNextOp = splitOp.next.next;
    outrec.pts = prevOp;
    const ip = InternalClipper.getLineIntersectPt(prevOp.pt, splitOp.pt, splitOp.next.pt, nextNextOp.pt);
    if (this.zCallbackInternal) {
      this.zCallbackInternal(prevOp.pt, splitOp.pt, splitOp.next.pt, nextNextOp.pt, ip);
    }
    const doubleArea1 = _ClipperBase.areaOutPt(prevOp);
    const absDoubleArea1 = doubleArea1 < B02 ? -doubleArea1 : doubleArea1;
    if (absDoubleArea1 < B42) {
      outrec.pts = null;
      return;
    }
    const doubleArea2 = this.areaTriangle(ip, splitOp.pt, splitOp.next.pt);
    const absDoubleArea2 = doubleArea2 < B02 ? -doubleArea2 : doubleArea2;
    if (ip.x === prevOp.pt.x && ip.y === prevOp.pt.y || ip.x === nextNextOp.pt.x && ip.y === nextNextOp.pt.y) {
      nextNextOp.prev = prevOp;
      prevOp.next = nextNextOp;
    } else {
      const newOp2 = new OutPt(ip, outrec);
      newOp2.prev = prevOp;
      newOp2.next = nextNextOp;
      nextNextOp.prev = newOp2;
      prevOp.next = newOp2;
    }
    if (!(absDoubleArea2 > B22) || // area > 1
    !(absDoubleArea2 > absDoubleArea1) && doubleArea2 > B02 !== doubleArea1 > B02)
      return;
    const newOutRec = this.newOutRec();
    newOutRec.owner = outrec.owner;
    splitOp.outrec = newOutRec;
    splitOp.next.outrec = newOutRec;
    const newOp = new OutPt(ip, newOutRec);
    newOp.prev = splitOp.next;
    newOp.next = splitOp;
    newOutRec.pts = newOp;
    splitOp.prev = newOp;
    splitOp.next.next = newOp;
    if (!this.usingPolytree)
      return;
    if (this.path1InsidePath2(prevOp, newOp)) {
      if (newOutRec.splits === null)
        newOutRec.splits = [];
      newOutRec.splits.push(outrec.idx);
    } else {
      if (outrec.splits === null)
        outrec.splits = [];
      outrec.splits.push(newOutRec.idx);
    }
  }
  static areaOutPt(op) {
    const maxCoord = InternalClipper.maxCoordForSafeAreaProduct;
    let area2 = 0;
    let allSmall = true;
    let op2 = op;
    do {
      const prev = op2.prev;
      const pt = op2.pt;
      if (Math.abs(prev.pt.x) >= maxCoord || Math.abs(prev.pt.y) >= maxCoord || Math.abs(pt.x) >= maxCoord || Math.abs(pt.y) >= maxCoord) {
        allSmall = false;
        break;
      }
      area2 += (prev.pt.y + pt.y) * (prev.pt.x - pt.x);
      op2 = op2.next;
    } while (op2 !== op);
    if (allSmall) {
      return BigInt(Math.round(area2));
    }
    let areaBig = B02;
    op2 = op;
    do {
      const prev = op2.prev;
      if (Number.isSafeInteger(prev.pt.y) && Number.isSafeInteger(op2.pt.y) && Number.isSafeInteger(prev.pt.x) && Number.isSafeInteger(op2.pt.x)) {
        const sumBig = BigInt(prev.pt.y) + BigInt(op2.pt.y);
        const diffBig = BigInt(prev.pt.x) - BigInt(op2.pt.x);
        areaBig += sumBig * diffBig;
      } else {
        const sum = prev.pt.y + op2.pt.y;
        const diff = prev.pt.x - op2.pt.x;
        areaBig += BigInt(Math.round(sum * diff));
      }
      op2 = op2.next;
    } while (op2 !== op);
    return areaBig;
  }
  areaTriangle(pt1, pt2, pt3) {
    const maxCoord = InternalClipper.maxCoordForSafeAreaProduct;
    if (Math.abs(pt1.x) < maxCoord && Math.abs(pt1.y) < maxCoord && Math.abs(pt2.x) < maxCoord && Math.abs(pt2.y) < maxCoord && Math.abs(pt3.x) < maxCoord && Math.abs(pt3.y) < maxCoord) {
      const area3 = (pt3.y + pt1.y) * (pt3.x - pt1.x) + (pt1.y + pt2.y) * (pt1.x - pt2.x) + (pt2.y + pt3.y) * (pt2.x - pt3.x);
      return BigInt(Math.round(area3));
    }
    if (Number.isSafeInteger(pt1.x) && Number.isSafeInteger(pt1.y) && Number.isSafeInteger(pt2.x) && Number.isSafeInteger(pt2.y) && Number.isSafeInteger(pt3.x) && Number.isSafeInteger(pt3.y)) {
      const term1 = (BigInt(pt3.y) + BigInt(pt1.y)) * (BigInt(pt3.x) - BigInt(pt1.x));
      const term2 = (BigInt(pt1.y) + BigInt(pt2.y)) * (BigInt(pt1.x) - BigInt(pt2.x));
      const term3 = (BigInt(pt2.y) + BigInt(pt3.y)) * (BigInt(pt2.x) - BigInt(pt3.x));
      return term1 + term2 + term3;
    }
    const area2 = (pt3.y + pt1.y) * (pt3.x - pt1.x) + (pt1.y + pt2.y) * (pt1.x - pt2.x) + (pt2.y + pt3.y) * (pt2.x - pt3.x);
    return BigInt(Math.round(area2));
  }
  isValidOwner(outRec, testOwner) {
    while (testOwner !== null && testOwner !== outRec) {
      testOwner = testOwner.owner;
    }
    return testOwner === null;
  }
  containsRect(rect, rec) {
    return rec.left >= rect.left && rec.right <= rect.right && rec.top >= rect.top && rec.bottom <= rect.bottom;
  }
  checkSplitOwner(outrec, splits) {
    for (let i = 0; i < splits.length; i++) {
      let split = this.outrecList[splits[i]];
      if (split.pts === null && split.splits !== null && this.checkSplitOwner(outrec, split.splits))
        return true;
      split = this.getRealOutRec(split);
      if (split === null || split === outrec || split.recursiveSplit === outrec)
        continue;
      split.recursiveSplit = outrec;
      if (split.splits !== null && this.checkSplitOwner(outrec, split.splits))
        return true;
      if (!this.checkBounds(split) || !this.containsRect(split.bounds, outrec.bounds) || !this.path1InsidePath2(outrec.pts, split.pts))
        continue;
      if (!this.isValidOwner(outrec, split)) {
        split.owner = outrec.owner;
      }
      outrec.owner = split;
      return true;
    }
    return false;
  }
};
// When there are no open paths, a lot of open-path branching becomes dead code.
// We set this per execute to allow fast short-circuiting in hot helpers.
__publicField(_ClipperBase, "openPathsEnabled", true);
var ClipperBase = _ClipperBase;
var Clipper64 = class extends ClipperBase {
  constructor() {
    super(...arguments);
    __publicField(this, "zCallback");
  }
  getZCallback() {
    return this.zCallback;
  }
  addPath(path, polytype, isOpen = false) {
    super.addPath(path, polytype, isOpen);
  }
  addReuseableData(reuseableData) {
    super.addReuseableData(reuseableData);
  }
  addPaths(paths, polytype, isOpen = false) {
    super.addPaths(paths, polytype, isOpen);
  }
  addSubject(paths) {
    this.addPaths(paths, PathType.Subject);
  }
  addOpenSubject(paths) {
    this.addPaths(paths, PathType.Subject, true);
  }
  addClip(paths) {
    this.addPaths(paths, PathType.Clip);
  }
  execute(clipType, fillRule, solutionOrTree, openPathsOrSolutionOpen) {
    if (Array.isArray(solutionOrTree)) {
      const solutionClosed = solutionOrTree;
      const solutionOpen = openPathsOrSolutionOpen;
      solutionClosed.length = 0;
      if (solutionOpen)
        solutionOpen.length = 0;
      try {
        this.executeInternal(clipType, fillRule);
        this.buildPaths(solutionClosed, solutionOpen || []);
      } catch {
        this.succeeded = false;
      }
      this.clearSolutionOnly();
      return this.succeeded;
    } else {
      const polytree = solutionOrTree;
      const openPaths = openPathsOrSolutionOpen;
      polytree.clear();
      if (openPaths)
        openPaths.length = 0;
      this.usingPolytree = true;
      try {
        this.executeInternal(clipType, fillRule);
        this.buildTree(polytree, openPaths || []);
      } catch {
        this.succeeded = false;
      }
      this.clearSolutionOnly();
      return this.succeeded;
    }
  }
};
var Clipper = {
  area(path) {
    return InternalClipper.area(path);
  },
  areaD(path) {
    let a = 0;
    const cnt = path.length;
    if (cnt < 3)
      return 0;
    let prevPt = path[cnt - 1];
    for (const pt of path) {
      a += (prevPt.y + pt.y) * (prevPt.x - pt.x);
      prevPt = pt;
    }
    return a * 0.5;
  },
  scalePath64(path, scale) {
    const maxAbs = InternalClipper.maxSafeCoordinateForScale(scale);
    const result = [];
    for (const pt of path) {
      InternalClipper.checkSafeScaleValue(pt.x, maxAbs, "scalePath64");
      InternalClipper.checkSafeScaleValue(pt.y, maxAbs, "scalePath64");
      result.push({
        x: Math.round(pt.x * scale),
        y: Math.round(pt.y * scale)
      });
    }
    return result;
  },
  scalePaths64(paths, scale) {
    const result = [];
    for (const path of paths) {
      result.push(Clipper.scalePath64(path, scale));
    }
    return result;
  },
  scalePathD(path, scale) {
    const result = [];
    for (const pt of path) {
      result.push({
        x: pt.x * scale,
        y: pt.y * scale
      });
    }
    return result;
  },
  scalePathsD(paths, scale) {
    const result = [];
    for (const path of paths) {
      result.push(Clipper.scalePathD(path, scale));
    }
    return result;
  }
};

// node_modules/clipper2-ts/dist/Offset.js
var JoinType;
(function(JoinType2) {
  JoinType2[JoinType2["Miter"] = 0] = "Miter";
  JoinType2[JoinType2["Square"] = 1] = "Square";
  JoinType2[JoinType2["Bevel"] = 2] = "Bevel";
  JoinType2[JoinType2["Round"] = 3] = "Round";
})(JoinType || (JoinType = {}));
var EndType;
(function(EndType2) {
  EndType2[EndType2["Polygon"] = 0] = "Polygon";
  EndType2[EndType2["Joined"] = 1] = "Joined";
  EndType2[EndType2["Butt"] = 2] = "Butt";
  EndType2[EndType2["Square"] = 3] = "Square";
  EndType2[EndType2["Round"] = 4] = "Round";
})(EndType || (EndType = {}));
var Group = class {
  constructor(paths, joinType, endType = EndType.Polygon) {
    __publicField(this, "inPaths");
    __publicField(this, "joinType");
    __publicField(this, "endType");
    __publicField(this, "pathsReversed");
    __publicField(this, "lowestPathIdx");
    this.joinType = joinType;
    this.endType = endType;
    const isJoined = endType === EndType.Polygon || endType === EndType.Joined;
    this.inPaths = [];
    for (const path of paths) {
      this.inPaths.push(ClipperOffset.stripDuplicates(path, isJoined));
    }
    if (endType === EndType.Polygon) {
      const lowestInfo = ClipperOffset.getLowestPathInfo(this.inPaths);
      this.lowestPathIdx = lowestInfo.idx;
      this.pathsReversed = this.lowestPathIdx >= 0 && lowestInfo.isNegArea;
    } else {
      this.lowestPathIdx = -1;
      this.pathsReversed = false;
    }
  }
};
var _ClipperOffset = class _ClipperOffset {
  constructor(miterLimit = 2, arcTolerance = 0, preserveCollinear = false, reverseSolution = false) {
    // <-- 1/500
    __publicField(this, "groupList", []);
    __publicField(this, "pathOut", []);
    __publicField(this, "normals", []);
    __publicField(this, "solution", []);
    __publicField(this, "solutionTree", null);
    __publicField(this, "groupDelta", 0);
    //*0.5 for open paths; *-1.0 for negative areas
    __publicField(this, "delta", 0);
    __publicField(this, "mitLimSqr", 0);
    __publicField(this, "stepsPerRad", 0);
    __publicField(this, "stepSin", 0);
    __publicField(this, "stepCos", 0);
    __publicField(this, "joinType", JoinType.Bevel);
    __publicField(this, "endType", EndType.Polygon);
    __publicField(this, "arcTolerance", 0);
    __publicField(this, "mergeGroups", true);
    __publicField(this, "miterLimit", 2);
    __publicField(this, "preserveCollinear", false);
    __publicField(this, "reverseSolution", false);
    __publicField(this, "zCallback");
    __publicField(this, "deltaCallback", null);
    // Internal Z callback that implements default Z handling before calling user callback
    __publicField(this, "ZCB", (bot1, top1, bot2, top2, intersectPt) => {
      if ((bot1.z || 0) !== 0 && (bot1.z === bot2.z || bot1.z === top2.z)) {
        intersectPt.z = bot1.z;
      } else if ((bot2.z || 0) !== 0 && bot2.z === top1.z) {
        intersectPt.z = bot2.z;
      } else if ((top1.z || 0) !== 0 && top1.z === top2.z) {
        intersectPt.z = top1.z;
      } else if (this.zCallback) {
        this.zCallback(bot1, top1, bot2, top2, intersectPt);
      }
    });
    this.miterLimit = miterLimit;
    this.arcTolerance = arcTolerance;
    this.mergeGroups = true;
    this.preserveCollinear = preserveCollinear;
    this.reverseSolution = reverseSolution;
  }
  clear() {
    this.groupList.length = 0;
  }
  addPath(path, joinType, endType) {
    if (path.length === 0)
      return;
    const pp = [path];
    this.addPaths(pp, joinType, endType);
  }
  addPaths(paths, joinType, endType) {
    if (paths.length === 0)
      return;
    this.groupList.push(new Group(paths, joinType, endType));
  }
  calcSolutionCapacity() {
    let result = 0;
    for (const g of this.groupList) {
      result += g.endType === EndType.Joined ? g.inPaths.length * 2 : g.inPaths.length;
    }
    return result;
  }
  checkPathsReversed() {
    let result = false;
    for (const g of this.groupList) {
      if (g.endType === EndType.Polygon) {
        result = g.pathsReversed;
        break;
      }
    }
    return result;
  }
  executeInternal(delta) {
    if (this.groupList.length === 0)
      return;
    if (Math.abs(delta) < 0.5) {
      for (const group of this.groupList) {
        for (const path of group.inPaths) {
          this.solution.push(path);
        }
      }
      return;
    }
    this.delta = delta;
    this.mitLimSqr = this.miterLimit <= 1 ? 2 : 2 / _ClipperOffset.sqr(this.miterLimit);
    for (const group of this.groupList) {
      this.doGroupOffset(group);
    }
    if (this.groupList.length === 0)
      return;
    const pathsReversed = this.checkPathsReversed();
    const fillRule = pathsReversed ? FillRule.Negative : FillRule.Positive;
    const c = new Clipper64();
    c.preserveCollinear = this.preserveCollinear;
    c.reverseSolution = this.reverseSolution !== pathsReversed;
    c.zCallback = this.ZCB;
    c.addSubject(this.solution);
    if (this.solutionTree !== null) {
      c.execute(ClipType.Union, fillRule, this.solutionTree);
    } else {
      c.execute(ClipType.Union, fillRule, this.solution);
    }
  }
  execute(delta, solutionOrTree) {
    if (Array.isArray(solutionOrTree)) {
      const solution = solutionOrTree;
      solution.length = 0;
      this.solution = solution;
      this.executeInternal(delta);
    } else {
      const solutionTree = solutionOrTree;
      solutionTree.clear();
      this.solutionTree = solutionTree;
      this.solution = [];
      this.executeInternal(delta);
    }
  }
  executeWithCallback(deltaCallback, solution) {
    this.deltaCallback = deltaCallback;
    this.execute(1, solution);
  }
  static getUnitNormal(pt1, pt2) {
    const dx = pt2.x - pt1.x;
    const dy = pt2.y - pt1.y;
    if (dx === 0 && dy === 0)
      return { x: 0, y: 0 };
    const f = 1 / Math.sqrt(dx * dx + dy * dy);
    return {
      x: dy * f,
      y: -dx * f
    };
  }
  static getLowestPathInfo(paths) {
    let idx = -1;
    let isNegArea = false;
    const botPt = { x: Number.MAX_SAFE_INTEGER, y: Number.MIN_SAFE_INTEGER };
    for (let i = 0; i < paths.length; ++i) {
      let a = Number.MAX_VALUE;
      for (const pt of paths[i]) {
        if (pt.y < botPt.y || pt.y === botPt.y && pt.x >= botPt.x)
          continue;
        if (a === Number.MAX_VALUE) {
          a = _ClipperOffset.area(paths[i]);
          if (a === 0)
            break;
          isNegArea = a < 0;
        }
        idx = i;
        botPt.x = pt.x;
        botPt.y = pt.y;
      }
    }
    return { idx, isNegArea };
  }
  static translatePoint(pt, dx, dy) {
    return { x: pt.x + dx, y: pt.y + dy, z: pt.z };
  }
  static reflectPoint(pt, pivot) {
    return { x: pivot.x + (pivot.x - pt.x), y: pivot.y + (pivot.y - pt.y), z: pt.z };
  }
  static almostZero(value, epsilon = 1e-3) {
    return Math.abs(value) < epsilon;
  }
  static hypotenuse(x, y) {
    return Math.sqrt(x * x + y * y);
  }
  static normalizeVector(vec) {
    const h = _ClipperOffset.hypotenuse(vec.x, vec.y);
    if (_ClipperOffset.almostZero(h))
      return { x: 0, y: 0 };
    const inverseHypot = 1 / h;
    return { x: vec.x * inverseHypot, y: vec.y * inverseHypot };
  }
  static getAvgUnitVector(vec1, vec2) {
    return _ClipperOffset.normalizeVector({ x: vec1.x + vec2.x, y: vec1.y + vec2.y });
  }
  static intersectPoint(pt1a, pt1b, pt2a, pt2b) {
    if (InternalClipper.isAlmostZero(pt1a.x - pt1b.x)) {
      if (InternalClipper.isAlmostZero(pt2a.x - pt2b.x))
        return { x: 0, y: 0 };
      const m2 = (pt2b.y - pt2a.y) / (pt2b.x - pt2a.x);
      const b2 = pt2a.y - m2 * pt2a.x;
      return { x: pt1a.x, y: m2 * pt1a.x + b2 };
    }
    if (InternalClipper.isAlmostZero(pt2a.x - pt2b.x)) {
      const m1 = (pt1b.y - pt1a.y) / (pt1b.x - pt1a.x);
      const b1 = pt1a.y - m1 * pt1a.x;
      return { x: pt2a.x, y: m1 * pt2a.x + b1 };
    } else {
      const m1 = (pt1b.y - pt1a.y) / (pt1b.x - pt1a.x);
      const b1 = pt1a.y - m1 * pt1a.x;
      const m2 = (pt2b.y - pt2a.y) / (pt2b.x - pt2a.x);
      const b2 = pt2a.y - m2 * pt2a.x;
      if (InternalClipper.isAlmostZero(m1 - m2))
        return { x: 0, y: 0 };
      const x = (b2 - b1) / (m1 - m2);
      return { x, y: m1 * x + b1 };
    }
  }
  getPerpendic(pt, norm) {
    return {
      x: Math.round(pt.x + norm.x * this.groupDelta),
      y: Math.round(pt.y + norm.y * this.groupDelta),
      z: pt.z || 0
    };
  }
  getPerpendicD(pt, norm) {
    return {
      x: pt.x + norm.x * this.groupDelta,
      y: pt.y + norm.y * this.groupDelta,
      z: pt.z || 0
    };
  }
  doBevel(path, j, k) {
    let pt1, pt2;
    const pjz = path[j].z || 0;
    if (j === k) {
      const absDelta = Math.abs(this.groupDelta);
      pt1 = {
        x: Math.round(path[j].x - absDelta * this.normals[j].x),
        y: Math.round(path[j].y - absDelta * this.normals[j].y),
        z: pjz
      };
      pt2 = {
        x: Math.round(path[j].x + absDelta * this.normals[j].x),
        y: Math.round(path[j].y + absDelta * this.normals[j].y),
        z: pjz
      };
    } else {
      pt1 = {
        x: Math.round(path[j].x + this.groupDelta * this.normals[k].x),
        y: Math.round(path[j].y + this.groupDelta * this.normals[k].y),
        z: pjz
      };
      pt2 = {
        x: Math.round(path[j].x + this.groupDelta * this.normals[j].x),
        y: Math.round(path[j].y + this.groupDelta * this.normals[j].y),
        z: pjz
      };
    }
    this.pathOut.push(pt1);
    this.pathOut.push(pt2);
  }
  doSquare(path, j, k) {
    let vec;
    if (j === k) {
      vec = { x: this.normals[j].y, y: -this.normals[j].x };
    } else {
      vec = _ClipperOffset.getAvgUnitVector({ x: -this.normals[k].y, y: this.normals[k].x }, { x: this.normals[j].y, y: -this.normals[j].x });
    }
    const absDelta = Math.abs(this.groupDelta);
    let ptQ = { x: path[j].x, y: path[j].y, z: path[j].z || 0 };
    ptQ = _ClipperOffset.translatePoint(ptQ, absDelta * vec.x, absDelta * vec.y);
    const pt1 = _ClipperOffset.translatePoint(ptQ, this.groupDelta * vec.y, this.groupDelta * -vec.x);
    const pt2 = _ClipperOffset.translatePoint(ptQ, this.groupDelta * -vec.y, this.groupDelta * vec.x);
    const pt3 = this.getPerpendicD(path[k], this.normals[k]);
    if (j === k) {
      const pt4 = {
        x: pt3.x + vec.x * this.groupDelta,
        y: pt3.y + vec.y * this.groupDelta
      };
      const pt = _ClipperOffset.intersectPoint(pt1, pt2, pt3, pt4);
      pt.z = ptQ.z;
      this.pathOut.push(Point64Utils.fromPointD(_ClipperOffset.reflectPoint(pt, ptQ)));
      this.pathOut.push(Point64Utils.fromPointD(pt));
    } else {
      const pt4 = this.getPerpendicD(path[j], this.normals[k]);
      const pt = _ClipperOffset.intersectPoint(pt1, pt2, pt3, pt4);
      pt.z = ptQ.z;
      this.pathOut.push(Point64Utils.fromPointD(pt));
      this.pathOut.push(Point64Utils.fromPointD(_ClipperOffset.reflectPoint(pt, ptQ)));
    }
  }
  doMiter(path, j, k, cosA) {
    const q = this.groupDelta / (cosA + 1);
    this.pathOut.push({
      x: Math.round(path[j].x + (this.normals[k].x + this.normals[j].x) * q),
      y: Math.round(path[j].y + (this.normals[k].y + this.normals[j].y) * q),
      z: path[j].z || 0
    });
  }
  doRound(path, j, k, angle) {
    if (this.deltaCallback !== null) {
      const absDelta = Math.abs(this.groupDelta);
      const arcTol = this.arcTolerance > 0.01 ? this.arcTolerance : absDelta * _ClipperOffset.arc_const;
      const stepsPer360 = Math.PI / Math.acos(1 - arcTol / absDelta);
      this.stepSin = Math.sin(2 * Math.PI / stepsPer360);
      this.stepCos = Math.cos(2 * Math.PI / stepsPer360);
      if (this.groupDelta < 0)
        this.stepSin = -this.stepSin;
      this.stepsPerRad = stepsPer360 / (2 * Math.PI);
    }
    const pt = path[j];
    const ptz = pt.z || 0;
    let offsetVec = { x: this.normals[k].x * this.groupDelta, y: this.normals[k].y * this.groupDelta };
    if (j === k)
      PointDUtils.negate(offsetVec);
    this.pathOut.push({
      x: Math.round(pt.x + offsetVec.x),
      y: Math.round(pt.y + offsetVec.y),
      z: ptz
    });
    const steps = Math.ceil(this.stepsPerRad * Math.abs(angle));
    for (let i = 1; i < steps; i++) {
      offsetVec = {
        x: offsetVec.x * this.stepCos - this.stepSin * offsetVec.y,
        y: offsetVec.x * this.stepSin + offsetVec.y * this.stepCos
      };
      this.pathOut.push({
        x: Math.round(pt.x + offsetVec.x),
        y: Math.round(pt.y + offsetVec.y),
        z: ptz
      });
    }
    this.pathOut.push(this.getPerpendic(path[j], this.normals[j]));
  }
  buildNormals(path) {
    const cnt = path.length;
    this.normals.length = 0;
    if (cnt === 0)
      return;
    for (let i = 0; i < cnt - 1; i++) {
      this.normals.push(_ClipperOffset.getUnitNormal(path[i], path[i + 1]));
    }
    this.normals.push(_ClipperOffset.getUnitNormal(path[cnt - 1], path[0]));
  }
  offsetPoint(group, path, j, k) {
    if (Point64Utils.equals(path[j], path[k]))
      return;
    let sinA = InternalClipper.crossProductD(this.normals[j], this.normals[k]);
    const cosA = InternalClipper.dotProductD(this.normals[j], this.normals[k]);
    if (sinA > 1)
      sinA = 1;
    else if (sinA < -1)
      sinA = -1;
    if (this.deltaCallback !== null) {
      this.groupDelta = this.deltaCallback(path, this.normals, j, k);
      if (group.pathsReversed)
        this.groupDelta = -this.groupDelta;
    }
    if (Math.abs(this.groupDelta) < _ClipperOffset.Tolerance) {
      this.pathOut.push(path[j]);
      return;
    }
    if (cosA > -0.999 && sinA * this.groupDelta < 0) {
      this.pathOut.push(this.getPerpendic(path[j], this.normals[k]));
      this.pathOut.push(path[j]);
      this.pathOut.push(this.getPerpendic(path[j], this.normals[j]));
    } else if (cosA > 0.999 && this.joinType !== JoinType.Round) {
      this.doMiter(path, j, k, cosA);
    } else {
      switch (this.joinType) {
        // miter unless the angle is sufficiently acute to exceed ML
        case JoinType.Miter:
          if (cosA > this.mitLimSqr - 1) {
            this.doMiter(path, j, k, cosA);
          } else {
            this.doSquare(path, j, k);
          }
          break;
        case JoinType.Round:
          this.doRound(path, j, k, Math.atan2(sinA, cosA));
          break;
        case JoinType.Bevel:
          this.doBevel(path, j, k);
          break;
        default:
          this.doSquare(path, j, k);
          break;
      }
    }
  }
  offsetPolygon(group, path) {
    this.pathOut = [];
    const cnt = path.length;
    let prev = cnt - 1;
    for (let i = 0; i < cnt; i++) {
      this.offsetPoint(group, path, i, prev);
      prev = i;
    }
    this.solution.push(this.pathOut);
  }
  offsetOpenJoined(group, path) {
    this.offsetPolygon(group, path);
    const reversePath2 = [...path].reverse();
    this.buildNormals(reversePath2);
    this.offsetPolygon(group, reversePath2);
  }
  offsetOpenPath(group, path) {
    this.pathOut = [];
    const highI = path.length - 1;
    if (this.deltaCallback !== null) {
      this.groupDelta = this.deltaCallback(path, this.normals, 0, 0);
    }
    if (Math.abs(this.groupDelta) < _ClipperOffset.Tolerance) {
      this.pathOut.push(path[0]);
    } else {
      switch (this.endType) {
        case EndType.Butt:
          this.doBevel(path, 0, 0);
          break;
        case EndType.Round:
          this.doRound(path, 0, 0, Math.PI);
          break;
        default:
          this.doSquare(path, 0, 0);
          break;
      }
    }
    for (let i = 1, k = 0; i < highI; i++) {
      this.offsetPoint(group, path, i, k);
      k = i;
    }
    for (let i = highI; i > 0; i--) {
      this.normals[i] = { x: -this.normals[i - 1].x, y: -this.normals[i - 1].y };
    }
    this.normals[0] = this.normals[highI];
    if (this.deltaCallback !== null) {
      this.groupDelta = this.deltaCallback(path, this.normals, highI, highI);
    }
    if (Math.abs(this.groupDelta) < _ClipperOffset.Tolerance) {
      this.pathOut.push(path[highI]);
    } else {
      switch (this.endType) {
        case EndType.Butt:
          this.doBevel(path, highI, highI);
          break;
        case EndType.Round:
          this.doRound(path, highI, highI, Math.PI);
          break;
        default:
          this.doSquare(path, highI, highI);
          break;
      }
    }
    for (let i = highI - 1, k = highI; i > 0; i--) {
      this.offsetPoint(group, path, i, k);
      k = i;
    }
    this.solution.push(this.pathOut);
  }
  doGroupOffset(group) {
    if (group.endType === EndType.Polygon) {
      if (group.lowestPathIdx < 0)
        this.delta = Math.abs(this.delta);
      this.groupDelta = group.pathsReversed ? -this.delta : this.delta;
    } else {
      this.groupDelta = Math.abs(this.delta);
    }
    const absDelta = Math.abs(this.groupDelta);
    this.joinType = group.joinType;
    this.endType = group.endType;
    if (group.joinType === JoinType.Round || group.endType === EndType.Round) {
      const arcTol = this.arcTolerance > 0.01 ? this.arcTolerance : absDelta * _ClipperOffset.arc_const;
      const stepsPer360 = Math.PI / Math.acos(1 - arcTol / absDelta);
      this.stepSin = Math.sin(2 * Math.PI / stepsPer360);
      this.stepCos = Math.cos(2 * Math.PI / stepsPer360);
      if (this.groupDelta < 0)
        this.stepSin = -this.stepSin;
      this.stepsPerRad = stepsPer360 / (2 * Math.PI);
    }
    for (const pathIn of group.inPaths) {
      this.pathOut = [];
      const cnt = pathIn.length;
      if (cnt === 1) {
        const pt = pathIn[0];
        if (this.deltaCallback !== null) {
          this.groupDelta = this.deltaCallback(pathIn, this.normals, 0, 0);
          if (group.pathsReversed)
            this.groupDelta = -this.groupDelta;
        }
        const ptz = pt.z || 0;
        if (group.endType === EndType.Round) {
          const steps = Math.ceil(this.stepsPerRad * 2 * Math.PI);
          this.pathOut = _ClipperOffset.ellipse(pt, Math.abs(this.groupDelta), Math.abs(this.groupDelta), steps);
          if (ptz !== 0)
            for (let i = 0; i < this.pathOut.length; i++)
              this.pathOut[i].z = ptz;
        } else {
          const d = Math.ceil(Math.abs(this.groupDelta));
          const r = { left: pt.x - d, top: pt.y - d, right: pt.x + d, bottom: pt.y + d };
          this.pathOut = [
            { x: r.left, y: r.top, z: ptz },
            { x: r.right, y: r.top, z: ptz },
            { x: r.right, y: r.bottom, z: ptz },
            { x: r.left, y: r.bottom, z: ptz }
          ];
        }
        this.solution.push(this.pathOut);
        continue;
      }
      if (cnt === 2 && group.endType === EndType.Joined) {
        this.endType = group.joinType === JoinType.Round ? EndType.Round : EndType.Square;
      }
      this.buildNormals(pathIn);
      switch (this.endType) {
        case EndType.Polygon:
          this.offsetPolygon(group, pathIn);
          break;
        case EndType.Joined:
          this.offsetOpenJoined(group, pathIn);
          break;
        default:
          this.offsetOpenPath(group, pathIn);
          break;
      }
    }
  }
  static stripDuplicates(path, isClosedPath) {
    const cnt = path.length;
    const result = [];
    if (cnt === 0)
      return result;
    let lastPt = path[0];
    result.push(lastPt);
    for (let i = 1; i < cnt; i++) {
      if (!Point64Utils.equals(lastPt, path[i])) {
        lastPt = path[i];
        result.push(lastPt);
      }
    }
    if (isClosedPath && Point64Utils.equals(lastPt, result[0])) {
      result.pop();
    }
    return result;
  }
  static area(path) {
    return InternalClipper.area(path);
  }
  static sqr(val) {
    return val * val;
  }
  static ellipse(center, radiusX, radiusY = 0, steps = 0) {
    if (radiusX <= 0)
      return [];
    if (radiusY <= 0)
      radiusY = radiusX;
    if (steps <= 2) {
      steps = Math.ceil(Math.PI * Math.sqrt((radiusX + radiusY) / 2));
    }
    const si = Math.sin(2 * Math.PI / steps);
    const co = Math.cos(2 * Math.PI / steps);
    let dx = co;
    let dy = si;
    const result = [{ x: Math.round(center.x + radiusX), y: center.y }];
    for (let i = 1; i < steps; ++i) {
      result.push({
        x: Math.round(center.x + radiusX * dx),
        y: Math.round(center.y + radiusY * dy)
      });
      const x = dx * co - dy * si;
      dy = dy * co + dx * si;
      dx = x;
    }
    return result;
  }
};
__publicField(_ClipperOffset, "Tolerance", 1e-12);
// Clipper2 approximates arcs by using series of relatively short straight
//line segments. And logically, shorter line segments will produce better arc
// approximations. But very short segments can degrade performance, usually
// with little or no discernable improvement in curve quality. Very short
// segments can even detract from curve quality, due to the effects of integer
// rounding. Since there isn't an optimal number of line segments for any given
// arc radius (that perfectly balances curve approximation with performance),
// arc tolerance is user defined. Nevertheless, when the user doesn't define
// an arc tolerance (ie leaves alone the 0 default value), the calculated
// default arc tolerance (offset_radius / 500) generally produces good (smooth)
// arc approximations without producing excessively small segment lengths.
// See also: https://www.angusj.com/clipper2/Docs/Trigonometry.htm
__publicField(_ClipperOffset, "arc_const", 2e-3);
var ClipperOffset = _ClipperOffset;

// node_modules/clipper2-ts/dist/Clipper.js
var B23 = BigInt(2);
function union(subject, clipOrFillRule, fillRule) {
  if (typeof clipOrFillRule === "number") {
    return booleanOp(ClipType.Union, subject, null, clipOrFillRule);
  } else {
    return booleanOp(ClipType.Union, subject, clipOrFillRule, fillRule);
  }
}
function booleanOp(clipType, subject, clip, fillRule) {
  const solution = [];
  if (subject === null)
    return solution;
  const c = new Clipper64();
  c.addPaths(subject, PathType.Subject);
  if (clip !== null) {
    c.addPaths(clip, PathType.Clip);
  }
  c.execute(clipType, fillRule, solution);
  return solution;
}
function booleanOpWithPolyTree(clipType, subject, clip, polytree, fillRule) {
  if (subject === null)
    return;
  const c = new Clipper64();
  c.addPaths(subject, PathType.Subject);
  if (clip !== null) {
    c.addPaths(clip, PathType.Clip);
  }
  c.execute(clipType, fillRule, polytree);
}
function inflatePaths(paths, delta, joinType, endType, miterLimit = 2, arcTolerance = 0) {
  const co = new ClipperOffset(miterLimit, arcTolerance);
  co.addPaths(paths, joinType, endType);
  const solution = [];
  co.execute(delta, solution);
  return solution;
}
function area(path) {
  return InternalClipper.area(path);
}
function isPositive(poly) {
  return area(poly) >= 0;
}
function reversePath(path) {
  return [...path].reverse();
}
function sqr(val) {
  return val * val;
}
function perpendicDistFromLineSqrd64(pt, line1, line2) {
  const a = pt.x - line1.x;
  const b = pt.y - line1.y;
  const c = line2.x - line1.x;
  const d = line2.y - line1.y;
  if (c === 0 && d === 0)
    return 0;
  if (Number.isSafeInteger(a) && Number.isSafeInteger(b) && Number.isSafeInteger(c) && Number.isSafeInteger(d)) {
    const cross2 = BigInt(a) * BigInt(d) - BigInt(c) * BigInt(b);
    const crossSq = cross2 * cross2;
    const denom = BigInt(c) * BigInt(c) + BigInt(d) * BigInt(d);
    return Number(crossSq) / Number(denom);
  }
  const cross = InternalClipper.crossProduct(line1, pt, line2);
  return sqr(cross) / (c * c + d * d);
}
function rdp(path, begin, end, epsSqrd, flags) {
  while (true) {
    let idx = 0;
    let maxD = 0;
    while (end > begin && Point64Utils.equals(path[begin], path[end]))
      flags[end--] = false;
    for (let i = begin + 1; i < end; ++i) {
      const d = perpendicDistFromLineSqrd64(path[i], path[begin], path[end]);
      if (d <= maxD)
        continue;
      maxD = d;
      idx = i;
    }
    if (maxD <= epsSqrd)
      return;
    flags[idx] = true;
    if (idx > begin + 1)
      rdp(path, begin, idx, epsSqrd, flags);
    if (idx < end - 1) {
      begin = idx;
      continue;
    }
    break;
  }
}
function ramerDouglasPeucker(path, epsilon) {
  const len = path.length;
  if (len < 5)
    return path;
  const flags = new Array(len).fill(false);
  flags[0] = true;
  flags[len - 1] = true;
  rdp(path, 0, len - 1, sqr(epsilon), flags);
  const result = [];
  for (let i = 0; i < len; ++i) {
    if (flags[i])
      result.push(path[i]);
  }
  return result;
}
function getNext(current, high, flags) {
  ++current;
  while (current <= high && flags[current])
    ++current;
  if (current <= high)
    return current;
  current = 0;
  while (flags[current])
    ++current;
  return current;
}
function getPrior(current, high, flags) {
  if (current === 0)
    current = high;
  else
    --current;
  while (current > 0 && flags[current])
    --current;
  if (!flags[current])
    return current;
  current = high;
  while (flags[current])
    --current;
  return current;
}
function simplifyPath(path, epsilon, isClosedPath = true) {
  const len = path.length;
  const high = len - 1;
  const epsSqr = sqr(epsilon);
  if (len < 4)
    return path;
  const flags = new Array(len).fill(false);
  const dsq = new Array(len).fill(0);
  let curr = 0;
  if (isClosedPath) {
    dsq[0] = perpendicDistFromLineSqrd64(path[0], path[high], path[1]);
    dsq[high] = perpendicDistFromLineSqrd64(path[high], path[0], path[high - 1]);
  } else {
    dsq[0] = Number.MAX_VALUE;
    dsq[high] = Number.MAX_VALUE;
  }
  for (let i = 1; i < high; ++i) {
    dsq[i] = perpendicDistFromLineSqrd64(path[i], path[i - 1], path[i + 1]);
  }
  while (true) {
    if (dsq[curr] > epsSqr) {
      const start = curr;
      do {
        curr = getNext(curr, high, flags);
      } while (curr !== start && dsq[curr] > epsSqr);
      if (curr === start)
        break;
    }
    const prev = getPrior(curr, high, flags);
    const next = getNext(curr, high, flags);
    if (next === prev)
      break;
    let prior2;
    if (dsq[next] < dsq[curr]) {
      prior2 = prev;
      const newPrev = curr;
      curr = next;
      const newNext = getNext(next, high, flags);
      flags[curr] = true;
      curr = newNext;
      const nextNext = getNext(newNext, high, flags);
      if (isClosedPath || curr !== high && curr !== 0) {
        dsq[curr] = perpendicDistFromLineSqrd64(path[curr], path[newPrev], path[nextNext]);
      }
      if (isClosedPath || newPrev !== 0 && newPrev !== high) {
        dsq[newPrev] = perpendicDistFromLineSqrd64(path[newPrev], path[prior2], path[curr]);
      }
    } else {
      prior2 = getPrior(prev, high, flags);
      flags[curr] = true;
      curr = next;
      const nextNext = getNext(next, high, flags);
      if (isClosedPath || curr !== high && curr !== 0) {
        dsq[curr] = perpendicDistFromLineSqrd64(path[curr], path[prev], path[nextNext]);
      }
      if (isClosedPath || prev !== 0 && prev !== high) {
        dsq[prev] = perpendicDistFromLineSqrd64(path[prev], path[prior2], path[curr]);
      }
    }
  }
  const result = [];
  for (let i = 0; i < len; i++) {
    if (!flags[i])
      result.push(path[i]);
  }
  return result;
}
function simplifyPaths(paths, epsilon, isClosedPaths = true) {
  const result = [];
  for (const path of paths) {
    result.push(simplifyPath(path, epsilon, isClosedPaths));
  }
  return result;
}

// src/geometry.ts
var MIN_WIDTH_RATIO = 2e-5;
var MAX_WIDTH_RATIO = 0.25;
function strokeWidthPx(stroke, pageWidth) {
  return clamp(stroke.width, MIN_WIDTH_RATIO, MAX_WIDTH_RATIO) * pageWidth;
}
function pointX(points, index, pageWidth) {
  return points[index * 3] * pageWidth;
}
function pointY(points, index, pageHeight) {
  return points[index * 3 + 1] * pageHeight;
}
function pointPressure(points, index) {
  const value = points[index * 3 + 2];
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0.5;
}
function pressureWidthFactor(pressure) {
  return 0.45 + 1.1 * pressure;
}
function hasPressureVariation(stroke) {
  if (stroke.kind !== "pen" && stroke.kind !== "eraser") return false;
  const points = stroke.points;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 2; i < points.length; i += 3) {
    const value = points[i];
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return Number.isFinite(min) && max - min > 0.03;
}
function traceSmoothPath(ctx, points, count, pageWidth, pageHeight) {
  ctx.moveTo(pointX(points, 0, pageWidth), pointY(points, 0, pageHeight));
  if (count === 1) return;
  if (count === 2) {
    ctx.lineTo(pointX(points, 1, pageWidth), pointY(points, 1, pageHeight));
    return;
  }
  for (let i = 1; i < count - 1; i++) {
    const cx = pointX(points, i, pageWidth);
    const cy = pointY(points, i, pageHeight);
    const nx = pointX(points, i + 1, pageWidth);
    const ny = pointY(points, i + 1, pageHeight);
    ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
  }
  ctx.lineTo(
    pointX(points, count - 1, pageWidth),
    pointY(points, count - 1, pageHeight)
  );
}
function renderFreehand(ctx, stroke, pageWidth, pageHeight, baseWidth) {
  const points = stroke.points;
  const count = Math.floor(points.length / 3);
  const variable = hasPressureVariation(stroke);
  if (!variable) {
    if (count === 1) {
      ctx.beginPath();
      ctx.arc(
        pointX(points, 0, pageWidth),
        pointY(points, 0, pageHeight),
        Math.max(0.6, baseWidth / 2),
        0,
        Math.PI * 2
      );
      ctx.fill();
      return;
    }
    ctx.beginPath();
    traceSmoothPath(ctx, points, count, pageWidth, pageHeight);
    ctx.lineWidth = Math.max(0.5, baseWidth);
    ctx.stroke();
    return;
  }
  if (count === 1) {
    const width = baseWidth * pressureWidthFactor(pointPressure(points, 0));
    ctx.beginPath();
    ctx.arc(
      pointX(points, 0, pageWidth),
      pointY(points, 0, pageHeight),
      Math.max(0.6, width / 2),
      0,
      Math.PI * 2
    );
    ctx.fill();
    return;
  }
  for (let i = 0; i < count - 1; i++) {
    const width = baseWidth * pressureWidthFactor((pointPressure(points, i) + pointPressure(points, i + 1)) / 2);
    ctx.beginPath();
    ctx.moveTo(pointX(points, i, pageWidth), pointY(points, i, pageHeight));
    ctx.lineTo(
      pointX(points, i + 1, pageWidth),
      pointY(points, i + 1, pageHeight)
    );
    ctx.lineWidth = Math.max(0.4, width);
    ctx.stroke();
  }
}
function renderEraser(ctx, stroke, pageWidth, pageHeight, baseWidth) {
  const points = stroke.points;
  const count = Math.floor(points.length / 3);
  if (count < 1) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(0,0,0,1)";
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (count === 1) {
    ctx.beginPath();
    ctx.arc(
      pointX(points, 0, pageWidth),
      pointY(points, 0, pageHeight),
      Math.max(1, baseWidth / 2),
      0,
      Math.PI * 2
    );
    ctx.fill();
  } else {
    if (hasPressureVariation(stroke)) {
      for (let i = 0; i < count - 1; i++) {
        const pressure = (pointPressure(points, i) + pointPressure(points, i + 1)) / 2;
        ctx.beginPath();
        ctx.moveTo(pointX(points, i, pageWidth), pointY(points, i, pageHeight));
        ctx.lineTo(
          pointX(points, i + 1, pageWidth),
          pointY(points, i + 1, pageHeight)
        );
        ctx.lineWidth = Math.max(1, baseWidth * pressureWidthFactor(pressure));
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    ctx.beginPath();
    traceSmoothPath(ctx, points, count, pageWidth, pageHeight);
    ctx.lineWidth = Math.max(1, baseWidth);
    ctx.stroke();
  }
  ctx.restore();
}
function renderRectEraser(ctx, stroke, pageWidth, pageHeight) {
  const points = stroke.points;
  if (points.length < 6) return;
  const x0 = pointX(points, 0, pageWidth);
  const y0 = pointY(points, 0, pageHeight);
  const x1 = pointX(points, 1, pageWidth);
  const y1 = pointY(points, 1, pageHeight);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.fillRect(
    Math.min(x0, x1),
    Math.min(y0, y1),
    Math.abs(x1 - x0),
    Math.abs(y1 - y0)
  );
  ctx.restore();
}
function renderLassoEraser(ctx, stroke, pageWidth, pageHeight) {
  const points = stroke.points;
  const count = Math.floor(points.length / 3);
  if (count < 3) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(points[0] * pageWidth, points[1] * pageHeight);
  for (let i = 1; i < count; i++) {
    ctx.lineTo(points[i * 3] * pageWidth, points[i * 3 + 1] * pageHeight);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function renderShape(ctx, stroke, kind, pageWidth, pageHeight, baseWidth) {
  const points = stroke.points;
  if (points.length < 6) return;
  const x0 = pointX(points, 0, pageWidth);
  const y0 = pointY(points, 0, pageHeight);
  const x1 = pointX(points, 1, pageWidth);
  const y1 = pointY(points, 1, pageHeight);
  const lineWidth = Math.max(0.5, baseWidth);
  const dx = x1 - x0;
  const dy = y1 - y0;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = ctx.globalAlpha * clamp(stroke.opacity, 0, 1);
  if (kind === "line" || kind === "arrow") {
    const length = Math.hypot(dx, dy);
    if (length < 0.5) {
      ctx.restore();
      return;
    }
    if (kind === "line") {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    } else {
      const head = Math.min(
        Math.max(lineWidth * 6, 10),
        length * 0.5
      );
      const ux = dx / length;
      const uy = dy / length;
      const bx = x1 - ux * head;
      const by = y1 - uy * head;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const px = -uy;
      const py = ux;
      const half = Math.max(head * 0.55, lineWidth * 1.5);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(bx + px * half, by + py * half);
      ctx.lineTo(bx - px * half, by - py * half);
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === "rect") {
    ctx.beginPath();
    ctx.rect(x0, y0, dx, dy);
    ctx.stroke();
  } else if (kind === "ellipse") {
    const rx = Math.abs(dx) / 2;
    const ry = Math.abs(dy) / 2;
    if (rx < 0.5 || ry < 0.5) {
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.ellipse(x0 + dx / 2, y0 + dy / 2, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (kind === "polygon") {
    const count = Math.floor(points.length / 3);
    if (count < 3) {
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < count; i++) {
      ctx.lineTo(pointX(points, i, pageWidth), pointY(points, i, pageHeight));
    }
    ctx.closePath();
    if (stroke.fill) ctx.fill();
    else ctx.stroke();
  }
  ctx.restore();
}
function renderRings(ctx, stroke, pageWidth, pageHeight) {
  const rings = stroke.rings;
  if (!rings || rings.length === 0) return;
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * clamp(stroke.opacity, 0, 1);
  ctx.fillStyle = stroke.color;
  ctx.beginPath();
  for (const ring of rings) {
    if (ring.length < 6) continue;
    ctx.moveTo(ring[0] * pageWidth, ring[1] * pageHeight);
    for (let i = 2; i + 1 < ring.length; i += 2) {
      ctx.lineTo(ring[i] * pageWidth, ring[i + 1] * pageHeight);
    }
    ctx.closePath();
  }
  ctx.fill("evenodd");
  ctx.restore();
}
function renderStroke(ctx, stroke, pageWidth, pageHeight) {
  if (pageWidth <= 0 || pageHeight <= 0) return;
  if (stroke.rings && stroke.rings.length > 0) {
    renderRings(ctx, stroke, pageWidth, pageHeight);
    return;
  }
  const count = Math.floor(stroke.points.length / 3);
  if (count < 1) return;
  const baseWidth = strokeWidthPx(stroke, pageWidth);
  if (baseWidth < 0.3) return;
  if (stroke.kind === "eraser") {
    renderEraser(ctx, stroke, pageWidth, pageHeight, baseWidth);
    return;
  }
  if (stroke.kind === "eraser-rect") {
    renderRectEraser(ctx, stroke, pageWidth, pageHeight);
    return;
  }
  if (stroke.kind === "eraser-lasso") {
    renderLassoEraser(ctx, stroke, pageWidth, pageHeight);
    return;
  }
  if (isShapeKind(stroke.kind)) {
    renderShape(ctx, stroke, stroke.kind, pageWidth, pageHeight, baseWidth);
    return;
  }
  ctx.save();
  ctx.globalAlpha = ctx.globalAlpha * clamp(stroke.opacity, 0, 1);
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  renderFreehand(ctx, stroke, pageWidth, pageHeight, baseWidth);
  ctx.restore();
}

// src/paths.ts
function flattenStroke(stroke, pageWidth, pageHeight) {
  const points = stroke.points;
  const count = Math.floor(points.length / 3);
  const raw = [];
  for (let i = 0; i < count; i++) {
    raw.push({
      x: points[i * 3] * pageWidth,
      y: points[i * 3 + 1] * pageHeight,
      p: Number.isFinite(points[i * 3 + 2]) ? points[i * 3 + 2] : 0.5
    });
  }
  if (raw.length === 0) return [];
  if (raw.length === 1) return [{ points: raw, fill: false }];
  const kind = stroke.kind;
  if (kind === "rect") {
    const [a, b] = raw;
    return [
      {
        points: [
          { x: a.x, y: a.y, p: 0.5 },
          { x: b.x, y: a.y, p: 0.5 },
          { x: b.x, y: b.y, p: 0.5 },
          { x: a.x, y: b.y, p: 0.5 },
          { x: a.x, y: a.y, p: 0.5 }
        ],
        fill: false
      }
    ];
  }
  if (kind === "ellipse") {
    const [a, b] = raw;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const rx = Math.abs(b.x - a.x) / 2;
    const ry = Math.abs(b.y - a.y) / 2;
    const out = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const angle = i / steps * Math.PI * 2;
      out.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry, p: 0.5 });
    }
    return [{ points: out, fill: false }];
  }
  if (kind === "polygon") {
    return [{ points: [...raw, { ...raw[0] }], fill: stroke.fill === true }];
  }
  if (kind === "arrow") {
    const [a, b] = raw;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) return [{ points: [a, b], fill: false }];
    const lineWidth = Math.max(0.5, stroke.width * pageWidth);
    const head = Math.min(Math.max(lineWidth * 6, 10), length * 0.5);
    const ux = dx / length;
    const uy = dy / length;
    const bx = b.x - ux * head;
    const by = b.y - uy * head;
    const half = Math.max(head * 0.55, lineWidth * 1.5);
    const px = -uy;
    const py = ux;
    return [
      {
        points: [
          { x: a.x, y: a.y, p: 0.5 },
          { x: bx, y: by, p: 0.5 }
        ],
        fill: false
      },
      {
        points: [
          { x: b.x, y: b.y, p: 0.5 },
          { x: bx + px * half, y: by + py * half, p: 0.5 },
          { x: bx - px * half, y: by - py * half, p: 0.5 },
          { x: b.x, y: b.y, p: 0.5 }
        ],
        fill: true
      }
    ];
  }
  return [{ points: raw, fill: false }];
}
function regionHitsPath(points, inside, step = 2) {
  if (points.length === 0) return false;
  if (points.length === 1) return inside(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / step));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (inside(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return true;
    }
  }
  return false;
}

// src/outline.ts
var OUTLINE_SCALE = 100;
var ARC_TOLERANCE_PX = 0.4;
var SIMPLIFY_PX = 0.25;
function pxToPath64(points) {
  return points.map(([x, y]) => ({
    x: Math.round(x * OUTLINE_SCALE),
    y: Math.round(y * OUTLINE_SCALE)
  }));
}
function ringToPath64(ring, pageW, pageH) {
  const out = [];
  for (let i = 0; i + 1 < ring.length; i += 2) {
    out.push({
      x: Math.round(ring[i] * pageW * OUTLINE_SCALE),
      y: Math.round(ring[i + 1] * pageH * OUTLINE_SCALE)
    });
  }
  return out;
}
function strokeToPaths(stroke, pageW, pageH) {
  if (stroke.rings && stroke.rings.length > 0) {
    return stroke.rings.map((ring) => ringToPath64(ring, pageW, pageH)).filter((path) => path.length >= 3);
  }
  const radius = Math.max(0.4, stroke.width * pageW / 2) * OUTLINE_SCALE;
  const shape = isShapeKind(stroke.kind);
  if (shape) {
    const parts = flattenStroke(stroke, pageW, pageH);
    if (parts.length === 0) return [];
    let accumulated = [];
    for (const part of parts) {
      const path = pxToPath64(
        part.points.map((point) => [point.x, point.y])
      );
      if (path.length === 0) continue;
      const outline = part.fill ? [path] : path.length === 1 ? [circlePath(path[0].x, path[0].y, radius)] : inflatePaths(
        [path],
        radius,
        JoinType.Round,
        EndType.Round,
        2,
        ARC_TOLERANCE_PX * OUTLINE_SCALE
      );
      accumulated = accumulated.length === 0 ? outline : union(
        accumulated,
        outline.map((item) => sameWinding(accumulated[0], item)),
        FillRule.NonZero
      );
    }
    return accumulated;
  }
  return freehandOutline(stroke, pageW, pageH);
}
function freehandOutline(stroke, pageW, pageH) {
  const points = stroke.points;
  const count = Math.floor(points.length / 3);
  if (count === 0) return [];
  const baseWidth = Math.max(1, stroke.width * pageW) * OUTLINE_SCALE;
  const variable = stroke.kind === "pen";
  const px = [];
  for (let i = 0; i < count; i++) {
    const pressure = points[i * 3 + 2];
    const factor = variable && Number.isFinite(pressure) ? pressureWidthFactor(pressure) : 1;
    px.push({
      x: Math.round(points[i * 3] * pageW * OUTLINE_SCALE),
      y: Math.round(points[i * 3 + 1] * pageH * OUTLINE_SCALE),
      w: baseWidth * factor
    });
  }
  return ribbonPaths(px);
}
function ribbonPaths(px) {
  if (px.length === 0) return [];
  if (px.length === 1) return [circlePath(px[0].x, px[0].y, Math.max(1, px[0].w / 2))];
  const left = [];
  const right = [];
  let lastNormal = { x: 0, y: -1 };
  for (let i = 0; i < px.length; i++) {
    const prev = px[Math.max(0, i - 1)];
    const next = px[Math.min(px.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const length = Math.hypot(tx, ty);
    if (length < 1e-6) {
      tx = lastNormal.x;
      ty = lastNormal.y;
    } else {
      tx /= length;
      ty /= length;
      lastNormal = { x: tx, y: ty };
    }
    const nx = -ty;
    const ny = tx;
    const half = Math.max(1, px[i].w / 2);
    left.push({ x: Math.round(px[i].x + nx * half), y: Math.round(px[i].y + ny * half) });
    right.push({ x: Math.round(px[i].x - nx * half), y: Math.round(px[i].y - ny * half) });
  }
  const ribbon = [...left, ...right.reverse()];
  const cleaned = simplifyPaths([ribbon], FillRule.NonZero);
  const round2 = [
    circlePath(px[0].x, px[0].y, Math.max(1, px[0].w / 2)),
    circlePath(px[px.length - 1].x, px[px.length - 1].y, Math.max(1, px[px.length - 1].w / 2))
  ];
  for (let i = 1; i < px.length - 1; i++) {
    const a = px[i - 1];
    const b = px[i];
    const c = px[i + 1];
    const v1 = Math.atan2(b.y - a.y, b.x - a.x);
    const v2 = Math.atan2(c.y - b.y, c.x - b.x);
    let turn = Math.abs(v2 - v1);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    if (turn > 0.44) round2.push(circlePath(b.x, b.y, Math.max(1, b.w / 2)));
  }
  const base = cleaned.length > 0 ? cleaned : [ribbon];
  return union(
    base,
    round2.map((path) => sameWinding(base[0], path)),
    FillRule.NonZero
  );
}
function eraserToPaths(geometry, pageW, pageH) {
  if (geometry.kind === "rect") {
    const path = pxToPath64([
      [geometry.x0, geometry.y0],
      [geometry.x1, geometry.y0],
      [geometry.x1, geometry.y1],
      [geometry.x0, geometry.y1]
    ]);
    return path.length >= 3 ? [path] : [];
  }
  if (geometry.kind === "polygon") {
    const path = pxToPath64(geometry.points);
    return path.length >= 3 ? [path] : [];
  }
  const trail = pxToPath64(geometry.points);
  if (trail.length === 0) return [];
  const radius = Math.max(0.4, geometry.radius) * OUTLINE_SCALE;
  if (trail.length === 1) return [circlePath(trail[0].x, trail[0].y, radius)];
  if (geometry.radii && geometry.radii.length === trail.length) {
    const px = trail.map((point, index) => ({
      x: point.x,
      y: point.y,
      w: Math.max(2, geometry.radii[index] * 2 * OUTLINE_SCALE)
    }));
    return ribbonPaths(px);
  }
  return inflatePaths(
    [trail],
    radius,
    JoinType.Round,
    EndType.Round,
    2,
    ARC_TOLERANCE_PX * OUTLINE_SCALE
  );
}
function sameWinding(reference, path) {
  if (path.length < 3 || reference.length < 3) return path;
  return isPositive(path) === isPositive(reference) ? path : reversePath(path);
}
function circlePath(cx, cy, radius) {
  const steps = Math.max(
    12,
    Math.min(96, Math.ceil(Math.PI * 2 * radius / (ARC_TOLERANCE_PX * OUTLINE_SCALE)))
  );
  const out = [];
  for (let i = 0; i < steps; i++) {
    const angle = i / steps * Math.PI * 2;
    out.push({
      x: Math.round(cx + Math.cos(angle) * radius),
      y: Math.round(cy + Math.sin(angle) * radius)
    });
  }
  return out;
}
function polygonArea(path) {
  let area2 = 0;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area2 / 2) / (OUTLINE_SCALE * OUTLINE_SCALE);
}
function toNormalizedRing(path, pageW, pageH) {
  const ring = [];
  for (const point of path) {
    ring.push(
      Number((point.x / OUTLINE_SCALE / pageW).toFixed(4)),
      Number((point.y / OUTLINE_SCALE / pageH).toFixed(4))
    );
  }
  return ring;
}
function subtractEraser(stroke, eraser, pageW, pageH) {
  const subject = strokeToPaths(stroke, pageW, pageH);
  if (subject.length === 0) return null;
  const clip = eraserToPaths(eraser, pageW, pageH);
  if (clip.length === 0) return null;
  const tree = new PolyTree64();
  booleanOpWithPolyTree(ClipType.Difference, subject, clip, tree, FillRule.EvenOdd);
  const pieces = [];
  const walk = (nodeCount, nodeAt) => {
    for (let i = 0; i < nodeCount; i++) {
      const node = nodeAt(i);
      const polygon = node.polygon;
      if (polygon && polygon.length >= 3 && polygonArea(polygon) >= 0.75) {
        const simplified = ramerDouglasPeucker(polygon, SIMPLIFY_PX * OUTLINE_SCALE);
        const rings = [
          toNormalizedRing(simplified.length >= 3 ? simplified : polygon, pageW, pageH)
        ];
        const holes = node.count;
        for (let h = 0; h < holes; h++) {
          const hole = node.child(h);
          const holePoly = hole.polygon;
          if (holePoly && holePoly.length >= 3) {
            const simpleHole = ramerDouglasPeucker(
              holePoly,
              SIMPLIFY_PX * OUTLINE_SCALE
            );
            rings.push(
              toNormalizedRing(
                simpleHole.length >= 3 ? simpleHole : holePoly,
                pageW,
                pageH
              )
            );
          }
        }
        pieces.push({ rings });
      }
    }
  };
  walk(tree.count, (index) => tree.child(index));
  if (pieces.length === 0) return [];
  if (subject.length === 1 && pieces.length === 1 && pieces[0].rings.length === 1) {
    const before = Math.round(polygonArea(subject[0]) * 100) / 100;
    const after = Math.round(polygonArea(strokeToPathsFromRings(pieces[0].rings, pageW, pageH)) * 100) / 100;
    if (before === after) return null;
  }
  return pieces;
}
function strokeToPathsFromRings(rings, pageW, pageH) {
  return ringToPath64(rings[0], pageW, pageH);
}

// src/erase.ts
function rectRegion(x0, y0, x1, y1) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  return (x, y) => x >= left && x <= right && y >= top && y <= bottom;
}
function polygonRegion(points) {
  if (points.length < 3) return () => false;
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };
}
function isEraserKind(kind) {
  return kind === "eraser" || kind === "eraser-rect" || kind === "eraser-lasso";
}
function eraserRegionTest(geometry) {
  if (geometry.kind === "rect") return rectRegion(geometry.x0, geometry.y0, geometry.x1, geometry.y1);
  if (geometry.kind === "polygon") return polygonRegion(geometry.points);
  return (x, y) => {
    const r2 = geometry.radius * geometry.radius;
    for (let i = 0; i < geometry.points.length; i++) {
      const a = geometry.points[i];
      const b = geometry.points[i + 1] ?? geometry.points[i];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const lengthSq = dx * dx + dy * dy;
      let t = lengthSq < 1e-9 ? 0 : ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));
      const px = a[0] + t * dx;
      const py = a[1] + t * dy;
      if ((x - px) ** 2 + (y - py) ** 2 <= r2) return true;
    }
    return false;
  };
}
function eraserBoundsPx(geometry) {
  if (geometry.kind === "rect") {
    return {
      minX: Math.min(geometry.x0, geometry.x1),
      maxX: Math.max(geometry.x0, geometry.x1),
      minY: Math.min(geometry.y0, geometry.y1),
      maxY: Math.max(geometry.y0, geometry.y1)
    };
  }
  const pad = geometry.kind === "swath" ? geometry.radius : 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of geometry.points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}
function strokeBoundsPx(stroke, pageW, pageH) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const visit = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  if (stroke.rings && stroke.rings.length > 0) {
    for (const ring of stroke.rings) {
      for (let i = 0; i + 1 < ring.length; i += 2) visit(ring[i] * pageW, ring[i + 1] * pageH);
    }
  } else {
    for (let i = 0; i + 1 < stroke.points.length; i += 3) {
      visit(stroke.points[i] * pageW, stroke.points[i + 1] * pageH);
    }
  }
  const pad = stroke.width * pageW / 2;
  return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}
function boxesOverlap(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}
function eraseInk(strokes, page, eraser, scope, pageW, pageH, nextId) {
  const bounds2 = eraserBoundsPx(eraser);
  const region = eraserRegionTest(eraser);
  let changed = 0;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    if (stroke.page !== page) continue;
    if (isEraserKind(stroke.kind)) continue;
    if (!boxesOverlap(strokeBoundsPx(stroke, pageW, pageH), bounds2)) continue;
    if (scope === "whole") {
      const paths = flattenStroke(stroke, pageW, pageH);
      if (!paths.some((path) => regionHitsPath(path.points, region))) continue;
      strokes.splice(i, 1);
      changed++;
      continue;
    }
    const pieces = subtractEraser(stroke, eraser, pageW, pageH);
    if (pieces === null) continue;
    if (pieces.length === 0) {
      strokes.splice(i, 1);
      changed++;
      continue;
    }
    const replacement = pieces.map((piece) => ({
      id: nextId(),
      kind: stroke.kind === "highlighter" ? "highlighter" : "pen",
      page: stroke.page,
      color: stroke.color,
      width: stroke.width,
      opacity: stroke.opacity,
      points: [],
      rings: piece.rings,
      fill: true
    }));
    strokes.splice(i, 1, ...replacement);
    changed++;
  }
  return changed;
}

// src/hittest.ts
var DEFAULT_TOLERANCE = 6;
function strokeHitTest(stroke, x, y, pageWidth, pageHeight, options = {}) {
  if (stroke.kind === "eraser" || stroke.kind === "eraser-rect" || stroke.kind === "eraser-lasso") {
    return false;
  }
  if (stroke.rings && stroke.rings.length > 0) {
    return ringsHit(stroke.rings, x, y, options.tolerancePx ?? DEFAULT_TOLERANCE, pageWidth);
  }
  const count = Math.floor(stroke.points.length / 3);
  if (count < 1) return false;
  const px = x * pageWidth;
  const py = y * pageHeight;
  const halfWidth = stroke.width * pageWidth / 2;
  const slack = Math.max(halfWidth, 0) + (options.tolerancePx ?? DEFAULT_TOLERANCE);
  if (count === 1) {
    return Math.hypot(stroke.points[0] * pageWidth - px, stroke.points[1] * pageHeight - py) <= slack;
  }
  const kind = stroke.kind;
  if (kind === "rect") {
    return hitAxisBox(stroke, px, py, pageWidth, pageHeight, slack);
  }
  if (kind === "ellipse") {
    const x0 = stroke.points[0] * pageWidth;
    const y0 = stroke.points[1] * pageHeight;
    const x1 = stroke.points[3] * pageWidth;
    const y1 = stroke.points[4] * pageHeight;
    const rx = Math.abs(x1 - x0) / 2;
    const ry = Math.abs(y1 - y0) / 2;
    if (rx < 0.5 || ry < 0.5) return false;
    const cx = x0 + (x1 - x0) / 2;
    const cy = y0 + (y1 - y0) / 2;
    const value = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
    const radial = Math.sqrt(value);
    return Math.abs(radial - 1) * ((rx + ry) / 2) <= slack;
  }
  const closed = kind === "polygon";
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count - 1; i++) {
    best = Math.min(
      best,
      segmentDistance(
        px,
        py,
        stroke.points[i * 3] * pageWidth,
        stroke.points[i * 3 + 1] * pageHeight,
        stroke.points[(i + 1) * 3] * pageWidth,
        stroke.points[(i + 1) * 3 + 1] * pageHeight
      )
    );
  }
  if (closed && count > 2) {
    best = Math.min(
      best,
      segmentDistance(
        px,
        py,
        stroke.points[(count - 1) * 3] * pageWidth,
        stroke.points[(count - 1) * 3 + 1] * pageHeight,
        stroke.points[0] * pageWidth,
        stroke.points[1] * pageHeight
      )
    );
  }
  return best <= slack;
}
function hitAxisBox(stroke, px, py, pageWidth, pageHeight, slack) {
  const x0 = stroke.points[0] * pageWidth;
  const y0 = stroke.points[1] * pageHeight;
  const x1 = stroke.points[3] * pageWidth;
  const y1 = stroke.points[4] * pageHeight;
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const nearLeft = Math.abs(px - left) <= slack && py >= top - slack && py <= bottom + slack;
  const nearRight = Math.abs(px - right) <= slack && py >= top - slack && py <= bottom + slack;
  const nearTop = Math.abs(py - top) <= slack && px >= left - slack && px <= right + slack;
  const nearBottom = Math.abs(py - bottom) <= slack && px >= left - slack && px <= right + slack;
  return nearLeft || nearRight || nearTop || nearBottom;
}
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-9) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function ringsHit(rings, x, y, tolerancePx, pageWidth) {
  let inside = false;
  let nearEdge = false;
  const slack = tolerancePx / Math.max(1, pageWidth);
  for (const ring of rings) {
    for (let i = 0; i + 1 < ring.length; i += 2) {
      const x1 = ring[i];
      const y1 = ring[i + 1];
      const x2 = ring[(i + 2) % ring.length];
      const y2 = ring[(i + 3) % ring.length];
      if (x1 > x !== x2 > x && y < (y2 - y1) * (x - x1) / (x2 - x1 || 1e-9) + y1) {
        inside = !inside;
      }
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lengthSq = dx * dx + dy * dy;
      let t = lengthSq > 1e-12 ? ((x - x1) * dx + (y - y1) * dy) / lengthSq : 0;
      t = Math.max(0, Math.min(1, t));
      const px = x1 + t * dx;
      const py = y1 + t * dy;
      if ((x - px) ** 2 + (y - py) ** 2 <= slack * slack) nearEdge = true;
    }
  }
  return inside || nearEdge;
}

// src/perf.ts
var MAX_SAMPLES = 600;
var PerfProbe = class {
  constructor() {
    this.enabled = true;
    this.samples = /* @__PURE__ */ new Map();
    this.counters = /* @__PURE__ */ new Map();
    this.timeline = [];
    this.origin = 0;
  }
  now() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }
  /**
   * Marks a point on the timeline (used to correlate long tasks).
   * `at` accepts a `performance.now()` timestamp (e.g. `entry.startTime`),
   * which places the event where it really happened instead of where it was
   * delivered — the longtask observer delivers entries in batches.
   */
  mark(name, dur, at) {
    if (!this.enabled) return;
    const time = at ?? this.now();
    if (this.origin === 0) this.origin = time;
    this.timeline.push({ t: Math.round(time - this.origin), name, dur });
    if (this.timeline.length > 240) this.timeline.splice(0, this.timeline.length - 240);
  }
  /** Record one millisecond sample. */
  add(name, ms) {
    if (!this.enabled || !Number.isFinite(ms)) return;
    let list = this.samples.get(name);
    if (!list) {
      list = [];
      this.samples.set(name, list);
    }
    list.push(ms);
    if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES);
  }
  /** Record an integer counter (points drawn, bytes written, ...). */
  count(name, delta = 1) {
    if (!this.enabled || !Number.isFinite(delta)) return;
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }
  /**
   * Start a timer. Calling the returned function records the elapsed time
   * and returns it, which keeps call sites a one-liner.
   */
  start(name) {
    if (!this.enabled) return () => 0;
    const t0 = this.now();
    return () => {
      const elapsed = this.now() - t0;
      this.add(name, elapsed);
      return elapsed;
    };
  }
  /** Time a synchronous block. */
  time(name, fn) {
    if (!this.enabled) return fn();
    const done = this.start(name);
    try {
      return fn();
    } finally {
      done();
    }
  }
  snapshot() {
    const stats = {};
    for (const [name, list] of this.samples) {
      if (list.length === 0) continue;
      const sorted = [...list].sort((a, b) => a - b);
      let total = 0;
      for (const value of list) total += value;
      stats[name] = {
        count: list.length,
        last: round(list[list.length - 1]),
        avg: round(total / list.length),
        p50: round(percentile(sorted, 0.5)),
        p95: round(percentile(sorted, 0.95)),
        max: round(sorted[sorted.length - 1]),
        total: round(total)
      };
    }
    return {
      enabled: this.enabled,
      stats,
      counters: Object.fromEntries(this.counters),
      timeline: [...this.timeline]
    };
  }
  /** Human readable one-line-per-metric summary for a Notice. */
  summary(limit = 8) {
    const snapshot = this.snapshot();
    const rows = Object.entries(snapshot.stats).sort((a, b) => b[1].count - a[1].count).slice(0, limit).map(([name, stat]) => {
      const total = name === "longtask" ? ` total=${(stat.total / 1e3).toFixed(1)}s` : "";
      return `${name}: n=${stat.count} avg=${stat.avg}ms p95=${stat.p95}ms max=${stat.max}ms${total}`;
    });
    const counters = Object.entries(snapshot.counters).map(
      ([name, value]) => `${name}=${Math.round(value)}`
    );
    return [...rows, ...counters.length > 0 ? [counters.join(" ")] : []];
  }
  reset() {
    this.samples.clear();
    this.counters.clear();
    this.timeline.length = 0;
    this.origin = 0;
  }
};
function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return sorted[index];
}
function round(value) {
  return Math.round(value * 100) / 100;
}
var perf = new PerfProbe();

// src/overlay.ts
var canvasPixelBudget = 24e5;
function setCanvasPixelBudget(pixels) {
  canvasPixelBudget = clamp(pixels, 1e6, 16e6);
}
var lowLatencyLive = false;
function setLowLatencyLive(value) {
  lowLatencyLive = value;
}
var PageOverlay = class {
  constructor(pageEl, pageNumber) {
    this.cssWidth = 0;
    this.cssHeight = 0;
    this.dpr = 1;
    this.doc = null;
    this.destroyed = false;
    this.liveStrokeId = null;
    this.liveDrawn = 0;
    /** css-px box the live canvas is known to have painted (null = whole). */
    this.liveDirty = null;
    this.pageEl = pageEl;
    this.pageNumber = pageNumber;
    const owner = pageEl.ownerDocument;
    this.committed = owner.createElement("canvas");
    this.committed.className = "pdf-ink-canvas pdf-ink-canvas-committed";
    this.committed.setAttribute("aria-hidden", "true");
    this.live = owner.createElement("canvas");
    this.live.className = "pdf-ink-canvas pdf-ink-canvas-live";
    this.live.setAttribute("aria-hidden", "true");
    this.layerCanvas = owner.createElement("canvas");
    pageEl.appendChild(this.committed);
    pageEl.appendChild(this.live);
    this.ctxCommitted = this.committed.getContext("2d");
    this.ctxLive = lowLatencyLive ? this.live.getContext("2d", {
      desynchronized: true
    }) : this.live.getContext("2d");
    this.ctxLayer = this.layerCanvas.getContext("2d");
    this.measure();
  }
  get widthPx() {
    return this.cssWidth;
  }
  get heightPx() {
    return this.cssHeight;
  }
  setDoc(doc) {
    this.doc = doc;
  }
  /** Sync the backing store with the current on-screen size. */
  measure() {
    if (this.destroyed) return false;
    const rect = this.pageEl.getBoundingClientRect();
    const width = Math.max(1, Math.round(this.pageEl.clientWidth || rect.width));
    const height = Math.max(1, Math.round(this.pageEl.clientHeight || rect.height));
    const view = this.pageEl.ownerDocument.defaultView;
    const rawDpr = clamp(view?.devicePixelRatio ?? 1, 1, 2);
    const budget = canvasPixelBudget / Math.max(1, width * height);
    const dpr = clamp(Math.min(rawDpr, Math.sqrt(budget)), 1, 2);
    if (width === this.cssWidth && height === this.cssHeight && dpr === this.dpr) {
      return false;
    }
    this.cssWidth = width;
    this.cssHeight = height;
    this.dpr = dpr;
    this.liveStrokeId = null;
    this.liveDrawn = 0;
    this.liveDirty = null;
    for (const canvas of [this.committed, this.live, this.layerCanvas]) {
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    }
    this.committed.style.width = `${width}px`;
    this.committed.style.height = `${height}px`;
    this.live.style.width = `${width}px`;
    this.live.style.height = `${height}px`;
    this.ctxCommitted?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctxLive?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctxLayer?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }
  /**
   * pdf.js resets a page by removing every child node of `.page`, which also
   * detaches our canvases. Re-append them and report whether that happened.
   */
  ensureAttached() {
    if (this.destroyed) return false;
    let changed = false;
    if (this.committed.parentElement !== this.pageEl) {
      this.pageEl.appendChild(this.committed);
      changed = true;
    }
    if (this.live.parentElement !== this.pageEl) {
      this.pageEl.appendChild(this.live);
      changed = true;
    }
    return changed;
  }
  /**
   * Recomposite all visible layers. When `preview` is given, the in-progress
   * eraser stroke is appended to its layer (used for live erasing).
   */
  render(preview) {
    if (this.destroyed) return;
    if (!perf.enabled) {
      this.renderInner(preview);
      return;
    }
    const done = perf.start("page.render");
    try {
      this.renderInner(preview);
    } finally {
      done();
    }
  }
  renderInner(preview) {
    const ctx = this.ctxCommitted;
    const layerCtx = this.ctxLayer;
    if (!ctx || !layerCtx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    const doc = this.doc;
    if (!doc) return;
    for (const layer of doc.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      layerCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      layerCtx.globalAlpha = 1;
      layerCtx.globalCompositeOperation = "source-over";
      layerCtx.clearRect(0, 0, this.cssWidth, this.cssHeight);
      for (const stroke of layer.strokes) {
        if (stroke.page !== this.pageNumber) continue;
        renderStroke(layerCtx, stroke, this.cssWidth, this.cssHeight);
      }
      if (preview && preview.layerId === layer.id && preview.stroke.page === this.pageNumber) {
        renderStroke(layerCtx, preview.stroke, this.cssWidth, this.cssHeight);
      }
      ctx.globalAlpha = clamp(layer.opacity, 0, 1);
      ctx.drawImage(this.layerCanvas, 0, 0, this.cssWidth, this.cssHeight);
    }
    ctx.globalAlpha = 1;
  }
  /**
   * Re-renders only a normalized rectangle of the page.
   *
   * Erasing one swath used to re-stroke every stroke on the page, which on a
   * page with a few hundred of them showed up as an ~95 ms long task right at
   * the end of the gesture. Only the ink that can touch the box is redrawn.
   */
  renderRegion(box) {
    if (this.destroyed) return;
    const ctx = this.ctxCommitted;
    const layerCtx = this.ctxLayer;
    if (!ctx || !layerCtx) return;
    const doc = this.doc;
    if (!doc) return;
    const padX = 8 / Math.max(1, this.cssWidth);
    const padY = 8 / Math.max(1, this.cssHeight);
    const x0 = Math.max(0, Math.min(box.x0, box.x1) - padX);
    const y0 = Math.max(0, Math.min(box.y0, box.y1) - padY);
    const x1 = Math.min(1, Math.max(box.x0, box.x1) + padX);
    const y1 = Math.min(1, Math.max(box.y0, box.y1) + padY);
    if (x1 <= x0 || y1 <= y0) return;
    const done = perf.enabled ? perf.start("page.renderRegion") : null;
    try {
      const px = x0 * this.cssWidth;
      const py = y0 * this.cssHeight;
      const pw = (x1 - x0) * this.cssWidth;
      const ph = (y1 - y0) * this.cssHeight;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(px, py, pw, ph);
      for (const layer of doc.layers) {
        if (!layer.visible || layer.opacity <= 0) continue;
        layerCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        layerCtx.globalAlpha = 1;
        layerCtx.globalCompositeOperation = "source-over";
        layerCtx.clearRect(px, py, pw, ph);
        layerCtx.save();
        layerCtx.beginPath();
        layerCtx.rect(px, py, pw, ph);
        layerCtx.clip();
        for (const stroke of layer.strokes) {
          if (stroke.page !== this.pageNumber) continue;
          if (!this.strokeTouches(stroke, x0, y0, x1, y1)) continue;
          renderStroke(layerCtx, stroke, this.cssWidth, this.cssHeight);
        }
        layerCtx.restore();
        ctx.globalAlpha = clamp(layer.opacity, 0, 1);
        ctx.drawImage(
          this.layerCanvas,
          px * this.dpr,
          py * this.dpr,
          pw * this.dpr,
          ph * this.dpr,
          px,
          py,
          pw,
          ph
        );
      }
      ctx.globalAlpha = 1;
    } finally {
      done?.();
    }
  }
  /** Cheap bbox test used to skip strokes that cannot touch a dirty box. */
  strokeTouches(stroke, x0, y0, x1, y1) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const points = stroke.points;
    for (let i = 0; i + 1 < points.length; i += 3) {
      const x = points[i];
      const y = points[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (const ring of stroke.rings ?? []) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        const x = ring[i];
        const y = ring[i + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX)) return false;
    return maxX >= x0 && minX <= x1 && maxY >= y0 && minY <= y1;
  }
  /** Draw the in-progress freehand stroke / shape on the top canvas. */
  drawLive(stroke, layerOpacity, guide) {
    if (this.destroyed) return;
    const ctx = this.ctxLive;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    const dirty = this.liveDirty;
    if (dirty) {
      const pad = 2;
      ctx.clearRect(
        dirty.x0 - pad,
        dirty.y0 - pad,
        dirty.x1 - dirty.x0 + pad * 2,
        dirty.y1 - dirty.y0 + pad * 2
      );
    } else {
      ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    }
    ctx.globalAlpha = clamp(layerOpacity, 0, 1);
    renderStroke(ctx, stroke, this.cssWidth, this.cssHeight);
    ctx.globalAlpha = 1;
    this.liveDirty = this.damageBox(stroke);
    if (guide) this.drawGuide(ctx, guide);
  }
  /**
   * Incremental freehand rendering: appendLive only draws the segments that
   * were added since the last call, which keeps pen latency low even for long
   * strokes at high DPI.
   */
  beginLive(stroke, layerOpacity) {
    if (this.destroyed) return;
    const ctx = this.ctxLive;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const dirty = this.liveDirty;
    if (dirty) {
      const pad = 2;
      ctx.clearRect(
        dirty.x0 - pad,
        dirty.y0 - pad,
        dirty.x1 - dirty.x0 + pad * 2,
        dirty.y1 - dirty.y0 + pad * 2
      );
    } else {
      ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    }
    this.liveStrokeId = stroke.id;
    this.liveDrawn = 0;
    this.appendLiveInner(stroke, layerOpacity);
  }
  appendLive(stroke, layerOpacity) {
    if (this.destroyed) return;
    if (!perf.enabled) {
      this.appendLiveInner(stroke, layerOpacity);
      return;
    }
    const done = perf.start("live.append");
    try {
      this.appendLiveInner(stroke, layerOpacity);
    } finally {
      done();
    }
  }
  appendLiveInner(stroke, layerOpacity) {
    const ctx = this.ctxLive;
    if (!ctx) return;
    if (this.liveStrokeId !== stroke.id) {
      this.beginLive(stroke, layerOpacity);
      return;
    }
    const points = stroke.points;
    const count = Math.floor(points.length / 3);
    if (count <= this.liveDrawn) return;
    const w = this.cssWidth;
    const h = this.cssHeight;
    const base = strokeWidthPx(stroke, w);
    const variable = hasPressureVariation(stroke);
    if (!variable) {
      this.drawLive(stroke, layerOpacity);
      this.liveDrawn = count;
      return;
    }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = clamp(layerOpacity * clamp(stroke.opacity, 0, 1), 0, 1);
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (this.liveDrawn === 0) {
      const dotWidth = variable ? base * pressureWidthFactor(points[2] ?? 0.5) : base;
      ctx.beginPath();
      ctx.arc(points[0] * w, points[1] * h, Math.max(0.6, dotWidth / 2), 0, Math.PI * 2);
      ctx.fill();
      this.liveDrawn = 1;
    }
    const start = Math.max(0, this.liveDrawn - 1);
    for (let i = start; i < count - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(points[i * 3] * w, points[i * 3 + 1] * h);
      ctx.lineTo(points[(i + 1) * 3] * w, points[(i + 1) * 3 + 1] * h);
      if (variable) {
        const pressure = ((points[i * 3 + 2] ?? 0.5) + (points[(i + 1) * 3 + 2] ?? 0.5)) / 2;
        ctx.lineWidth = Math.max(0.4, base * pressureWidthFactor(pressure));
      } else {
        ctx.lineWidth = Math.max(0.4, base);
      }
      ctx.stroke();
    }
    this.liveDrawn = count;
    ctx.globalAlpha = 1;
    this.liveDirty = this.damageBox(stroke);
  }
  /**
   * Commit a finished stroke on top of the already composited page. Only
   * valid when the stroke belongs to the topmost visible layer; otherwise a
   * full recomposite is required.
   */
  appendCommitted(stroke, layerOpacity) {
    if (this.destroyed) return;
    const ctx = this.ctxCommitted;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = clamp(layerOpacity, 0, 1);
    renderStroke(ctx, stroke, this.cssWidth, this.cssHeight);
    ctx.globalAlpha = 1;
  }
  /**
   * Dashed selection frame plus its transform handles. The frame is an
   * oriented rectangle (`angle` in radians, corners in local space), so a
   * rotated selection keeps a tight box that turns with the ink instead of
   * an axis-aligned box that grows and shrinks while rotating.
   */
  drawSelection(options = {}) {
    if (this.destroyed) return;
    const ctx = this.ctxLive;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    this.live.style.opacity = "";
    const frame = options.frame;
    if (!frame) return;
    if (!Number.isFinite(frame.hw) || !Number.isFinite(frame.hh)) return;
    const page = { width: this.cssWidth, height: this.cssHeight };
    ctx.save();
    ctx.strokeStyle = "rgba(76, 140, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash?.([6, 4]);
    ctx.translate(frame.cx, frame.cy);
    ctx.rotate(frame.angle);
    ctx.strokeRect(-frame.hw, -frame.hh, frame.hw * 2, frame.hh * 2);
    ctx.setLineDash?.([]);
    ctx.restore();
    if (options.handles) {
      const corners = frameCorners(frame);
      const edges = frameEdges(frame);
      const knob = selectionKnob(frame, page, options.knobEdge);
      const knobEdge = edges[options.knobEdge ?? selectionKnobEdge(frame)];
      ctx.save();
      ctx.strokeStyle = "rgba(76, 140, 255, 0.9)";
      ctx.lineWidth = 1;
      ctx.setLineDash?.([3, 3]);
      ctx.beginPath();
      ctx.moveTo(knobEdge.mx, knobEdge.my);
      ctx.lineTo(knob.x, knob.y);
      ctx.stroke();
      ctx.setLineDash?.([]);
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.strokeStyle = "rgba(76, 140, 255, 1)";
      ctx.lineWidth = 1.5;
      for (const corner of corners) {
        const size = 9;
        ctx.beginPath();
        ctx.rect(corner.x - size / 2, corner.y - size / 2, size, size);
        ctx.fill();
        ctx.stroke();
      }
      for (const edge of edges) {
        const size = 7;
        ctx.beginPath();
        ctx.rect(edge.mx - size / 2, edge.my - size / 2, size, size);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(knob.x, knob.y, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (options.label) {
      const knob = selectionKnob(frame, page, options.knobEdge);
      this.drawBadge(ctx, options.label, knob.x, knob.y - 30);
    }
  }
  drawBadge(ctx, text, centerX, top) {
    const padX = 7;
    const width = Math.max(34, text.length * 7 + padX * 2);
    const height = 18;
    const left = centerX - width / 2;
    const y = Math.max(2, top);
    ctx.save();
    ctx.setLineDash?.([]);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(30, 30, 30, 0.86)";
    ctx.beginPath();
    ctx.rect(left, y, width, height);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText?.(text, centerX, y + height / 2);
    ctx.restore();
  }
  /** Dashed freehand outline used by the lasso eraser. */
  drawFreehandGuide(stroke) {
    if (this.destroyed) return;
    const ctx = this.ctxLive;
    if (!ctx) return;
    const points = stroke.points;
    const count = Math.floor(points.length / 3);
    if (count < 2) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    ctx.save();
    ctx.strokeStyle = "rgba(76, 140, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash?.([5, 4]);
    ctx.beginPath();
    ctx.moveTo(points[0] * this.cssWidth, points[1] * this.cssHeight);
    for (let i = 1; i < count; i++) {
      ctx.lineTo(
        points[i * 3] * this.cssWidth,
        points[i * 3 + 1] * this.cssHeight
      );
    }
    if (count > 2) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  /**
   * Finishes a freehand stroke by drawing it **vectorially** into the
   * composite.
   *
   * It used to blit the live canvas instead (one `drawImage`), which is faster
   * in theory — but a canvas is not a reliable source: with
   * `desynchronized: true` the spec explicitly allows stale or empty pixels,
   * and that showed up as "the stroke vanishes the moment I lift the pen".
   * Drawing from the stroke data is exact, crisp and still sub-millisecond.
   */
  commitLive(stroke, layerOpacity) {
    if (this.destroyed) return;
    const ctx = this.ctxCommitted;
    if (!ctx) return;
    const done = perf.enabled ? perf.start("commit.vector") : null;
    try {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = clamp(layerOpacity, 0, 1);
      renderStroke(ctx, stroke, this.cssWidth, this.cssHeight);
      ctx.globalAlpha = 1;
    } finally {
      done?.();
    }
    this.live.style.opacity = "";
    this.clearLive();
    this.liveStrokeId = null;
    this.liveDrawn = 0;
  }
  /** Stroke extent in css px, padded by its width (pressure can widen it). */
  damageBox(stroke) {
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    const points = stroke.points;
    for (let i = 0; i + 1 < points.length; i += 3) {
      x0 = Math.min(x0, points[i] * this.cssWidth);
      x1 = Math.max(x1, points[i] * this.cssWidth);
      y0 = Math.min(y0, points[i + 1] * this.cssHeight);
      y1 = Math.max(y1, points[i + 1] * this.cssHeight);
    }
    for (const ring of stroke.rings ?? []) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        x0 = Math.min(x0, ring[i] * this.cssWidth);
        x1 = Math.max(x1, ring[i] * this.cssWidth);
        y0 = Math.min(y0, ring[i + 1] * this.cssHeight);
        y1 = Math.max(y1, ring[i + 1] * this.cssHeight);
      }
    }
    if (!Number.isFinite(x0)) return null;
    const pad = Math.max(4, strokeWidthPx(stroke, this.cssWidth));
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }
  /** Dashed rectangle/circle used while a shape snaps to square / circle. */
  drawGuideOnly(guide) {
    if (this.destroyed) return;
    const ctx = this.ctxLive;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    this.drawGuide(ctx, guide);
  }
  drawGuide(ctx, guide) {
    const w = this.cssWidth;
    const h = this.cssHeight;
    const x0 = guide.x0 * w;
    const y0 = guide.y0 * h;
    const x1 = guide.x1 * w;
    const y1 = guide.y1 * h;
    ctx.save();
    ctx.strokeStyle = "rgba(76, 140, 255, 0.9)";
    ctx.lineWidth = 1;
    ctx.setLineDash?.([5, 4]);
    ctx.beginPath();
    if (guide.kind === "rect") {
      ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else {
      ctx.ellipse(
        x0 + (x1 - x0) / 2,
        y0 + (y1 - y0) / 2,
        Math.abs(x1 - x0) / 2,
        Math.abs(y1 - y0) / 2,
        0,
        0,
        Math.PI * 2
      );
    }
    ctx.stroke();
    ctx.setLineDash?.([2, 4]);
    ctx.beginPath();
    ctx.moveTo(x0 + (x1 - x0) / 2, Math.min(y0, y1) - 12);
    ctx.lineTo(x0 + (x1 - x0) / 2, Math.max(y0, y1) + 12);
    ctx.moveTo(Math.min(x0, x1) - 12, y0 + (y1 - y0) / 2);
    ctx.lineTo(Math.max(x0, x1) + 12, y0 + (y1 - y0) / 2);
    ctx.stroke();
    ctx.restore();
  }
  clearLive() {
    const ctx = this.ctxLive;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    this.live.style.opacity = "";
    this.liveDirty = null;
  }
  destroy() {
    this.destroyed = true;
    this.committed.remove();
    this.live.remove();
    this.doc = null;
  }
};
var SELECTION_ROTATE_OFFSET_PX = 22;
var SELECTION_HANDLE_HIT_PX = 11;
function frameCorners(frame) {
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  const local = [
    [-frame.hw, -frame.hh],
    [frame.hw, -frame.hh],
    [frame.hw, frame.hh],
    [-frame.hw, frame.hh]
  ];
  return local.map(([lx, ly]) => ({
    x: frame.cx + lx * cos - ly * sin,
    y: frame.cy + lx * sin + ly * cos
  }));
}
function frameEdges(frame) {
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  const local = [
    [0, -frame.hh, 0, -1],
    [frame.hw, 0, 1, 0],
    [0, frame.hh, 0, 1],
    [-frame.hw, 0, -1, 0]
  ];
  return local.map(([lx, ly, nx, ny]) => ({
    mx: frame.cx + lx * cos - ly * sin,
    my: frame.cy + lx * sin + ly * cos,
    nx: nx * cos - ny * sin,
    ny: nx * sin + ny * cos
  }));
}
function selectionKnob(frame, page, edge) {
  const edges = frameEdges(frame);
  const best = edges[edge ?? selectionKnobEdge(frame)] ?? edges[0];
  const length = Math.hypot(best.nx, best.ny) || 1;
  let x = best.mx + best.nx / length * SELECTION_ROTATE_OFFSET_PX;
  let y = best.my + best.ny / length * SELECTION_ROTATE_OFFSET_PX;
  if (page) {
    x = Math.min(Math.max(x, 10), Math.max(10, page.width - 10));
    y = Math.min(Math.max(y, 10), Math.max(10, page.height - 10));
  }
  return { x, y };
}
function selectionKnobEdge(frame) {
  const edges = frameEdges(frame);
  let best = 0;
  for (let i = 1; i < edges.length; i++) {
    if (edges[i].my < edges[best].my - 1e-3) best = i;
  }
  return best;
}
function frameFromBox(box, width, height) {
  return {
    cx: (box.x0 + box.x1) / 2 * width,
    cy: (box.y0 + box.y1) / 2 * height,
    hw: Math.max(1, (box.x1 - box.x0) / 2 * width),
    hh: Math.max(1, (box.y1 - box.y0) / 2 * height),
    angle: 0
  };
}

// src/recognize.ts
var DEFAULTS = {
  minLengthPx: 18,
  lineTolerance: 0.035,
  closeRatio: 0.25,
  simplifyRatio: 0.035,
  axisTolerance: 0.34,
  ellipseTolerance: 0.14
};
function recognizeStroke(points, pageWidth, pageHeight, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  if (pageWidth <= 0 || pageHeight <= 0) return null;
  const count = Math.floor(points.length / 3);
  if (count < 4) return null;
  const px = [];
  for (let i = 0; i < count; i++) {
    px.push({ x: points[i * 3] * pageWidth, y: points[i * 3 + 1] * pageHeight });
  }
  let length = 0;
  for (let i = 1; i < px.length; i++) {
    length += distance(px[i - 1], px[i]);
  }
  if (length < opts.minLengthPx) return null;
  const first = px[0];
  const last = px[px.length - 1];
  const span = distance(first, last);
  const closed = span <= opts.closeRatio * length;
  if (!closed) {
    const deviation = maxDeviation(px, first, last);
    if (deviation <= Math.max(2.5, opts.lineTolerance * Math.max(span, length))) {
      return normalize([first, last], pageWidth, pageHeight, "line", 1);
    }
  }
  if (!closed) {
    const simplified = simplify(px, Math.max(3, 0.06 * length));
    if (simplified.length === 3 && span <= 0.2 * length) {
      return normalize(simplified, pageWidth, pageHeight, "polygon", 0.4);
    }
    return null;
  }
  const loop = closedLoopPoints(px);
  if (loop.length < 3) return null;
  const box = bounds(loop);
  const widthPx = box.maxX - box.minX;
  const heightPx = box.maxY - box.minY;
  if (widthPx < 6 || heightPx < 6) return null;
  const ellipseError = meanEllipseError(loop, box);
  if (ellipseError <= opts.ellipseTolerance) {
    return normalize(
      [
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.maxY }
      ],
      pageWidth,
      pageHeight,
      "ellipse",
      clamp01(1 - ellipseError * 3)
    );
  }
  const corners = simplify(loop, Math.max(2.5, opts.simplifyRatio * length));
  const areaRatio = loopFillRatio(loop, box);
  if (corners.length === 4 && isAxisAligned(corners, opts.axisTolerance) || corners.length <= 8 && areaRatio >= 0.86) {
    return normalize(
      [
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.maxY }
      ],
      pageWidth,
      pageHeight,
      "rect",
      clamp01(1 - ellipseError)
    );
  }
  if (corners.length >= 3 && corners.length <= 10) {
    return normalize(corners, pageWidth, pageHeight, "polygon", 0.45);
  }
  return null;
}
function normalize(vertices, pageWidth, pageHeight, kind, confidence) {
  const points = [];
  for (const vertex of vertices) {
    points.push(vertex.x / pageWidth, vertex.y / pageHeight, 0.5);
  }
  return { kind, points, confidence: clamp01(confidence) };
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function maxDeviation(points, start, end) {
  const length = distance(start, end);
  if (length < 1e-6) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (const point of points) {
    const dev = Math.abs((end.x - start.x) * (start.y - point.y) - (start.x - point.x) * (end.y - start.y)) / length;
    if (dev > worst) worst = dev;
  }
  return worst;
}
function closedLoopPoints(points) {
  const loop = [...points];
  if (loop.length > 3 && distance(loop[0], loop[loop.length - 1]) < 2) loop.pop();
  return loop;
}
function bounds(points) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}
function meanEllipseError(points, box) {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const rx = Math.max(1e-6, (box.maxX - box.minX) / 2);
  const ry = Math.max(1e-6, (box.maxY - box.minY) / 2);
  let total = 0;
  for (const point of points) {
    const value = ((point.x - cx) / rx) ** 2 + ((point.y - cy) / ry) ** 2;
    total += Math.abs(Math.sqrt(value) - 1);
  }
  return total / points.length;
}
function loopFillRatio(points, box) {
  const boxArea = (box.maxX - box.minX) * (box.maxY - box.minY);
  if (boxArea <= 1e-6) return 0;
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  return Math.min(1, Math.abs(area2 / 2) / boxArea);
}
function isAxisAligned(corners, tolerance) {
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return false;
    if (Math.min(dx, dy) / length > tolerance) return false;
  }
  return true;
}
function simplify(points, epsilon) {
  if (points.length < 3) return [...points];
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let index = -1;
    let max = 0;
    for (let i = start + 1; i < end; i++) {
      const dev = perpendicularDistance(points[i], points[start], points[end]);
      if (dev > max) {
        max = dev;
        index = i;
      }
    }
    if (index >= 0 && max > epsilon) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
function perpendicularDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return distance(point, start);
  return Math.abs(dy * (point.x - start.x) - dx * (point.y - start.y)) / length;
}
function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

// src/transform.ts
var ELLIPSE_SAMPLES = 48;
function snapshotStroke(stroke) {
  return {
    id: stroke.id,
    kind: stroke.kind,
    points: stroke.points.slice(),
    rings: stroke.rings ? stroke.rings.map((ring) => ring.slice()) : null,
    width: stroke.width
  };
}
function restoreStroke(stroke, snapshot) {
  stroke.kind = snapshot.kind;
  stroke.points = snapshot.points.slice();
  if (snapshot.rings) stroke.rings = snapshot.rings.map((ring) => ring.slice());
  else delete stroke.rings;
  stroke.width = snapshot.width;
}
function outlineOf(snapshot, width, height) {
  const x0 = snapshot.points[0] * width;
  const y0 = snapshot.points[1] * height;
  const x1 = snapshot.points[3] * width;
  const y1 = snapshot.points[4] * height;
  if (snapshot.kind === "rect") {
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1]
    ];
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  const points = [];
  for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
    const angle = i / ELLIPSE_SAMPLES * Math.PI * 2;
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }
  return points;
}
function applyTransform(stroke, snapshot, transform) {
  const { pageWidth: width, pageHeight: height } = transform;
  if (width <= 0 || height <= 0) return;
  const scaleX = clamp(transform.scaleX, 0.02, 40);
  const scaleY = clamp(transform.scaleY, 0.02, 40);
  const cos = Math.cos(transform.rotate);
  const sin = Math.sin(transform.rotate);
  let m11;
  let m12;
  let m21;
  let m22;
  if (transform.local) {
    m11 = cos * cos * scaleX + sin * sin * scaleY;
    m12 = cos * sin * (scaleX - scaleY);
    m21 = m12;
    m22 = sin * sin * scaleX + cos * cos * scaleY;
  } else {
    m11 = cos * scaleX;
    m12 = -sin * scaleY;
    m21 = sin * scaleX;
    m22 = cos * scaleY;
  }
  const mapX = (x, y) => {
    const dx = x * width - transform.cx;
    const dy = y * height - transform.cy;
    return (transform.cx + m11 * dx + m12 * dy) / width;
  };
  const mapY = (x, y) => {
    const dx = x * width - transform.cx;
    const dy = y * height - transform.cy;
    return (transform.cy + m21 * dx + m22 * dy) / height;
  };
  const sheared = Math.abs(m12) > 1e-9 || Math.abs(m21) > 1e-9;
  stroke.width = snapshot.width * Math.sqrt(Math.abs(m11 * m22 - m12 * m21));
  if (sheared && (snapshot.kind === "rect" || snapshot.kind === "ellipse")) {
    const outline = outlineOf(snapshot, width, height);
    const points2 = [];
    for (const [x, y] of outline) {
      points2.push(mapX(x / width, y / height), mapY(x / width, y / height), 0.5);
    }
    stroke.kind = "polygon";
    stroke.points = points2;
    delete stroke.rings;
    return;
  }
  const original = snapshot.points;
  const points = new Array(original.length);
  for (let i = 0; i + 2 < original.length; i += 3) {
    const x = original[i];
    const y = original[i + 1];
    points[i] = mapX(x, y);
    points[i + 1] = mapY(x, y);
    points[i + 2] = original[i + 2];
  }
  stroke.points = points;
  if (snapshot.rings) {
    stroke.rings = snapshot.rings.map((ring) => {
      const moved = new Array(ring.length);
      for (let i = 0; i + 1 < ring.length; i += 2) {
        moved[i] = mapX(ring[i], ring[i + 1]);
        moved[i + 1] = mapY(ring[i], ring[i + 1]);
      }
      return moved;
    });
  } else {
    delete stroke.rings;
  }
}

// src/ui/selection-menu.ts
var import_obsidian = require("obsidian");
var SelectionMenu = class {
  constructor(controller) {
    this.controller = controller;
    this.el = null;
    this.onOutside = (event) => {
      const target = event.target;
      if (this.el && target && this.el.contains(target)) return;
      if (this.anchor && target && this.anchor.contains(target)) return;
      this.close();
    };
    this.onKey = (event) => {
      if (event.key === "Escape") this.close();
    };
    this.anchor = null;
    this.doc = controller.containerEl.ownerDocument;
  }
  get isOpen() {
    return Boolean(this.el);
  }
  open(clientX, clientY, anchor, placement) {
    this.close();
    const el2 = this.doc.createElement("div");
    el2.className = "pdf-ink-selection-menu";
    this.anchor = anchor ?? null;
    const items = [
      ["copy", "\u590D\u5236", () => this.controller.copySelection()],
      ["scissors", "\u526A\u5207", () => this.controller.cutSelection()],
      ["clipboard-paste", "\u7C98\u8D34", () => this.controller.pasteClipboard()],
      ["trash-2", "\u5220\u9664", () => this.controller.deleteSelection()]
    ];
    for (const [icon, label, action] of items) {
      const row = this.doc.createElement("button");
      row.type = "button";
      row.className = "pdf-ink-selection-item";
      const iconEl = this.doc.createElement("span");
      iconEl.className = "pdf-ink-selection-icon";
      (0, import_obsidian.setIcon)(iconEl, icon);
      const text = this.doc.createElement("span");
      text.textContent = label;
      row.append(iconEl, text);
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (row.disabled) return;
        action();
        this.close();
      });
      const needsSelection = icon !== "clipboard-paste";
      if (needsSelection && !this.controller.hasSelection) {
        row.disabled = true;
        row.title = "\u5148\u9009\u4E2D\u4E00\u6761\u7B14\u8FF9";
      }
      if (icon === "clipboard-paste" && !this.controller.hasClipboard) {
        row.disabled = true;
        row.title = "\u526A\u8D34\u677F\u662F\u7A7A\u7684\uFF1A\u5148\u590D\u5236\u6216\u526A\u5207\u7B14\u8FF9";
      }
      el2.appendChild(row);
    }
    this.doc.body.appendChild(el2);
    const rect = el2.getBoundingClientRect();
    let left = clientX + 8;
    let top = clientY + 8;
    if (placement) {
      const gap = 10;
      const frame = placement.frame;
      const midX = (frame.left + frame.right) / 2;
      const midY = (frame.top + frame.bottom) / 2;
      const margin = 8;
      const clampX = (value) => clamp(value, margin, Math.max(margin, window.innerWidth - rect.width - margin));
      const clampY = (value) => clamp(value, margin, Math.max(margin, window.innerHeight - rect.height - margin));
      const candidates = [
        { left: frame.right + gap, top: clampY(midY - rect.height / 2) },
        { left: frame.left - gap - rect.width, top: clampY(midY - rect.height / 2) },
        { left: clampX(midX - rect.width / 2), top: frame.bottom + gap },
        {
          left: clampX(midX - rect.width / 2),
          top: frame.top - gap - rect.height
        }
      ];
      let best = { left: clampX(clientX + 8), top: clampY(clientY + 8) };
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const candidate of candidates) {
        const x = clampX(candidate.left);
        const y = clampY(candidate.top);
        const box = {
          left: x,
          top: y,
          right: x + rect.width,
          bottom: y + rect.height
        };
        const knobOverlap = overlap(box, placement.knob);
        const frameOverlap = overlap(box, frame);
        const shifted = Math.abs(x - candidate.left) + Math.abs(y - candidate.top);
        const score = -knobOverlap * 20 - frameOverlap - shifted;
        if (score > bestScore) {
          bestScore = score;
          best = { left: x, top: y };
        }
      }
      left = best.left;
      top = best.top;
    }
    left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8));
    el2.style.left = `${left}px`;
    el2.style.top = `${top}px`;
    this.el = el2;
    window.setTimeout(() => {
      this.doc.addEventListener("pointerdown", this.onOutside, true);
      this.doc.addEventListener("keydown", this.onKey, true);
    }, 0);
  }
  close() {
    if (!this.el) return;
    this.doc.removeEventListener("pointerdown", this.onOutside, true);
    this.doc.removeEventListener("keydown", this.onKey, true);
    this.el.remove();
    this.el = null;
    this.anchor = null;
  }
};
function overlap(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

// src/ui/toolbar.ts
var import_obsidian3 = require("obsidian");

// src/ui/brush-panel.ts
var import_obsidian2 = require("obsidian");

// src/color.ts
function clamp012(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
function parseHex(hex) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let body = match[1];
  if (body.length === 3) {
    body = body.split("").map((char) => char + char).join("");
  }
  return [
    parseInt(body.slice(0, 2), 16) / 255,
    parseInt(body.slice(2, 4), 16) / 255,
    parseInt(body.slice(4, 6), 16) / 255
  ];
}
function hexToHsl(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return { h: 0, s: 0, l: 0 };
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}
function hslToHex(h, s, l) {
  const hue = (h % 360 + 360) % 360 / 360;
  const sat = clamp012(s / 100);
  const light = clamp012(l / 100);
  if (sat === 0) {
    const value = Math.round(light * 255);
    return `#${value.toString(16).padStart(2, "0").repeat(3)}`;
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const channel = (t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  const toHex = (value) => Math.round(clamp012(value) * 255).toString(16).padStart(2, "0");
  return `#${toHex(channel(hue + 1 / 3))}${toHex(channel(hue))}${toHex(channel(hue - 1 / 3))}`;
}
function normalizeHex(input) {
  const rgb = parseHex(input);
  if (!rgb) return null;
  return `#${rgb.map(
    (value) => Math.round(clamp012(value) * 255).toString(16).padStart(2, "0")
  ).join("")}`;
}

// src/ui/place.ts
function overlapArea(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}
function placeFloating(el2, anchor, options = {}) {
  const gap = options.gap ?? 6;
  const margin = options.margin ?? 8;
  const anchorRect = anchor.getBoundingClientRect();
  const rect = el2.getBoundingClientRect();
  const candidates = [
    { left: anchorRect.right + gap, top: anchorRect.top },
    { left: anchorRect.left - gap - rect.width, top: anchorRect.top },
    { left: anchorRect.left, top: anchorRect.bottom + gap },
    { left: anchorRect.left, top: anchorRect.top - gap - rect.height }
  ];
  let best = { left: candidates[0].left, top: candidates[0].top };
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const left = clamp(
      candidate.left,
      margin,
      Math.max(margin, window.innerWidth - rect.width - margin)
    );
    const top = clamp(
      candidate.top,
      margin,
      Math.max(margin, window.innerHeight - rect.height - margin)
    );
    const box = {
      left,
      top,
      right: left + rect.width,
      bottom: top + rect.height
    };
    let overlap2 = 0;
    for (const avoid of options.avoid ?? []) overlap2 += overlapArea(box, avoid);
    const shifted = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
    const score = -overlap2 * 4 - shifted;
    if (score > bestScore) {
      bestScore = score;
      best = { left, top };
    }
  }
  el2.style.left = `${Math.round(best.left)}px`;
  el2.style.top = `${Math.round(best.top)}px`;
}
function boxOf(element) {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

// src/ui/brush-panel.ts
var TITLES = {
  pen: "\u94A2\u7B14",
  highlighter: "\u8367\u5149\u7B14",
  eraser: "\u6A61\u76AE"
};
var HOLD_MS = 420;
var PREVIEW_WIDTH = 214;
var PREVIEW_HEIGHT = 52;
var BrushPanel = class {
  constructor(plugin, doc) {
    this.plugin = plugin;
    this.el = null;
    this.anchor = null;
    this.kind = "pen";
    this.menu = null;
    this.presetRow = null;
    this.paletteGrid = null;
    this.widthInput = null;
    this.widthValue = null;
    this.opacityInput = null;
    this.opacityValue = null;
    this.preview = null;
    this.segments = /* @__PURE__ */ new Map();
    this.hold = { timer: null, fired: false, startX: 0, startY: 0 };
    this.lastPaletteSignature = "";
    this.colorEditor = null;
    this.onEditorOutside = (event) => {
      const target = event.target;
      if (target && this.colorEditor?.contains(target)) return;
      this.closeColorEditor();
    };
    this.onOutside = (event) => {
      const target = event.target;
      if (!target) return;
      if (this.el?.contains(target)) return;
      if (this.menu?.contains(target)) return;
      if (this.colorEditor?.contains(target)) return;
      if (target instanceof HTMLElement && target.closest("input[type=color]")) return;
      this.close();
    };
    this.onKey = (event) => {
      if (event.key === "Escape") this.close();
    };
    this.doc = doc;
  }
  get isOpen() {
    return Boolean(this.el);
  }
  toggle(anchor, kind) {
    if (this.el && this.anchor === anchor && this.kind === kind) {
      this.close();
      return;
    }
    this.open(anchor, kind);
  }
  open(anchor, kind) {
    this.close();
    this.anchor = anchor;
    this.kind = kind;
    const el2 = this.doc.createElement("div");
    el2.className = "pdf-ink-brush-panel";
    el2.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    this.el = el2;
    this.lastPaletteSignature = "";
    const title = this.doc.createElement("div");
    title.className = "pdf-ink-panel-title";
    title.textContent = TITLES[kind];
    el2.appendChild(title);
    this.presetRow = this.doc.createElement("div");
    this.presetRow.className = "pdf-ink-panel-presets";
    el2.appendChild(this.presetRow);
    if (kind === "eraser") this.buildEraserBody(el2);
    else this.buildBrushBody(el2);
    this.doc.body.appendChild(el2);
    this.refresh();
    placeFloating(el2, anchor, {
      gap: 8,
      avoid: [boxOf(anchor.closest(".pdf-ink-toolbar") ?? anchor)]
    });
    window.setTimeout(() => {
      this.doc.addEventListener("pointerdown", this.onOutside, true);
      this.doc.addEventListener("keydown", this.onKey, true);
    }, 0);
  }
  close() {
    this.closeMenu();
    this.closeColorEditor();
    if (!this.el) return;
    this.doc.removeEventListener("pointerdown", this.onOutside, true);
    this.doc.removeEventListener("keydown", this.onKey, true);
    this.cancelHold();
    this.el.remove();
    this.el = null;
    this.anchor = null;
    this.presetRow = null;
    this.paletteGrid = null;
    this.widthInput = null;
    this.widthValue = null;
    this.opacityInput = null;
    this.opacityValue = null;
    this.preview = null;
    this.segments.clear();
  }
  /* ------------------------------------------------------------------ */
  /* Building blocks                                                     */
  /* ------------------------------------------------------------------ */
  buildBrushBody(el2) {
    this.heading(el2, "\u8C03\u8272\u677F");
    this.paletteGrid = this.doc.createElement("div");
    this.paletteGrid.className = "pdf-ink-panel-grid";
    el2.appendChild(this.paletteGrid);
    this.heading(el2, "\u7C97\u7EC6");
    this.widthInput = this.slider(
      el2,
      0.5,
      20,
      0.5,
      (value) => this.plugin.setBrushWidth(this.kind, value)
    );
    this.widthValue = this.widthInput.nextElementSibling;
    this.heading(el2, "\u4E0D\u900F\u660E\u5EA6");
    this.opacityInput = this.slider(
      el2,
      10,
      100,
      5,
      (value) => this.plugin.setBrushOpacity(this.kind === "highlighter" ? "highlighter" : "pen", value / 100)
    );
    this.opacityValue = this.opacityInput.nextElementSibling;
    const preview = this.doc.createElement("canvas");
    preview.className = "pdf-ink-panel-preview";
    el2.appendChild(preview);
    this.preview = preview;
  }
  buildEraserBody(el2) {
    this.heading(el2, "\u64E6\u9664\u65B9\u5F0F");
    this.segmented(
      el2,
      "scope",
      [
        { value: "partial", label: SCOPE_LABELS.partial },
        { value: "whole", label: SCOPE_LABELS.whole }
      ],
      (value) => this.plugin.setEraserScope(value)
    );
    this.heading(el2, "\u64E6\u9664\u533A\u57DF");
    this.segmented(
      el2,
      "region",
      [
        { value: "free", label: REGION_LABELS.free },
        { value: "rect", label: REGION_LABELS.rect },
        { value: "lasso", label: REGION_LABELS.lasso }
      ],
      (value) => this.plugin.setEraserRegion(value)
    );
    this.heading(el2, "\u6A61\u76AE\u534A\u5F84");
    this.widthInput = this.slider(
      el2,
      4,
      48,
      1,
      (value) => this.plugin.setBrushWidth("eraser", value)
    );
    this.widthValue = this.widthInput.nextElementSibling;
    const preview = this.doc.createElement("canvas");
    preview.className = "pdf-ink-panel-preview";
    el2.appendChild(preview);
    this.preview = preview;
  }
  heading(parent, text) {
    const heading = this.doc.createElement("div");
    heading.className = "pdf-ink-panel-heading";
    heading.textContent = text;
    parent.appendChild(heading);
  }
  slider(parent, min, max, step, onInput) {
    const row = this.doc.createElement("div");
    row.className = "pdf-ink-panel-slider";
    const input = this.doc.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.addEventListener("input", () => {
      onInput(Number(input.value));
      this.refresh();
    });
    const value = this.doc.createElement("span");
    value.className = "pdf-ink-panel-value";
    row.append(input, value);
    parent.appendChild(row);
    return input;
  }
  segmented(parent, axis, options, onPick) {
    const row = this.doc.createElement("div");
    row.className = "pdf-ink-panel-segment";
    for (const option of options) {
      const button = this.doc.createElement("button");
      button.type = "button";
      button.className = "pdf-ink-panel-seg";
      button.textContent = option.label;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onPick(option.value);
        this.refresh();
      });
      row.appendChild(button);
      this.segments.set(`${axis}:${option.value}`, button);
    }
    parent.appendChild(row);
  }
  /* ------------------------------------------------------------------ */
  /* Refresh                                                             */
  /* ------------------------------------------------------------------ */
  refresh() {
    if (!this.el) return;
    this.renderPresets();
    if (this.kind === "eraser") this.refreshEraser();
    else this.refreshBrush();
    this.drawPreview();
  }
  refreshBrush() {
    const kind = this.kind === "highlighter" ? "highlighter" : "pen";
    const brush = this.plugin.brushFor(kind);
    if (this.paletteGrid) this.renderPalette(this.paletteGrid, brush.color);
    if (this.widthInput) {
      const text = formatWidth(brush.widthPx);
      if (this.doc.activeElement !== this.widthInput) this.widthInput.value = text;
      if (this.widthValue) this.widthValue.textContent = `${text}px`;
    }
    if (this.opacityInput) {
      const percent = String(Math.round(brush.opacity * 100));
      if (this.doc.activeElement !== this.opacityInput) this.opacityInput.value = percent;
      if (this.opacityValue) this.opacityValue.textContent = `${percent}%`;
    }
  }
  refreshEraser() {
    const settings = this.plugin.settings;
    for (const [key, button] of this.segments) {
      const [axis, value] = key.split(":");
      const active = axis === "scope" ? settings.eraserScope === value : settings.eraserRegion === value;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    if (this.widthInput) {
      const text = formatWidth(settings.eraserWidth);
      if (this.doc.activeElement !== this.widthInput) this.widthInput.value = text;
      if (this.widthValue) this.widthValue.textContent = `${text}px`;
    }
  }
  /* ------------------------------------------------------------------ */
  /* Presets                                                             */
  /* ------------------------------------------------------------------ */
  renderPresets() {
    const row = this.presetRow;
    if (!row) return;
    while (row.firstChild) row.removeChild(row.firstChild);
    for (const preset of this.plugin.presetsOf(this.kind)) {
      const chip = this.presetChip(preset);
      row.appendChild(chip);
    }
    const add = this.doc.createElement("button");
    add.type = "button";
    add.className = "pdf-ink-preset-add";
    add.textContent = "\uFF0B";
    (0, import_obsidian2.setTooltip)(add, "\u628A\u5F53\u524D\u7B14\u5237\u72B6\u6001\u5B58\u6210\u9884\u8BBE");
    add.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.plugin.addPreset(this.kind);
      this.refresh();
    });
    row.appendChild(add);
  }
  presetChip(preset) {
    const chip = this.doc.createElement("button");
    chip.type = "button";
    chip.className = "pdf-ink-preset";
    if (this.isActivePreset(preset)) chip.classList.add("is-active");
    const swatch = this.doc.createElement("span");
    swatch.className = "pdf-ink-preset-swatch";
    if (this.kind === "eraser") {
      swatch.classList.add("is-eraser");
      (0, import_obsidian2.setIcon)(swatch, "eraser");
    } else {
      swatch.style.backgroundColor = preset.color;
    }
    const name = this.doc.createElement("span");
    name.className = "pdf-ink-preset-name";
    name.textContent = preset.name;
    chip.append(swatch, name);
    chip.title = this.kind === "eraser" ? `${REGION_LABELS[preset.region]} \xB7 ${SCOPE_LABELS[preset.scope]} \xB7 \u534A\u5F84 ${formatWidth(preset.widthPx)}px` : `${preset.color} \xB7 ${formatWidth(preset.widthPx)}px \xB7 ${Math.round(preset.opacity * 100)}%`;
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    this.bindTapHold(
      chip,
      () => {
        this.plugin.applyPreset(this.kind, preset);
        this.refresh();
      },
      () => this.openPresetMenu(chip, preset)
    );
    chip.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.cancelHold();
      this.openPresetMenu(chip, preset);
    });
    return chip;
  }
  isActivePreset(preset) {
    const settings = this.plugin.settings;
    if (this.kind === "eraser") {
      const eraser = preset;
      return settings.eraserRegion === eraser.region && settings.eraserScope === eraser.scope && Math.abs(settings.eraserWidth - eraser.widthPx) < 0.01;
    }
    const brush = preset;
    const current = this.plugin.brushFor(this.kind === "highlighter" ? "highlighter" : "pen");
    return brush.color.toLowerCase() === current.color.toLowerCase() && Math.abs(brush.widthPx - current.widthPx) < 0.01 && Math.abs(brush.opacity - current.opacity) < 0.01;
  }
  openPresetMenu(anchor, preset) {
    this.closeMenu();
    const menu = this.doc.createElement("div");
    menu.className = "pdf-ink-preset-menu";
    const items = [
      [
        "\u91CD\u547D\u540D",
        () => {
          this.closeMenu();
          this.startRename(anchor, preset);
        }
      ],
      [
        "\u8986\u76D6\u4E3A\u5F53\u524D",
        () => {
          this.plugin.overwritePreset(this.kind, preset.id);
          this.closeMenu();
          this.refresh();
        }
      ],
      [
        "\u5220\u9664",
        () => {
          this.plugin.deletePreset(this.kind, preset.id);
          this.closeMenu();
          this.refresh();
        }
      ]
    ];
    for (const [label, action] of items) {
      const row = this.doc.createElement("button");
      row.type = "button";
      row.className = "pdf-ink-preset-menu-item";
      row.textContent = label;
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      menu.appendChild(row);
    }
    this.doc.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.round(rect.left)}px`;
    menu.style.top = `${Math.round(rect.bottom + 4)}px`;
    menu.style.position = "fixed";
    this.menu = menu;
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight - 8) {
      menu.style.top = `${Math.round(rect.top - menuRect.height - 4)}px`;
    }
    if (menuRect.right > window.innerWidth - 8) {
      menu.style.left = `${Math.round(window.innerWidth - menuRect.width - 8)}px`;
    }
  }
  closeMenu() {
    this.menu?.remove();
    this.menu = null;
  }
  /** Renames in place: the chip turns into an input until Enter / blur. */
  startRename(chip, preset) {
    while (chip.firstChild) chip.removeChild(chip.firstChild);
    const input = this.doc.createElement("input");
    input.type = "text";
    input.className = "pdf-ink-preset-rename";
    input.value = preset.name;
    input.maxLength = 24;
    const commit = (save) => {
      if (save) this.plugin.renamePreset(this.kind, preset.id, input.value);
      this.refresh();
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") commit(true);
      else if (event.key === "Escape") commit(false);
    });
    input.addEventListener("blur", () => commit(true));
    chip.appendChild(input);
    input.focus();
    input.select();
  }
  /* ------------------------------------------------------------------ */
  /* Palette                                                             */
  /* ------------------------------------------------------------------ */
  renderPalette(grid, current) {
    const signature = this.plugin.settings.palette.join(",");
    if (signature === this.lastPaletteSignature && grid.childElementCount > 0) {
      for (const el2 of Array.from(grid.querySelectorAll(".pdf-ink-panel-swatch"))) {
        const index = el2.dataset.index;
        if (index === void 0) continue;
        const color = this.plugin.settings.palette[Number(index)];
        el2.classList.toggle("is-active", color?.toLowerCase() === current.toLowerCase());
      }
      return;
    }
    this.lastPaletteSignature = signature;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    this.plugin.settings.palette.forEach((color, index) => {
      const swatch = this.doc.createElement("button");
      swatch.type = "button";
      swatch.className = "pdf-ink-panel-swatch";
      swatch.style.backgroundColor = color;
      swatch.dataset.index = String(index);
      swatch.setAttribute("aria-label", color);
      (0, import_obsidian2.setTooltip)(swatch, `${color}\uFF08\u957F\u6309\u6539\u8272\uFF0C\u62D6\u51FA\u9762\u677F\u5220\u9664\uFF09`);
      if (color.toLowerCase() === current.toLowerCase()) swatch.classList.add("is-active");
      this.bindPaletteSwatch(swatch, index, color);
      grid.appendChild(swatch);
    });
    const add = this.doc.createElement("button");
    add.type = "button";
    add.className = "pdf-ink-panel-swatch pdf-ink-swatch-add";
    add.textContent = "\uFF0B";
    (0, import_obsidian2.setTooltip)(add, "\u628A\u5F53\u524D\u7B14\u8272\u52A0\u8FDB\u8C03\u8272\u677F");
    add.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const brush = this.plugin.brushFor(this.kind === "highlighter" ? "highlighter" : "pen");
      if (this.plugin.settings.palette.some((entry) => entry.toLowerCase() === brush.color.toLowerCase())) {
        new import_obsidian2.Notice("[PDF Ink] \u8FD9\u4E2A\u989C\u8272\u5DF2\u7ECF\u5728\u8C03\u8272\u677F\u91CC\u4E86");
        return;
      }
      this.plugin.addPaletteColor(brush.color);
      this.refresh();
    });
    grid.appendChild(add);
  }
  /** Click applies, long press opens the native picker, drag-out deletes. */
  bindPaletteSwatch(swatch, index, color) {
    const kind = this.kind === "highlighter" ? "highlighter" : "pen";
    let dragging = false;
    let pointerId = -1;
    const clean = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
    };
    const onMove = (event) => {
      if (event.pointerId !== pointerId) return;
      const dx = event.clientX - this.hold.startX;
      const dy = event.clientY - this.hold.startY;
      if (!dragging && Math.hypot(dx, dy) > 10) {
        dragging = true;
        this.cancelHold();
        swatch.classList.add("is-dragging");
      }
      if (dragging) swatch.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const onUp = (event) => {
      if (event.pointerId !== pointerId) return;
      clean();
      this.cancelHold();
      swatch.classList.remove("is-dragging");
      swatch.style.transform = "";
      const panel = this.el;
      if (dragging && panel) {
        const rect = panel.getBoundingClientRect();
        const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
        if (outside) {
          this.plugin.removePaletteColor(index);
          this.refresh();
          return;
        }
      }
      if (this.hold.fired) return;
      if (!dragging) {
        this.plugin.setBrushColor(this.kind === "highlighter" ? "highlighter" : "pen", color);
        this.refresh();
      }
    };
    swatch.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.plugin.setBrushColor(kind, color);
      this.refresh();
      this.openColorEditor(index, swatch);
    });
    swatch.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      pointerId = event.pointerId;
      dragging = false;
      this.startHold(event.clientX, event.clientY, () => {
        this.plugin.setBrushColor(kind, color);
        this.refresh();
        this.openColorEditor(index, swatch);
      });
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
    });
    swatch.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.cancelHold();
      this.plugin.setBrushColor(kind, color);
      this.refresh();
      this.openColorEditor(index, swatch);
    });
  }
  openColorEditor(index, anchor) {
    this.closeColorEditor();
    const initial = normalizeHex(this.plugin.settings.palette[index] ?? "#000000") ?? "#000000";
    const hsl = hexToHsl(initial);
    let hue = hsl.h;
    let sat = hsl.s;
    let light = hsl.l;
    const el2 = this.doc.createElement("div");
    el2.className = "pdf-ink-color-editor";
    el2.addEventListener("pointerdown", (event) => event.stopPropagation());
    const preview = this.doc.createElement("div");
    preview.className = "pdf-ink-color-editor-preview";
    preview.style.backgroundColor = initial;
    el2.appendChild(preview);
    const hexInput = this.doc.createElement("input");
    hexInput.type = "text";
    hexInput.className = "pdf-ink-color-hex";
    hexInput.value = initial;
    hexInput.spellcheck = false;
    const applyHex = (hex, updateInput) => {
      preview.style.backgroundColor = hex;
      if (updateInput) hexInput.value = hex;
      this.plugin.setPaletteSlot(index, hex);
      this.refresh();
    };
    const fromSliders = () => applyHex(hslToHex(hue, sat, light), true);
    const row = (label, max, value, onInput) => {
      const wrap = this.doc.createElement("div");
      wrap.className = "pdf-ink-color-row";
      const text = this.doc.createElement("span");
      text.textContent = label;
      const slider = this.doc.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = String(max);
      slider.step = "1";
      slider.value = String(value);
      slider.addEventListener("input", () => onInput(Number(slider.value)));
      wrap.append(text, slider);
      el2.appendChild(wrap);
      return slider;
    };
    const paintGradients = () => {
      hueSlider.style.backgroundImage = "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)";
      satSlider.style.backgroundImage = `linear-gradient(to right, hsl(${hue} 0% ${light}%), hsl(${hue} 100% ${light}%))`;
      lightSlider.style.backgroundImage = `linear-gradient(to right, #000, hsl(${hue} ${sat}% 50%), #fff)`;
    };
    const hueSlider = row("\u8272\u76F8", 360, hue, (next) => {
      hue = next;
      paintGradients();
      fromSliders();
    });
    const satSlider = row("\u9971\u548C", 100, sat, (next) => {
      sat = next;
      paintGradients();
      fromSliders();
    });
    const lightSlider = row("\u660E\u5EA6", 100, light, (next) => {
      light = next;
      paintGradients();
      fromSliders();
    });
    paintGradients();
    el2.appendChild(hexInput);
    hexInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Enter") return;
      const normalized = normalizeHex(hexInput.value);
      if (!normalized) {
        hexInput.value = normalizeHex(preview.style.backgroundColor) ?? initial;
        return;
      }
      const next = hexToHsl(normalized);
      hue = next.h;
      sat = next.s;
      light = next.l;
      hueSlider.value = String(hue);
      satSlider.value = String(sat);
      lightSlider.value = String(light);
      paintGradients();
      applyHex(normalized, true);
    });
    hexInput.addEventListener("blur", () => {
      const normalized = normalizeHex(hexInput.value);
      if (normalized) hexInput.value = normalized;
    });
    this.doc.body.appendChild(el2);
    placeFloating(el2, anchor, {
      gap: 8,
      avoid: [boxOf(anchor.closest(".pdf-ink-toolbar") ?? anchor)]
    });
    this.colorEditor = el2;
    window.setTimeout(() => {
      this.doc.addEventListener("pointerdown", this.onEditorOutside, true);
    }, 0);
  }
  closeColorEditor() {
    if (!this.colorEditor) return;
    this.doc.removeEventListener("pointerdown", this.onEditorOutside, true);
    this.colorEditor.remove();
    this.colorEditor = null;
  }
  /* ------------------------------------------------------------------ */
  /* Tap / hold                                                          */
  /* ------------------------------------------------------------------ */
  startHold(clientX, clientY, onHold) {
    this.cancelHold();
    this.hold.startX = clientX;
    this.hold.startY = clientY;
    this.hold.fired = false;
    this.hold.timer = window.setTimeout(() => {
      this.hold.timer = null;
      this.hold.fired = true;
      try {
        onHold();
      } catch (error) {
        void error;
      }
      window.setTimeout(() => {
        this.hold.fired = false;
      }, 700);
    }, HOLD_MS);
  }
  cancelHold() {
    if (this.hold.timer !== null) {
      window.clearTimeout(this.hold.timer);
      this.hold.timer = null;
    }
  }
  /** Click → tap action; press and hold → hold action (no click afterwards). */
  bindTapHold(el2, onTap, onHold) {
    el2.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.startHold(event.clientX, event.clientY, onHold);
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      el2.addEventListener(type, () => {
        if (this.hold.timer !== null) this.cancelHold();
      });
    }
    el2.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.hold.fired) {
        this.hold.fired = false;
        return;
      }
      onTap();
    });
  }
  /* ------------------------------------------------------------------ */
  /* Preview                                                             */
  /* ------------------------------------------------------------------ */
  drawPreview() {
    const canvas = this.preview;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    canvas.width = Math.round(PREVIEW_WIDTH * dpr);
    canvas.height = Math.round(PREVIEW_HEIGHT * dpr);
    canvas.style.width = `${PREVIEW_WIDTH}px`;
    canvas.style.height = `${PREVIEW_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    const stroke = this.previewStroke();
    renderStroke(ctx, stroke, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  }
  previewStroke() {
    const points = [];
    const steps = 42;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = 0.05 + 0.9 * t;
      const y = 0.5 - 0.28 * Math.sin((t - 0.5) * Math.PI * 1.8);
      const pressure = 0.3 + 0.7 * Math.sin(Math.PI * t) ** 0.6;
      points.push(x, y, pressure);
    }
    if (this.kind === "eraser") {
      const width = this.plugin.settings.eraserWidth;
      return {
        id: "preview",
        kind: "pen",
        page: 1,
        color: "#868e96",
        width: width / PREVIEW_WIDTH,
        opacity: 1,
        points
      };
    }
    const kind = this.kind === "highlighter" ? "highlighter" : "pen";
    const brush = this.plugin.brushFor(kind);
    return {
      id: "preview",
      kind,
      page: 1,
      color: brush.color,
      width: brush.widthPx / PREVIEW_WIDTH,
      opacity: brush.opacity,
      points
    };
  }
};

// src/ui/toolbar.ts
var TOOLS = [
  { tool: "pen", icon: "pencil", label: "\u94A2\u7B14 (P\uFF0C\u53CC\u51FB/\u957F\u6309\u5F00\u9762\u677F)" },
  { tool: "highlighter", icon: "highlighter", label: "\u8367\u5149\u7B14 (H\uFF0C\u53CC\u51FB/\u957F\u6309\u5F00\u9762\u677F)" },
  { tool: "eraser", icon: "eraser", label: "\u6A61\u76AE (E\uFF0C\u53CC\u51FB/\u957F\u6309\u5207\u6362\u6A21\u5F0F)" },
  { tool: "select", icon: "mouse-pointer-2", label: "\u9009\u62E9\uFF08\u53CC\u51FB/\u957F\u6309\u5207\u6362\u6A21\u5F0F\uFF09" },
  { tool: "hand", icon: "hand", label: "\u62D6\u62FD\u9875\u9762 (G)" }
];
var SHAPES = [
  { tool: "line", icon: "minus", label: "\u76F4\u7EBF" },
  { tool: "arrow", icon: "arrow-up-right", label: "\u7BAD\u5934" },
  { tool: "rect", icon: "square", label: "\u77E9\u5F62" },
  { tool: "ellipse", icon: "circle", label: "\u692D\u5706" }
];
var PdfInkToolbar = class {
  constructor(plugin, controller) {
    this.plugin = plugin;
    this.controller = controller;
    this.toolButtons = /* @__PURE__ */ new Map();
    this.brushPanel = null;
    this.holdTimer = null;
    /*\n	 * update() runs on every commit (each finished stroke). Re-writing the same\n	 * text / icon / swatches each time is pure DOM churn: it costs us a little\n	 * and, worse, wakes up every plugin that watches the workspace with a\n	 * MutationObserver. Cache what was rendered and only touch what changed.\n	 */
    this.lastToggleIcon = "";
    this.lastQuickSignature = "";
    this.lastChipText = "";
    this.lastLayoutLabel = "";
    this.modeMenu = null;
    this.modeMenuAnchor = null;
    this.collapsed = false;
    this.suppressClick = false;
    this.dragState = null;
    /** pointer ids the drag grabbed, so they can always be released again */
    this.capturedPointers = /* @__PURE__ */ new Set();
    this.onOutsidePointerDown = (event) => {
      const target = event.target;
      if (this.modeMenu) {
        if (!this.modeMenu.contains(target) && !this.modeMenuAnchor?.contains(target)) {
          this.closeModeMenu();
        }
      }
    };
    this.onToolbarDragMove = (event) => {
      const state = this.dragState;
      if (!state) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (!state.active) {
        if (Math.hypot(dx, dy) < 4) return;
        state.active = true;
        this.cancelHold();
        this.applyPosition(state.left, state.top);
        try {
          this.el.setPointerCapture?.(event.pointerId);
          this.capturedPointers.add(event.pointerId);
        } catch {
        }
      }
      event.preventDefault();
      const hostRect = this.controller.containerEl.getBoundingClientRect();
      const left = clamp(
        state.left + dx,
        0,
        Math.max(0, hostRect.width - this.el.offsetWidth)
      );
      const top = clamp(
        state.top + dy,
        0,
        Math.max(0, hostRect.height - this.el.offsetHeight)
      );
      this.applyPosition(left, top);
    };
    this.onToolbarDragEnd = (event) => {
      const cancelled = event?.type === "pointercancel";
      const touchCancel = cancelled && event?.pointerType === "touch";
      this.releaseDragCapture();
      this.cancelHold();
      const state = this.dragState;
      this.dragState = null;
      window.removeEventListener("pointermove", this.onToolbarDragMove, true);
      window.removeEventListener("pointerup", this.onToolbarDragEnd, true);
      window.removeEventListener("pointercancel", this.onToolbarDragEnd, true);
      if (!state?.active) return;
      if (cancelled) {
        this.applyPosition(state.left, state.top);
        return;
      }
      if (touchCancel) return;
      this.suppressClick = true;
      window.setTimeout(() => {
        this.suppressClick = false;
      }, 50);
      this.plugin.setToolbarPosition({
        x: parseFloat(this.el.style.left) || 0,
        y: parseFloat(this.el.style.top) || 0
      });
    };
    const host = controller.containerEl;
    host.classList.add("pdf-ink-host");
    this.doc = host.ownerDocument;
    this.el = this.doc.createElement("div");
    this.el.className = "pdf-ink-toolbar";
    this.el.addEventListener(
      "pointerdown",
      (event) => this.onToolbarPointerDown(event)
    );
    this.el.addEventListener(
      "click",
      (event) => {
        if (!this.suppressClick) return;
        this.suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );
    this.build();
    host.appendChild(this.el);
    this.applySavedPosition();
    this.doc.addEventListener("pointerdown", this.onOutsidePointerDown, true);
    this.update();
  }
  build() {
    this.toggleButton = this.doc.createElement("button");
    this.toggleButton.type = "button";
    this.toggleButton.className = "pdf-ink-btn pdf-ink-toggle-btn";
    (0, import_obsidian3.setIcon)(this.toggleButton, "chevrons-right");
    (0, import_obsidian3.setTooltip)(this.toggleButton, "\u6536\u8D77\u5DE5\u5177\u680F");
    this.toggleButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.setCollapsed(!this.collapsed);
    });
    this.el.appendChild(this.toggleButton);
    for (const entry of TOOLS) {
      this.toolButton(entry.tool, entry.icon, entry.label);
    }
    this.divider();
    for (const entry of SHAPES) {
      this.toolButton(entry.tool, entry.icon, entry.label);
    }
    this.divider();
    this.colorChip = this.doc.createElement("div");
    this.colorChip.className = "pdf-ink-color-chip";
    this.colorDot = this.doc.createElement("span");
    this.colorDot.className = "pdf-ink-color-dot";
    this.colorChip.appendChild(this.colorDot);
    this.el.appendChild(this.colorChip);
    this.quickRow = this.doc.createElement("div");
    this.quickRow.className = "pdf-ink-quick-colors";
    this.el.appendChild(this.quickRow);
    this.divider();
    this.undoButton = this.button("undo-2", "\u64A4\u9500 (Ctrl+Z)", () => this.controller.undo());
    this.redoButton = this.button(
      "redo-2",
      "\u91CD\u505A (Ctrl+Shift+Z)",
      () => this.controller.redo()
    );
    this.divider();
    const layersButton = this.button(
      "layers",
      "\u56FE\u5C42\u9762\u677F",
      () => this.plugin.toggleLayersPanel(this.el)
    );
    layersButton.classList.add("pdf-ink-layers-button");
    this.layoutButton = this.button(
      "layout-template",
      "\u5207\u6362\u5DE5\u5177\u680F\u5E03\u5C40",
      () => this.plugin.cycleToolbarLayout()
    );
    this.layerChip = this.doc.createElement("button");
    this.layerChip.className = "pdf-ink-layer-chip";
    this.layerChip.type = "button";
    this.layerChip.addEventListener(
      "click",
      () => this.plugin.toggleLayersPanel(this.el)
    );
    (0, import_obsidian3.setTooltip)(this.layerChip, "\u5F53\u524D\u56FE\u5C42\uFF0C\u70B9\u51FB\u6253\u5F00\u56FE\u5C42\u9762\u677F");
    this.el.appendChild(this.layerChip);
  }
  toolButton(tool, icon, label) {
    const button = this.button(icon, label, () => this.plugin.setTool(tool));
    button.dataset.tool = tool;
    this.toolButtons.set(tool, button);
    if (tool === "select") this.bindModeMenu(button);
    else if (tool === "eraser" || tool === "pen" || tool === "highlighter") {
      this.bindBrushPanel(button, tool);
    }
  }
  /** Double click or long press opens the per-brush panel (single click still applies). */
  bindBrushPanel(anchor, kind) {
    const open = () => {
      this.plugin.setTool(kind);
      this.brushPanel ?? (this.brushPanel = new BrushPanel(this.plugin, this.doc));
      this.brushPanel.open(anchor, kind);
    };
    anchor.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      open();
    });
    anchor.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.armHold(() => {
        this.suppressClick = true;
        window.setTimeout(() => {
          this.suppressClick = false;
        }, 400);
        open();
      });
    });
    for (const type of ["pointercancel", "pointerleave"]) {
      anchor.addEventListener(type, () => this.cancelHold());
    }
  }
  armHold(callback, delay = 420) {
    this.cancelHold();
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = null;
      callback();
    }, delay);
  }
  cancelHold() {
    if (this.holdTimer !== null) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }
  bindModeMenu(anchor) {
    let timer = null;
    const open = () => this.openModeMenu(anchor);
    anchor.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      open();
    });
    anchor.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        open();
      }, 420);
    });
    const cancel = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    anchor.addEventListener("pointerup", cancel);
    anchor.addEventListener("pointerleave", cancel);
  }
  openModeMenu(anchor) {
    this.closeModeMenu();
    const settings = this.plugin.settings;
    const groups = [
      {
        title: "\u9009\u62E9\u533A\u57DF",
        axis: "select",
        options: [
          { value: "rect", label: "\u77E9\u5F62\u9009\u62E9" },
          { value: "lasso", label: "\u5957\u7D22\u9009\u62E9" }
        ]
      }
    ];
    const menu = this.doc.createElement("div");
    menu.className = "pdf-ink-mode-menu is-floating";
    for (const group of groups) {
      const heading = this.doc.createElement("div");
      heading.className = "pdf-ink-mode-heading";
      heading.textContent = group.title;
      menu.appendChild(heading);
      const current = group.axis === "scope" ? settings.eraserScope : group.axis === "region" ? settings.eraserRegion : settings.selectMode;
      for (const option of group.options) {
        const row = this.doc.createElement("button");
        row.type = "button";
        row.className = "pdf-ink-mode-option";
        if (option.value === current) row.classList.add("is-selected");
        const radio = this.doc.createElement("span");
        radio.className = "pdf-ink-radio";
        if (option.value === current) radio.classList.add("is-selected");
        const label = this.doc.createElement("span");
        label.textContent = option.label;
        row.append(radio, label);
        row.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.plugin.setSelectMode(option.value);
          this.refreshModeMenu(menu, groups);
        });
        menu.appendChild(row);
      }
    }
    this.doc.body.appendChild(menu);
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const toolbarRect = this.el.getBoundingClientRect();
    const gap = 6;
    const candidates = [
      { left: anchorRect.right + gap, top: anchorRect.top },
      { left: anchorRect.left - gap - menuRect.width, top: anchorRect.top },
      { left: anchorRect.left, top: anchorRect.bottom + gap },
      { left: anchorRect.left, top: anchorRect.top - gap - menuRect.height }
    ];
    let best = { left: 0, top: 0 };
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const left = clamp(candidate.left, 8, Math.max(8, window.innerWidth - menuRect.width - 8));
      const top = clamp(candidate.top, 8, Math.max(8, window.innerHeight - menuRect.height - 8));
      const box = { left, top, width: menuRect.width, height: menuRect.height };
      const overlap2 = overlapArea2(box, toolbarRect);
      const shifted = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
      const score = -overlap2 * 3 - shifted;
      if (score > bestScore) {
        bestScore = score;
        best = { left, top };
      }
    }
    menu.style.left = `${best.left}px`;
    menu.style.top = `${best.top}px`;
    this.modeMenu = menu;
    this.modeMenuAnchor = anchor;
  }
  refreshModeMenu(menu, groups) {
    const settings = this.plugin.settings;
    const rows = menu.querySelectorAll(".pdf-ink-mode-option");
    let index = 0;
    for (const group of groups) {
      const current = settings.selectMode;
      for (const option of group.options) {
        const row = rows[index++];
        if (!row) continue;
        const selected = option.value === current;
        row.classList.toggle("is-selected", selected);
        row.querySelector(".pdf-ink-radio")?.classList.toggle("is-selected", selected);
      }
    }
    void groups;
  }
  closeModeMenu() {
    this.modeMenu?.remove();
    this.modeMenu = null;
    this.modeMenuAnchor = null;
  }
  button(icon, label, onClick) {
    const button = this.doc.createElement("button");
    button.type = "button";
    button.className = "pdf-ink-btn";
    button.setAttribute("aria-label", label);
    (0, import_obsidian3.setIcon)(button, icon);
    (0, import_obsidian3.setTooltip)(button, label);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    this.el.appendChild(button);
    return button;
  }
  divider() {
    const divider = this.doc.createElement("div");
    divider.className = "pdf-ink-divider";
    this.el.appendChild(divider);
  }
  /** The one-row "quick colors" strip: click picks, long press replaces. */
  renderQuickColors() {
    const row = this.quickRow;
    const visible = this.plugin.tool !== "eraser" && this.plugin.tool !== "select";
    const current = visible ? this.currentBrush().color.toLowerCase() : "";
    const signature = `${visible ? "1" : "0"}|${current}|${this.plugin.settings.quickColors.join(",")}`;
    if (signature === this.lastQuickSignature) return;
    this.lastQuickSignature = signature;
    while (row.firstChild) row.removeChild(row.firstChild);
    row.classList.toggle("is-hidden", !visible);
    if (!visible) return;
    this.plugin.settings.quickColors.forEach((color, index) => {
      const swatch = this.doc.createElement("button");
      swatch.type = "button";
      swatch.className = "pdf-ink-quick-color";
      swatch.style.backgroundColor = color;
      swatch.setAttribute("aria-label", `${color}\uFF08\u957F\u6309\u66FF\u6362\u4E3A\u5F53\u524D\u7B14\u8272\uFF09`);
      (0, import_obsidian3.setTooltip)(swatch, `${color}\uFF08\u957F\u6309\u66FF\u6362\u4E3A\u5F53\u524D\u7B14\u8272\uFF09`);
      if (color.toLowerCase() === current) swatch.classList.add("is-active");
      swatch.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        this.armHold(() => {
          this.suppressClick = true;
          this.plugin.setQuickColor(index, this.currentBrush().color);
        }, 480);
      });
      swatch.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.plugin.setColor(color);
      });
      row.appendChild(swatch);
    });
  }
  /** Called when a stroke starts: popovers must not stay in the way. */
  closePopovers() {
    this.cancelHold();
    this.closeModeMenu();
    this.brushPanel?.close();
  }
  applySavedPosition() {
    const position = this.plugin.settings.toolbarPos;
    if (!position) return;
    const host = this.controller.containerEl;
    const hostRect = host.getBoundingClientRect();
    if (hostRect.width < 50 || hostRect.height < 50) return;
    this.applyPosition(
      clamp(position.x, 0, Math.max(0, hostRect.width - this.el.offsetWidth)),
      clamp(position.y, 0, Math.max(0, hostRect.height - this.el.offsetHeight))
    );
  }
  applyPosition(left, top) {
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    this.el.style.right = "auto";
    this.el.style.bottom = "auto";
  }
  onToolbarPointerDown(event) {
    event.stopPropagation();
    if (event.button !== 0) return;
    const target = event.target;
    if (target?.closest("input")) return;
    const hostRect = this.controller.containerEl.getBoundingClientRect();
    const rect = this.el.getBoundingClientRect();
    this.dragState = {
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left - hostRect.left,
      top: rect.top - hostRect.top,
      active: false
    };
    window.addEventListener("pointermove", this.onToolbarDragMove, true);
    window.addEventListener("pointerup", this.onToolbarDragEnd, true);
    window.addEventListener("pointercancel", this.onToolbarDragEnd, true);
  }
  releaseDragCapture() {
    try {
      for (const pointerId of this.capturedPointers) {
        if (this.el.hasPointerCapture?.(pointerId)) {
          this.el.releasePointerCapture(pointerId);
        }
      }
    } catch {
    }
    this.capturedPointers.clear();
  }
  setCollapsed(value) {
    this.collapsed = value;
    this.el.classList.toggle("is-collapsed", value);
    this.updateToggleIcon();
    if (!value) this.update();
  }
  updateToggleIcon() {
    const vertical = this.plugin.settings.toolbarLayout === "vertical";
    const icon = this.collapsed ? vertical ? "chevrons-up" : "chevrons-left" : vertical ? "chevrons-down" : "chevrons-right";
    if (this.lastToggleIcon !== icon) {
      this.lastToggleIcon = icon;
      (0, import_obsidian3.setIcon)(this.toggleButton, icon);
      (0, import_obsidian3.setTooltip)(this.toggleButton, this.collapsed ? "\u5C55\u5F00\u5DE5\u5177\u680F" : "\u6536\u8D77\u5DE5\u5177\u680F");
    }
  }
  currentBrush() {
    return this.plugin.brushFor(this.plugin.tool);
  }
  update() {
    const layout = this.plugin.settings.toolbarLayout ?? "horizontal";
    this.el.classList.toggle("pdf-ink-layout-vertical", layout === "vertical");
    this.el.classList.toggle("pdf-ink-layout-square", layout === "square");
    this.updateToggleIcon();
    for (const [tool, button] of this.toolButtons) {
      button.classList.toggle("is-active", this.plugin.tool === tool);
    }
    const brush = this.currentBrush();
    this.colorDot.style.backgroundColor = brush.color;
    this.colorChip.classList.toggle("is-dim", this.plugin.tool === "eraser");
    this.renderQuickColors();
    this.undoButton.disabled = !this.controller.history.canUndo;
    this.redoButton.disabled = !this.controller.history.canRedo;
    const layoutLabel = `\u5207\u6362\u5DE5\u5177\u680F\u5E03\u5C40\uFF08\u5F53\u524D\uFF1A${this.plugin.settings.toolbarLayout === "vertical" ? "\u7EB5\u5411" : this.plugin.settings.toolbarLayout === "square" ? "\u65B9\u5F62" : "\u6A2A\u5411"}\uFF09`;
    if (this.layoutButton && this.lastLayoutLabel !== layoutLabel) {
      this.lastLayoutLabel = layoutLabel;
      this.layoutButton.setAttribute("aria-label", layoutLabel);
    }
    const doc = this.controller.doc;
    const layer = doc ? doc.layers.find((entry) => entry.id === doc.activeLayerId) : null;
    const chipText = layer ? `\u56FE\u5C42\uFF1A${layer.name}` : "\u65E0\u56FE\u5C42";
    if (this.lastChipText !== chipText) {
      this.lastChipText = chipText;
      this.layerChip.textContent = chipText;
    }
    this.layerChip.classList.toggle(
      "is-warning",
      !!layer && (!layer.visible || layer.locked)
    );
  }
  destroy() {
    this.cancelHold();
    this.brushPanel?.close();
    this.brushPanel = null;
    this.closeModeMenu();
    this.doc.removeEventListener("pointerdown", this.onOutsidePointerDown, true);
    this.el.remove();
  }
};
function overlapArea2(box, other) {
  const right = "width" in box ? box.left + box.width : 0;
  const bottom = box.top + box.height;
  const otherRight = "right" in other ? other.right : 0;
  const otherBottom = "bottom" in other ? other.bottom : 0;
  const w = Math.min(right, otherRight) - Math.max(box.left, other.left);
  const h = Math.min(bottom, otherBottom) - Math.max(box.top, other.top);
  return w > 0 && h > 0 ? w * h : 0;
}

// src/controller.ts
var SHAPE_TOOLS = ["line", "arrow", "rect", "ellipse"];
var MIN_POINT_DISTANCE_PX = 1.2;
var MIN_SHAPE_SIZE_PX = 3;
var THIN_BRUSH_PX = 6;
var HOLD_CANCEL_PX = 5;
var HOLD_POLL_MS = 60;
function translateStroke(stroke, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const points = stroke.points;
  for (let i = 0; i + 1 < points.length; i += 3) {
    points[i] += dx;
    points[i + 1] += dy;
  }
  for (const ring of stroke.rings ?? []) {
    for (let i = 0; i + 1 < ring.length; i += 2) {
      ring[i] += dx;
      ring[i + 1] += dy;
    }
  }
}
function boundsOf(strokes) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const visit = (x, y) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (const stroke of strokes) {
    for (let i = 0; i + 1 < stroke.points.length; i += 3) {
      visit(stroke.points[i], stroke.points[i + 1]);
    }
    for (const ring of stroke.rings ?? []) {
      for (let i = 0; i + 1 < ring.length; i += 2) visit(ring[i], ring[i + 1]);
    }
  }
  return { x0, y0, x1, y1 };
}
function toPagePoints(points, pageW, pageH) {
  const out = [];
  for (let i = 0; i < points.length; i += 3) {
    out.push([points[i] * pageW, points[i + 1] * pageH]);
  }
  return out;
}
function distanceToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = 0;
  if (lengthSq > 0) {
    t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = clamp(t, 0, 1);
  }
  const x = ax + t * dx;
  const y = ay + t * dy;
  return (px - x) * (px - x) + (py - y) * (py - y);
}
var PdfInkController = class {
  constructor(plugin, leaf) {
    this.doc = null;
    this.filePath = null;
    this.drawing = false;
    this.toolbar = null;
    this.history = new History(250);
    this.overlays = /* @__PURE__ */ new Map();
    this.pageEls = /* @__PURE__ */ new Map();
    this.component = null;
    this.pdfWrapper = null;
    this.resolvingViewer = false;
    this.hookedBus = null;
    this.busHandlers = [];
    this.domObserver = null;
    this.pageResizeObserver = null;
    this.observedPages = /* @__PURE__ */ new Set();
    this.attachTimer = null;
    this.io = null;
    this.session = null;
    this.erased = null;
    this.externalOverlay = null;
    this.activePointerId = null;
    this.strokeListenersAttached = false;
    this.strokeWatchdog = null;
    this.zeroMoves = 0;
    this.moveLogCount = 0;
    this.eraserCursor = null;
    this.brushRing = null;
    /** overlay the user last touched; paste and menus target its page */
    this.lastOverlay = null;
    /** last pen position over a page, even while hovering */
    this.hoverPoint = null;
    /** set when a long, light press should select instead of erase */
    this.holdSelectAt = null;
    this.lastTapStrokeId = null;
    this.lastTapStrokeAt = 0;
    this.lastTap = null;
    /** selection mode was entered by a pen long press (temporary) */
    this.selectEnteredByHold = false;
    this.selectionMenu = null;
    this.selection = null;
    this.selectSession = null;
    this.moveSession = null;
    this.transformSession = null;
    /** hand tool: pointer drag scrolls the PDF viewer */
    this.panSession = null;
    this.liveRaf = 0;
    this.lastLiveAt = 0;
    /** hold-to-erase timer and the point it was armed at */
    this.holdTimer = null;
    this.selectHoldTimer = null;
    this.holdOrigin = null;
    /** true while the current erase came from a long press, not the eraser tool */
    this.pressureErasing = false;
    /** fires while the pen rests at the end of a shape-like stroke */
    this.shapeHoldTimer = null;
    /** perf.now() of the last pen pointerdown, used to suppress its context menu */
    this.lastPenAt = 0;
    /** Rect measured once per stroke: getBoundingClientRect on a 749-page
     * viewer can trigger a forced layout (~40-80 ms in the perf samples). */
    this.rectCache = null;
    this.layoutHooked = false;
    this.onLayoutShift = () => {
      this.rectCache = null;
    };
    this.eraseRaf = 0;
    this.renderQueued = false;
    this.loadingPath = null;
    this.toolbarDismissed = false;
    this.altHeld = false;
    this.lastNotice = 0;
    this.lastSetupAt = 0;
    this.destroyed = false;
    /** compat-mouse events are swallowed until this perf.now() timestamp */
    this.compatShieldUntil = 0;
    /**
     * Compatibility mouse events that follow a pen / mouse stroke.
     *
     * Other plugins routinely react to `mousedown` / `mouseup` / `click` on the
     * workspace (toolbar re-layouts, selection scans, index updates…). When they
     * do that between two pen samples they push the next `pointermove` behind
     * 100 ms+ of unrelated work, which is exactly what "writing feels sticky"
     * looks like. The events are already defaultPrevented by us, but plugins
     * listening on `document` still see them, so they are stopped here — only
     * for the stroke itself and a short tail, only over a PDF page.
     */
    this.onCompatMouse = (event) => {
      if (!this.isStroking && perf.now() > this.compatShieldUntil) return;
      const target = event.target;
      if (!target?.closest?.(".pdf-container")) return;
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    /** `perf.now()` of the last finished stroke, for long-task attribution. */
    this.lastCommitAt = 0;
    this.onStrokePointerMove = (event) => {
      const overlay = this.session?.overlay ?? this.erased?.overlay ?? this.selectSession?.overlay ?? this.moveSession?.overlay ?? this.transformSession?.overlay;
      if (!overlay) return;
      if (this.activePointerId !== null && event.pointerId !== this.activePointerId) {
        return;
      }
      if (this.selectSession || this.moveSession || this.transformSession) {
        this.resetStrokeWatchdog();
        this.onPointerMove(event, overlay);
        return;
      }
      this.moveLogCount++;
      if (this.moveLogCount <= 20 || this.moveLogCount % 15 === 0) {
        this.plugin.log(
          `move#${this.moveLogCount} id=${event.pointerId} type=${event.pointerType} b=${event.buttons} p=${Number(event.pressure ?? 0).toFixed(2)}`
        );
      }
      const zeroPressure = (event.pressure ?? 0) <= 1e-3;
      const hovering = event.pointerType === "pen" ? event.buttons === 0 && zeroPressure : event.buttons === 0;
      if (hovering) {
        this.zeroMoves++;
        if (this.zeroMoves >= 3) {
          this.plugin.log(
            `stroke end on hover type=${event.pointerType} buttons=${event.buttons} pressure=${event.pressure}`
          );
          this.onPointerUp(event, overlay);
          this.detachStrokeListeners();
          this.setStroking(false);
        }
        return;
      }
      this.zeroMoves = 0;
      this.resetStrokeWatchdog();
      this.onPointerMove(event, overlay);
    };
    this.onStrokePointerUp = (event) => {
      const overlay = this.session?.overlay ?? this.erased?.overlay ?? this.selectSession?.overlay ?? this.moveSession?.overlay ?? this.transformSession?.overlay;
      if (!overlay) {
        this.detachStrokeListeners();
        return;
      }
      if (this.activePointerId !== null && event.pointerId !== this.activePointerId) {
        return;
      }
      if (event.type === "pointercancel" && event.pointerType !== "touch") {
        this.plugin.log(
          `pointercancel ignored type=${event.pointerType} b=${event.buttons} p=${event.pressure}`
        );
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.onPointerUp(event, overlay);
      this.detachStrokeListeners();
    };
    this.onLostPointerCapture = () => {
      const overlay = this.session?.overlay ?? this.erased?.overlay;
      if (!overlay || this.activePointerId === null) return;
      try {
        overlay.live.setPointerCapture(this.activePointerId);
      } catch {
      }
    };
    /**
     * Auto shape recognition fires while the pen is still resting, not only on
     * lift — otherwise the user has to hold for seconds before it converts.
     * It only commits when the stroke actually looks like a shape, so pausing
     * in the middle of handwriting never cuts the stroke.
     */
    this.shapeHoldArmedAt = 0;
    this.onPanMove = (event) => {
      const pan = this.panSession;
      if (!pan || event.pointerId !== pan.pointerId) return;
      event.preventDefault();
      pan.scroller.scrollLeft = pan.left - (event.clientX - pan.startX);
      pan.scroller.scrollTop = pan.top - (event.clientY - pan.startY);
    };
    this.onPanEnd = (event) => {
      const pan = this.panSession;
      if (!pan || event.pointerId !== pan.pointerId) return;
      this.panSession = null;
      this.containerEl.classList.remove("pdf-ink-panning");
      window.removeEventListener("pointermove", this.onPanMove, true);
      window.removeEventListener("pointerup", this.onPanEnd, true);
      window.removeEventListener("pointercancel", this.onPanEnd, true);
    };
    this.pendingLive = null;
    this.onHoverPointerMove = (event) => {
      this.updateHoverCursor(event);
      this.rememberHover(event);
    };
    this.hideEraserCursor = () => {
      if (this.eraserCursor) this.eraserCursor.style.display = "none";
    };
    /** Pointer left the page (or the tool changed): drop every cursor hint. */
    this.hideHoverCursor = () => {
      this.hideEraserCursor();
      this.hideBrushRing();
      this.containerEl.classList.remove("pdf-ink-cursor-point", "pdf-ink-cursor-ring");
    };
    this.applyAltPassthrough = () => {
      const allow = this.altHeld && this.plugin.tool === "select";
      this.containerEl.classList.toggle("pdf-ink-alt", allow);
    };
    /**
     * Chromium synthesizes a `contextmenu` event from a long pen press. If we
     * only guard the canvas, the event still reaches the editor's handlers, so
     * the guard lives on the document in the capture phase. Mouse right-clicks
     * are left alone so PDF++ menus keep working.
     */
    this.onDocumentContextMenu = (event) => {
      const target = event.target;
      if (!target || !this.containerEl.contains(target)) return;
      const penRecent = perf.now() - this.lastPenAt < 5e3;
      if (!this.drawing && !penRecent) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    this.plugin = plugin;
    this.leaf = leaf;
    this.view = leaf.view;
    this.containerEl.addEventListener("pointermove", this.onHoverPointerMove);
    this.containerEl.addEventListener("pointerleave", this.hideHoverCursor);
    for (const type of ["mousedown", "mouseup", "click", "dblclick"]) {
      window.addEventListener(type, this.onCompatMouse, true);
    }
  }
  /** Clipboard lives on the plugin so it survives tab switches. */
  get clipboard() {
    return this.plugin.inkClipboard;
  }
  set clipboard(value) {
    this.plugin.inkClipboard = value;
  }
  get containerEl() {
    return this.view.containerEl;
  }
  get viewerEl() {
    const fromWrapper = this.pdfWrapper?.dom?.viewerEl;
    if (fromWrapper?.isConnected) return fromWrapper;
    const container = this.containerEl;
    if (!container?.querySelector) return null;
    return container.querySelector(".pdf-container .pdfViewer") ?? container.querySelector(".pdfViewer") ?? null;
  }
  get viewerContainerEl() {
    const fromWrapper = this.pdfWrapper?.dom?.viewerContainerEl;
    if (fromWrapper?.isConnected) return fromWrapper;
    return this.viewerEl?.parentElement ?? null;
  }
  get eventBus() {
    const wrapper = this.pdfWrapper;
    return wrapper?.eventBus ?? wrapper?.pdfViewer?.eventBus ?? null;
  }
  get hasViewer() {
    return Boolean(this.viewerEl);
  }
  /** Anchor for floating panels; null when the toolbar is hidden. */
  get toolbarEl() {
    return this.toolbar?.el ?? null;
  }
  get isAlive() {
    return !this.destroyed;
  }
  /** True while a pointer session is open; used to hold off disk writes. */
  get isStroking() {
    return Boolean(
      this.session || this.erased || this.selectSession || this.moveSession || this.transformSession
    );
  }
  /** Which pointer session is open, for diagnostics and tests. */
  get sessionKind() {
    if (this.session) return this.session.type;
    if (this.erased) return "erase";
    if (this.selectSession) return "select";
    if (this.moveSession) return "move";
    if (this.transformSession) return "transform";
    return null;
  }
  /**
   * Wipes every stroke in the document (layers stay). Destructive: the caller
   * confirms first. A `.bak` snapshot is written before anything changes.
   */
  clearAllInk() {
    const doc = this.doc;
    if (!doc) return 0;
    let removed = 0;
    for (const layer of doc.layers) {
      removed += layer.strokes.length;
      layer.strokes = [];
    }
    if (removed === 0) return 0;
    this.selection = null;
    this.selectionMenu?.close();
    this.finishInteractions();
    this.history.clear();
    if (this.filePath) void this.plugin.storage.backupOnce(this.filePath);
    this.plugin.log(`cleared all ink: ${removed} strokes`);
    this.renderNow();
    this.markDirty();
    this.refreshToolbar();
    return removed;
  }
  /**
   * Panic button: drop every half-open session so the next pen-down starts
   * clean. Needed because a driver can cancel a pointer at a bad moment and
   * leave the plugin convinced a stroke is still in flight.
   */
  resetInputState() {
    this.finishInteractions();
    this.activePointerId = null;
    this.lastTap = null;
    this.hoverPoint = null;
    this.plugin.log(`reset input state (was ${this.sessionKind ?? "idle"})`);
  }
  /**
   * Diagnostics only: hide our ink canvases so an idle long-task count can be
   * compared with and without them. "live" keeps the committed canvas (the
   * ink itself) and drops only the in-progress layer, which tells us which of
   * the two costs the compositor its time.
   */
  setInkHidden(mode) {
    for (const overlay of this.overlays.values()) {
      const hideLive = mode === "live" || mode === "all";
      const hideCommitted = mode === "all";
      overlay.live.style.display = hideLive ? "none" : "";
      overlay.committed.style.display = hideCommitted ? "none" : "";
    }
  }
  /** How many canvases we currently keep alive, for the diagnostics export. */
  get canvasCount() {
    return this.overlays.size * 2;
  }
  attach(retries = 80) {
    if (this.destroyed) return;
    if (this.attachTimer !== null) {
      window.clearTimeout(this.attachTimer);
      this.attachTimer = null;
    }
    this.ensureDomObserver();
    void this.resolveViewer();
    if (!this.hasViewer) {
      this.plugin.log(`attach: no viewer element yet (retries=${retries})`);
      if (retries > 0) this.scheduleAttach(retries - 1);
      return;
    }
    this.containerEl.classList.toggle(
      "pdf-ink-pen-mode",
      this.plugin.settings.stylusFreehand
    );
    this.ensureHooked();
    this.hookLayoutListeners();
    this.setupPages();
    void this.ensureFile();
    this.refreshToolbar();
    this.plugin.log(
      `attach retries=${retries} pages=${this.pageEls.size} overlays=${this.overlays.size} file=${this.view?.file?.path ?? "-"} doc=${Boolean(this.doc)}`
    );
    if ((!this.doc || this.pageEls.size === 0) && retries > 0) {
      this.scheduleAttach(retries - 1);
    }
  }
  /**
   * Obsidian 1.12 exposes the PDF viewer as `view.viewer`, a thenable
   * component wrapper whose child holds `pdfViewer` (dom + eventBus).
   * DOM lookup is the primary source of truth; this only adds the event bus.
   */
  async resolveViewer() {
    if (this.pdfWrapper || this.resolvingViewer) return;
    const holder = this.view?.viewer;
    if (!holder) return;
    this.resolvingViewer = true;
    try {
      let child = holder.child ?? null;
      if (!child && typeof holder.then === "function") {
        child = await new Promise((resolve) => {
          const timer = window.setTimeout(() => resolve(null), 1500);
          try {
            holder.then((value) => {
              window.clearTimeout(timer);
              resolve(value);
            });
          } catch {
            window.clearTimeout(timer);
            resolve(null);
          }
        });
      }
      if (!child) return;
      this.component = child;
      this.pdfWrapper = child.pdfViewer ?? null;
      this.plugin.log(
        `viewer resolved child=${Boolean(child)} wrapper=${Boolean(
          this.pdfWrapper
        )} dom=${this.pdfWrapper?.dom ? Object.keys(this.pdfWrapper.dom).join(",") : "-"}`
      );
      if (this.pdfWrapper) {
        this.ensureHooked();
        this.setupPages();
        this.refreshToolbar();
        void this.ensureFile();
      }
    } finally {
      this.resolvingViewer = false;
    }
  }
  scheduleAttach(retries) {
    if (retries <= 0 || this.destroyed) return;
    this.attachTimer = window.setTimeout(() => {
      this.attachTimer = null;
      this.attach(retries - 1);
    }, 150);
  }
  ensureOverlaysAttached() {
    const active = this.externalOverlay ?? this.session?.overlay ?? this.erased?.overlay ?? null;
    for (const overlay of this.overlays.values()) {
      if (!overlay.ensureAttached()) continue;
      overlay.measure();
      overlay.render();
      if (this.activePointerId !== null && overlay === active) {
        try {
          overlay.live.setPointerCapture(this.activePointerId);
        } catch {
        }
      }
    }
  }
  ensureDomObserver() {
    if (this.domObserver || typeof MutationObserver === "undefined") return;
    const container = this.containerEl;
    if (!container) return;
    this.domObserver = new MutationObserver(() => {
      if (this.destroyed) return;
      this.ensureOverlaysAttached();
      const now = Date.now();
      if (now - this.lastSetupAt < 250) return;
      this.lastSetupAt = now;
      if (!this.hasViewer) return;
      this.setupPages();
      this.refreshToolbar();
    });
    this.domObserver.observe(container, { childList: true, subtree: true });
  }
  ensurePageResizeObserver() {
    if (this.pageResizeObserver) return this.pageResizeObserver;
    if (typeof ResizeObserver === "undefined") return null;
    this.pageResizeObserver = new ResizeObserver((entries) => {
      this.rectCache = null;
      for (const entry of entries) {
        const el2 = entry.target;
        const pageNumber = Number(el2.dataset.pageNumber);
        const overlay = this.overlays.get(pageNumber);
        if (overlay) {
          overlay.measure();
          overlay.render();
        }
      }
    });
    return this.pageResizeObserver;
  }
  ensureHooked() {
    const bus = this.eventBus;
    if (!bus?.on) return false;
    if (this.hookedBus === bus) return true;
    this.unhook();
    this.hookedBus = bus;
    const onPages = () => {
      this.setupPages();
      void this.ensureFile();
    };
    const onPageRendered = (event) => {
      const pageNumber = Number(event?.pageNumber);
      if (!this.pageEls.has(pageNumber)) {
        this.setupPagesThrottled();
      }
      const overlay = this.overlays.get(pageNumber);
      if (overlay) {
        overlay.ensureAttached();
        overlay.measure();
        overlay.render();
      } else if (this.pageEls.has(pageNumber)) {
        this.mount(pageNumber);
      }
    };
    const onScale = () => this.scheduleDeferredRender();
    this.busHandlers = [
      ["pagesloaded", onPages],
      ["pagerendered", onPageRendered],
      ["scalechanging", onScale],
      ["pagechanging", onScale]
    ];
    for (const [name, handler] of this.busHandlers) bus.on(name, handler);
    return true;
  }
  unhook() {
    const bus = this.hookedBus;
    if (bus?.off) {
      for (const [name, handler] of this.busHandlers) bus.off(name, handler);
    }
    this.busHandlers = [];
    this.hookedBus = null;
  }
  setupPages() {
    const viewerEl = this.viewerEl;
    if (!viewerEl) return;
    let pages = Array.from(
      viewerEl.querySelectorAll("div.page[data-page-number]")
    );
    if (pages.length === 0) {
      pages = Array.from(
        viewerEl.querySelectorAll("[data-page-number]")
      ).filter((el2) => {
        const n = Number(el2.dataset.pageNumber);
        return Number.isFinite(n) && n >= 1 && el2.querySelector(".canvasWrapper, canvas");
      });
    }
    if (pages.length === 0) {
      this.plugin.log("setupPages: no page elements found");
      return;
    }
    const next = /* @__PURE__ */ new Map();
    for (const el2 of pages) {
      const pageNumber = Number(el2.dataset.pageNumber);
      if (Number.isFinite(pageNumber) && pageNumber >= 1) {
        next.set(pageNumber, el2);
      }
    }
    let changed = next.size !== this.pageEls.size;
    if (!changed) {
      for (const [pageNumber, el2] of next) {
        if (this.pageEls.get(pageNumber) !== el2) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) {
      this.ensureOverlaysAttached();
      return;
    }
    this.pageEls.clear();
    for (const [pageNumber, el2] of next) this.pageEls.set(pageNumber, el2);
    this.plugin.log(`setupPages: found=${pages.length} mapped=${this.pageEls.size}`);
    for (const [pageNumber, overlay] of [...this.overlays]) {
      const el2 = this.pageEls.get(pageNumber);
      if (!el2 || el2 === overlay.pageEl) continue;
      this.replaceOverlay(pageNumber, overlay, el2);
    }
    this.ensureObserver();
    const observer = this.io;
    if (observer) {
      const current = new Set(this.pageEls.values());
      for (const el2 of [...this.observedPages]) {
        if (!current.has(el2)) {
          observer.unobserve(el2);
          this.observedPages.delete(el2);
        }
      }
      for (const el2 of current) {
        if (this.observedPages.has(el2)) continue;
        observer.observe(el2);
        this.observedPages.add(el2);
      }
    } else {
      for (const pageNumber of this.pageEls.keys()) this.mount(pageNumber);
    }
    this.mountVisible();
    this.ensureOverlaysAttached();
  }
  setupPagesThrottled() {
    const now = Date.now();
    if (now - this.lastSetupAt < 300) return;
    this.lastSetupAt = now;
    this.setupPages();
  }
  ensureObserver() {
    if (this.io) return;
    if (typeof IntersectionObserver === "undefined") return;
    const root = this.viewerContainerEl;
    this.io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el2 = entry.target;
          const pageNumber = Number(el2.dataset.pageNumber);
          if (!Number.isFinite(pageNumber)) continue;
          if (entry.isIntersecting) this.mount(pageNumber);
          else if (!this.drawing) {
            const overlay = this.overlays.get(pageNumber);
            if (overlay && (this.session?.overlay === overlay || this.erased?.overlay === overlay)) {
              continue;
            }
            this.unmount(pageNumber);
          }
        }
      },
      { root, rootMargin: "120% 0px" }
    );
  }
  mount(pageNumber) {
    if (this.destroyed || this.overlays.has(pageNumber)) return;
    const pageEl = this.pageEls.get(pageNumber);
    if (!pageEl) return;
    const overlay = new PageOverlay(pageEl, pageNumber);
    overlay.setDoc(this.doc);
    this.bindOverlay(overlay);
    overlay.measure();
    overlay.render();
    this.overlays.set(pageNumber, overlay);
    this.ensurePageResizeObserver()?.observe(pageEl);
    this.syncPointerTargets(false);
  }
  /** True while the plugin is the one handling page input. */
  ownsPage() {
    return this.drawing || this.plugin.settings.stylusFreehand || Boolean(this.session || this.erased);
  }
  bindOverlay(overlay) {
    overlay.live.addEventListener(
      "pointerdown",
      (event) => this.onPointerDown(event, overlay)
    );
    overlay.live.addEventListener("contextmenu", (event) => {
      if (this.ownsPage()) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }
  /**
   * pdf.js may replace the whole `.page` element. Move an in-progress stroke
   * to the new overlay instead of silently dropping it.
   */
  replaceOverlay(pageNumber, oldOverlay, pageEl) {
    const active = this.session?.overlay === oldOverlay || this.erased?.overlay === oldOverlay;
    const overlay = new PageOverlay(pageEl, pageNumber);
    overlay.setDoc(this.doc);
    this.bindOverlay(overlay);
    this.overlays.set(pageNumber, overlay);
    if (active) {
      if (this.session?.overlay === oldOverlay) this.session.overlay = overlay;
      if (this.erased?.overlay === oldOverlay) this.erased.overlay = overlay;
      if (this.externalOverlay === oldOverlay) this.externalOverlay = overlay;
    }
    try {
      this.pageResizeObserver?.unobserve(oldOverlay.pageEl);
    } catch {
    }
    oldOverlay.destroy();
    this.ensurePageResizeObserver()?.observe(pageEl);
    overlay.measure();
    overlay.render();
    if (active && this.activePointerId !== null) {
      try {
        overlay.live.setPointerCapture(this.activePointerId);
      } catch {
      }
    }
    this.plugin.log(`replaceOverlay page=${pageNumber} active=${active}`);
  }
  unmount(pageNumber) {
    const overlay = this.overlays.get(pageNumber);
    if (!overlay) return;
    if (this.session?.overlay === overlay) this.session = null;
    if (this.erased?.overlay === overlay) this.erased = null;
    try {
      this.pageResizeObserver?.unobserve(overlay.pageEl);
    } catch {
    }
    overlay.destroy();
    this.overlays.delete(pageNumber);
  }
  mountVisible() {
    if (typeof window === "undefined") return;
    const viewportHeight = this.viewerContainerEl?.clientHeight || window.innerHeight;
    for (const [pageNumber, el2] of this.pageEls) {
      const rect = el2.getBoundingClientRect();
      if (rect.bottom > -viewportHeight && rect.top < viewportHeight * 2) {
        this.mount(pageNumber);
      }
    }
  }
  async ensureFile() {
    const file = this.view?.file ?? this.component?.file;
    if (!file || file.extension !== "pdf") {
      this.plugin.log(
        `ensureFile: no pdf file yet file=${String(this.view?.file?.path ?? "-")}`
      );
      return;
    }
    if (this.loadingPath === file.path) return;
    if (this.filePath === file.path && this.doc) return;
    this.plugin.log(`ensureFile: start ${file.path}`);
    this.loadingPath = file.path;
    this.filePath = file.path;
    this.history.clear();
    this.doc = null;
    this.renderNow();
    this.refreshToolbar();
    this.notify();
    let doc = null;
    try {
      doc = await this.plugin.storage.load(file.path);
    } finally {
      if (this.loadingPath === file.path) this.loadingPath = null;
    }
    if (this.destroyed || this.filePath !== file.path) return;
    if (!doc) doc = createDoc(file.path);
    this.doc = doc;
    this.plugin.log(
      `ensureFile: loaded ${file.path} layers=${doc.layers.length}`
    );
    this.purgeLegacyEraserMasks();
    this.renderNow();
    this.refreshToolbar();
    this.notify();
  }
  /**
   * Drops every stored eraser mask. Their ink was "erased" by drawing on top
   * of it, so removing the mask means that ink shows again — which is exactly
   * what the user asked for. One `.bak` is written before the first purge.
   */
  purgeLegacyEraserMasks() {
    const doc = this.doc;
    if (!doc) return 0;
    let removed = 0;
    for (const layer of doc.layers) {
      const before = layer.strokes.length;
      layer.strokes = layer.strokes.filter((stroke) => {
        if (!stroke.kind.startsWith("eraser")) return true;
        removed++;
        return false;
      });
      if (layer.strokes.length !== before) {
      }
    }
    if (removed === 0) return 0;
    this.plugin.log(`purged ${removed} legacy eraser masks`);
    if (this.filePath) void this.plugin.storage.backupOnce(this.filePath);
    this.history.clear();
    this.markDirty();
    return removed;
  }
  onVaultRename(oldPath, newPath) {
    if (this.filePath !== oldPath) return;
    this.filePath = newPath;
    if (this.doc) this.doc.file = newPath;
    this.notify();
  }
  /** Switching tools must drop the selection: its dashed box is tool UI. */
  onToolChanged() {
    this.selectionMenu?.close();
    if (this.plugin.tool !== "select") this.selectEnteredByHold = false;
    if (this.plugin.tool === "select") return;
    this.clearSelection();
  }
  setDrawing(on) {
    if (this.destroyed) return;
    if (on) {
      this.toolbarDismissed = false;
      this.attach();
      void this.ensureFile();
    }
    this.drawing = on;
    this.containerEl.classList.toggle("pdf-ink-drawing", on);
    this.containerEl.classList.toggle(
      "pdf-ink-pen-mode",
      this.plugin.settings.stylusFreehand
    );
    if (on) {
      this.setupPages();
      this.mountVisible();
    } else {
      this.finishInteractions();
    }
    this.syncPointerTargets(false);
    this.refreshToolbar();
    this.plugin.emitter.trigger("pdf-ink:active-changed");
    this.notify();
  }
  toggleDrawing() {
    this.setDrawing(!this.drawing);
  }
  dismissToolbar() {
    this.toolbarDismissed = true;
    this.setDrawing(false);
  }
  refreshToolbar() {
    this.containerEl.classList.toggle("pdf-ink-tool-hand", this.plugin.tool === "hand");
    this.applyAltPassthrough();
    this.containerEl.classList.toggle(
      "pdf-ink-pen-mode",
      this.plugin.settings.stylusFreehand || this.plugin.settings.mouseFreehand
    );
    if (!this.eraserDiscVisible()) this.hideEraserCursor();
    if (this.plugin.tool !== "pen" && this.plugin.tool !== "highlighter") {
      this.hideBrushRing();
      this.containerEl.classList.remove("pdf-ink-cursor-point", "pdf-ink-cursor-ring");
    }
    const wanted = Boolean(this.viewerEl) && !this.toolbarDismissed && (this.drawing || this.plugin.settings.showToolbarAlways);
    if (wanted) {
      if (!this.toolbar) this.toolbar = new PdfInkToolbar(this.plugin, this);
      else this.toolbar.update();
    } else if (this.toolbar) {
      this.toolbar.destroy();
      this.toolbar = null;
    }
  }
  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */
  pointFor(event, overlay, rect) {
    const box = rect ?? this.rectFor(overlay);
    if (!box || box.width < 2 || box.height < 2) return null;
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const pressure = event.pointerType === "pen" && Number.isFinite(event.pressure) ? clamp(event.pressure, 0, 1) : 0.5;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), p: pressure };
  }
  rectFor(overlay, refresh = false) {
    if (!refresh && this.rectCache && this.rectCache.overlay === overlay) {
      return this.rectCache.box;
    }
    const box = overlay.live.getBoundingClientRect();
    this.rectCache = { overlay, box };
    return box;
  }
  onPointerDown(event, overlay) {
    if (!this.drawing || !this.doc) return;
    this.toolbar?.closePopovers();
    if (this.plugin.strokeBlocked()) {
      this.plugin.log("stroke blocked in drawing mode (hold release guard)");
      return;
    }
    if (event.shiftKey && (this.plugin.tool === "pen" || this.plugin.tool === "highlighter")) {
      return;
    }
    this.selectionMenu?.close();
    if (this.plugin.tool !== "select") this.clearSelection();
    if (this.session || this.erased) this.finishInteractions();
    if (event.altKey) return;
    if (event.button !== 0) return;
    const rect = this.rectFor(overlay, true);
    if (rect.width < 2 || rect.height < 2) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const downPoint = this.pointFor(event, overlay, rect);
    if (downPoint && this.maybeDoubleTap(overlay, event, downPoint, rect)) {
      this.activePointerId = null;
      this.setStroking(false);
      return;
    }
    this.plugin.log(
      `down id=${event.pointerId} type=${event.pointerType} b=${event.buttons} p=${Number(
        event.pressure ?? 0
      ).toFixed(2)}`
    );
    this.toolbar?.closePopovers();
    this.lastOverlay = overlay;
    this.activePointerId = event.pointerId;
    if (event.pointerType === "pen") this.lastPenAt = perf.now();
    this.lastLiveAt = 0;
    try {
      overlay.live.setPointerCapture(event.pointerId);
    } catch {
    }
    this.beginToolAt(overlay, event);
    if (this.session || this.erased || this.selectSession || this.moveSession || this.transformSession) {
      this.attachStrokeListeners();
    }
  }
  /**
   * Entry point for "pen draws without entering draw mode". Called from the
   * document level capture listener installed by the plugin.
   */
  beginExternalStroke(event, pageEl) {
    if (this.destroyed) return false;
    this.toolbar?.closePopovers();
    if (this.session || this.erased) this.finishInteractions();
    const pageNumber = Number(pageEl.dataset.pageNumber);
    if (!Number.isFinite(pageNumber)) return false;
    if (!this.doc) {
      this.plugin.log(
        `external: doc not ready file=${this.view?.file?.path ?? "-"} pages=${this.pageEls.size}`
      );
      void this.ensureFile().then(() => {
        this.notice("\u6279\u6CE8\u6B63\u5728\u52A0\u8F7D\uFF0C\u8BF7\u518D\u5199\u4E00\u6B21");
      });
      this.plugin.dumpDiagnostics("doc-not-ready");
      return false;
    }
    if (!this.pageEls.has(pageNumber)) this.setupPages();
    this.mount(pageNumber);
    const overlay = this.overlays.get(pageNumber);
    if (!overlay) {
      this.plugin.log(
        `external: no overlay page=${pageNumber} pageEls=${this.pageEls.size} viewer=${this.hasViewer}`
      );
      this.plugin.dumpDiagnostics("no-overlay");
      return false;
    }
    overlay.ensureAttached();
    overlay.measure();
    this.rectFor(overlay, true);
    this.lastLiveAt = 0;
    try {
      overlay.live.setPointerCapture(event.pointerId);
    } catch {
    }
    this.selectionMenu?.close();
    const externalPoint = this.pointFor(event, overlay, this.rectFor(overlay));
    if (externalPoint && this.maybeDoubleTap(overlay, event, externalPoint, this.rectFor(overlay))) {
      return true;
    }
    this.externalOverlay = overlay;
    this.toolbar?.closePopovers();
    this.activePointerId = event.pointerId;
    if (event.pointerType === "pen") this.lastPenAt = perf.now();
    this.plugin.log(
      `external down id=${event.pointerId} type=${event.pointerType} b=${event.buttons} p=${Number(
        event.pressure ?? 0
      ).toFixed(2)}`
    );
    this.beginToolAt(overlay, event);
    if (this.session || this.erased || this.selectSession || this.moveSession || this.transformSession || this.panSession) {
      this.attachStrokeListeners();
      return true;
    }
    this.externalOverlay = null;
    this.activePointerId = null;
    return false;
  }
  attachStrokeListeners() {
    if (this.strokeListenersAttached) return;
    this.strokeListenersAttached = true;
    this.zeroMoves = 0;
    this.moveLogCount = 0;
    window.addEventListener("pointermove", this.onStrokePointerMove, true);
    window.addEventListener("pointerup", this.onStrokePointerUp, true);
    window.addEventListener("pointercancel", this.onStrokePointerUp, true);
    window.addEventListener("lostpointercapture", this.onLostPointerCapture, true);
    this.resetStrokeWatchdog();
  }
  detachStrokeListeners() {
    if (this.strokeWatchdog !== null) {
      window.clearTimeout(this.strokeWatchdog);
      this.strokeWatchdog = null;
    }
    if (this.strokeListenersAttached) {
      this.strokeListenersAttached = false;
      window.removeEventListener("pointermove", this.onStrokePointerMove, true);
      window.removeEventListener("pointerup", this.onStrokePointerUp, true);
      window.removeEventListener("pointercancel", this.onStrokePointerUp, true);
      window.removeEventListener("lostpointercapture", this.onLostPointerCapture, true);
    }
    this.externalOverlay = null;
    this.activePointerId = null;
  }
  resetStrokeWatchdog() {
    if (this.strokeWatchdog !== null) window.clearTimeout(this.strokeWatchdog);
    this.strokeWatchdog = window.setTimeout(() => {
      this.strokeWatchdog = null;
      if (!this.session && !this.erased && !this.selectSession && !this.moveSession && !this.transformSession) {
        return;
      }
      this.plugin.log("watchdog: committing stalled stroke");
      if (this.session) this.finishSession();
      if (this.erased) this.finishErase();
      if (this.selectSession) this.finishSelection();
      if (this.moveSession) this.finishMoveSelection();
      if (this.transformSession) this.finishTransform();
      this.setStroking(false);
      this.detachStrokeListeners();
    }, 2e3);
  }
  beginToolAt(overlay, event) {
    const tool = this.plugin.tool;
    if (tool === "hand") {
      this.beginPan(event);
      return;
    }
    if (tool === "select") {
      this.beginSelection(overlay, event);
    } else if (tool === "eraser") {
      const { eraserRegion, eraserScope } = this.plugin.settings;
      if (eraserRegion === "free") {
        if (eraserScope === "whole") this.beginStrokeErase(overlay, event);
        else this.beginErase(overlay, event);
      } else if (eraserRegion === "rect") {
        this.beginRectErase(overlay, event);
      } else {
        this.beginLassoErase(overlay, event);
      }
    } else if (SHAPE_TOOLS.includes(tool)) {
      this.beginShape(overlay, event, tool);
    } else {
      this.beginFreehand(overlay, event, tool === "highlighter" ? "highlighter" : "pen");
    }
  }
  beginFreehand(overlay, event, tool) {
    const layer = this.getWritableLayer();
    if (!layer) return;
    const point = this.pointFor(event, overlay);
    if (!point) return;
    const brush = this.plugin.brushFor(tool);
    const landing = point.p < 0.15 ? 0.5 : point.p;
    const stroke = {
      id: uid("s"),
      kind: tool,
      page: overlay.pageNumber,
      color: brush.color,
      width: brush.widthPx / REFERENCE_PAGE_WIDTH,
      opacity: brush.opacity,
      points: [point.x, point.y, landing]
    };
    this.session = {
      type: "freehand",
      overlay,
      layerId: layer.id,
      layerOpacity: layer.opacity,
      stroke,
      lastX: point.x,
      lastY: point.y,
      lastPressure: point.p,
      lastPointAt: perf.now()
    };
    this.plugin.log(
      `stroke start kind=${tool} page=${overlay.pageNumber} size=${overlay.widthPx}x${overlay.heightPx}`
    );
    this.setStroking(true);
    overlay.beginLive(stroke, layer.opacity);
    this.armHoldErase(overlay, event, point);
  }
  /**
   * Hold-to-erase: the ink is drawn immediately, and only if the pen rests
   * (and presses hard enough) do we roll that bit back and start erasing.
   * That keeps handwriting latency untouched.
   */
  armHoldErase(overlay, event, point) {
    this.cancelHoldErase();
    const settings = this.plugin.settings;
    if (!settings.eraserHoldEnabled) return;
    if (event.pointerType !== "pen") return;
    this.holdOrigin = { x: point.x, y: point.y };
    const startedAt = perf.now();
    const holdMs = Math.max(120, settings.eraserHoldMs);
    const windowMs = Math.max(holdMs, settings.eraserHoldWindowMs);
    let streak = 0;
    const tick = () => {
      this.holdTimer = null;
      const session = this.session;
      if (!session || session.type !== "freehand" || session.overlay !== overlay) return;
      const elapsed = perf.now() - startedAt;
      if (elapsed >= holdMs) {
        if (session.lastPressure >= settings.eraserHoldPressure) {
          streak += 1;
          if (streak >= 2) {
            this.startPressureErase(session);
            return;
          }
        } else {
          streak = 0;
          this.holdSelectAt = null;
          this.holdOrigin = null;
          if (this.holdTimer !== null) {
            window.clearTimeout(this.holdTimer);
            this.holdTimer = null;
          }
          this.discardSession();
          this.activePointerId = null;
          this.setStroking(false);
          this.plugin.log("pen long press -> select tool");
          this.selectEnteredByHold = true;
          this.plugin.setTool("select");
          this.beginSelection(overlay, event, false);
          return;
        }
      }
      if (elapsed >= windowMs) return;
      this.holdTimer = window.setTimeout(tick, HOLD_POLL_MS);
    };
    this.holdTimer = window.setTimeout(tick, holdMs);
  }
  cancelHoldErase() {
    if (this.holdTimer !== null) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.holdOrigin = null;
  }
  armShapeHold(session) {
    const settings = this.plugin.settings;
    if (!settings.autoShapeEnabled || settings.autoShapeTrigger !== "hold") return;
    const now = perf.now();
    if (now - this.shapeHoldArmedAt < 120) return;
    this.shapeHoldArmedAt = now;
    if (this.shapeHoldTimer !== null) window.clearTimeout(this.shapeHoldTimer);
    const delay = Math.max(200, settings.autoShapeHoldMs);
    this.shapeHoldTimer = window.setTimeout(() => {
      this.shapeHoldTimer = null;
      if (this.session !== session) return;
      if (perf.now() - session.lastPointAt < delay - 30) return;
      const rect = this.rectFor(session.overlay);
      if (rect.width < 10 || rect.height < 10) return;
      const points = session.stroke.points;
      if (points.length < 12) return;
      if (!recognizeStroke(points, rect.width, rect.height)) return;
      perf.count("shape.early");
      this.plugin.log("shape hold: committing early");
      this.finishSession();
    }, delay);
  }
  cancelShapeHold() {
    if (this.shapeHoldTimer !== null) {
      window.clearTimeout(this.shapeHoldTimer);
      this.shapeHoldTimer = null;
    }
  }
  startPressureErase(session) {
    const layer = this.doc ? findLayer(this.doc, session.layerId) : null;
    if (!layer) return;
    session.overlay.clearLive();
    this.session = null;
    this.pressureErasing = true;
    const rect = this.rectFor(session.overlay);
    this.showEraserCursorAt(
      rect.left + session.lastX * rect.width,
      rect.top + session.lastY * rect.height,
      session.overlay,
      session.lastPressure
    );
    this.plugin.log(`hold erase start page=${session.overlay.pageNumber}`);
    this.beginEraseAt(
      session.overlay,
      session.lastX,
      session.lastY,
      session.lastPressure,
      layer
    );
  }
  beginShape(overlay, event, kind) {
    const layer = this.getWritableLayer();
    if (!layer) return;
    const point = this.pointFor(event, overlay);
    if (!point) return;
    const brush = this.plugin.brushFor("pen");
    const stroke = {
      id: uid("s"),
      kind,
      page: overlay.pageNumber,
      color: brush.color,
      width: brush.widthPx / REFERENCE_PAGE_WIDTH,
      opacity: brush.opacity,
      points: [point.x, point.y, 0.5, point.x, point.y, 0.5]
    };
    this.session = {
      type: "shape",
      overlay,
      layerId: layer.id,
      layerOpacity: layer.opacity,
      stroke,
      startX: point.x,
      startY: point.y
    };
    this.plugin.log(
      `shape start kind=${kind} page=${overlay.pageNumber} size=${overlay.widthPx}x${overlay.heightPx}`
    );
    this.setStroking(true);
    overlay.drawLive(stroke, layer.opacity);
  }
  beginRectErase(overlay, event) {
    const layer = this.getWritableLayer();
    if (!layer) return;
    const point = this.pointFor(event, overlay);
    if (!point) return;
    const stroke = {
      id: uid("s"),
      kind: "eraser-rect",
      page: overlay.pageNumber,
      color: "#000000",
      width: this.plugin.settings.eraserWidth / REFERENCE_PAGE_WIDTH,
      opacity: 1,
      points: [point.x, point.y, 0.5, point.x, point.y, 0.5]
    };
    this.session = {
      type: "shape",
      overlay,
      layerId: layer.id,
      layerOpacity: layer.opacity,
      stroke,
      startX: point.x,
      startY: point.y
    };
    this.plugin.log(`rect erase start page=${overlay.pageNumber}`);
    this.setStroking(true);
    overlay.drawGuideOnly({
      kind: "rect",
      x0: point.x,
      y0: point.y,
      x1: point.x,
      y1: point.y
    });
  }
  beginLassoErase(overlay, event) {
    const layer = this.getWritableLayer();
    if (!layer) return;
    const point = this.pointFor(event, overlay);
    if (!point) return;
    const stroke = {
      id: uid("s"),
      kind: "eraser-lasso",
      page: overlay.pageNumber,
      color: "#000000",
      width: this.plugin.settings.eraserWidth / REFERENCE_PAGE_WIDTH,
      opacity: 1,
      points: [point.x, point.y, 0.5]
    };
    this.session = {
      type: "freehand",
      overlay,
      layerId: layer.id,
      layerOpacity: layer.opacity,
      stroke,
      lastX: point.x,
      lastY: point.y,
      lastPressure: point.p,
      lastPointAt: perf.now()
    };
    this.plugin.log(`lasso erase start page=${overlay.pageNumber}`);
    this.setStroking(true);
    overlay.drawFreehandGuide(stroke);
  }
  /* ------------------------------------------------------------------ */
  /* Hand tool (pan)                                                     */
  /* ------------------------------------------------------------------ */
  beginPan(event) {
    const scroller = this.viewerContainerEl;
    if (!scroller) return;
    this.panSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
      scroller
    };
    this.containerEl.classList.add("pdf-ink-panning");
    window.addEventListener("pointermove", this.onPanMove, true);
    window.addEventListener("pointerup", this.onPanEnd, true);
    window.addEventListener("pointercancel", this.onPanEnd, true);
  }
  beginSelection(overlay, event, armHold = true) {
    const point = this.pointFor(event, overlay);
    if (!point) return;
    const handle = this.selectionHandleAt(overlay, point.x, point.y);
    if (handle) {
      this.beginTransform(overlay, point, handle);
      return;
    }
    if (this.selection && this.selection.page === overlay.pageNumber && this.selectionContains(overlay, point.x, point.y)) {
      const strokes = this.collectSelectedStrokes();
      if (strokes.length > 0) {
        this.moveSession = {
          overlay,
          ids: strokes.map((stroke) => stroke.id),
          originals: new Map(
            strokes.map((stroke) => [stroke.id, stroke.points.slice()])
          ),
          ringOriginals: new Map(
            strokes.filter((stroke) => stroke.rings).map((stroke) => [
              stroke.id,
              (stroke.rings ?? []).map((ring) => ring.slice())
            ])
          ),
          startX: point.x,
          startY: point.y
        };
        this.setStroking(true);
        return;
      }
    }
    this.clearSelection();
    const mode = this.plugin.settings.selectMode;
    this.selectSession = {
      mode,
      overlay,
      startX: point.x,
      startY: point.y,
      points: [point.x, point.y, 0.5]
    };
    this.setStroking(true);
    if (mode === "rect") {
      overlay.drawGuideOnly({
        kind: "rect",
        x0: point.x,
        y0: point.y,
        x1: point.x,
        y1: point.y
      });
    } else {
      overlay.drawFreehandGuide(this.makeGuideStroke(overlay.pageNumber, [point.x, point.y, 0.5]));
    }
    if (armHold) this.armSelectHold(overlay, point, event.clientX, event.clientY);
  }
  /** Long press in the selection tool opens the menu on the stroke below. */
  armSelectHold(overlay, point, clientX, clientY) {
    this.cancelSelectHold();
    if (!this.plugin.settings.tapGestureMenuEnabled) return;
    const delay = Math.max(350, this.plugin.settings.eraserHoldMs);
    this.selectHoldTimer = window.setTimeout(() => {
      this.selectHoldTimer = null;
      const session = this.selectSession;
      if (!session || session.overlay !== overlay) return;
      const rect = this.rectFor(overlay);
      const pts = session.points;
      const moved = pts.length > 6 || pts.length >= 6 && (Math.abs(pts[3] - pts[0]) * rect.width > 8 || Math.abs(pts[4] - pts[1]) * rect.height > 8);
      if (moved) return;
      this.selectSession = null;
      overlay.clearLive();
      this.setStroking(false);
      if (this.selectStrokeAt(overlay, point.x, point.y)) {
        this.plugin.log("hold select (selection tool)");
        this.openSelectionMenu(clientX, clientY);
      } else {
        this.renderSelection();
      }
    }, delay);
  }
  cancelSelectHold() {
    if (this.selectHoldTimer !== null) {
      window.clearTimeout(this.selectHoldTimer);
      this.selectHoldTimer = null;
    }
  }
  makeGuideStroke(page, points) {
    return {
      id: "selection-guide",
      kind: "pen",
      page,
      color: "#4c8cff",
      width: 1e-4,
      opacity: 1,
      points
    };
  }
  updateSelection(event, overlay) {
    if (this.transformSession) {
      this.updateTransform(event, overlay);
      return;
    }
    if (this.selectSession) {
      const session = this.selectSession;
      const rect2 = this.rectFor(overlay);
      const point2 = this.pointFor(event, overlay, rect2);
      if (!point2) return;
      if (session.mode === "rect") {
        session.points = [
          session.startX,
          session.startY,
          0.5,
          point2.x,
          point2.y,
          0.5
        ];
        overlay.drawGuideOnly({
          kind: "rect",
          x0: session.startX,
          y0: session.startY,
          x1: point2.x,
          y1: point2.y
        });
      } else {
        const lastX = session.points[session.points.length - 3];
        const lastY = session.points[session.points.length - 2];
        const dx2 = (point2.x - lastX) * rect2.width;
        const dy2 = (point2.y - lastY) * rect2.height;
        if (dx2 * dx2 + dy2 * dy2 > 2) {
          session.points.push(point2.x, point2.y, 0.5);
          overlay.drawFreehandGuide(
            this.makeGuideStroke(overlay.pageNumber, session.points)
          );
        }
      }
      return;
    }
    const move = this.moveSession;
    if (!move) return;
    const rect = this.rectFor(overlay);
    const point = this.pointFor(event, overlay, rect);
    if (!point) return;
    const dx = point.x - move.startX;
    const dy = point.y - move.startY;
    const done = perf.start("selection.move");
    for (const id of move.ids) {
      const stroke = this.findStrokeById(id);
      const original = move.originals.get(id);
      if (!stroke || !original) continue;
      const ringOrigin = move.ringOriginals.get(id);
      if (ringOrigin && stroke.rings) {
        stroke.rings = ringOrigin.map((ring) => {
          const moved = ring.slice();
          for (let i = 0; i + 1 < moved.length; i += 2) {
            moved[i] = ring[i] + dx;
            moved[i + 1] = ring[i + 1] + dy;
          }
          return moved;
        });
      } else if (ringOrigin) {
        stroke.rings = ringOrigin.map((ring) => ring.slice());
      }
      for (let i = 0; i < stroke.points.length; i += 3) {
        stroke.points[i] = original[i] + dx;
        stroke.points[i + 1] = original[i + 1] + dy;
      }
    }
    overlay.render();
    this.refreshSelectionFrame();
    this.renderSelection();
    done();
  }
  finishSelection() {
    this.cancelSelectHold();
    const session = this.selectSession;
    this.selectSession = null;
    if (!session) return;
    session.overlay.clearLive();
    const doc = this.doc;
    const layer = doc ? getActiveLayer(doc) : null;
    const page = session.overlay.pageNumber;
    const points = session.points;
    const rect = {
      x0: Math.min(points[0], points[3] ?? points[0]),
      y0: Math.min(points[1], points[4] ?? points[1]),
      x1: Math.max(points[0], points[3] ?? points[0]),
      y1: Math.max(points[1], points[4] ?? points[1])
    };
    const polygon = [];
    for (let i = 0; i < points.length / 3; i++) {
      polygon.push([points[i * 3], points[i * 3 + 1]]);
    }
    if (session.mode === "rect" && Math.abs(rect.x1 - rect.x0) * (session.overlay.widthPx || 1) < 6 && Math.abs(rect.y1 - rect.y0) * (session.overlay.heightPx || 1) < 6) {
      this.selectStrokeAt(session.overlay, rect.x0, rect.y0);
      this.setStroking(false);
      return;
    }
    const ids = /* @__PURE__ */ new Set();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    if (layer) {
      for (const stroke of layer.strokes) {
        if (stroke.page !== page) continue;
        if (stroke.kind === "eraser" || stroke.kind === "eraser-rect" || stroke.kind === "eraser-lasso") {
          continue;
        }
        const bbox = this.strokeBounds(stroke);
        const hit = session.mode === "rect" ? bbox.x0 <= rect.x1 && bbox.x1 >= rect.x0 && bbox.y0 <= rect.y1 && bbox.y1 >= rect.y0 : this.anyPointInPolygon(
          stroke.points,
          polygon,
          stroke.rings
        );
        if (!hit) continue;
        ids.add(stroke.id);
        x0 = Math.min(x0, bbox.x0);
        y0 = Math.min(y0, bbox.y0);
        x1 = Math.max(x1, bbox.x1);
        y1 = Math.max(y1, bbox.y1);
      }
    }
    if (ids.size > 0) {
      this.selection = {
        page,
        ids,
        frame: this.frameFromBounds(
          this.padBounds({ x0, y0, x1, y1 }, session.overlay),
          session.overlay
        )
      };
      this.renderSelection();
    } else {
      this.selection = null;
    }
    this.setStroking(false);
  }
  finishMoveSelection() {
    const move = this.moveSession;
    this.moveSession = null;
    if (!move) return;
    const after = /* @__PURE__ */ new Map();
    for (const id of move.ids) {
      const stroke = this.findStrokeById(id);
      if (stroke) after.set(id, stroke.points.slice());
    }
    const apply = (snapshot) => {
      for (const [id, points] of snapshot) {
        const stroke = this.findStrokeById(id);
        if (stroke) stroke.points = points.slice();
      }
    };
    this.history.push({
      label: "\u79FB\u52A8\u7B14\u8FF9",
      undo: () => apply(move.originals),
      redo: () => apply(after)
    });
    this.markDirty();
    this.refreshSelectionFrame();
    this.renderSelection();
    this.setStroking(false);
  }
  /* ------------------------------------------------------------------ */
  /* Selection frame (oriented rectangle around the selected ink)        */
  /* ------------------------------------------------------------------ */
  pageSize(overlay) {
    return { width: overlay.widthPx || 1, height: overlay.heightPx || 1 };
  }
  /** Selection frame in css px of the given overlay. */
  framePx(overlay) {
    const frame = this.selection?.frame;
    if (!frame) return null;
    const { width, height } = this.pageSize(overlay);
    return {
      cx: frame.cx * width,
      cy: frame.cy * height,
      hw: frame.hw * width,
      hh: frame.hh * height,
      angle: frame.angle
    };
  }
  frameFromBounds(bounds2, overlay) {
    const { width, height } = this.pageSize(overlay);
    const px = frameFromBox(bounds2, width, height);
    return {
      cx: px.cx / width,
      cy: px.cy / height,
      hw: px.hw / width,
      hh: px.hh / height,
      angle: 0
    };
  }
  /**
   * Re-fits the frame around the strokes while keeping its current angle —
   * i.e. the tight oriented bounding box. Running this every frame is what
   * makes the frame follow a drag and stay the same size under rotation.
   */
  refreshSelectionFrame() {
    const selection = this.selection;
    if (!selection) return;
    const overlay = this.overlays.get(selection.page);
    if (!overlay) return;
    const strokes = this.collectSelectedStrokes();
    if (strokes.length === 0) return;
    const { width, height } = this.pageSize(overlay);
    const angle = selection.frame.angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const visit = (nx, ny) => {
      const px = nx * width;
      const py = ny * height;
      const lx = cos * px + sin * py;
      const ly = -sin * px + cos * py;
      if (lx < x0) x0 = lx;
      if (lx > x1) x1 = lx;
      if (ly < y0) y0 = ly;
      if (ly > y1) y1 = ly;
    };
    for (const stroke of strokes) {
      for (let i = 0; i + 1 < stroke.points.length; i += 3) {
        visit(stroke.points[i], stroke.points[i + 1]);
      }
      for (const ring of stroke.rings ?? []) {
        for (let i = 0; i + 1 < ring.length; i += 2) visit(ring[i], ring[i + 1]);
      }
    }
    if (!Number.isFinite(x0)) return;
    const pad = 10;
    const localCx = (x0 + x1) / 2;
    const localCy = (y0 + y1) / 2;
    const hw = Math.max(1, (x1 - x0) / 2 + pad);
    const hh = Math.max(1, (y1 - y0) / 2 + pad);
    selection.frame = {
      cx: (cos * localCx - sin * localCy) / width,
      cy: (sin * localCx + cos * localCy) / height,
      hw: hw / width,
      hh: hh / height,
      angle
    };
  }
  selectionContains(overlay, x, y) {
    const frame = this.framePx(overlay);
    if (!frame) return false;
    const { width, height } = this.pageSize(overlay);
    const px = x * width;
    const py = y * height;
    const cos = Math.cos(frame.angle);
    const sin = Math.sin(frame.angle);
    const dx = px - frame.cx;
    const dy = py - frame.cy;
    const lx = cos * dx + sin * dy;
    const ly = -sin * dx + cos * dy;
    return Math.abs(lx) <= frame.hw && Math.abs(ly) <= frame.hh;
  }
  /* ------------------------------------------------------------------ */
  /* Selection transform (scale / rotate)                                */
  /* ------------------------------------------------------------------ */
  /** Corner / edge square or rotate knob under the pointer, if any. */
  selectionHandleAt(overlay, x, y) {
    const selection = this.selection;
    if (!selection || selection.page !== overlay.pageNumber) return null;
    if (selection.ids.size === 0) return null;
    const frame = this.framePx(overlay);
    if (!frame) return null;
    const px = x * this.pageSize(overlay).width;
    const py = y * this.pageSize(overlay).height;
    const knob = selectionKnob(frame, this.pageSize(overlay));
    if (Math.hypot(px - knob.x, py - knob.y) <= 14) return "rotate";
    const corners = frameCorners(frame);
    const cornerNames = ["nw", "ne", "se", "sw"];
    for (let i = 0; i < corners.length; i++) {
      if (Math.hypot(px - corners[i].x, py - corners[i].y) <= SELECTION_HANDLE_HIT_PX) {
        return cornerNames[i];
      }
    }
    const edgeNames = ["n", "e", "s", "w"];
    const edges = frameEdges(frame);
    for (let i = 0; i < edges.length; i++) {
      if (Math.hypot(px - edges[i].mx, py - edges[i].my) <= SELECTION_HANDLE_HIT_PX - 1) {
        return edgeNames[i];
      }
    }
    return null;
  }
  beginTransform(overlay, point, handle) {
    const selection = this.selection;
    if (!selection) return;
    const strokes = this.collectSelectedStrokes();
    if (strokes.length === 0) return;
    const frame = this.framePx(overlay);
    if (!frame) return;
    const { width, height } = this.pageSize(overlay);
    const startX = point.x * width;
    const startY = point.y * height;
    const corners = frameCorners(frame);
    const edges = frameEdges(frame);
    const cornerNames = ["nw", "ne", "se", "sw"];
    const edgeNames = ["n", "e", "s", "w"];
    const cornerIndex = cornerNames.indexOf(handle);
    const edgeIndex = edgeNames.indexOf(handle);
    let anchor = { x: frame.cx, y: frame.cy };
    if (cornerIndex >= 0) {
      anchor = corners[(cornerIndex + 2) % 4];
    } else if (edgeIndex >= 0) {
      anchor = { x: edges[(edgeIndex + 2) % 4].mx, y: edges[(edgeIndex + 2) % 4].my };
    }
    const snapshots = /* @__PURE__ */ new Map();
    for (const stroke of strokes) snapshots.set(stroke.id, snapshotStroke(stroke));
    this.transformSession = {
      kind: handle === "rotate" ? "rotate" : "scale",
      overlay,
      ids: strokes.map((stroke) => stroke.id),
      snapshots,
      cx: anchor.x,
      cy: anchor.y,
      startX,
      startY,
      startAngle: Math.atan2(startY - frame.cy, startX - frame.cx),
      frameAngle: frame.angle,
      frame0: { ...selection.frame },
      knobEdge: selectionKnobEdge(frame),
      preview: null,
      axis: handle === "e" || handle === "w" ? "x" : handle === "n" || handle === "s" ? "y" : null,
      scaleX: 1,
      scaleY: 1,
      rotate: 0,
      label: ""
    };
    this.setStroking(true);
    this.plugin.log(`transform start ${handle} n=${strokes.length}`);
  }
  updateTransform(event, overlay) {
    const session = this.transformSession;
    if (!session) return;
    const { width, height } = this.pageSize(overlay);
    const point = this.pointFor(event, overlay, this.rectFor(overlay));
    if (!point) return;
    const px = point.x * width;
    const py = point.y * height;
    const cos = Math.cos(session.frameAngle);
    const sin = Math.sin(session.frameAngle);
    const done = perf.start("selection.transform");
    if (session.kind === "scale") {
      const toLocal = (x, y) => {
        const dx = x - session.cx;
        const dy = y - session.cy;
        return { x: cos * dx + sin * dy, y: -sin * dx + cos * dy };
      };
      const start = toLocal(session.startX, session.startY);
      const now = toLocal(px, py);
      let scaleX = Math.abs(start.x) > 0.5 ? now.x / start.x : 1;
      let scaleY = Math.abs(start.y) > 0.5 ? now.y / start.y : 1;
      if (session.axis === "x") scaleY = 1;
      if (session.axis === "y") scaleX = 1;
      scaleX = clamp(scaleX, 0.05, 20);
      scaleY = clamp(scaleY, 0.05, 20);
      if (event.shiftKey && !session.axis) {
        const locked = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
        scaleX = locked;
        scaleY = locked;
      }
      session.scaleX = scaleX;
      session.scaleY = scaleY;
      const percentX = Math.round(scaleX * 100);
      const percentY = Math.round(scaleY * 100);
      session.label = percentX === percentY ? `${percentX}%` : percentX === 100 ? `${percentY}%` : percentY === 100 ? `${percentX}%` : `${percentX}% \xD7 ${percentY}%`;
    } else {
      let angle = Math.atan2(py - session.cy, px - session.cx) - session.startAngle;
      if (event.shiftKey) {
        const step = Math.PI / 12;
        angle = Math.round(angle / step) * step;
      }
      session.rotate = angle;
      session.label = `${Math.round(angle * 180 / Math.PI)}\xB0`;
      const frame = this.framePx(overlay);
      if (frame) session.preview = { ...frame, angle: session.frameAngle + angle };
    }
    const transform = {
      scaleX: session.scaleX,
      scaleY: session.scaleY,
      rotate: session.kind === "rotate" ? session.rotate : session.frameAngle,
      local: session.kind === "scale",
      cx: session.cx,
      cy: session.cy,
      pageWidth: width,
      pageHeight: height
    };
    for (const id of session.ids) {
      const stroke = this.findStrokeById(id);
      const snapshot = session.snapshots.get(id);
      if (stroke && snapshot) applyTransform(stroke, snapshot, transform);
    }
    overlay.render();
    if (session.kind === "scale") this.refreshSelectionFrame();
    this.renderSelection(session.label);
    done();
  }
  finishTransform() {
    const session = this.transformSession;
    this.transformSession = null;
    if (!session) return;
    if (session.kind === "rotate" && session.rotate !== 0 && this.selection) {
      this.selection.frame.angle = session.frameAngle + session.rotate;
    }
    const after = /* @__PURE__ */ new Map();
    for (const id of session.ids) {
      const stroke = this.findStrokeById(id);
      if (stroke) after.set(id, snapshotStroke(stroke));
    }
    const afterFrame = this.selection ? { ...this.selection.frame } : null;
    const apply = (snapshots, frame) => {
      for (const [id, snapshot] of snapshots) {
        const stroke = this.findStrokeById(id);
        if (stroke) restoreStroke(stroke, snapshot);
      }
      if (frame && this.selection) this.selection.frame = { ...frame };
      this.refreshSelectionFrame();
      this.renderSelection();
    };
    this.history.push({
      label: session.kind === "scale" ? "\u7F29\u653E\u7B14\u8FF9" : "\u65CB\u8F6C\u7B14\u8FF9",
      undo: () => apply(session.snapshots, session.frame0),
      redo: () => apply(after, afterFrame)
    });
    this.plugin.log(
      `transform ${session.kind} scale=${session.scaleX.toFixed(3)}x${session.scaleY.toFixed(
        3
      )} rotate=${(session.rotate * 180 / Math.PI).toFixed(1)}`
    );
    this.refreshSelectionFrame();
    this.renderSelection();
    this.markDirty();
    this.setStroking(false);
  }
  /* ------------------------------------------------------------------ */
  /* Selection nudge (arrow keys)                                        */
  /* ------------------------------------------------------------------ */
  nudgeSelection(dxPx, dyPx) {
    const selection = this.selection;
    if (!selection || selection.ids.size === 0) return false;
    const overlay = this.overlays.get(selection.page);
    if (!overlay) return false;
    const strokes = this.collectSelectedStrokes();
    if (strokes.length === 0) return false;
    const width = overlay.widthPx || 1;
    const height = overlay.heightPx || 1;
    const before = strokes.map((stroke) => snapshotStroke(stroke));
    for (const stroke of strokes) translateStroke(stroke, dxPx / width, dyPx / height);
    const after = strokes.map((stroke) => snapshotStroke(stroke));
    const apply = (snapshots) => {
      for (const snapshot of snapshots) {
        const stroke = this.findStrokeById(snapshot.id);
        if (stroke) restoreStroke(stroke, snapshot);
      }
      this.refreshSelectionFrame();
      this.renderSelection();
    };
    this.history.push({
      label: "\u5FAE\u79FB\u7B14\u8FF9",
      undo: () => apply(before),
      redo: () => apply(after)
    });
    this.refreshSelectionFrame();
    this.renderSelection();
    this.markDirty();
    return true;
  }
  pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }
  anyPointInPolygon(points, polygon, rings) {
    for (let i = 0; i < points.length / 3; i++) {
      if (this.pointInPolygon(points[i * 3], points[i * 3 + 1], polygon)) {
        return true;
      }
    }
    for (const ring of rings ?? []) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        if (this.pointInPolygon(ring[i], ring[i + 1], polygon)) return true;
      }
    }
    return false;
  }
  strokeBounds(stroke) {
    const points = stroke.points;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < points.length / 3; i++) {
      const x = points[i * 3];
      const y = points[i * 3 + 1];
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    for (const ring of stroke.rings ?? []) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        x0 = Math.min(x0, ring[i]);
        y0 = Math.min(y0, ring[i + 1]);
        x1 = Math.max(x1, ring[i]);
        y1 = Math.max(y1, ring[i + 1]);
      }
    }
    return { x0, y0, x1, y1 };
  }
  findStrokeById(id) {
    const doc = this.doc;
    if (!doc) return null;
    for (const layer of doc.layers) {
      const stroke = layer.strokes.find((entry) => entry.id === id);
      if (stroke) return stroke;
    }
    return null;
  }
  collectSelectedStrokes() {
    const selection = this.selection;
    const doc = this.doc;
    if (!selection || !doc) return [];
    const result = [];
    for (const layer of doc.layers) {
      for (const stroke of layer.strokes) {
        if (selection.ids.has(stroke.id)) result.push(stroke);
      }
    }
    return result;
  }
  renderSelection(label) {
    const selection = this.selection;
    if (!selection) return;
    const overlay = this.overlays.get(selection.page);
    if (!overlay) return;
    const preview = this.transformSession?.preview;
    const frame = preview ?? this.framePx(overlay);
    if (!frame) return;
    const knobEdge = preview ? this.transformSession?.knobEdge : void 0;
    overlay.drawSelection({ frame, handles: true, label, knobEdge });
  }
  /** Selects every stroke on the visible page (Ctrl+A / select-all). */
  selectAll() {
    const doc = this.doc;
    const overlay = this.currentOverlay();
    if (!doc || !overlay) return false;
    const ids = /* @__PURE__ */ new Set();
    const strokes = [];
    for (const layer of doc.layers) {
      for (const stroke of layer.strokes) {
        if (stroke.page !== overlay.pageNumber) continue;
        if (stroke.kind.startsWith("eraser")) continue;
        ids.add(stroke.id);
        strokes.push(stroke);
      }
    }
    if (ids.size === 0) return false;
    this.selection = {
      page: overlay.pageNumber,
      ids,
      frame: this.frameFromBounds(this.padBounds(boundsOf(strokes), overlay), overlay)
    };
    this.renderSelection();
    return true;
  }
  get hasSelection() {
    return Boolean(this.selection && this.selection.ids.size > 0);
  }
  /** Axis-aligned bounds of the current selection, in page-normalized coords. */
  get selectionFrame() {
    const selection = this.selection;
    if (!selection) return null;
    const overlay = this.overlays.get(selection.page);
    if (!overlay) return null;
    const frame = this.framePx(overlay);
    if (!frame) return null;
    const corners = frameCorners(frame);
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const { width, height } = this.pageSize(overlay);
    return {
      x0: Math.min(...xs) / width,
      y0: Math.min(...ys) / height,
      x1: Math.max(...xs) / width,
      y1: Math.max(...ys) / height
    };
  }
  /** Rotation of the current selection frame, in radians. */
  get selectionAngle() {
    return this.selection?.frame.angle ?? 0;
  }
  get hasClipboard() {
    return Boolean(this.clipboard && this.clipboard.strokes.length > 0);
  }
  /**
   * Double tap only opens the menu in the selection tool. The pen uses a long
   * press instead, and the eraser has no menu at all.
   */
  maybeDoubleTap(overlay, event, point, rect) {
    if (this.plugin.tool !== "select") return false;
    if (!this.plugin.settings.tapGestureMenuEnabled) return false;
    if (this.selectionHandleAt(overlay, point.x, point.y)) return false;
    const now = perf.now();
    const previous = this.lastTap;
    this.lastTap = { time: now, x: point.x, y: point.y };
    if (!previous) return false;
    if (now - previous.time > 340) return false;
    if (Math.abs(point.x - previous.x) * rect.width > 12) return false;
    if (Math.abs(point.y - previous.y) * rect.height > 12) return false;
    if (!this.selectStrokeAt(overlay, point.x, point.y)) this.clearSelection();
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.plugin.log("double tap select");
    this.openSelectionMenu(event.clientX, event.clientY);
    return true;
  }
  /** Selects the topmost stroke under a point (tap / light long press). */
  selectStrokeAt(overlay, x, y) {
    const doc = this.doc;
    if (!doc) return false;
    const pageW = overlay.widthPx || 1;
    const pageH = overlay.heightPx || 1;
    for (let li = doc.layers.length - 1; li >= 0; li--) {
      const layer = doc.layers[li];
      if (!layer.visible || layer.locked) continue;
      for (let i = layer.strokes.length - 1; i >= 0; i--) {
        const stroke = layer.strokes[i];
        if (stroke.page !== overlay.pageNumber) continue;
        if (stroke.kind.startsWith("eraser")) continue;
        if (!strokeHitTest(stroke, x, y, pageW, pageH, { tolerancePx: 10 })) continue;
        this.selection = {
          page: overlay.pageNumber,
          ids: /* @__PURE__ */ new Set([stroke.id]),
          frame: this.frameFromBounds(
            this.padBounds(boundsOf([stroke]), overlay),
            overlay
          )
        };
        this.renderSelection();
        return true;
      }
    }
    return false;
  }
  /** Removes the dot left by the first tap of a double tap. */
  dropLastTapDot(now) {
    const id = this.lastTapStrokeId;
    this.lastTapStrokeId = null;
    if (!id || now - this.lastTapStrokeAt > 500) return;
    const doc = this.doc;
    if (!doc) return;
    for (const layer of doc.layers) {
      const index = layer.strokes.findIndex((stroke) => stroke.id === id);
      if (index >= 0) {
        layer.strokes.splice(index, 1);
        this.afterChange();
        return;
      }
    }
  }
  /** Grows a selection box by a few pixels so its dashed edge is grabbable. */
  padBounds(b, overlay, padPx = 10) {
    const w = overlay.widthPx || 1;
    const h = overlay.heightPx || 1;
    return {
      x0: b.x0 - padPx / w,
      y0: b.y0 - padPx / h,
      x1: b.x1 + padPx / w,
      y1: b.y1 + padPx / h
    };
  }
  openSelectionMenu(clientX, clientY) {
    this.selectionMenu ?? (this.selectionMenu = new SelectionMenu(this));
    this.selectionMenu.open(
      clientX,
      clientY,
      void 0,
      this.menuPlacement(clientX, clientY)
    );
  }
  /**
   * Anchors the menu just outside the selection frame, keeping clear of the
   * rotate knob (which sticks out above the frame and follows the hand).
   */
  menuPlacement(clientX, clientY) {
    const selection = this.selection;
    if (!selection) return void 0;
    const overlay = this.overlays.get(selection.page);
    if (!overlay) return void 0;
    const rect = this.rectFor(overlay);
    const frame = this.framePx(overlay);
    if (!frame) return void 0;
    const corners = frameCorners(frame);
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const box = {
      left: rect.left + Math.min(...xs),
      top: rect.top + Math.min(...ys),
      right: rect.left + Math.max(...xs),
      bottom: rect.top + Math.max(...ys)
    };
    const knob = selectionKnob(frame, this.pageSize(overlay));
    const radius = SELECTION_ROTATE_OFFSET_PX + 10;
    return {
      frame: box,
      knob: {
        left: rect.left + knob.x - radius,
        top: rect.top + knob.y - radius,
        right: rect.left + knob.x + radius,
        bottom: rect.top + knob.y + radius
      }
    };
  }
  /** Abandons the in-progress stroke without committing it. */
  discardSession() {
    const session = this.session;
    this.session = null;
    this.pendingLive = null;
    if (this.liveRaf) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(this.liveRaf);
      else window.clearTimeout(this.liveRaf);
      this.liveRaf = 0;
    }
    this.cancelShapeHold();
    if (session) session.overlay.clearLive();
  }
  /** Copies the current selection into the plugin's internal clipboard. */
  copySelection() {
    const strokes = this.collectSelectedStrokes();
    if (strokes.length === 0) return false;
    this.clipboard = {
      strokes: strokes.map((stroke) => JSON.parse(JSON.stringify(stroke))),
      page: this.selection?.page ?? 1
    };
    this.plugin.log(`copy n=${strokes.length} page=${this.clipboard.page}`);
    this.notice(`\u5DF2\u590D\u5236 ${strokes.length} \u6761\u7B14\u8FF9`);
    return true;
  }
  cutSelection() {
    if (!this.copySelection()) return false;
    this.deleteSelection();
    return true;
  }
  deleteSelection() {
    const selection = this.selection;
    const doc = this.doc;
    if (!selection || !doc) return false;
    const removed = [];
    for (const layer of doc.layers) {
      for (let i = layer.strokes.length - 1; i >= 0; i--) {
        const stroke = layer.strokes[i];
        if (!selection.ids.has(stroke.id)) continue;
        layer.strokes.splice(i, 1);
        removed.push({ stroke, layer, index: i });
      }
    }
    if (removed.length === 0) return false;
    this.history.push({
      label: "\u5220\u9664\u7B14\u8FF9",
      undo: () => {
        for (const item of [...removed].sort((a, b) => a.index - b.index)) {
          item.layer.strokes.splice(Math.min(item.index, item.layer.strokes.length), 0, item.stroke);
        }
      },
      redo: () => {
        for (const item of removed) {
          const index = item.layer.strokes.findIndex((entry) => entry.id === item.stroke.id);
          if (index >= 0) item.layer.strokes.splice(index, 1);
        }
      }
    });
    this.clearSelection();
    this.afterChange();
    return true;
  }
  /** Pastes the clipboard onto the visible page, offset so it does not hide the original. */
  pasteClipboard() {
    const clipboard = this.clipboard;
    const doc = this.doc;
    if (!clipboard || !doc || clipboard.strokes.length === 0) {
      this.notice("\u526A\u8D34\u677F\u662F\u7A7A\u7684\uFF1A\u5148\u590D\u5236\u6216\u526A\u5207\u7B14\u8FF9");
      return false;
    }
    const layer = this.getWritableLayer();
    if (!layer) {
      this.notice("\u5F53\u524D\u56FE\u5C42\u88AB\u9501\u5B9A\u6216\u4E0D\u53EF\u89C1\uFF0C\u65E0\u6CD5\u7C98\u8D34");
      return false;
    }
    const hover = this.hoverPoint;
    const overlay = hover?.overlay ?? this.currentOverlay();
    const page = hover?.overlay.pageNumber ?? this.selection?.page ?? overlay?.pageNumber ?? clipboard.page;
    const rect = overlay ? this.rectFor(overlay) : null;
    const source = boundsOf(clipboard.strokes);
    let dx = 0;
    let dy = 0;
    if (hover) {
      dx = hover.x - source.x0;
      dy = hover.y - source.y0;
    } else if (rect && rect.width > 10) {
      dx = 8 / rect.width;
      dy = 8 / rect.height;
    }
    const created = [];
    for (const source2 of clipboard.strokes) {
      const copy = JSON.parse(JSON.stringify(source2));
      copy.id = uid("s");
      copy.page = page;
      translateStroke(copy, dx, dy);
      layer.strokes.push(copy);
      created.push(copy);
    }
    const pasteOverlay = overlay ?? this.overlays.get(page) ?? null;
    this.selection = {
      page,
      ids: new Set(created.map((stroke) => stroke.id)),
      frame: pasteOverlay ? this.frameFromBounds(
        this.padBounds(boundsOf(created), pasteOverlay),
        pasteOverlay
      ) : { cx: 0.5, cy: 0.5, hw: 0.1, hh: 0.1, angle: 0 }
    };
    this.history.push({
      label: "\u7C98\u8D34",
      undo: () => {
        for (const stroke of created) {
          const index = layer.strokes.findIndex((entry) => entry.id === stroke.id);
          if (index >= 0) layer.strokes.splice(index, 1);
        }
      },
      redo: () => {
        for (const stroke of created) {
          if (!layer.strokes.some((entry) => entry.id === stroke.id)) {
            layer.strokes.push(stroke);
          }
        }
      }
    });
    this.afterChange();
    this.renderSelection();
    this.plugin.log(
      `paste page=${page} layer=${layer.name} n=${created.length} offset=${dx.toFixed(4)},${dy.toFixed(4)}`
    );
    return true;
  }
  currentOverlay() {
    if (this.lastOverlay && this.overlays.get(this.lastOverlay.pageNumber) === this.lastOverlay) {
      return this.lastOverlay;
    }
    const page = this.selection?.page;
    if (page !== void 0) {
      const overlay = this.overlays.get(page);
      if (overlay) return overlay;
    }
    for (const overlay of this.overlays.values()) return overlay;
    return null;
  }
  clearSelection() {
    if (!this.selection) return;
    const overlay = this.overlays.get(this.selection.page);
    this.selection = null;
    overlay?.clearLive();
  }
  beginErase(overlay, event) {
    const layer = this.getWritableLayer();
    if (!layer) return;
    const point = this.pointFor(event, overlay);
    if (!point) return;
    this.beginEraseAt(overlay, point.x, point.y, point.p, layer);
  }
  beginEraseAt(overlay, x, y, pressure, layer) {
    const stroke = {
      id: uid("s"),
      kind: "eraser",
      page: overlay.pageNumber,
      color: "#000000",
      width: this.plugin.settings.eraserWidth / REFERENCE_PAGE_WIDTH,
      opacity: 1,
      points: [x, y, this.eraserPressure(pressure)]
    };
    this.erased = {
      overlay,
      layerId: layer.id,
      layerOpacity: layer.opacity,
      stroke,
      lastX: x,
      lastY: y
    };
    this.setStroking(true);
    this.requestErasePreview();
  }
  /** Pressure recorded on eraser points, so the swath can grow with the pen. */
  eraserPressure(pressure) {
    return this.plugin.settings.eraserPressureSize ? pressure : 0.5;
  }
  hitStrokes(layer, overlay, x, y) {
    const pageW = overlay.widthPx || 1;
    const pageH = overlay.heightPx || 1;
    const tolerance = Math.max(6, this.plugin.settings.eraserWidth / 3);
    const hits = [];
    for (let index = 0; index < layer.strokes.length; index++) {
      const stroke = layer.strokes[index];
      if (stroke.page !== overlay.pageNumber) continue;
      if (strokeHitTest(stroke, x, y, pageW, pageH, { tolerancePx: tolerance })) {
        hits.push({ stroke, index });
      }
    }
    return hits;
  }
  /** Sweeping whole-stroke erase: starts anywhere, removes every stroke it touches. */
  beginStrokeErase(overlay, event) {
    const layer = this.getWritableLayer();
    if (!layer) return;
    const point = this.pointFor(event, overlay);
    if (!point) return;
    const session = {
      type: "stroke-erase",
      overlay,
      layerId: layer.id,
      removed: [],
      seen: /* @__PURE__ */ new Set()
    };
    this.setStroking(true);
    this.session = session;
    const hits = this.hitStrokes(layer, overlay, point.x, point.y);
    if (hits.length > 0) {
      this.removeStrokes(layer, session, hits);
      overlay.render();
    }
  }
  continueStrokeErase(event, overlay, session) {
    const doc = this.doc;
    const layer = doc ? findLayer(doc, session.layerId) : null;
    if (!layer) return;
    const point = this.pointFor(event, overlay);
    if (!point) return;
    const hits = this.hitStrokes(layer, overlay, point.x, point.y);
    if (hits.length === 0) return;
    this.removeStrokes(layer, session, hits);
    overlay.render();
  }
  removeStrokes(layer, session, hits) {
    const targets = hits.filter((hit) => !session.seen.has(hit.stroke.id)).sort((a, b) => b.index - a.index);
    for (const target of targets) {
      const index = layer.strokes.findIndex((entry) => entry.id === target.stroke.id);
      if (index < 0) continue;
      layer.strokes.splice(index, 1);
      session.seen.add(target.stroke.id);
      session.removed.push({ stroke: target.stroke, index });
    }
  }
  finishStrokeErase(session, layer) {
    if (session.removed.length === 0) {
      this.renderNow();
      return;
    }
    const removed = [...session.removed];
    this.clearSelection();
    this.plugin.log(`stroke erase removed=${removed.length}`);
    this.history.push({
      label: "\u6574\u7B14\u5220\u9664",
      undo: () => {
        for (const item of [...removed].sort((a, b) => a.index - b.index)) {
          if (layer.strokes.some((entry) => entry.id === item.stroke.id)) continue;
          const index = Math.min(item.index, layer.strokes.length);
          layer.strokes.splice(index, 0, item.stroke);
        }
      },
      redo: () => {
        for (const item of removed) {
          const index = layer.strokes.findIndex(
            (entry) => entry.id === item.stroke.id
          );
          if (index >= 0) layer.strokes.splice(index, 1);
        }
      }
    });
    this.afterChange(session.overlay);
  }
  onPointerMove(event, overlay) {
    this.trackBrushRing(event, overlay);
    if (!this.drawing && !this.externalOverlay) return;
    if (this.selectSession || this.moveSession || this.transformSession) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.updateSelection(event, overlay);
      return;
    }
    const session = this.session;
    if (session && session.overlay === overlay) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (session.type === "freehand") this.extendFreehand(event, overlay, session);
      else if (session.type === "stroke-erase")
        this.continueStrokeErase(event, overlay, session);
      else this.updateShape(event, overlay, session);
      return;
    }
    const erased = this.erased;
    if (erased && erased.overlay === overlay) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.extendErase(event, overlay, erased);
    }
  }
  onPointerUp(event, overlay) {
    this.cancelHoldErase();
    this.plugin.log(
      `end ${event.type} id=${event.pointerId} type=${event.pointerType} b=${event.buttons} p=${Number(
        event.pressure ?? 0
      ).toFixed(2)}`
    );
    if (this.session && this.session.overlay === overlay) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.finishSession();
    }
    if (this.erased && this.erased.overlay === overlay) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.finishErase();
    }
    if (this.selectSession) {
      const session = this.selectSession;
      const rect = this.rectFor(overlay);
      const dragged = Math.abs((session.points[3] ?? session.points[0]) - session.points[0]) * (overlay.widthPx || 1) > 6 || Math.abs((session.points[4] ?? session.points[1]) - session.points[1]) * (overlay.heightPx || 1) > 6 || session.points.length > 6;
      this.finishSelection();
      if (this.selection) {
        this.openSelectionMenu(event.clientX, event.clientY);
      } else if (!dragged && this.pointIsOnPage(overlay, event)) {
        if (this.selectEnteredByHold) {
          this.selectEnteredByHold = false;
          this.plugin.setTool("pen");
        }
      }
    }
    if (this.moveSession) {
      this.finishMoveSelection();
      this.openSelectionMenu(event.clientX, event.clientY);
    }
    if (this.transformSession) {
      this.finishTransform();
      this.openSelectionMenu(event.clientX, event.clientY);
    }
    this.activePointerId = null;
    if (!this.session && !this.erased) this.setStroking(false);
  }
  /** True when the pointer is inside the page (used to place the menu). */
  pointIsOnPage(overlay, event) {
    const rect = this.rectFor(overlay);
    return event.clientX >= rect.left && event.clientX <= rect.left + rect.width && event.clientY >= rect.top && event.clientY <= rect.top + rect.height;
  }
  scheduleLiveAppend(session) {
    this.pendingLive = session;
    if (this.liveRaf) return;
    const run = () => {
      this.liveRaf = 0;
      const pending = this.pendingLive;
      this.pendingLive = null;
      if (!pending || pending !== this.session) return;
      if (this.lastLiveAt > 0) perf.add("frame.gap", perf.now() - this.lastLiveAt);
      this.lastLiveAt = perf.now();
      perf.count("live.frames");
      pending.overlay.appendLive(pending.stroke, pending.layerOpacity);
    };
    this.liveRaf = window.requestAnimationFrame ? window.requestAnimationFrame(run) : window.setTimeout(run, 16);
  }
  extendFreehand(event, overlay, session) {
    perf.count("input.move");
    if (event.timeStamp > 0) perf.add("input.latency", perf.now() - event.timeStamp);
    if (!perf.enabled) {
      this.extendFreehandInner(event, overlay, session);
      return;
    }
    const done = perf.start("input.extend");
    try {
      this.extendFreehandInner(event, overlay, session);
    } finally {
      done();
    }
  }
  extendFreehandInner(event, overlay, session) {
    const rectStart = perf.now();
    const rect = this.rectFor(overlay);
    perf.add("input.rect", perf.now() - rectStart);
    session.lastPressure = event.pressure ?? session.lastPressure;
    const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
    const list = events.length > 0 ? events : [event];
    let added = false;
    for (const ev of list) {
      const point = this.pointFor(ev, overlay, rect);
      if (!point) continue;
      const dx = (point.x - session.lastX) * rect.width;
      const dy = (point.y - session.lastY) * rect.height;
      if (dx * dx + dy * dy < MIN_POINT_DISTANCE_PX ** 2) continue;
      session.stroke.points.push(point.x, point.y, point.p);
      session.lastX = point.x;
      session.lastY = point.y;
      added = true;
    }
    if (!added) return;
    session.lastPointAt = perf.now();
    if (session.stroke.points.length === 3) {
      const next = session.lastPressure;
      if (Number.isFinite(next) && next > session.stroke.points[2]) {
        session.stroke.points[2] = next;
      }
    }
    this.armShapeHold(session);
    if (this.holdOrigin) {
      const dx = (session.lastX - this.holdOrigin.x) * rect.width;
      const dy = (session.lastY - this.holdOrigin.y) * rect.height;
      const radius = Math.max(
        HOLD_CANCEL_PX,
        this.plugin.settings.eraserHoldRadiusPx
      );
      if (dx * dx + dy * dy > radius * radius) {
        this.holdSelectAt = null;
        this.cancelHoldErase();
      }
    }
    perf.count("points.added", list.length);
    if (session.stroke.kind === "eraser-lasso") {
      overlay.drawFreehandGuide(session.stroke);
      return;
    }
    this.scheduleLiveAppend(session);
  }
  updateShape(event, overlay, session) {
    const rect = this.rectFor(overlay);
    const point = this.pointFor(event, overlay, rect);
    if (!point) return;
    let { x, y } = point;
    const kind = session.stroke.kind;
    if (kind === "line" || kind === "arrow") {
      if (event.shiftKey) {
        const constrained = this.constrainShape(session, x, y, rect);
        x = constrained.x;
        y = constrained.y;
      }
      session.guide = void 0;
    } else {
      const dxPx = (x - session.startX) * rect.width;
      const dyPx = (y - session.startY) * rect.height;
      const ax = Math.abs(dxPx);
      const ay = Math.abs(dyPx);
      let snapped = event.shiftKey;
      if (!snapped && Math.min(ax, ay) > 8 && Math.abs(ax - ay) <= 12) {
        snapped = true;
      }
      if (snapped) {
        const side = event.shiftKey ? Math.max(ax, ay) : (ax + ay) / 2;
        x = clamp(
          session.startX + (dxPx < 0 ? -side : side) / rect.width,
          0,
          1
        );
        y = clamp(
          session.startY + (dyPx < 0 ? -side : side) / rect.height,
          0,
          1
        );
        session.guide = {
          kind: kind === "ellipse" ? "ellipse" : "rect",
          x0: session.startX,
          y0: session.startY,
          x1: x,
          y1: y
        };
      } else {
        session.guide = void 0;
      }
    }
    session.stroke.points = [session.startX, session.startY, 0.5, x, y, 0.5];
    this.scheduleLiveRender();
  }
  constrainShape(session, x, y, rect) {
    const dxPx = (x - session.startX) * rect.width;
    const dyPx = (y - session.startY) * rect.height;
    const kind = session.stroke.kind;
    if (kind === "line" || kind === "arrow") {
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(dyPx, dxPx) / step) * step;
      const length = Math.hypot(dxPx, dyPx);
      return {
        x: clamp(session.startX + Math.cos(angle) * length / rect.width, 0, 1),
        y: clamp(session.startY + Math.sin(angle) * length / rect.height, 0, 1)
      };
    }
    const side = Math.max(Math.abs(dxPx), Math.abs(dyPx));
    const sx = dxPx < 0 ? -1 : 1;
    const sy = dyPx < 0 ? -1 : 1;
    return {
      x: clamp(session.startX + sx * side / rect.width, 0, 1),
      y: clamp(session.startY + sy * side / rect.height, 0, 1)
    };
  }
  scheduleLiveRender() {
    const session = this.session;
    if (!session || session.type === "stroke-erase") return;
    if (session.stroke.kind === "eraser-rect") {
      const guide = session.type === "shape" && session.guide ? session.guide : {
        kind: "rect",
        x0: session.stroke.points[0],
        y0: session.stroke.points[1],
        x1: session.stroke.points[3],
        y1: session.stroke.points[4]
      };
      session.overlay.drawGuideOnly(guide);
      return;
    }
    session.overlay.drawLive(
      session.stroke,
      session.layerOpacity,
      session.type === "shape" ? session.guide : void 0
    );
  }
  finishSession() {
    if (!perf.enabled) {
      this.finishSessionInner();
      return;
    }
    const done = perf.start("commit.total");
    try {
      this.finishSessionInner();
    } finally {
      done();
    }
  }
  finishSessionInner() {
    this.cancelShapeHold();
    const session = this.session;
    this.session = null;
    this.pendingLive = null;
    if (this.liveRaf) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(this.liveRaf);
      else window.clearTimeout(this.liveRaf);
      this.liveRaf = 0;
    }
    if (!session) return;
    const doc = this.doc;
    const layer = doc ? findLayer(doc, session.layerId) : null;
    if (!layer) {
      session.overlay.clearLive();
      this.renderNow();
      return;
    }
    if (session.type === "stroke-erase") {
      this.finishStrokeErase(session, layer);
      return;
    }
    if (session.type === "shape") {
      const rect = this.rectFor(session.overlay, true);
      const points = session.stroke.points;
      const dx = (points[3] - points[0]) * rect.width;
      const dy = (points[4] - points[1]) * rect.height;
      if (Math.hypot(dx, dy) < MIN_SHAPE_SIZE_PX) {
        session.overlay.clearLive();
        this.renderNow();
        return;
      }
    }
    if (session.stroke.kind === "eraser-lasso" && session.stroke.points.length < 12) {
      session.overlay.clearLive();
      this.renderNow();
      return;
    }
    const stroke = session.stroke;
    if (session.type === "freehand" && Math.floor(stroke.points.length / 3) === 1 && this.plugin.tool !== "select") {
      session.overlay.clearLive();
      if (this.selectStrokeAt(session.overlay, stroke.points[0], stroke.points[1])) {
        this.plugin.log("tap select");
        this.lastTapStrokeId = null;
      } else {
        this.clearSelection();
        this.afterChange(session.overlay);
      }
      return;
    }
    if (stroke.kind === "eraser-rect" || stroke.kind === "eraser-lasso") {
      const pageW = session.overlay.widthPx || 1;
      const pageH = session.overlay.heightPx || 1;
      const eraser = stroke.kind === "eraser-rect" ? {
        kind: "rect",
        x0: stroke.points[0] * pageW,
        y0: stroke.points[1] * pageH,
        x1: stroke.points[3] * pageW,
        y1: stroke.points[4] * pageH
      } : { kind: "polygon", points: toPagePoints(stroke.points, pageW, pageH) };
      session.overlay.clearLive();
      this.applyEraseRegion(
        session.overlay,
        layer,
        eraser,
        this.plugin.settings.eraserScope
      );
      return;
    }
    if (layer.strokes.some((entry) => entry.id === stroke.id)) {
      session.overlay.clearLive();
      this.afterChange();
      return;
    }
    const guessed = session.type === "freehand" ? this.tryRecognize(stroke, session) : null;
    if (guessed) {
      this.commitRecognizedShape(session.overlay, layer, stroke, guessed);
      return;
    }
    layer.strokes.push(stroke);
    perf.mark("commit");
    if (session.type === "freehand" && Math.floor(stroke.points.length / 3) === 1) {
      this.lastTapStrokeId = stroke.id;
      this.lastTapStrokeAt = perf.now();
    }
    perf.add("stroke.points", stroke.points.length / 3);
    this.plugin.log(
      `commit kind=${stroke.kind} page=${stroke.page} points=${stroke.points.length / 3} layer=${layer.name}`
    );
    this.history.push({
      label: session.type === "shape" ? "\u5F62\u72B6" : "\u7ED8\u5236",
      undo: () => {
        const index = layer.strokes.findIndex((entry) => entry.id === stroke.id);
        if (index >= 0) layer.strokes.splice(index, 1);
      },
      redo: () => {
        if (!layer.strokes.some((entry) => entry.id === stroke.id)) {
          layer.strokes.push(stroke);
        }
      }
    });
    if (!this.commitStrokeFast(stroke, layer, session.overlay)) {
      perf.count("commit.full");
      session.overlay.clearLive();
      perf.count("commit.region");
      session.overlay.renderRegion(boundsOf([stroke]));
      this.markDirty();
      this.measureCommitFrame();
    } else {
      perf.count("commit.fast");
      this.markDirty();
      this.measureCommitFrame();
    }
  }
  /**
   * Time from "stroke committed" to the browser's next frame. Our own commit
   * costs ~0.2 ms, so anything near 100 ms here is the compositor presenting
   * the canvas — the metric that tells the two apart.
   */
  measureCommitFrame() {
    this.lastCommitAt = perf.now();
    if (typeof requestAnimationFrame !== "function") return;
    const started = this.lastCommitAt;
    requestAnimationFrame(() => {
      perf.add("commit.toFrame", perf.now() - started);
    });
  }
  /** Same measurement at stroke start, to tell "commit" from "stroke begin". */
  measureStrokeFrame() {
    if (typeof requestAnimationFrame !== "function") return;
    const started = perf.now();
    requestAnimationFrame(() => {
      perf.add("stroke.toFrame", perf.now() - started);
    });
  }
  /**
   * Try to turn a finished pen stroke into a clean shape. Conservative on
   * purpose: a false positive is far more annoying than a missed shape.
   */
  tryRecognize(stroke, session) {
    const settings = this.plugin.settings;
    if (!settings.autoShapeEnabled) return null;
    if (stroke.kind !== "pen") return null;
    if (Math.floor(stroke.points.length / 3) < 4) return null;
    if (settings.autoShapeTrigger === "hold") {
      const rested = perf.now() - session.lastPointAt;
      if (rested < settings.autoShapeHoldMs) return null;
    }
    const rect = this.rectFor(session.overlay);
    if (rect.width < 10 || rect.height < 10) return null;
    return recognizeStroke(stroke.points, rect.width, rect.height);
  }
  /**
   * Replaces hand-drawn ink with the recognized shape. Undo restores the
   * original handwriting, so a wrong guess costs one Ctrl+Z.
   */
  commitRecognizedShape(overlay, layer, original, guessed) {
    const shape = {
      ...original,
      id: uid("s"),
      kind: guessed.kind,
      points: guessed.points
    };
    this.plugin.log(
      `recognize kind=${guessed.kind} confidence=${guessed.confidence.toFixed(
        2
      )} from=${Math.floor(original.points.length / 3)} points`
    );
    perf.count("shape.recognized");
    overlay.clearLive();
    layer.strokes.push(shape);
    const index = layer.strokes.length - 1;
    this.history.push({
      label: "\u56FE\u5F62\u8BC6\u522B",
      undo: () => {
        const current = layer.strokes.findIndex((entry) => entry.id === shape.id);
        if (current >= 0) layer.strokes.splice(current, 1);
        layer.strokes.splice(Math.min(index, layer.strokes.length), 0, original);
      },
      redo: () => {
        const current = layer.strokes.findIndex((entry) => entry.id === original.id);
        if (current >= 0) layer.strokes.splice(current, 1);
        layer.strokes.splice(Math.min(index, layer.strokes.length), 0, shape);
      }
    });
    if (!this.commitStrokeFast(shape, layer, overlay)) {
      perf.count("commit.full");
      this.afterChange(overlay);
    } else {
      perf.count("commit.fast");
      this.markDirty();
    }
  }
  /**
   * Erases with a region either by cutting strokes ("涂抹") or by removing
   * whole strokes that the region touches ("整笔"). Snapshot-based undo keeps
   * the operation atomic no matter how many strokes were affected.
   */
  /**
   * Erases with a region either by cutting strokes ("涂抹") or by removing
   * whole strokes that the region touches ("整笔"). Snapshot-based undo keeps
   * the operation atomic no matter how many strokes were affected.
   */
  applyEraseRegion(overlay, layer, eraser, scope) {
    const pageW = overlay.widthPx || 1;
    const pageH = overlay.heightPx || 1;
    const before = layer.strokes.slice();
    const done = perf.start("erase.total");
    const changed = eraseInk(
      layer.strokes,
      overlay.pageNumber,
      eraser,
      scope,
      pageW,
      pageH,
      () => uid("s")
    );
    done();
    if (changed === 0) {
      this.renderNow();
      return;
    }
    const after = layer.strokes.slice();
    this.clearSelection();
    this.plugin.log(`erase region scope=${scope} changed=${changed}`);
    perf.count(scope === "whole" ? "erase.whole" : "erase.partial");
    this.history.push({
      label: scope === "whole" ? "\u6574\u7B14\u64E6\u9664" : "\u64E6\u9664",
      undo: () => {
        layer.strokes.splice(0, layer.strokes.length, ...before);
      },
      redo: () => {
        layer.strokes.splice(0, layer.strokes.length, ...after);
      }
    });
    perf.count("erase.region");
    overlay.renderRegion(this.eraseGeometryBox(eraser, pageW, pageH));
    this.markDirty();
  }
  /** Pixel bbox of an erase geometry, as normalized page coordinates. */
  eraseGeometryBox(eraser, pageW, pageH) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (x, y, pad) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x - pad < x0) x0 = x - pad;
      if (x + pad > x1) x1 = x + pad;
      if (y - pad < y0) y0 = y - pad;
      if (y + pad > y1) y1 = y + pad;
    };
    if (eraser.kind === "rect") {
      add(eraser.x0, eraser.y0, 0);
      add(eraser.x1, eraser.y1, 0);
    } else if (eraser.kind === "polygon") {
      for (const [x, y] of eraser.points) add(x, y, 0);
    } else {
      let radius = eraser.radius;
      for (const value of eraser.radii ?? []) {
        if (value > radius) radius = value;
      }
      const pad = radius * 1.5 + 4;
      for (const [x, y] of eraser.points) add(x, y, pad);
    }
    if (!Number.isFinite(x0)) {
      return { x0: 0, y0: 0, x1: 1, y1: 1 };
    }
    return {
      x0: x0 / Math.max(1, pageW),
      y0: y0 / Math.max(1, pageH),
      x1: x1 / Math.max(1, pageW),
      y1: y1 / Math.max(1, pageH)
    };
  }
  /**
   * Fast path: when the finished stroke belongs to the topmost visible layer,
   * paint only that stroke onto the existing composite instead of re-rendering
   * every stroke on the page. This is what keeps fast handwriting responsive.
   */
  commitStrokeFast(stroke, layer, overlay) {
    const doc = this.doc;
    if (!doc) return false;
    if (stroke.kind === "eraser" || stroke.kind === "eraser-rect" || stroke.kind === "eraser-lasso") {
      return false;
    }
    let top = null;
    for (const candidate of doc.layers) {
      if (candidate.visible && candidate.opacity > 0) top = candidate;
    }
    if (top !== layer) return false;
    if (stroke.kind === "pen" || stroke.kind === "highlighter") {
      overlay.commitLive(stroke, layer.opacity);
    } else {
      overlay.appendCommitted(stroke, layer.opacity);
    }
    return true;
  }
  pruneErasedStrokes(layer, eraser, overlay) {
    const removed = [];
    const pageW = overlay.widthPx || 1;
    const pageH = overlay.heightPx || 1;
    for (let i = layer.strokes.length - 1; i >= 0; i--) {
      const candidate = layer.strokes[i];
      if (candidate.page !== eraser.page || candidate.id === eraser.id) continue;
      if (candidate.kind === "eraser" || candidate.kind === "eraser-rect" || candidate.kind === "eraser-lasso") {
        continue;
      }
      if (!this.isFullyErased(candidate, eraser, pageW, pageH)) continue;
      layer.strokes.splice(i, 1);
      removed.push({ stroke: candidate, index: i });
    }
    return removed;
  }
  isFullyErased(stroke, eraser, pageW, pageH) {
    const points = stroke.points;
    const count = Math.floor(points.length / 3);
    if (count < 1) return false;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = points[i * 3] * pageW;
      const y = points[i * 3 + 1] * pageH;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const ep = eraser.points;
    if (eraser.kind === "eraser-lasso") {
      const polygon = [];
      for (let i = 0; i < ep.length / 3; i++) {
        polygon.push([ep[i * 3] * pageW, ep[i * 3 + 1] * pageH]);
      }
      if (polygon.length < 3) return false;
      const inside = (x, y) => {
        let result = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const [xi, yi] = polygon[i];
          const [xj, yj] = polygon[j];
          if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
            result = !result;
          }
        }
        return result;
      };
      const corners2 = [
        [minX, minY],
        [maxX, minY],
        [minX, maxY],
        [maxX, maxY]
      ];
      for (let i = 0; i < count; i++) {
        if (!inside(points[i * 3] * pageW, points[i * 3 + 1] * pageH)) return false;
      }
      for (const [x, y] of corners2) {
        if (!inside(x, y)) return false;
      }
      return true;
    }
    if (eraser.kind === "eraser-rect") {
      if (ep.length < 6) return false;
      const x0 = Math.min(ep[0], ep[3]) * pageW;
      const x1 = Math.max(ep[0], ep[3]) * pageW;
      const y0 = Math.min(ep[1], ep[4]) * pageH;
      const y1 = Math.max(ep[1], ep[4]) * pageH;
      return minX >= x0 && maxX <= x1 && minY >= y0 && maxY <= y1;
    }
    const radius = Math.max(1, eraser.width * pageW / 2);
    const segments = [];
    for (let i = 0; i < ep.length / 3; i++) {
      segments.push(ep[i * 3] * pageW, ep[i * 3 + 1] * pageH);
    }
    const corners = [
      [minX, minY],
      [maxX, minY],
      [minX, maxY],
      [maxX, maxY]
    ];
    const check = (x, y) => {
      for (let i = 0; i < segments.length - 2; i += 2) {
        if (distanceToSegmentSq(
          x,
          y,
          segments[i],
          segments[i + 1],
          segments[i + 2],
          segments[i + 3]
        ) <= radius * radius) {
          return true;
        }
      }
      return false;
    };
    for (let i = 0; i < count; i++) {
      if (!check(points[i * 3] * pageW, points[i * 3 + 1] * pageH)) return false;
    }
    for (const [x, y] of corners) {
      if (!check(x, y)) return false;
    }
    return true;
  }
  extendErase(event, overlay, session) {
    const rect = this.rectFor(overlay);
    const point = this.pointFor(event, overlay, rect);
    if (!point) return;
    const distance2 = Math.hypot(
      (point.x - session.lastX) * rect.width,
      (point.y - session.lastY) * rect.height
    );
    const steps = Math.max(1, Math.min(48, Math.ceil(distance2 / 2)));
    const pressure = this.eraserPressure(point.p);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      session.stroke.points.push(
        session.lastX + (point.x - session.lastX) * t,
        session.lastY + (point.y - session.lastY) * t,
        pressure
      );
    }
    this.showEraserCursorAt(event.clientX, event.clientY, overlay, point.p);
    session.lastX = point.x;
    session.lastY = point.y;
    this.requestErasePreview();
  }
  requestErasePreview() {
    if (this.eraseRaf) return;
    const run = () => {
      this.eraseRaf = 0;
      const session = this.erased;
      if (session) {
        session.overlay.render({
          layerId: session.layerId,
          stroke: session.stroke
        });
      }
    };
    this.eraseRaf = window.requestAnimationFrame ? window.requestAnimationFrame(run) : window.setTimeout(run, 16);
  }
  finishErase() {
    const session = this.erased;
    this.erased = null;
    const fromHold = this.pressureErasing;
    this.pressureErasing = false;
    if (this.eraseRaf) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(this.eraseRaf);
      else window.clearTimeout(this.eraseRaf);
      this.eraseRaf = 0;
    }
    if (!session) return;
    if (fromHold) {
      this.plugin.log(`hold erase end points=${session.stroke.points.length / 3}`);
      if (this.plugin.tool !== "eraser") this.hideEraserCursor();
    }
    const doc = this.doc;
    const layer = doc ? findLayer(doc, session.layerId) : null;
    session.overlay.clearLive();
    if (!layer) {
      this.renderNow();
      return;
    }
    const pageW = session.overlay.widthPx || 1;
    const pageH = session.overlay.heightPx || 1;
    const trail = [];
    const points = session.stroke.points;
    for (let i = 0; i < points.length; i += 3) {
      trail.push([points[i] * pageW, points[i + 1] * pageH]);
    }
    const radius = Math.max(2, session.stroke.width * pageW / 2);
    const radii = [];
    if (this.plugin.settings.eraserPressureSize) {
      let varies = false;
      let min = 1;
      let max = 0;
      for (let i = 2; i < points.length; i += 3) {
        const p = Number.isFinite(points[i]) ? points[i] : 0.5;
        if (p < min) min = p;
        if (p > max) max = p;
      }
      varies = max - min > 0.03;
      if (varies) {
        for (let i = 0; i < points.length; i += 3) {
          const p = Number.isFinite(points[i + 2]) ? points[i + 2] : 0.5;
          radii.push(radius * pressureWidthFactor(p));
        }
      }
    }
    this.applyEraseRegion(
      session.overlay,
      layer,
      { kind: "swath", points: trail, radius, ...radii.length > 0 ? { radii } : {} },
      "partial"
    );
  }
  finishInteractions() {
    this.cancelHoldErase();
    this.cancelShapeHold();
    if (this.session) this.finishSession();
    if (this.erased) this.finishErase();
    if (this.selectSession) this.finishSelection();
    if (this.moveSession) this.finishMoveSelection();
    this.detachStrokeListeners();
    this.setStroking(false);
  }
  getWritableLayer() {
    const doc = this.doc;
    if (!doc) return null;
    const layer = getActiveLayer(doc);
    if (!layer) return null;
    if (!layer.visible) {
      this.notice("\u5F53\u524D\u56FE\u5C42\u5DF2\u9690\u85CF\uFF0C\u65E0\u6CD5\u7ED8\u5236");
      return null;
    }
    if (layer.locked) {
      this.notice("\u5F53\u524D\u56FE\u5C42\u5DF2\u9501\u5B9A\uFF0C\u65E0\u6CD5\u7ED8\u5236");
      return null;
    }
    return layer;
  }
  /**
   * Toggles the in-stroke CSS state.
   *
   * Deliberately does NOT touch `body` any more: the old `pdf-ink-writing`
   * body class switched other plugins' `backdrop-filter` off twice per stroke
   * (dev.44) and every toggle forced those blurred surfaces to re-rasterize.
   * dev.51 already found the trick useless; the 137 ms `commit.toFrame` is
   * what made removing it non-negotiable.
   */
  setStroking(active) {
    this.syncPointerTargets(active);
    if (!active) this.compatShieldUntil = perf.now() + 350;
    if (active) this.measureStrokeFrame();
  }
  /** Makes our live canvas hit-testable (and the text layer inert) in place. */
  syncPointerTargets(stroking) {
    const hideText = stroking || this.drawing;
    for (const overlay of this.overlays.values()) {
      overlay.live.style.pointerEvents = hideText ? "auto" : "";
      overlay.live.style.cursor = hideText ? "crosshair" : "";
      const layers = overlay.pageEl.querySelectorAll(".textLayer");
      layers.forEach((layer) => {
        layer.style.pointerEvents = hideText ? "none" : "";
      });
    }
  }
  /**
   * Cursor policy (scheme C):
   *  - thin pen / highlighter (<= 6 px): CSS dot-with-short-arms, zero latency
   *  - thick pen / highlighter: a ring the size of the brush, drawn in DOM
   *  - freehand eraser: the translucent disc
   *  - everything else: the plain crosshair
   */
  /**
   * Re-evaluates the cursor for a pen position.
   *
   * Needed while the brush is resized (Shift + touch): the hover handler is
   * not running then, so crossing the thin/thick threshold left the ring
   * hidden but never applied the fine-point cursor — the pen looked invisible.
   */
  refreshCursor(event) {
    this.updateHoverCursor(event);
  }
  updateHoverCursor(event) {
    const tool = this.plugin.tool;
    const pageEl = event.target?.closest?.(
      ".page"
    );
    const isInk = tool === "pen" || tool === "highlighter";
    const wantsRing = isInk && Boolean(pageEl);
    let size = 0;
    if (wantsRing) {
      const brush = this.plugin.brushFor(tool);
      const pageWidth = pageEl?.clientWidth || pageEl?.getBoundingClientRect().width || 1;
      size = clamp(brush.widthPx * pageWidth / REFERENCE_PAGE_WIDTH, 2, 160);
    }
    const thin = wantsRing && size <= THIN_BRUSH_PX;
    this.containerEl.classList.toggle("pdf-ink-cursor-point", thin);
    this.containerEl.classList.toggle("pdf-ink-cursor-ring", wantsRing && !thin);
    if (!wantsRing || thin) this.hideBrushRing();
    if (wantsRing && !thin) this.showBrushRingAt(event.clientX, event.clientY, size);
    if (this.eraserDiscVisible() && pageEl) this.showEraserDisc(event, pageEl);
    else this.hideEraserCursor();
  }
  ensureBrushRing() {
    if (this.brushRing?.isConnected) return this.brushRing;
    const el2 = this.containerEl.ownerDocument.createElement("div");
    el2.className = "pdf-ink-brush-ring";
    this.containerEl.appendChild(el2);
    this.brushRing = el2;
    return el2;
  }
  /** Ring sized to the brush, positioned with a transform (no layout). */
  showBrushRingAt(clientX, clientY, size) {
    const hostRect = this.containerEl.getBoundingClientRect();
    const ring = this.ensureBrushRing();
    ring.style.display = "block";
    ring.style.width = `${size}px`;
    ring.style.height = `${size}px`;
    ring.style.transform = `translate3d(${clientX - hostRect.left - size / 2}px, ${clientY - hostRect.top - size / 2}px, 0)`;
  }
  trackBrushRing(event, overlay) {
    if (!this.containerEl.classList.contains("pdf-ink-cursor-ring")) return;
    const tool = this.plugin.tool;
    if (tool !== "pen" && tool !== "highlighter") return;
    const brush = this.plugin.brushFor(tool);
    const size = clamp(
      brush.widthPx * (overlay.widthPx || 1) / REFERENCE_PAGE_WIDTH,
      2,
      160
    );
    this.showBrushRingAt(event.clientX, event.clientY, size);
  }
  hideBrushRing() {
    if (this.brushRing) this.brushRing.style.display = "none";
  }
  /** Translucent disc preview for the freehand eraser. */
  showEraserDisc(event, pageEl) {
    const hostRect = this.containerEl.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    const pageWidth = pageEl.clientWidth || pageRect.width || 1;
    const size = clamp(
      this.plugin.settings.eraserWidth * pageWidth / REFERENCE_PAGE_WIDTH,
      4,
      160
    );
    const cursor = this.ensureEraserCursor();
    cursor.style.display = "block";
    cursor.style.width = `${size}px`;
    cursor.style.height = `${size}px`;
    cursor.style.transform = `translate3d(${event.clientX - hostRect.left - size / 2}px, ${event.clientY - hostRect.top - size / 2}px, 0)`;
  }
  /**
   * Remembers where the pen is hovering (no contact needed). Paste drops the
   * clipboard at this point instead of asking for a selection first.
   */
  rememberHover(event) {
    const target = event.target;
    const pageEl = target?.closest?.(".page");
    if (!pageEl) return;
    const pageNumber = Number(pageEl.dataset.pageNumber);
    const overlay = this.overlays.get(pageNumber);
    if (!overlay) return;
    const rect = overlay.live.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.hoverPoint = { overlay, x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }
  ensureEraserCursor() {
    if (this.eraserCursor?.isConnected) return this.eraserCursor;
    const el2 = this.containerEl.ownerDocument.createElement("div");
    el2.className = "pdf-ink-eraser-cursor";
    this.containerEl.appendChild(el2);
    this.eraserCursor = el2;
    return el2;
  }
  /** White translucent disc used for eraser + hold-to-erase feedback. */
  showEraserCursorAt(clientX, clientY, overlay, pressure) {
    const hostRect = this.containerEl.getBoundingClientRect();
    const pageWidth = overlay.widthPx || 1;
    const factor = this.plugin.settings.eraserPressureSize ? pressureWidthFactor(pressure) : 1;
    const size = clamp(
      this.plugin.settings.eraserWidth * pageWidth / REFERENCE_PAGE_WIDTH * factor,
      4,
      160
    );
    const cursor = this.ensureEraserCursor();
    cursor.style.display = "block";
    cursor.style.width = `${size}px`;
    cursor.style.height = `${size}px`;
    cursor.style.transform = `translate3d(${clientX - hostRect.left - size / 2}px, ${clientY - hostRect.top - size / 2}px, 0)`;
  }
  /** The translucent disc belongs to the freehand eraser only. */
  eraserDiscVisible() {
    return this.plugin.tool === "eraser" && this.plugin.settings.eraserRegion === "free";
  }
  /** While Alt is held the canvas must not swallow text selection / links. */
  /**
   * Text selection / link clicking is opt-in: it only works in the select
   * tool while Alt is held. Everywhere else the text layer must not receive
   * pointer events, or the pen would drag text instead of drawing.
   */
  setAltPassthrough(active) {
    this.altHeld = active;
    this.applyAltPassthrough();
  }
  notice(message) {
    const now = Date.now();
    if (now - this.lastNotice < 2e3) return;
    this.lastNotice = now;
    new import_obsidian4.Notice(`[PDF Ink] ${message}`);
  }
  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */
  renderNow() {
    for (const overlay of this.overlays.values()) {
      overlay.setDoc(this.doc);
      overlay.measure();
      overlay.render();
    }
    this.renderSelection();
  }
  requestRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    const run = () => {
      this.renderQueued = false;
      this.renderNow();
    };
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(run);
    } else {
      run();
    }
  }
  scheduleDeferredRender() {
    this.requestRender();
    window.setTimeout(() => this.requestRender(), 120);
  }
  refreshLayout() {
    this.rectCache = null;
    for (const overlay of this.overlays.values()) overlay.measure();
    this.requestRender();
  }
  hookLayoutListeners() {
    if (this.layoutHooked) return;
    this.layoutHooked = true;
    window.addEventListener("scroll", this.onLayoutShift, true);
    window.addEventListener("wheel", this.onLayoutShift, { passive: true, capture: true });
    window.addEventListener("resize", this.onLayoutShift);
    this.containerEl.ownerDocument.addEventListener("contextmenu", this.onDocumentContextMenu, true);
  }
  unhookLayoutListeners() {
    if (!this.layoutHooked) return;
    this.layoutHooked = false;
    window.removeEventListener("scroll", this.onLayoutShift, true);
    window.removeEventListener("wheel", this.onLayoutShift, true);
    window.removeEventListener("resize", this.onLayoutShift);
    this.containerEl.ownerDocument.removeEventListener(
      "contextmenu",
      this.onDocumentContextMenu,
      true
    );
  }
  afterChange(target) {
    const done = perf.start("render.afterChange");
    try {
      if (target && this.overlays.get(target.pageNumber) === target) {
        target.ensureAttached();
        target.measure();
        target.render();
      } else {
        this.renderNow();
      }
    } finally {
      done();
    }
    this.markDirty();
  }
  markDirty() {
    if (!this.doc || !this.filePath) return;
    const done = perf.start("dirty.save");
    try {
      this.plugin.storage.scheduleSave(this.filePath, this.doc);
      this.notify();
    } finally {
      done();
    }
  }
  notify() {
    this.toolbar?.update();
    this.plugin.emitter.trigger("pdf-ink:doc-changed", this);
  }
  /* ------------------------------------------------------------------ */
  /* Undo / redo                                                         */
  /* ------------------------------------------------------------------ */
  undo() {
    if (this.history.undo()) this.afterChange();
  }
  redo() {
    if (this.history.redo()) this.afterChange();
  }
  /* ------------------------------------------------------------------ */
  /* Layers                                                              */
  /* ------------------------------------------------------------------ */
  addLayer() {
    const doc = this.doc;
    if (!doc) return null;
    const layer = createLayer(`\u56FE\u5C42 ${doc.layers.length + 1}`);
    doc.layers.push(layer);
    doc.activeLayerId = layer.id;
    const previousActive = doc.activeLayerId;
    this.history.push({
      label: "\u65B0\u5EFA\u56FE\u5C42",
      undo: () => {
        const index = doc.layers.indexOf(layer);
        if (index >= 0) doc.layers.splice(index, 1);
        if (doc.activeLayerId === layer.id) {
          doc.activeLayerId = doc.layers[doc.layers.length - 1]?.id ?? null;
        }
      },
      redo: () => {
        if (!doc.layers.includes(layer)) doc.layers.push(layer);
        doc.activeLayerId = previousActive;
      }
    });
    this.afterChange();
    return layer;
  }
  deleteLayer(layerId) {
    const doc = this.doc;
    if (!doc) return;
    const index = doc.layers.findIndex((layer2) => layer2.id === layerId);
    if (index < 0) return;
    const layer = doc.layers[index];
    const previousActive = doc.activeLayerId;
    doc.layers.splice(index, 1);
    let fallback = null;
    if (doc.layers.length === 0) {
      fallback = createLayer("\u56FE\u5C42 1");
      doc.layers.push(fallback);
      doc.activeLayerId = fallback.id;
    } else if (doc.activeLayerId === layer.id) {
      doc.activeLayerId = doc.layers[Math.min(index, doc.layers.length - 1)]?.id ?? null;
    }
    const createdFallback = fallback;
    this.history.push({
      label: "\u5220\u9664\u56FE\u5C42",
      undo: () => {
        if (createdFallback) {
          const fallbackIndex = doc.layers.indexOf(createdFallback);
          if (fallbackIndex >= 0) doc.layers.splice(fallbackIndex, 1);
        }
        doc.layers.splice(index, 0, layer);
        doc.activeLayerId = previousActive ?? layer.id;
      },
      redo: () => {
        const current = doc.layers.indexOf(layer);
        if (current >= 0) doc.layers.splice(current, 1);
        if (createdFallback) {
          if (!doc.layers.includes(createdFallback)) doc.layers.push(createdFallback);
          doc.activeLayerId = createdFallback.id;
        } else if (doc.activeLayerId === layer.id) {
          doc.activeLayerId = doc.layers[Math.min(index, doc.layers.length - 1)]?.id ?? doc.layers[doc.layers.length - 1]?.id ?? null;
        }
      }
    });
    this.afterChange();
  }
  setActiveLayer(layerId) {
    const doc = this.doc;
    if (!doc || !findLayer(doc, layerId)) return;
    doc.activeLayerId = layerId;
    this.markDirty();
  }
  renameLayer(layerId, name) {
    const doc = this.doc;
    const layer = doc ? findLayer(doc, layerId) : null;
    if (!layer) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    layer.name = trimmed;
    this.markDirty();
  }
  setLayerVisible(layerId, visible) {
    const doc = this.doc;
    const layer = doc ? findLayer(doc, layerId) : null;
    if (!layer) return;
    layer.visible = visible;
    this.afterChange();
  }
  setLayerLocked(layerId, locked) {
    const doc = this.doc;
    const layer = doc ? findLayer(doc, layerId) : null;
    if (!layer) return;
    layer.locked = locked;
    this.markDirty();
  }
  setLayerOpacity(layerId, opacity) {
    const doc = this.doc;
    const layer = doc ? findLayer(doc, layerId) : null;
    if (!layer) return;
    layer.opacity = clamp(opacity, 0, 1);
    this.afterChange();
  }
  moveLayer(layerId, delta) {
    const doc = this.doc;
    if (!doc) return;
    const index = doc.layers.findIndex((layer2) => layer2.id === layerId);
    if (index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= doc.layers.length) return;
    const [layer] = doc.layers.splice(index, 1);
    doc.layers.splice(target, 0, layer);
    this.history.push({
      label: "\u8C03\u6574\u56FE\u5C42\u987A\u5E8F",
      undo: () => {
        const current = doc.layers.indexOf(layer);
        if (current < 0) return;
        doc.layers.splice(current, 1);
        doc.layers.splice(index, 0, layer);
      },
      redo: () => {
        const current = doc.layers.indexOf(layer);
        if (current < 0) return;
        doc.layers.splice(current, 1);
        doc.layers.splice(target, 0, layer);
      }
    });
    this.afterChange();
  }
  /* ------------------------------------------------------------------ */
  /* Diagnostics                                                         */
  /* ------------------------------------------------------------------ */
  debugInfo() {
    const viewerEl = this.viewerEl;
    const count = (selector) => viewerEl ? viewerEl.querySelectorAll(selector).length : -1;
    const styleOf = (el2) => {
      if (!el2) return null;
      const win = el2.ownerDocument.defaultView;
      const cs = win?.getComputedStyle(el2);
      if (!cs) return null;
      return {
        position: cs.position,
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
        display: cs.display,
        overflow: cs.overflow,
        width: cs.width,
        height: cs.height
      };
    };
    const rectOf = (el2) => {
      const rect = el2.getBoundingClientRect();
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      };
    };
    const firstPage = this.pageEls.values().next().value;
    return {
      filePath: this.filePath,
      viewType: this.view?.getViewType?.(),
      hasViewer: this.hasViewer,
      pdfContainerFound: Boolean(this.containerEl?.querySelector(".pdf-container")),
      viewerFound: Boolean(viewerEl),
      viewerRect: viewerEl ? rectOf(viewerEl) : null,
      hooked: Boolean(this.hookedBus),
      viewerResolved: Boolean(this.pdfWrapper),
      componentResolved: Boolean(this.component),
      domKeys: this.pdfWrapper?.dom ? Object.keys(this.pdfWrapper.dom) : [],
      viewerClass: viewerEl?.className ?? null,
      viewerChildren: viewerEl?.childElementCount ?? 0,
      selectorCounts: {
        page: count(".page"),
        pageWithNumber: count("div.page[data-page-number]"),
        anyPageNumber: count("[data-page-number]"),
        canvasWrapper: count(".canvasWrapper"),
        canvas: count("canvas"),
        total: count("*")
      },
      pageEls: [...this.pageEls.keys()],
      overlays: [...this.overlays.entries()].map(([page, overlay]) => ({
        page,
        css: `${overlay.widthPx}x${overlay.heightPx}`,
        rect: rectOf(overlay.live),
        style: styleOf(overlay.live),
        pageStyle: styleOf(overlay.pageEl),
        canvases: overlay.pageEl.querySelectorAll("canvas").length,
        backing: `${overlay.committed.width}x${overlay.committed.height}`
      })),
      firstPage: firstPage ? {
        class: firstPage.className,
        rect: rectOf(firstPage),
        style: styleOf(firstPage),
        parentClass: firstPage.parentElement?.className ?? null,
        children: firstPage.children.length
      } : null,
      drawing: this.drawing,
      toolbar: Boolean(this.toolbar),
      doc: this.doc ? {
        layers: this.doc.layers.length,
        strokes: this.doc.layers.reduce(
          (sum, layer) => sum + layer.strokes.length,
          0
        ),
        // Real document size. `perf.counters["save.points"]` is a
        // running total across saves and reads ~20x larger — it is
        // not the annotation size and must not be quoted as such.
        points: this.doc.layers.reduce(
          (sum, layer) => sum + layer.strokes.reduce(
            (total, stroke) => total + stroke.points.length / 3,
            0
          ),
          0
        ),
        ringPoints: this.doc.layers.reduce(
          (sum, layer) => sum + layer.strokes.reduce(
            (total, stroke) => total + (stroke.rings ?? []).reduce(
              (ringTotal, ring) => ringTotal + ring.length / 2,
              0
            ),
            0
          ),
          0
        ),
        eraserMasks: this.doc.layers.reduce(
          (sum, layer) => sum + layer.strokes.filter(
            (stroke) => stroke.kind.startsWith("eraser")
          ).length,
          0
        ),
        activeLayerId: this.doc.activeLayerId
      } : null
    };
  }
  /* ------------------------------------------------------------------ */
  /* Cleanup                                                             */
  /* ------------------------------------------------------------------ */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.attachTimer !== null) window.clearTimeout(this.attachTimer);
    this.finishInteractions();
    this.unhook();
    this.io?.disconnect();
    this.io = null;
    this.domObserver?.disconnect();
    this.domObserver = null;
    this.pageResizeObserver?.disconnect();
    this.pageResizeObserver = null;
    for (const pageNumber of [...this.overlays.keys()]) this.unmount(pageNumber);
    this.containerEl.removeEventListener("pointermove", this.onHoverPointerMove);
    this.containerEl.removeEventListener("pointerleave", this.hideHoverCursor);
    for (const type of ["mousedown", "mouseup", "click", "dblclick"]) {
      window.removeEventListener(type, this.onCompatMouse, true);
    }
    this.compatShieldUntil = 0;
    this.eraserCursor?.remove();
    this.eraserCursor = null;
    this.toolbar?.destroy();
    this.toolbar = null;
    this.unhookLayoutListeners();
    this.containerEl.classList.remove("pdf-ink-drawing");
    this.containerEl.classList.remove("pdf-ink-stroking");
    this.containerEl.classList.remove("pdf-ink-host");
    this.containerEl.ownerDocument.body.classList.remove("pdf-ink-writing");
  }
};

// src/keys.ts
var ACTIONS = [
  { id: "tool:pen", name: "\u94A2\u7B14", group: "\u5DE5\u5177", defaultSpec: "p", tool: "pen" },
  { id: "tool:highlighter", name: "\u8367\u5149\u7B14", group: "\u5DE5\u5177", defaultSpec: "h", tool: "highlighter" },
  { id: "tool:eraser", name: "\u6A61\u76AE", group: "\u5DE5\u5177", defaultSpec: "e", tool: "eraser" },
  { id: "tool:select", name: "\u9009\u62E9", group: "\u5DE5\u5177", defaultSpec: "s", tool: "select" },
  { id: "tool:line", name: "\u76F4\u7EBF", group: "\u5DE5\u5177", defaultSpec: "l", tool: "line" },
  { id: "tool:arrow", name: "\u7BAD\u5934", group: "\u5DE5\u5177", defaultSpec: "a", tool: "arrow" },
  { id: "tool:rect", name: "\u77E9\u5F62", group: "\u5DE5\u5177", defaultSpec: "r", tool: "rect" },
  { id: "tool:ellipse", name: "\u692D\u5706", group: "\u5DE5\u5177", defaultSpec: "o", tool: "ellipse" },
  { id: "tool:hand", name: "\u62D6\u62FD\u9875\u9762", group: "\u5DE5\u5177", defaultSpec: "g", tool: "hand" },
  { id: "color:1", name: "\u8C03\u8272\u677F\u7B2C 1 \u8272", group: "\u989C\u8272", defaultSpec: "1", colorIndex: 0 },
  { id: "color:2", name: "\u8C03\u8272\u677F\u7B2C 2 \u8272", group: "\u989C\u8272", defaultSpec: "2", colorIndex: 1 },
  { id: "color:3", name: "\u8C03\u8272\u677F\u7B2C 3 \u8272", group: "\u989C\u8272", defaultSpec: "3", colorIndex: 2 },
  { id: "color:4", name: "\u8C03\u8272\u677F\u7B2C 4 \u8272", group: "\u989C\u8272", defaultSpec: "4", colorIndex: 3 },
  { id: "color:5", name: "\u8C03\u8272\u677F\u7B2C 5 \u8272", group: "\u989C\u8272", defaultSpec: "5", colorIndex: 4 },
  { id: "color:6", name: "\u8C03\u8272\u677F\u7B2C 6 \u8272", group: "\u989C\u8272", defaultSpec: "6", colorIndex: 5 },
  { id: "color:7", name: "\u8C03\u8272\u677F\u7B2C 7 \u8272", group: "\u989C\u8272", defaultSpec: "7", colorIndex: 6 },
  { id: "color:8", name: "\u8C03\u8272\u677F\u7B2C 8 \u8272", group: "\u989C\u8272", defaultSpec: "8", colorIndex: 7 },
  { id: "color:9", name: "\u8C03\u8272\u677F\u7B2C 9 \u8272", group: "\u989C\u8272", defaultSpec: "9", colorIndex: 8 }
];
var MOD_ALIASES = {
  ctrl: "ctrl",
  control: "ctrl",
  mod: "ctrl",
  cmd: "ctrl",
  command: "ctrl",
  meta: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift"
};
var PRETTY_KEYS = {
  space: "Space",
  escape: "Esc",
  enter: "Enter",
  tab: "Tab",
  arrowup: "\u2191",
  arrowdown: "\u2193",
  arrowleft: "\u2190",
  arrowright: "\u2192",
  pageup: "PgUp",
  pagedown: "PgDn",
  home: "Home",
  end: "End",
  backspace: "Backspace",
  delete: "Delete",
  bracketleft: "[",
  bracketright: "]",
  comma: ",",
  period: ".",
  slash: "/",
  semicolon: ";",
  quote: "'",
  backslash: "\\",
  minus: "-",
  equal: "=",
  backquote: "`"
};
function normalizeKeyName(key) {
  if (!key) return "";
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") {
    return "";
  }
  if (key === " ") return "space";
  return key.length === 1 ? key.toLowerCase() : key.toLowerCase();
}
function parseKeySpec(spec) {
  const raw = spec.trim();
  if (!raw) return null;
  const tokens = raw.toLowerCase().split("+").map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) return null;
  const key = tokens.pop();
  if (!key) return null;
  if (MOD_ALIASES[key]) return null;
  const mods = [];
  for (const token of tokens) {
    const mod = MOD_ALIASES[token];
    if (mod && !mods.includes(mod)) mods.push(mod);
  }
  return { mods, key };
}
function normalizeSpec(spec) {
  const parsed = parseKeySpec(spec);
  if (!parsed) return "";
  const parts = [];
  for (const mod of ["ctrl", "alt", "shift"]) {
    if (parsed.mods.includes(mod)) parts.push(mod);
  }
  parts.push(parsed.key);
  return parts.join("+");
}
function formatKeySpec(spec) {
  const parsed = parseKeySpec(spec);
  if (!parsed) return "";
  const parts = [];
  if (parsed.mods.includes("ctrl")) parts.push("Ctrl");
  if (parsed.mods.includes("alt")) parts.push("Alt");
  if (parsed.mods.includes("shift")) parts.push("Shift");
  const pretty = PRETTY_KEYS[parsed.key];
  if (pretty) parts.push(pretty);
  else if (parsed.key.length === 1) parts.push(parsed.key.toUpperCase());
  else parts.push(parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1));
  return parts.join("+");
}
function specFromEvent(event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  const key = normalizeKeyName(event.key);
  if (!key) return "";
  parts.push(key);
  return parts.join("+");
}
function matchesSpec(spec, event) {
  const parsed = parseKeySpec(spec);
  if (!parsed) return false;
  const hasCtrl = event.ctrlKey || event.metaKey;
  if (parsed.mods.includes("ctrl") !== hasCtrl) return false;
  if (parsed.mods.includes("alt") !== event.altKey) return false;
  if (parsed.mods.includes("shift") !== event.shiftKey) return false;
  return normalizeKeyName(event.key) === parsed.key;
}
function resolveBindings(saved) {
  const out = {};
  for (const action of ACTIONS) {
    if (saved && Object.prototype.hasOwnProperty.call(saved, action.id)) {
      out[action.id] = saved[action.id] ?? "";
    } else {
      out[action.id] = action.defaultSpec;
    }
  }
  return out;
}
function actionIdForSpec(spec, bindings) {
  const wanted = normalizeSpec(spec);
  if (!wanted) return null;
  for (const action of ACTIONS) {
    if (normalizeSpec(bindings[action.id] ?? "") === wanted) return action.id;
  }
  return null;
}
function findConflicts(bindings) {
  const seen = /* @__PURE__ */ new Map();
  for (const action of ACTIONS) {
    const spec = normalizeSpec(bindings[action.id] ?? "");
    if (!spec) continue;
    const list = seen.get(spec);
    if (list) list.push(action.id);
    else seen.set(spec, [action.id]);
  }
  const conflicts = {};
  for (const [spec, ids] of seen) {
    if (ids.length > 1) conflicts[spec] = ids;
  }
  return conflicts;
}

// src/settings.ts
var import_obsidian5 = require("obsidian");
var DEFAULT_SETTINGS = {
  folder: "\u9644\u4EF6/Ink \u6807\u6CE8",
  inputMode: "auto",
  keyBindings: {},
  keyHolds: {},
  logKeyEvents: false,
  tempEraserKey: "f",
  tempEraserMouse: "off",
  tapGestureMenuEnabled: true,
  blurShield: true,
  lowLatencyLive: false,
  penAdjustSpeed: 5,
  penColor: "#e03131",
  penWidth: 2.5,
  penOpacity: 1,
  brushPresets: {
    pen: [
      { id: "p-red-25", name: "\u7EA2 \xB7 2.5", color: "#e03131", widthPx: 2.5, opacity: 1 },
      { id: "p-black-25", name: "\u9ED1 \xB7 2.5", color: "#1e1e1e", widthPx: 2.5, opacity: 1 },
      { id: "p-blue-5", name: "\u84DD \xB7 5", color: "#1971c2", widthPx: 5, opacity: 1 }
    ],
    highlighter: [
      { id: "h-yellow-12", name: "\u9EC4 \xB7 12", color: "#ffd43b", widthPx: 12, opacity: 0.5 }
    ],
    eraser: [
      { id: "e-free-16", name: "\u6D82\u62B9 \xB7 16", region: "free", scope: "partial", widthPx: 16 }
    ]
  },
  quickColors: ["#1e1e1e", "#e03131", "#1971c2"],
  highlighterColor: "#ffd43b",
  highlighterWidth: 12,
  highlighterOpacity: 0.5,
  eraserWidth: 16,
  eraserRegion: "free",
  eraserScope: "partial",
  eraserHoldEnabled: true,
  eraserHoldMs: 750,
  eraserHoldWindowMs: 1e3,
  eraserHoldRadiusPx: 10,
  eraserHoldPressure: 0.55,
  eraserPressureSize: true,
  autoShapeEnabled: true,
  autoShapeTrigger: "hold",
  autoShapeHoldMs: 600,
  selectMode: "rect",
  inkQuality: "smooth",
  palette: [
    "#1e1e1e",
    "#e03131",
    "#1971c2",
    "#2f9e44",
    "#f08c00",
    "#7048e8",
    "#e64980",
    "#15aabf",
    "#8b5a2b",
    "#868e96",
    "#1c3f94",
    "#9c2b2b"
  ],
  recentColors: [],
  stylusFreehand: true,
  mouseFreehand: false,
  showToolbarAlways: true,
  toolbarLayout: "horizontal",
  toolbarPos: null
};
var PdfInkSettingTab = class extends import_obsidian5.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    while (containerEl.firstChild) containerEl.removeChild(containerEl.firstChild);
    containerEl.createEl("h2", { text: "PDF Ink \u8BBE\u7F6E" });
    new import_obsidian5.Setting(containerEl).setName("\u6279\u6CE8\u6570\u636E\u6587\u4EF6\u5939").setDesc(
      "\u6BCF\u4EFD PDF \u7684\u7B14\u8FF9\u4FDD\u5B58\u4E3A\u8BE5\u6587\u4EF6\u5939\u4E0B\u7684\u540C\u540D JSON\uFF08\u5982 \u9644\u4EF6/Ink \u6807\u6CE8/\u8D44\u6599/\u9AD8\u6570.pdf.json\uFF09\uFF0C\u968F Obsidian Sync \u540C\u6B65\u3002"
    ).addText(
      (text) => text.setPlaceholder("\u9644\u4EF6/Ink \u6807\u6CE8").setValue(this.plugin.settings.folder).onChange(async (value) => {
        this.plugin.settings.folder = value.trim() || "PDF Ink";
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u8F93\u5165\u65B9\u5F0F" });
    new import_obsidian5.Setting(containerEl).setName("\u786C\u4EF6").setDesc(
      "\u89E6\u5C4F\u5E73\u677F\uFF08iPad / Surface\uFF09\u7B14\u5C16\u4E0E\u7B14\u753B\u5728\u540C\u4E00\u70B9\uFF0C\u505C\u4F4F/\u53CC\u51FB\u8FD9\u7C7B\u624B\u52BF\u770B\u5F97\u89C1\uFF1B\u6570\u4F4D\u677F\uFF08Wacom / \u9AD8\u6F2B / \u7ED8\u738B / XPPen\uFF09\u624B\u5728\u677F\u4E0A\u3001\u773C\u5728\u5C4F\u4E0A\uFF0C\u624B\u52BF\u770B\u4E0D\u89C1\u4E5F\u96BE\u63A7\u3002\u9009\u300C\u6570\u4F4D\u677F\u300D\u4F1A\u5173\u6389\u624B\u52BF\u5E76\u542F\u7528\u4FA7\u952E\u4E34\u65F6\u6A61\u76AE\uFF0C\u4E4B\u540E\u6BCF\u4E00\u9879\u4ECD\u53EF\u5355\u72EC\u6539\u3002"
    ).addDropdown(
      (dropdown) => dropdown.addOptions({
        auto: "\u81EA\u52A8\uFF08\u4FDD\u6301\u73B0\u6709\u8BBE\u7F6E\uFF09",
        touch: "\u89E6\u5C4F\u5E73\u677F\uFF08\u4FDD\u7559\u624B\u52BF\uFF09",
        tablet: "\u6570\u4F4D\u677F\uFF08\u5173\u624B\u52BF\uFF0C\u8D70\u6309\u952E\uFF09"
      }).setValue(this.plugin.settings.inputMode).onChange(async (value) => {
        const mode = value;
        await this.plugin.applyInputMode(mode);
        if (mode === "auto") return;
        new import_obsidian5.Notice(
          mode === "tablet" ? "[PDF Ink] \u5DF2\u5957\u7528\u6570\u4F4D\u677F\u9884\u8BBE\uFF1A\u624B\u52BF\u5173\u95ED\uFF0C\u4FA7\u952E\u4FDD\u7559\u4E3A\u4E34\u65F6\u6A61\u76AE" : "[PDF Ink] \u5DF2\u5957\u7528\u89E6\u5C4F\u9884\u8BBE\uFF1A\u624B\u52BF\u5F00\u542F"
        );
        this.display();
      })
    );
    containerEl.createEl("h3", { text: "\u4E66\u5199" });
    new import_obsidian5.Setting(containerEl).setName("\u58A8\u8FF9\u6E05\u6670\u5EA6 / \u6D41\u7545\u5EA6").setDesc(
      "\u753B\u5E03\u50CF\u7D20\u9884\u7B97\u3002\u9884\u7B97\u8D8A\u5C0F\uFF0C\u6BCF\u6B21\u843D\u7B14\u540E\u6D4F\u89C8\u5668\u8981\u4E0A\u4F20/\u91CD\u7ED8\u7684\u7EB9\u7406\u8D8A\u5C0F\u3001\u4E66\u5199\u8D8A\u987A\uFF1B\u9884\u7B97\u8D8A\u5927\uFF0C\u653E\u5927\u540E\u7B14\u8FF9\u8D8A\u9510\u5229\u3002\u7F29\u653E\u4F1A\u81EA\u52A8\u9002\u914D\uFF1A\u770B\u6574\u9875\u65F6\u901A\u5E38\u662F 2 \u500D\uFF0C\u653E\u5927\u540E\u6309\u9884\u7B97\u5C01\u9876\u3002"
    ).addDropdown(
      (dropdown) => dropdown.addOptions({
        fast: "\u6781\u6D41\u7545\uFF08\u7EA6 1.2 Mpx/\u9875\uFF09",
        smooth: "\u6D41\u7545\u4F18\u5148\uFF08\u7EA6 2.4 Mpx/\u9875\uFF09",
        balanced: "\u5E73\u8861\uFF08\u7EA6 4 Mpx/\u9875\uFF09",
        crisp: "\u6E05\u6670\u4F18\u5148\uFF08\u7EA6 8 Mpx/\u9875\uFF09"
      }).setValue(this.plugin.settings.inkQuality).onChange(async (value) => {
        this.plugin.settings.inkQuality = value;
        await this.plugin.saveSettings();
        this.plugin.applyInkQuality();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u5173\u95ED\u5176\u4ED6\u63D2\u4EF6\u7684\u6BDB\u73BB\u7483\u80CC\u666F").setDesc(
      "\u5B9E\u6D4B\uFF1A\u9875\u9762\u4E0A\u65B9\u6709 backdrop-filter\uFF08\u6BDB\u73BB\u7483\uFF09\u65F6\uFF0CChromium \u4F1A\u5728\u6BCF\u4E00\u7B14\u7684\u6BCF\u4E2A\u91C7\u6837\u70B9\u91CD\u65B0\u6805\u683C\u5316\u90A3\u5757\u6A21\u7CCA\uFF0C\u957F\u4EFB\u52A1 100ms \u8D77\u3002\u5F00\u542F\u540E PDF Ink \u52A0\u8F7D\u671F\u95F4\u4F1A\u5E38\u9A7B\u5173\u95ED\u5DF2\u77E5\u7684\u51E0\u5904\u6BDB\u73BB\u7483\uFF08Editing Toolbar \u7B49\uFF09\u3002\u82E5\u67D0\u63D2\u4EF6\u6309\u94AE\u770B\u8D77\u6765\u53D8\u900F\u660E/\u96BE\u770B\uFF0C\u53EF\u5173\u6389\u6B64\u9879\u3002"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.blurShield).onChange(async (value) => {
        this.plugin.settings.blurShield = value;
        await this.plugin.saveSettings();
        this.plugin.applyBlurShield();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("Shift + \u60AC\u505C\u8C03\u7B14\u5237\u7684\u7075\u654F\u5EA6").setDesc(
      "\u6309\u4F4F Shift \u8BA9\u7B14\u5728\u9875\u9762\u4E0A\u65B9\u79FB\u52A8\uFF1A\u5DE6\u53F3\u6539\u7C97\u7EC6\u3001\u4E0A\u4E0B\u6539\u4E0D\u900F\u660E\u5EA6\u3002\u6570\u503C\u8D8A\u5927\uFF0C\u540C\u6837\u7684\u79FB\u52A8\u8DDD\u79BB\u6539\u5F97\u8D8A\u591A\uFF081 \u6700\u6162\uFF0C10 \u6700\u5FEB\uFF09\u3002"
    ).addSlider(
      (slider) => slider.setLimits(1, 10, 1).setValue(this.plugin.settings.penAdjustSpeed).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.penAdjustSpeed = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u4F4E\u5EF6\u8FDF\u753B\u5E03\uFF08\u5B9E\u9A8C\uFF09").setDesc(
      "\u7ED9\u8FDB\u884C\u4E2D\u7684\u7B14\u8FF9\u753B\u5E03\u542F\u7528 Chrome \u7684 desynchronized \u4F4E\u5EF6\u8FDF\u6A21\u5F0F\u3002\u89C4\u8303\u5141\u8BB8\u8BE5\u6A21\u5F0F\u8FD4\u56DE\u8FC7\u671F\u50CF\u7D20\uFF0C\u5DF2\u5728 dev.64 \u5B9E\u6D4B\u5BFC\u81F4\u300C\u62AC\u7B14\u540E\u7B14\u8FF9\u6D88\u5931\u300D\uFF0C\u9ED8\u8BA4\u5173\u95ED\uFF1B\u60F3\u8BD5\u53EF\u6253\u5F00\u540E\u91CD\u65B0\u6253\u5F00 PDF\u3002"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.lowLatencyLive).onChange(async (value) => {
        this.plugin.settings.lowLatencyLive = value;
        await this.plugin.saveSettings();
        this.plugin.applyInkQuality();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u6570\u4F4D\u7B14\u76F4\u63A5\u4E66\u5199").setDesc("\u7B14\u5C16\u843D\u5728 PDF \u9875\u9762\u4E0A\u5373\u5F00\u59CB\u753B\uFF0C\u4E0D\u9700\u8981\u5148\u8FDB\u5165\u7ED8\u5236\u6A21\u5F0F\uFF1B\u6309\u4F4F Alt \u53EF\u4E34\u65F6\u9009\u5B57/\u70B9\u94FE\u63A5\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.stylusFreehand).onChange(async (value) => {
        this.plugin.settings.stylusFreehand = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u9F20\u6807\u4E5F\u76F4\u63A5\u4E66\u5199\uFF08\u515C\u5E95\uFF09").setDesc("\u5982\u679C\u624B\u5199\u677F\u9A71\u52A8\u628A\u7B14\u4E0A\u62A5\u6210\u9F20\u6807\uFF0C\u6253\u5F00\u6B64\u9879\uFF1B\u5E73\u65F6\u5EFA\u8BAE\u5173\u95ED\uFF0C\u5426\u5219\u9F20\u6807\u4F1A\u65E0\u6CD5\u9009\u5B57\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.mouseFreehand).onChange(async (value) => {
        this.plugin.settings.mouseFreehand = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u59CB\u7EC8\u663E\u793A\u5DE5\u5177\u680F").setDesc("\u5173\u95ED\u540E\uFF0C\u53EA\u6709\u8FDB\u5165\u7ED8\u5236\u6A21\u5F0F\u6216\u6309 Ribbon \u65F6\u624D\u663E\u793A PDF \u53F3\u4E0A\u89D2\u7684\u5DE5\u5177\u680F\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.showToolbarAlways).onChange(async (value) => {
        this.plugin.settings.showToolbarAlways = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u5DE5\u5177\u680F\u5E03\u5C40").setDesc("\u6A2A\u5411\u9002\u5408\u5BBD\u5C4F\uFF1B\u7EB5\u5411\u9002\u5408\u9760\u8FB9\u7AD6\u6392\uFF1B\u65B9\u5F62\u4F1A\u7D27\u51D1\u6362\u884C\uFF0C\u9002\u5408\u5C0F\u7A97\u53E3\u3002").addDropdown(
      (dropdown) => dropdown.addOptions({
        horizontal: "\u6A2A\u5411",
        vertical: "\u7EB5\u5411",
        square: "\u65B9\u5F62"
      }).setValue(this.plugin.settings.toolbarLayout).onChange(async (value) => {
        this.plugin.settings.toolbarLayout = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u952E\u4F4D\u6620\u5C04" });
    containerEl.createEl("p", {
      text: "\u53EA\u5728 PDF \u89C6\u56FE\u662F\u5F53\u524D\u9762\u677F\u3001\u4E14\u7126\u70B9\u4E0D\u5728\u8F93\u5165\u6846\u65F6\u751F\u6548\u3002\u6570\u4F4D\u677F\u9A71\u52A8\u6216\u7B14\u7684\u4FA7\u952E\u6620\u5C04\u51FA\u6765\u7684\u952E\u76D8\u6309\u952E\uFF0C\u76F4\u63A5\u586B\u5728\u8FD9\u91CC\u3002\u70B9\u8F93\u5165\u6846\u540E\u6309\u4E00\u4E2A\u952E\u5373\u5F55\u5236\uFF0CEsc \u6E05\u7A7A\u3002\u6CE8\u610F\u522B\u628A\u540C\u4E00\u4E2A\u952E\u4E5F\u7ED1\u5230 Obsidian \u81EA\u5E26\u5FEB\u6377\u952E\u4E0A\uFF0C\u5426\u5219\u4F1A\u6267\u884C\u4E24\u6B21\u3002"
    });
    containerEl.createEl("p", {
      text: "\u6BCF\u4E2A\u5DE5\u5177\u540E\u9762\u8FD8\u6709\u4E00\u4E2A\u300C\u70B9\u6309 / \u6309\u4F4F\u300D\uFF1A\u70B9\u6309\uFF1D\u6309\u4E00\u4E0B\u5C31\u5207\u8FC7\u53BB\u5E76\u4E00\u76F4\u7528\u5B83\uFF1B\u6309\u4F4F\uFF1D\u6309\u4E0B\u4E34\u65F6\u5207\u8FC7\u53BB\uFF0C**\u677E\u5F00\u7ACB\u523B\u56DE\u5230\u539F\u6765\u90A3\u652F\u7B14** \u2014\u2014 \u7B14\u4FA7\u952E\u6620\u5C04\u6210 E \u65F6\u9009\u8FD9\u4E2A\uFF0C\u624D\u662F\u6570\u4F4D\u677F\u4E0A\u300C\u6309\u4F4F\u64E6\u3001\u677E\u624B\u7EE7\u7EED\u5199\u300D\u7684\u624B\u611F\u3002"
    });
    this.renderTempEraser(containerEl);
    const bindings = resolveBindings(this.plugin.settings.keyBindings);
    const inputs = [];
    for (const group of ["\u5DE5\u5177", "\u989C\u8272"]) {
      containerEl.createEl("h4", { text: group });
      for (const action of ACTIONS.filter((entry) => entry.group === group)) {
        const el2 = this.keyRow(
          containerEl,
          action.name,
          "",
          bindings[action.id] ?? "",
          (spec) => {
            void this.commitBinding(action.id, spec);
          },
          action.tool ? (setting) => {
            setting.addDropdown(
              (dropdown) => dropdown.addOptions({ tap: "\u70B9\u6309\u5207\u6362", hold: "\u6309\u4F4F\u751F\u6548" }).setValue(
                this.plugin.settings.keyHolds[action.id] ? "hold" : "tap"
              ).onChange(async (value) => {
                const next = { ...this.plugin.settings.keyHolds };
                if (value === "hold") next[action.id] = true;
                else delete next[action.id];
                this.plugin.settings.keyHolds = next;
                await this.plugin.saveSettings();
              })
            );
          } : void 0
        );
        inputs.push({ id: action.id, el: el2 });
      }
    }
    this.markConflicts(inputs, bindings);
    new import_obsidian5.Setting(containerEl).setName("\u8BB0\u5F55\u6309\u952E\u4E8B\u4EF6\uFF08\u6392\u67E5\u4FA7\u952E\u7528\uFF09").setDesc(
      "\u6253\u5F00\u540E\uFF0CPDF \u89C6\u56FE\u91CC\u6BCF\u6B21\u6309\u952E\u7684 keydown / keyup \u90FD\u5199\u8FDB debug.json \u7684\u65E5\u5FD7\u3002\u7B14\u4FA7\u952E\u6620\u5C04\u4E0D\u751F\u6548\u65F6\u6253\u5F00\u5B83\u3001\u6309\u51E0\u4E0B\u4FA7\u952E\u3001\u518D\u5BFC\u51FA\u8BCA\u65AD\u4FE1\u606F\uFF0C\u5C31\u80FD\u770B\u51FA\u9A71\u52A8\u5230\u5E95\u53D1\u7684\u662F\u4EC0\u4E48\u952E\uFF08\u6216\u8005\u6839\u672C\u6CA1\u53D1\u952E\uFF09\u3002"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.logKeyEvents).onChange(async (value) => {
        this.plugin.settings.logKeyEvents = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u6062\u590D\u9ED8\u8BA4\u952E\u4F4D").setDesc("\u5DE5\u5177\u56DE\u5230 P / H / E / S / L / A / R / O / G\uFF0C\u989C\u8272\u56DE\u5230 1\u20139\u3002").addButton(
      (button) => button.setButtonText("\u6062\u590D\u9ED8\u8BA4").onClick(async () => {
        this.plugin.settings.keyBindings = {};
        await this.plugin.saveSettings();
        this.display();
      })
    );
    containerEl.createEl("h3", { text: "\u94A2\u7B14" });
    new import_obsidian5.Setting(containerEl).setName("\u9ED8\u8BA4\u989C\u8272").addColorPicker(
      (picker) => picker.setValue(this.plugin.settings.penColor).onChange(async (value) => {
        this.plugin.settings.penColor = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u9ED8\u8BA4\u7C97\u7EC6").setDesc("\u5355\u4F4D\uFF1AA4 \u9875\u9762 100% \u7F29\u653E\u4E0B\u7684\u50CF\u7D20").addSlider(
      (slider) => slider.setLimits(0.5, 20, 0.5).setValue(this.plugin.settings.penWidth).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.penWidth = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u4E0D\u900F\u660E\u5EA6").setDesc("100% \u662F\u4E0D\u900F\u660E\u3002\u964D\u4F4E\u540E\u540C\u4E00\u4E2A\u9884\u8BBE\u4E5F\u80FD\u5F53\u6DE1\u8272\u9A6C\u514B\u7B14\u7528\u3002").addSlider(
      (slider) => slider.setLimits(10, 100, 5).setValue(Math.round(this.plugin.settings.penOpacity * 100)).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.penOpacity = value / 100;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u8367\u5149\u7B14" });
    new import_obsidian5.Setting(containerEl).setName("\u9ED8\u8BA4\u989C\u8272").addColorPicker(
      (picker) => picker.setValue(this.plugin.settings.highlighterColor).onChange(async (value) => {
        this.plugin.settings.highlighterColor = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u9ED8\u8BA4\u7C97\u7EC6").addSlider(
      (slider) => slider.setLimits(2, 40, 1).setValue(this.plugin.settings.highlighterWidth).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.highlighterWidth = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u4E0D\u900F\u660E\u5EA6").addSlider(
      (slider) => slider.setLimits(10, 90, 5).setValue(Math.round(this.plugin.settings.highlighterOpacity * 100)).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.highlighterOpacity = value / 100;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u6A61\u76AE" });
    new import_obsidian5.Setting(containerEl).setName("\u64E6\u9664\u65B9\u5F0F").setDesc(
      "\u6D82\u62B9\uFF1A\u53EA\u64E6\u6389\u6846\u9009\u5230\u7684\u90E8\u5206\uFF0C\u7B14\u8FF9\u4F1A\u88AB\u5207\u6210\u51E0\u6BB5\uFF1B\u6574\u7B14\uFF1A\u6846\u5230\u4E00\u70B9\u5C31\u6574\u6761\u5220\u9664\u3002"
    ).addDropdown(
      (dropdown) => dropdown.addOptions({ partial: "\u6D82\u62B9\uFF08\u53EA\u64E6\u9009\u4E2D\u90E8\u5206\uFF09", whole: "\u6574\u7B14\uFF08\u78B0\u5230\u5C31\u6574\u6761\u5220\uFF09" }).setValue(this.plugin.settings.eraserScope).onChange(async (value) => {
        this.plugin.settings.eraserScope = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u64E6\u9664\u533A\u57DF").setDesc("\u81EA\u7531\u6D82\u62B9\u6CBF\u7B14\u8FF9\u64E6\uFF1B\u77E9\u5F62/\u5957\u7D22\u6846\u9009\u4E00\u5757\u533A\u57DF\uFF1B\u70B9\u9009\u5355\u51FB\u4E00\u6761\u7B14\u8FF9\u3002").addDropdown(
      (dropdown) => dropdown.addOptions({
        free: "\u81EA\u7531\u6D82\u62B9",
        rect: "\u77E9\u5F62\u6846\u9009",
        lasso: "\u5957\u7D22\u6846\u9009"
      }).setValue(this.plugin.settings.eraserRegion).onChange(async (value) => {
        this.plugin.settings.eraserRegion = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u6A61\u76AE\u534A\u5F84").setDesc("\u5355\u4F4D\uFF1AA4 \u9875\u9762 100% \u7F29\u653E\u4E0B\u7684\u50CF\u7D20\uFF1B\u53EA\u64E6\u9664\u5F53\u524D\u56FE\u5C42\u3002").addSlider(
      (slider) => slider.setLimits(4, 48, 1).setValue(this.plugin.settings.eraserWidth).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.eraserWidth = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u624B\u52BF" });
    containerEl.createEl("p", {
      text: "\u8FD9\u7EC4\u624B\u52BF\u4F9D\u8D56\u300C\u770B\u5F97\u89C1\u7B14\u5C16\u505C\u5728\u54EA\u91CC\u300D\uFF0C\u9002\u5408\u89E6\u5C4F\u5E73\u677F\uFF1B\u6570\u4F4D\u677F\u4E0A\u624B\u5728\u677F\u3001\u773C\u5728\u5C4F\uFF0C\u505C\u4F4F\u770B\u4E0D\u89C1\uFF0C\u8BEF\u89E6\u7387\u9AD8\u3002\u5728\u300C\u8F93\u5165\u65B9\u5F0F \u2192 \u786C\u4EF6\u300D\u91CC\u9009\u6570\u4F4D\u677F\u4F1A\u81EA\u52A8\u5173\u6389\u5B83\u4EEC\u3002"
    });
    new import_obsidian5.Setting(containerEl).setName("\u505C\u4F4F\u7B14\u5C16\uFF1A\u8F7B\u538B\u9009\u4E2D / \u91CD\u538B\u64E6\u9664").setDesc(
      "\u4E00\u4E2A\u624B\u52BF\u4E24\u4E2A\u51FA\u53E3\uFF1A\u538B\u529B\u4F4E\u4E8E\u9608\u503C\u5207\u5230\u9009\u62E9\u5DE5\u5177\u5E76\u7EE7\u7EED\u6846\u9009\uFF0C\u9AD8\u4E8E\u9608\u503C\u76F4\u63A5\u64E6\u9664\u3002\u843D\u7B14\u4ECD\u7136\u7ACB\u523B\u51FA\u58A8\uFF0C\u5224\u5B9A\u6210\u7ACB\u624D\u56DE\u6EDA\u521A\u753B\u7684\u90A3\u4E00\u70B9\u3002\u5173\u6389\u5373\u4E24\u4E2A\u4E00\u8D77\u5173\u3002"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.eraserHoldEnabled).onChange(async (value) => {
        this.plugin.settings.eraserHoldEnabled = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u9009\u62E9\u5DE5\u5177\u91CC\u53CC\u51FB / \u957F\u6309\u5F39\u83DC\u5355").setDesc(
      "\u5728\u7B14\u8FF9\u6216\u7A7A\u767D\u5904\u53CC\u51FB\uFF08\u6216\u957F\u6309\uFF09\u5F39\u51FA\u590D\u5236/\u526A\u5207/\u7C98\u8D34\u83DC\u5355\uFF0C\u89E6\u5C4F\u5E73\u677F\u4E0A\u987A\u624B\uFF0C\u6570\u4F4D\u677F\u4E0A\u53CC\u51FB\u5BB9\u6613\u8BEF\u89E6\u53D1\u3002\u5173\u6389\u540E\u6539\u7528 Ctrl+C / Ctrl+X / Ctrl+V \u4E0E Delete\u3002"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.tapGestureMenuEnabled).onChange(async (value) => {
        this.plugin.settings.tapGestureMenuEnabled = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u6309\u4F4F\u65F6\u95F4").setDesc("\u7B14\u5C16\u505C\u4F4F\u591A\u4E45\u7B97\u957F\u6309\uFF08\u6BEB\u79D2\uFF09\u3002\u592A\u77ED\u5BB9\u6613\u8BEF\u89E6\u53D1\uFF0C\u592A\u957F\u624B\u611F\u53D1\u949D\u3002").addSlider(
      (slider) => slider.setLimits(200, 800, 50).setValue(this.plugin.settings.eraserHoldMs).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.eraserHoldMs = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u538B\u529B\u5224\u5B9A\u7A97\u53E3").setDesc(
      "\u957F\u6309\u5F00\u59CB\u540E\u7684\u8FD9\u6BB5\u65F6\u95F4\u5185\uFF0C\u53EA\u8981\u538B\u529B\u8D85\u8FC7\u9608\u503C\u5C31\u4F1A\u8FDB\u5165\u64E6\u9664\uFF1B\u8D85\u8FC7\u7A97\u53E3\u8FD8\u6CA1\u538B\u591F\u5219\u4E0D\u4F1A\u89E6\u53D1\u3002"
    ).addSlider(
      (slider) => slider.setLimits(500, 2e3, 100).setValue(this.plugin.settings.eraserHoldWindowMs).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.eraserHoldWindowMs = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u9759\u6B62\u5224\u5B9A\u534A\u5F84").setDesc("\u7B14\u5C16\u505C\u5728\u4E0B\u7B14\u70B9\u8FD9\u4E2A\u534A\u5F84\u8303\u56F4\u5185\u5C31\u7B97\u6CA1\u52A8\uFF0C\u8D85\u8FC7\u624D\u7B97\u5F00\u59CB\u4E66\u5199\u3002\u5355\u4F4D\uFF1A\u5C4F\u5E55\u50CF\u7D20\u3002").addSlider(
      (slider) => slider.setLimits(3, 24, 1).setValue(this.plugin.settings.eraserHoldRadiusPx).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.eraserHoldRadiusPx = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u64E6\u9664\u89E6\u53D1\u538B\u529B").setDesc(
      "\u540C\u4E00\u4E2A\u957F\u6309\u624B\u52BF\uFF1A\u538B\u529B\u4F4E\u4E8E\u8FD9\u4E2A\u503C\u7B97\u300C\u9009\u4E2D\u300D\uFF0C\u9AD8\u4E8E\u5B83\u624D\u7B97\u300C\u64E6\u9664\u300D\u3002\u6570\u4F4D\u7B14\u5E38\u89C1\u538B\u529B\u5728 0.3\u20130.7\uFF0C\u5EFA\u8BAE 0.5\u20130.6\u3002"
    ).addSlider(
      (slider) => slider.setLimits(30, 90, 5).setValue(Math.round(this.plugin.settings.eraserHoldPressure * 100)).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.eraserHoldPressure = value / 100;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u64E6\u5934\u968F\u538B\u529B\u53D8\u5316").setDesc("\u538B\u5F97\u8D8A\u91CD\u64E6\u5F97\u8D8A\u5BBD\u3002\u5173\u95ED\u540E\u64E6\u5934\u6052\u5B9A\u4E3A\u4E0A\u9762\u7684\u6A61\u76AE\u534A\u5F84\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.eraserPressureSize).onChange(async (value) => {
        this.plugin.settings.eraserPressureSize = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u81EA\u52A8\u8BC6\u522B\u56FE\u5F62" });
    new import_obsidian5.Setting(containerEl).setName("\u753B\u5B8C\u81EA\u52A8\u53D8\u6807\u51C6\u56FE\u5F62").setDesc("\u628A\u5E72\u51C0\u7684\u76F4\u7EBF\u3001\u7BAD\u5934\u3001\u77E9\u5F62\u3001\u692D\u5706\u3001\u4E09\u89D2/\u591A\u8FB9\u5F62\u66FF\u6362\u6210\u6807\u51C6\u56FE\u5F62\uFF1B\u624B\u5199\u6587\u5B57\u4E0D\u4F1A\u88AB\u8BC6\u522B\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.autoShapeEnabled).onChange(async (value) => {
        this.plugin.settings.autoShapeEnabled = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u89E6\u53D1\u65B9\u5F0F").setDesc("\u300C\u505C\u987F\u300D\u9700\u8981\u753B\u5B8C\u540E\u7B14\u5C16\u7A0D\u4F5C\u505C\u7559\uFF1B\u300C\u7ACB\u5373\u300D\u6BCF\u7B14\u90FD\u5C1D\u8BD5\u8BC6\u522B\uFF0C\u66F4\u5BB9\u6613\u8BEF\u5224\u3002").addDropdown(
      (dropdown) => dropdown.addOptions({ hold: "\u753B\u5B8C\u505C\u987F\u4E00\u4E0B", immediate: "\u753B\u5B8C\u7ACB\u5373\u8BC6\u522B" }).setValue(this.plugin.settings.autoShapeTrigger).onChange(async (value) => {
        this.plugin.settings.autoShapeTrigger = value === "immediate" ? "immediate" : "hold";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u505C\u987F\u65F6\u95F4").setDesc("\u62AC\u7B14\u524D\u7B14\u5C16\u9700\u8981\u505C\u4F4F\u591A\u4E45\uFF08\u6BEB\u79D2\uFF09\uFF0C\u4EC5\u300C\u753B\u5B8C\u505C\u987F\u300D\u6A21\u5F0F\u751F\u6548\u3002").addSlider(
      (slider) => slider.setLimits(200, 1500, 50).setValue(this.plugin.settings.autoShapeHoldMs).setDynamicTooltip().onChange(async (value) => {
        this.plugin.settings.autoShapeHoldMs = value;
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u5E38\u7528\u8272\u4E0E\u8C03\u8272\u677F" });
    new import_obsidian5.Setting(containerEl).setName("\u5DE5\u5177\u680F\u5E38\u7528\u8272").setDesc(
      "\u5DE5\u5177\u680F\u4E0A\u5E38\u9A7B\u7684\u4E00\u884C\u989C\u8272\uFF0C\u53EA\u663E\u793A 1\u20136 \u683C\u3002\u70B9\u4E00\u4E0B\u5207\u6362\u989C\u8272\uFF1B\u5728\u5DE5\u5177\u680F\u4E0A\u957F\u6309\u67D0\u4E00\u683C\u4F1A\u7528\u5F53\u524D\u7B14\u8272\u66FF\u6362\u5B83\u3002"
    );
    const quickWrap = containerEl.createDiv("pdf-ink-settings-swatches");
    const renderQuick = () => {
      while (quickWrap.firstChild) quickWrap.removeChild(quickWrap.firstChild);
      this.plugin.settings.quickColors.forEach((color, index) => {
        const cell = quickWrap.createDiv("pdf-ink-settings-swatch");
        const input = cell.createEl("input", { type: "color" });
        input.value = color;
        input.addEventListener("change", async () => {
          this.plugin.settings.quickColors[index] = input.value;
          await this.plugin.saveSettings();
        });
        const remove = cell.createEl("button", {
          cls: "pdf-ink-settings-remove",
          text: "\xD7"
        });
        remove.addEventListener("click", async () => {
          this.plugin.settings.quickColors.splice(index, 1);
          await this.plugin.saveSettings();
          renderQuick();
        });
      });
    };
    renderQuick();
    new import_obsidian5.Setting(containerEl).addButton(
      (button) => button.setButtonText("\u6DFB\u52A0\u4E00\u683C").onClick(async () => {
        if (this.plugin.settings.quickColors.length >= 6) return;
        this.plugin.settings.quickColors.push(
          this.plugin.settings.quickColors.at(-1) ?? "#1e1e1e"
        );
        await this.plugin.saveSettings();
        renderQuick();
      })
    );
    new import_obsidian5.Setting(containerEl).setName("\u8C03\u8272\u677F").setDesc(
      "\u7B14\u5237\u9762\u677F\u91CC\u7684\u989C\u8272\u7F51\u683C\u3002\u8FD9\u91CC\u6539\u5B8C\u7ACB\u523B\u751F\u6548\uFF1B\u9762\u677F\u91CC\u957F\u6309\u8272\u683C\u4E5F\u80FD\u6539\u8272\uFF0C\u300C\uFF0B\u300D\u52A0\u4E00\u683C\uFF0C\u62D6\u51FA\u9762\u677F\u5220\u9664\u3002"
    );
    const paletteWrap = containerEl.createDiv("pdf-ink-settings-swatches");
    const renderPalette = () => {
      while (paletteWrap.firstChild) paletteWrap.removeChild(paletteWrap.firstChild);
      this.plugin.settings.palette.forEach((color, index) => {
        const cell = paletteWrap.createDiv("pdf-ink-settings-swatch");
        const input = cell.createEl("input", { type: "color" });
        input.value = color;
        input.addEventListener("change", async () => {
          this.plugin.setPaletteSlot(index, input.value);
          await this.plugin.saveSettings();
        });
        const remove = cell.createEl("button", {
          cls: "pdf-ink-settings-remove",
          text: "\xD7"
        });
        remove.addEventListener("click", async () => {
          this.plugin.removePaletteColor(index);
          await this.plugin.saveSettings();
          renderPalette();
        });
      });
    };
    renderPalette();
    new import_obsidian5.Setting(containerEl).addButton(
      (button) => button.setButtonText("\u6062\u590D\u9ED8\u8BA4\u8C03\u8272\u677F").onClick(async () => {
        this.plugin.settings.palette = [...DEFAULT_SETTINGS.palette];
        await this.plugin.saveSettings();
        renderPalette();
      })
    );
    containerEl.createEl("h3", { text: "\u7B14\u5237\u9884\u8BBE" });
    containerEl.createEl("p", {
      text: "\u9884\u8BBE\u662F\u300C\u989C\u8272 + \u7C97\u7EC6 + \u4E0D\u900F\u660E\u5EA6\u300D\u7684\u6574\u5957\u7EC4\u5408\u3002\u5728\u5DE5\u5177\u680F\u53CC\u51FB/\u957F\u6309\u7B14\u5237\u6309\u94AE\u6253\u5F00\u9762\u677F\uFF0C\u70B9\u300C\uFF0B\u300D\u628A\u5F53\u524D\u72B6\u6001\u5B58\u6210\u9884\u8BBE\uFF1B\u8FD9\u91CC\u53EF\u4EE5\u5220\u6389\u4E0D\u8981\u7684\u3002"
    });
    const presetKinds = [
      ["pen", "\u94A2\u7B14"],
      ["highlighter", "\u8367\u5149\u7B14"],
      ["eraser", "\u6A61\u76AE"]
    ];
    for (const [kind, label] of presetKinds) {
      const list = kind === "eraser" ? this.plugin.settings.brushPresets.eraser : this.plugin.settings.brushPresets[kind];
      const wrap = containerEl.createDiv("pdf-ink-settings-presets");
      if (list.length === 0) {
        wrap.createEl("span", {
          cls: "pdf-ink-settings-empty",
          text: `${label}\uFF1A\u8FD8\u6CA1\u6709\u9884\u8BBE`
        });
        continue;
      }
      for (const preset of list) {
        const chip = wrap.createDiv("pdf-ink-settings-chip");
        const swatch = chip.createDiv("pdf-ink-swatch-mini");
        swatch.style.backgroundColor = "color" in preset ? preset.color : "var(--text-faint)";
        chip.createEl("span", { text: preset.name });
        const remove = chip.createEl("button", {
          cls: "pdf-ink-settings-remove",
          text: "\xD7"
        });
        remove.addEventListener("click", async () => {
          this.plugin.deletePreset(kind, preset.id);
          await this.plugin.saveSettings();
          this.display();
        });
      }
    }
    containerEl.createEl("h3", { text: "\u989C\u8272" });
    new import_obsidian5.Setting(containerEl).setName("\u6700\u8FD1\u4F7F\u7528\u7684\u989C\u8272").setDesc("\u5DE5\u5177\u680F\u8C03\u8272\u677F\u4F1A\u81EA\u52A8\u8BB0\u5F55\u6700\u8FD1\u7528\u8FC7\u7684\u989C\u8272\uFF0C\u8FD9\u91CC\u53EF\u4EE5\u6E05\u7A7A\u3002").addButton(
      (button) => button.setButtonText("\u6E05\u7A7A").onClick(async () => {
        this.plugin.settings.recentColors = [];
        await this.plugin.saveSettings();
      })
    );
    containerEl.createEl("h3", { text: "\u4F7F\u7528" });
    containerEl.createEl("p", {
      text: "\u952E\u4F4D\u90FD\u5728\u4E0A\u9762\u7684\u300C\u952E\u4F4D\u6620\u5C04\u300D\u91CC\u6539\u3002\u9ED8\u8BA4\uFF1AP/H/E/S/L/A/R/O/G \u5207\u5DE5\u5177\u30011\u20139 \u5FEB\u9009\u8C03\u8272\u677F\u8272\u3001Ctrl+Z \u64A4\u9500\u3001Ctrl+Shift+Z \u91CD\u505A\u3001Esc \u9000\u51FA\u7ED8\u5236\u6A21\u5F0F\uFF1B\u6309\u4F4F F\uFF08\u53EF\u6539\uFF09= \u4E34\u65F6\u6A61\u76AE\uFF0C\u677E\u5F00\u56DE\u5230\u539F\u6765\u90A3\u652F\u7B14\u3002"
    });
  }
  /** Text input that records the next key press instead of typing text. */
  keyRow(parent, name, desc, spec, onCommit, extra) {
    const setting = new import_obsidian5.Setting(parent).setName(name);
    if (desc) setting.setDesc(desc);
    let elRef;
    setting.addText((text) => {
      elRef = text.inputEl;
      text.setPlaceholder("\u672A\u7ED1\u5B9A");
      text.setValue(formatKeySpec(spec));
    });
    const el2 = elRef;
    if (!el2) throw new Error("keyRow: input missing");
    extra?.(setting);
    el2.readOnly = true;
    el2.addClass("pdf-ink-key");
    el2.addEventListener("focus", () => el2.addClass("pdf-ink-key-recording"));
    el2.addEventListener("blur", () => el2.removeClass("pdf-ink-key-recording"));
    el2.addEventListener("keydown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        onCommit("");
        return;
      }
      const next = specFromEvent(event);
      if (!next) return;
      onCommit(next);
    });
    return el2;
  }
  renderTempEraser(containerEl) {
    const settings = this.plugin.settings;
    this.keyRow(
      containerEl,
      "\u6309\u4F4F = \u4E34\u65F6\u6A61\u76AE",
      "\u6309\u4F4F\u8FD9\u4E2A\u952E\u5207\u5230\u6A61\u76AE\uFF0C\u677E\u5F00\u7ACB\u523B\u56DE\u5230\u539F\u6765\u90A3\u652F\u7B14\uFF08\u539F\u5DE5\u5177\u7684\u6A61\u76AE\u53C2\u6570\u4E0D\u53D7\u5F71\u54CD\uFF09\u3002\u7559\u7A7A\u5173\u95ED\u3002",
      settings.tempEraserKey,
      (spec) => {
        void (async () => {
          settings.tempEraserKey = normalizeSpec(spec);
          await this.plugin.saveSettings();
          this.display();
        })();
      }
    );
    new import_obsidian5.Setting(containerEl).setName("\u4FA7\u952E\u88AB\u8BC6\u522B\u6210\u9F20\u6807\u53F3\u952E / \u4E2D\u952E").setDesc(
      "\u6709\u7684\u9A71\u52A8\u628A\u7B14\u4FA7\u952E\u6620\u5C04\u6210\u9F20\u6807\u6309\u952E\u800C\u4E0D\u662F\u952E\u76D8\u3002\u9009\u5BF9\u4E86\u5C31\u628A\u300C\u6309\u4F4F\u4FA7\u952E\u65F6\u843D\u7B14\u300D\u5F53\u4F5C\u4E34\u65F6\u6A61\u76AE\u3002\u5148\u7528\u300C\u5BFC\u51FA\u8BCA\u65AD\u4FE1\u606F\u300D\u770B\u65E5\u5FD7\u91CC btn= \u7684\u503C\u518D\u786E\u5B9A\u3002"
    ).addDropdown(
      (dropdown) => dropdown.addOptions({
        off: "\u4E0D\u7528\uFF08\u9ED8\u8BA4\uFF09",
        right: "\u53F3\u952E\uFF08button=2\uFF09",
        middle: "\u4E2D\u952E\uFF08button=1\uFF09"
      }).setValue(settings.tempEraserMouse).onChange(async (value) => {
        settings.tempEraserMouse = value;
        await this.plugin.saveSettings();
      })
    );
  }
  async commitBinding(id, spec) {
    const normalized = normalizeSpec(spec);
    const defaults = resolveBindings(void 0);
    const next = { ...this.plugin.settings.keyBindings };
    if (normalized && normalized === normalizeSpec(defaults[id] ?? "")) {
      delete next[id];
    } else {
      next[id] = normalized;
    }
    this.plugin.settings.keyBindings = next;
    await this.plugin.saveSettings();
    this.display();
  }
  markConflicts(inputs, bindings) {
    const conflicts = findConflicts(bindings);
    for (const entry of inputs) {
      const spec = normalizeSpec(bindings[entry.id] ?? "");
      const ids = spec ? conflicts[spec] : void 0;
      if (ids && ids.length > 1) {
        entry.el.addClass("pdf-ink-key-conflict");
        entry.el.setAttr(
          "title",
          `\u91CD\u590D\u7ED1\u5B9A\uFF1A${ids.filter((id) => id !== entry.id).map((id) => ACTIONS.find((action) => action.id === id)?.name ?? id).join("\u3001")}`
        );
      }
    }
  }
};

// src/compact.ts
var COORDINATE_DECIMALS = 4;
var COORDINATE_SCALE = 10 ** COORDINATE_DECIMALS;
var ERASER_MIN_GAP_PX = 4;
var ERASER_MIN_GAP = ERASER_MIN_GAP_PX / REFERENCE_PAGE_WIDTH;
var THINNABLE_KINDS = /* @__PURE__ */ new Set(["eraser"]);
function roundCoordinates(points, scale = COORDINATE_SCALE) {
  for (let i = 0; i < points.length; i++) {
    const rounded = Math.round(points[i] * scale) / scale;
    if (rounded !== points[i]) points[i] = rounded;
  }
}
function thinPolyline(points, minGap = ERASER_MIN_GAP) {
  const count = Math.floor(points.length / 3);
  if (count <= 2) return points;
  const gapSq = minGap * minGap;
  const out = [points[0], points[1], points[2]];
  let lastX = points[0];
  let lastY = points[1];
  for (let i = 1; i < count - 1; i++) {
    const x = points[i * 3];
    const y = points[i * 3 + 1];
    const dx = x - lastX;
    const dy = y - lastY;
    if (dx * dx + dy * dy < gapSq) continue;
    out.push(x, y, points[i * 3 + 2]);
    lastX = x;
    lastY = y;
  }
  const tail = (count - 1) * 3;
  out.push(points[tail], points[tail + 1], points[tail + 2]);
  return out;
}
function compactStroke(stroke) {
  if (stroke.rings) {
    for (const ring of stroke.rings) roundCoordinates(ring);
  }
  roundCoordinates(stroke.points);
  if (!THINNABLE_KINDS.has(stroke.kind)) return;
  if (Math.floor(stroke.points.length / 3) <= 2) return;
  stroke.points = thinPolyline(stroke.points);
}
function compactDocForSave(doc) {
  for (const layer of doc.layers) {
    for (const stroke of layer.strokes) compactStroke(stroke);
  }
  return doc;
}
function countPoints(doc) {
  let total = 0;
  for (const layer of doc.layers) {
    for (const stroke of layer.strokes) total += Math.floor(stroke.points.length / 3);
  }
  return total;
}

// src/path.ts
function normalizeVaultPath(path) {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
}

// src/storage.ts
var BUSY_RETRY_MS = 400;
var InkStorage = class {
  constructor(app, getFolder, isBusy) {
    this.app = app;
    this.getFolder = getFolder;
    this.isBusy = isBusy;
    this.timers = /* @__PURE__ */ new Map();
    this.pending = /* @__PURE__ */ new Map();
  }
  get folder() {
    const raw = (this.getFolder() ?? "").replace(/^\/+|\/+$/g, "");
    return normalizeVaultPath(raw.length > 0 ? raw : "PDF Ink");
  }
  pathFor(filePath) {
    const folder = this.folder;
    return normalizeVaultPath(
      folder.length > 0 ? `${folder}/${filePath}.json` : `${filePath}.json`
    );
  }
  get adapter() {
    return this.app.vault.adapter;
  }
  async load(filePath) {
    const path = this.pathFor(filePath);
    try {
      if (!await this.adapter.exists(path)) return null;
      const text = await this.adapter.read(path);
      return normalizeDoc(JSON.parse(text), filePath);
    } catch (error) {
      console.error(`[pdf-ink] failed to read ${path}`, error);
      return null;
    }
  }
  async writeNow(filePath, doc) {
    const path = this.pathFor(filePath);
    await this.ensureParentFolder(path);
    doc.file = filePath;
    doc.updated = Date.now();
    const doneSerialize = perf.start("save.serialize");
    let text = "";
    try {
      compactDocForSave(doc);
      text = JSON.stringify(doc);
    } finally {
      doneSerialize();
    }
    perf.count("save.bytes", text.length);
    perf.count("save.points", countPoints(doc));
    const doneWrite = perf.start("save.write");
    try {
      await this.adapter.write(path, text);
    } finally {
      doneWrite();
    }
  }
  scheduleSave(filePath, doc, delay = 500) {
    this.pending.set(filePath, doc);
    const existing = this.timers.get(filePath);
    if (existing) window.clearTimeout(existing);
    this.timers.set(
      filePath,
      window.setTimeout(() => {
        this.timers.delete(filePath);
        void this.flush(filePath);
      }, delay)
    );
  }
  /** One-time copy before a destructive migration rewrites the sidecar. */
  async backupOnce(filePath) {
    const path = this.pathFor(filePath);
    const backup = `${path}.bak`;
    try {
      if (await this.adapter.exists(backup)) return;
      if (!await this.adapter.exists(path)) return;
      await this.adapter.write(backup, await this.adapter.read(path));
      void backup;
    } catch (error) {
      console.error("[pdf-ink] failed to back up sidecar", error);
    }
  }
  async flush(filePath, force = false) {
    const doc = this.pending.get(filePath);
    if (!doc) return;
    if (!force && this.isBusy?.()) {
      this.scheduleSave(filePath, doc, BUSY_RETRY_MS);
      return;
    }
    this.pending.delete(filePath);
    try {
      await this.writeNow(filePath, doc);
    } catch (error) {
      console.error(`[pdf-ink] failed to save annotations of ${filePath}`, error);
    }
  }
  async flushAll() {
    const timers = [...this.timers.values()];
    for (const timer of timers) window.clearTimeout(timer);
    this.timers.clear();
    const paths = [...this.pending.keys()];
    await Promise.all(paths.map((path) => this.flush(path, true)));
  }
  /** Move the sidecar when the annotated PDF is renamed inside the vault. */
  async move(oldPath, newPath) {
    if (oldPath === newPath) return;
    const from = this.pathFor(oldPath);
    const to = this.pathFor(newPath);
    if (from === to) return;
    try {
      if (!await this.adapter.exists(from)) return;
      await this.ensureParentFolder(to);
      if (await this.adapter.exists(to)) {
        console.error(`[pdf-ink] annotation file already exists: ${to}`);
        return;
      }
      await this.adapter.rename(from, to);
      const doc = await this.load(newPath);
      if (doc) {
        doc.file = newPath;
        await this.adapter.write(to, JSON.stringify(doc));
      }
      const pendingDoc = this.pending.get(oldPath);
      if (pendingDoc) {
        this.pending.delete(oldPath);
        pendingDoc.file = newPath;
        this.pending.set(newPath, pendingDoc);
      }
    } catch (error) {
      console.error(`[pdf-ink] failed to move ${from} -> ${to}`, error);
    }
  }
  async ensureParentFolder(path) {
    const parts = path.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!current) continue;
      if (!await this.adapter.exists(current)) {
        try {
          await this.adapter.mkdir(current);
        } catch (error) {
          if (!await this.adapter.exists(current)) throw error;
        }
      }
    }
  }
};

// src/ui/layers-view.ts
var import_obsidian8 = require("obsidian");

// src/ui/layers-content.ts
var import_obsidian7 = require("obsidian");

// src/ui/confirm.ts
var import_obsidian6 = require("obsidian");
var ConfirmModal = class extends import_obsidian6.Modal {
  constructor(app, title, message, confirmLabel, onConfirm) {
    super(app);
    this.title = title;
    this.message = message;
    this.confirmLabel = confirmLabel;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    this.titleEl.setText(this.title);
    this.contentEl.createEl("p", { text: this.message });
    const row = this.contentEl.createDiv("pdf-ink-confirm-row");
    const cancel = row.createEl("button", { text: "\u53D6\u6D88" });
    const confirm = row.createEl("button", {
      text: this.confirmLabel,
      cls: "mod-warning"
    });
    cancel.addEventListener("click", () => this.close());
    confirm.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ui/layers-content.ts
function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== void 0) node.textContent = text;
  return node;
}
function iconButton(parent, icon, label, onClick) {
  const button = el(parent.ownerDocument, "button", "pdf-ink-icon-btn");
  button.type = "button";
  button.setAttribute("aria-label", label);
  (0, import_obsidian7.setIcon)(button, icon);
  (0, import_obsidian7.setTooltip)(button, label);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  parent.appendChild(button);
  return button;
}
function renderLayersInto(container, plugin) {
  const doc = container.ownerDocument;
  while (container.firstChild) container.removeChild(container.firstChild);
  const controller = plugin.getTargetController();
  const ink = controller?.doc ?? null;
  const header = el(doc, "div", "pdf-ink-layers-header");
  const titleWrap = el(doc, "div", "pdf-ink-layers-title-wrap");
  const title = el(
    doc,
    "div",
    "pdf-ink-layers-title",
    controller?.filePath?.split("/").pop() ?? "PDF \u58A8\u8FF9"
  );
  const subtitle = el(
    doc,
    "div",
    "pdf-ink-layers-subtitle",
    ink ? `${ink.layers.length} \u4E2A\u56FE\u5C42` : "\u5C1A\u672A\u6253\u5F00 PDF"
  );
  titleWrap.append(title, subtitle);
  header.appendChild(titleWrap);
  iconButton(header, "plus", "\u65B0\u5EFA\u56FE\u5C42", () => {
    if (!controller) {
      new import_obsidian7.Notice("[PDF Ink] \u8BF7\u5148\u6253\u5F00\u4E00\u4E2A PDF \u6587\u4EF6");
      return;
    }
    controller.addLayer();
  });
  container.appendChild(header);
  if (!controller || !ink) {
    container.appendChild(
      el(
        doc,
        "div",
        "pdf-ink-layers-empty",
        "\u6253\u5F00\u4E00\u4E2A PDF\uFF0C\u70B9\u51FB\u94C5\u7B14\uFF08\u6216\u547D\u4EE4\u300CPDF Ink: \u5F00\u542F/\u5173\u95ED\u7ED8\u5236\u6A21\u5F0F\u300D\uFF09\u5373\u53EF\u5F00\u59CB\u6279\u6CE8\u3002\u7B14\u8FF9\u4F1A\u6309\u56FE\u5C42\u4FDD\u5B58\u3002"
      )
    );
    return;
  }
  const list = el(doc, "div", "pdf-ink-layer-list");
  for (const layer of [...ink.layers].reverse()) {
    list.appendChild(renderLayerRow(doc, layer, controller, ink.activeLayerId, plugin, container));
  }
  container.appendChild(list);
  const active = ink.layers.find((layer) => layer.id === ink.activeLayerId);
  if (active) container.appendChild(renderOpacity(doc, active, controller));
  container.appendChild(
    el(
      doc,
      "div",
      "pdf-ink-layers-hint",
      "\u5217\u8868\u4ECE\u4E0A\u5230\u4E0B\u5373\u7ED8\u5236\u5C42\u7EA7\uFF08\u4E0A\u65B9\u8986\u76D6\u4E0B\u65B9\uFF09\u3002\u53CC\u51FB\u56FE\u5C42\u540D\u53EF\u91CD\u547D\u540D\u3002"
    )
  );
}
function renderLayerRow(doc, layer, controller, activeLayerId, plugin, root) {
  const row = el(doc, "div", "pdf-ink-layer-row");
  row.dataset.layerId = layer.id;
  row.classList.toggle("is-active", layer.id === activeLayerId);
  row.classList.toggle("is-hidden", !layer.visible);
  row.addEventListener("click", () => controller.setActiveLayer(layer.id));
  iconButton(
    row,
    layer.visible ? "eye" : "eye-off",
    layer.visible ? "\u9690\u85CF\u56FE\u5C42" : "\u663E\u793A\u56FE\u5C42",
    () => controller.setLayerVisible(layer.id, !layer.visible)
  );
  iconButton(
    row,
    layer.locked ? "lock" : "unlock",
    layer.locked ? "\u89E3\u9501\u56FE\u5C42" : "\u9501\u5B9A\u56FE\u5C42",
    () => controller.setLayerLocked(layer.id, !layer.locked)
  );
  const name = el(doc, "div", "pdf-ink-layer-name", layer.name);
  name.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    startRename(doc, name, layer, controller, plugin, root);
  });
  row.appendChild(name);
  const actions = el(doc, "div", "pdf-ink-layer-actions");
  iconButton(actions, "chevron-up", "\u4E0A\u79FB\u4E00\u5C42", () => controller.moveLayer(layer.id, 1));
  iconButton(actions, "chevron-down", "\u4E0B\u79FB\u4E00\u5C42", () => controller.moveLayer(layer.id, -1));
  iconButton(actions, "trash-2", "\u5220\u9664\u56FE\u5C42", () => {
    new ConfirmModal(
      plugin.app,
      "\u5220\u9664\u56FE\u5C42",
      `\u786E\u5B9A\u5220\u9664\u300C${layer.name}\u300D\u5417\uFF1F`,
      "\u5220\u9664",
      () => controller.deleteLayer(layer.id)
    ).open();
  });
  row.appendChild(actions);
  return row;
}
function renderOpacity(doc, layer, controller) {
  const wrap = el(doc, "div", "pdf-ink-layers-opacity");
  wrap.appendChild(el(doc, "span", "pdf-ink-layers-opacity-label", "\u4E0D\u900F\u660E\u5EA6"));
  const input = el(doc, "input", "pdf-ink-layers-opacity-input");
  input.type = "range";
  input.min = "10";
  input.max = "100";
  input.step = "5";
  input.value = String(Math.round(layer.opacity * 100));
  const value = el(doc, "span", "pdf-ink-layers-opacity-value", `${input.value}%`);
  input.addEventListener("input", () => {
    value.textContent = `${input.value}%`;
  });
  input.addEventListener("change", () => {
    controller.setLayerOpacity(layer.id, Number(input.value) / 100);
  });
  wrap.append(input, value);
  return wrap;
}
function startRename(doc, nameEl, layer, controller, plugin, root) {
  const input = doc.createElement("input");
  input.className = "pdf-ink-layer-rename";
  input.value = layer.name;
  nameEl.textContent = "";
  nameEl.appendChild(input);
  input.focus();
  input.select();
  const commit = () => {
    controller.renameLayer(layer.id, input.value);
    renderLayersInto(root, plugin);
  };
  input.addEventListener("blur", commit, { once: true });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      input.value = layer.name;
      input.blur();
    }
  });
}

// src/ui/layers-view.ts
var VIEW_TYPE_LAYERS = "pdf-ink-layers";
var InkLayersView = class extends import_obsidian8.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.renderScheduled = false;
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_LAYERS;
  }
  getDisplayText() {
    return "PDF \u58A8\u8FF9\u56FE\u5C42";
  }
  getIcon() {
    return "layers";
  }
  async onOpen() {
    this.contentEl.classList.add("pdf-ink-layers");
    this.registerEvent(
      this.plugin.emitter.on("pdf-ink:doc-changed", () => this.scheduleRender())
    );
    this.registerEvent(
      this.plugin.emitter.on("pdf-ink:active-changed", () => this.scheduleRender())
    );
    this.render();
  }
  scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    window.requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.render();
    });
  }
  render() {
    renderLayersInto(this.contentEl, this.plugin);
  }
};

// src/ui/layers-popover.ts
var PdfInkLayersPopover = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.panel = null;
    this.anchor = null;
    this.renderQueued = false;
    this.unsubscribers = [];
    this.onDocumentPointerDown = (event) => {
      if (!this.panel) return;
      const target = event.target;
      if (!target) return;
      if (this.panel.contains(target) || this.anchor?.contains(target)) return;
      this.close();
    };
    this.onKeyDown = (event) => {
      if (event.key === "Escape") this.close();
    };
  }
  get isOpen() {
    return Boolean(this.panel);
  }
  toggle(anchor) {
    if (this.panel) {
      this.close();
      return;
    }
    this.open(anchor);
  }
  open(anchor) {
    this.close();
    const doc = anchor?.ownerDocument ?? document;
    const panel = doc.createElement("div");
    panel.className = "pdf-ink-layers pdf-ink-layers-popover";
    doc.body.appendChild(panel);
    this.panel = panel;
    this.anchor = anchor;
    renderLayersInto(panel, this.plugin);
    this.position(panel, anchor, doc);
    doc.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    doc.addEventListener("keydown", this.onKeyDown, true);
    const schedule = () => this.scheduleRender();
    for (const name of ["pdf-ink:doc-changed", "pdf-ink:active-changed"]) {
      const ref = this.plugin.emitter.on(name, schedule);
      this.unsubscribers.push(() => this.plugin.emitter.offref(ref));
    }
  }
  close() {
    if (!this.panel) return;
    const doc = this.panel.ownerDocument;
    doc.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    doc.removeEventListener("keydown", this.onKeyDown, true);
    for (const off of this.unsubscribers.splice(0)) off();
    this.panel.remove();
    this.panel = null;
    this.anchor = null;
  }
  scheduleRender() {
    if (this.renderQueued || !this.panel) return;
    this.renderQueued = true;
    window.requestAnimationFrame(() => {
      this.renderQueued = false;
      if (this.panel) renderLayersInto(this.panel, this.plugin);
    });
  }
  position(panel, anchor, doc) {
    const rect = panel.getBoundingClientRect();
    const view = doc.defaultView ?? window;
    if (!anchor || !anchor.isConnected) {
      panel.style.left = `${Math.max(8, (view.innerWidth - rect.width) / 2)}px`;
      panel.style.top = `${Math.max(8, (view.innerHeight - rect.height) / 3)}px`;
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const toolbar = anchor.closest(".pdf-ink-toolbar");
    const toolbarRect = toolbar?.getBoundingClientRect() ?? null;
    const gap = 8;
    const candidates = [
      { left: anchorRect.right + gap, top: anchorRect.top },
      { left: anchorRect.left - gap - rect.width, top: anchorRect.top },
      { left: anchorRect.left, top: anchorRect.bottom + gap },
      { left: anchorRect.left, top: anchorRect.top - gap - rect.height }
    ];
    let best = { left: 0, top: 0 };
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const left = clamp2(candidate.left, 8, Math.max(8, view.innerWidth - rect.width - 8));
      const top = clamp2(candidate.top, 8, Math.max(8, view.innerHeight - rect.height - 8));
      const overlap2 = toolbarRect ? overlapArea3(
        { left, top, width: rect.width, height: rect.height },
        toolbarRect
      ) : 0;
      const shifted = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
      const score = -overlap2 * 3 - shifted;
      if (score > bestScore) {
        bestScore = score;
        best = { left, top };
      }
    }
    panel.style.left = `${best.left}px`;
    panel.style.top = `${best.top}px`;
  }
};
function clamp2(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function overlapArea3(box, other) {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const w = Math.min(right, other.right) - Math.max(box.left, other.left);
  const h = Math.min(bottom, other.bottom) - Math.max(box.top, other.top);
  return w > 0 && h > 0 ? w * h : 0;
}

// src/main.ts
var HOLD_RELEASE_GUARD_MS = 250;
var PdfInkPlugin = class extends import_obsidian9.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.emitter = new import_obsidian9.Events();
    this.tool = "pen";
    /** Shared between PDF leaves so copy in one tab pastes in another. */
    this.inkClipboard = null;
    /** temporary tool while a "hold" key or the pen side button is down */
    this.tempTool = null;
    this.applyingTemp = false;
    /** keeps the mouse channel from re-arming until the button is released */
    this.tempSuppressed = false;
    /** tip is currently on the surface, from the pen tracker below */
    this.penDown = false;
    /** restore latched until the tip lifts (see endTempTool) */
    this.pendingTempRestore = null;
    /** no new stroke may start until this timestamp */
    this.strokeGuardUntil = 0;
    this.controllers = /* @__PURE__ */ new Map();
    this.layersPopover = null;
    this.lastController = null;
    this.settingsTimer = null;
    this.logLines = [];
    this.lastDump = 0;
    this.autoDumpScheduled = false;
    this.globalPointerDown = (event) => {
      this.handleGlobalPointerDown(event);
    };
    /** injected <style> that disables other plugins' backdrop-filter */
    this.blurShieldEl = null;
    /**
     * Long tasks (> 50 ms) block the pen path no matter how cheap our own
     * drawing is, so record them to tell "our code is slow" apart from
     * "something else froze the main thread".
     */
    this.longTaskObserver = null;
    /* ------------------------------------------------------------------ */
    /* Pen-only brush adjustment (Shift + move the pen above the page)     */
    /* ------------------------------------------------------------------ */
    this.shiftAdjust = null;
    this.shiftHud = null;
    this.shiftRaf = 0;
    /**
     * Photoshop / Krita muscle memory: hold Shift and move the pen *without*
     * touching the page — horizontal changes the brush size, vertical changes
     * the opacity. Refuses to run while the tip is down or a session is open,
     * so it can never fight a stroke, a selection or a pan.
     */
    this.handlePenAdjust = (event) => {
      const inkTool = this.tool === "pen" || this.tool === "highlighter";
      if (!inkTool || !event.shiftKey || !this.penDown || this.isAnySessionOpen()) {
        if (this.shiftAdjust) this.endShiftAdjust();
        return;
      }
      const kind = this.tool === "highlighter" ? "highlighter" : "pen";
      if (!this.shiftAdjust) {
        const brush = this.brushFor(kind);
        this.shiftAdjust = {
          x: event.clientX,
          y: event.clientY,
          size: brush.widthPx,
          opacity: brush.opacity
        };
        this.showShiftHud(event.clientX, event.clientY, brush.widthPx, brush.opacity);
        return;
      }
      const speed = Math.max(1, Math.min(10, this.settings.penAdjustSpeed)) * 0.12;
      const dx = event.clientX - this.shiftAdjust.x;
      const dy = event.clientY - this.shiftAdjust.y;
      const size = clamp(this.shiftAdjust.size + dx * speed, 0.5, 64);
      const opacity = clamp(this.shiftAdjust.opacity - dy * speed * 0.02, 0.05, 1);
      this.positionShiftHud(event.clientX, event.clientY, size, opacity);
      if (this.shiftRaf) return;
      this.shiftRaf = window.requestAnimationFrame(() => {
        this.shiftRaf = 0;
        this.setBrushWidth(kind, Math.round(size * 10) / 10);
        this.setBrushOpacity(kind, Math.round(opacity * 100) / 100);
        this.getActiveController()?.refreshCursor(event);
      });
    };
    /** Pen state tracker: the deferred restore lands when the tip leaves. */
    this.trackPenState = (event) => {
      if (event.pointerType === "touch") return;
      const down = (event.buttons & 1) !== 0;
      const was = this.penDown;
      this.penDown = down;
      if (was && !down) {
        this.endShiftAdjust();
        this.flushPendingTempRestore();
      }
    };
    this.syncMouseTempEraser = (event) => {
      const mask = this.mouseEraserMask;
      if (!mask) {
        if (this.tempTool?.channel === "mouse") this.endTempTool("mouse");
        return;
      }
      if (event.pointerType !== "pen") return;
      if ((event.buttons & mask) !== 0) {
        if (!this.tempTool && !this.tempSuppressed) {
          this.beginTempTool("eraser", "mouse");
        }
        return;
      }
      this.tempSuppressed = false;
      if (this.tempTool?.channel === "mouse") this.endTempTool("mouse");
    };
    /* ------------------------------------------------------------------ */
    /* Global pointer / keyboard                                           */
    /* ------------------------------------------------------------------ */
    this.handleGlobalPointerDown = (event) => {
      const rawTarget = event.target;
      if (event.pointerType === "pen" || rawTarget?.closest?.(".pdf-container")) {
        this.log(
          `raw pointer type=${event.pointerType} id=${event.pointerId} btn=${event.button} b=${event.buttons} alt=${event.altKey} target=${rawTarget?.className || rawTarget?.tagName || "?"}`
        );
      }
      if (!this.settings.stylusFreehand && !this.settings.mouseFreehand && this.tool !== "hand") {
        return;
      }
      const isPen = event.pointerType === "pen";
      const isMouse = event.pointerType === "mouse";
      const hand = this.tool === "hand";
      if (!isPen && !(isMouse && (this.settings.mouseFreehand || hand))) return;
      this.syncAlt(event.altKey);
      if (event.altKey && this.tool === "select") return;
      if (event.shiftKey && (this.tool === "pen" || this.tool === "highlighter")) {
        return;
      }
      if (event.altKey || event.button !== 0) return;
      const target = event.target;
      if (!target?.closest) return;
      if (target.closest(
        ".pdf-ink-toolbar, .pdf-toolbar, .pdf-plus-color-palette, .modal, .menu, .prompt"
      )) {
        return;
      }
      const pageEl = target.closest(".page[data-page-number]");
      this.log(`pointer type=${event.pointerType} target=${target.className || target.tagName}`);
      if (!pageEl) {
        this.log("pointer: no .page[data-page-number] in target chain");
        return;
      }
      const container = target.closest(".pdf-container");
      if (!container) {
        this.log("pointer: no .pdf-container in target chain");
        return;
      }
      const controller = this.findControllerByContainer(container);
      if (!controller) {
        this.log("pointer: no controller for this container");
        return;
      }
      if (controller.drawing) return;
      if (this.strokeBlocked()) {
        this.log("stroke blocked (hold release guard)");
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const started = controller.beginExternalStroke(event, pageEl);
      this.log(
        `pointer: page=${pageEl.dataset.pageNumber} doc=${Boolean(
          controller.doc
        )} started=${started}`
      );
    };
  }
  async onload() {
    await this.loadSettings();
    this.applyInkQuality();
    this.applyBlurShield();
    this.storage = new InkStorage(
      this.app,
      () => this.settings.folder,
      () => [...this.controllers.values()].some((controller) => controller.isStroking)
    );
    this.registerView(VIEW_TYPE_LAYERS, (leaf) => new InkLayersView(leaf, this));
    this.addSettingTab(new PdfInkSettingTab(this.app, this));
    this.addRibbonIcon("pencil", "PDF \u58A8\u8FF9\uFF1A\u5F00\u542F/\u5173\u95ED\u7ED8\u5236", () => this.toggleDrawing());
    this.registerCommands();
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scanLeaves()));
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.scanLeaves();
        this.trackActive();
        this.emitter.trigger("pdf-ink:active-changed");
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.scanLeaves();
        this.trackActive();
      })
    );
    this.registerEvent(this.app.workspace.on("resize", () => this.refreshLayouts()));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void this.handleRename(oldPath, file.path);
      })
    );
    this.registerDomEvent(
      document,
      "keydown",
      (event) => this.handleKeyDown(event),
      true
    );
    this.registerDomEvent(
      document,
      "keyup",
      (event) => this.handleKeyUp(event),
      true
    );
    this.registerDomEvent(window, "blur", () => {
      this.syncAlt(false);
      this.penDown = false;
      this.endTempTool();
      this.flushPendingTempRestore();
    });
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel"
    ]) {
      window.addEventListener(type, this.syncMouseTempEraser, true);
      this.register(
        () => window.removeEventListener(type, this.syncMouseTempEraser, true)
      );
    }
    for (const type of ["pointerdown", "pointerup", "pointercancel"]) {
      window.addEventListener(type, this.trackPenState, true);
      this.register(
        () => window.removeEventListener(type, this.trackPenState, true)
      );
    }
    window.addEventListener("pointermove", this.handlePenAdjust, true);
    this.register(
      () => window.removeEventListener("pointermove", this.handlePenAdjust, true)
    );
    this.registerDomEvent(document, "contextmenu", (event) => {
      if (!this.mouseEraserMask) return;
      if (event.pointerType !== "pen") return;
      const target = event.target;
      if (!target?.closest?.(".pdf-container")) return;
      event.preventDefault();
    });
    window.addEventListener("pointerdown", this.globalPointerDown, true);
    this.register(
      () => window.removeEventListener("pointerdown", this.globalPointerDown, true)
    );
    this.app.workspace.onLayoutReady(() => {
      this.scanLeaves();
      this.trackActive();
    });
    this.observeLongTasks();
  }
  observeLongTasks() {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          perf.add("longtask", entry.duration);
          perf.mark("longtask", entry.duration, entry.startTime);
          if (entry.duration >= 100) {
            let afterCommit = Infinity;
            let busy = false;
            for (const controller of this.controllers.values()) {
              if (controller.isStroking) busy = true;
              if (controller.lastCommitAt > 0) {
                const age = entry.startTime - controller.lastCommitAt;
                if (age >= 0 && age < afterCommit) afterCommit = age;
              }
            }
            const tag = afterCommit < 400 ? `after-commit +${Math.round(afterCommit)}ms` : busy ? "during-stroke" : "idle";
            this.log(`longtask ${Math.round(entry.duration)}ms ${tag}`);
          }
        }
      });
      observer.observe({ type: "longtask", buffered: true });
      this.longTaskObserver = observer;
      this.register(() => observer.disconnect());
    } catch (error) {
    }
  }
  async onunload() {
    this.layersPopover?.close();
    this.layersPopover = null;
    for (const controller of this.controllers.values()) controller.destroy();
    this.controllers.clear();
    this.lastController = null;
    this.blurShieldEl?.remove();
    this.blurShieldEl = null;
    await this.storage.flushAll();
  }
  /* ------------------------------------------------------------------ */
  /* Settings & brushes                                                  */
  /* ------------------------------------------------------------------ */
  async loadSettings() {
    const stored = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...stored ?? {} };
    if (!Array.isArray(this.settings.palette) || this.settings.palette.length === 0) {
      this.settings.palette = [...DEFAULT_SETTINGS.palette];
    }
    if (stored && stored.highlighterOpacity === 0.35) {
      this.settings.highlighterOpacity = 0.5;
    }
    if (!Array.isArray(this.settings.recentColors)) {
      this.settings.recentColors = [];
    }
    this.settings.penOpacity = Number.isFinite(this.settings.penOpacity) ? clamp(this.settings.penOpacity, 0.05, 1) : 1;
    const storedPresets = stored?.brushPresets;
    const seeded = storedPresets === void 0;
    const presets = seeded ? DEFAULT_SETTINGS.brushPresets : storedPresets;
    this.settings.brushPresets = {
      pen: clonePresets(presets?.pen),
      highlighter: clonePresets(presets?.highlighter),
      eraser: clonePresets(presets?.eraser)
    };
    const storedQuick = stored?.quickColors;
    this.settings.quickColors = Array.isArray(storedQuick) ? storedQuick.filter((entry) => typeof entry === "string") : [...DEFAULT_SETTINGS.quickColors];
    const legacy = stored?.eraserMode;
    if (legacy) {
      const map = {
        brush: ["free", "partial"],
        rect: ["rect", "partial"],
        lasso: ["lasso", "partial"],
        stroke: ["free", "whole"],
        "stroke-pick": ["free", "whole"]
      };
      const pair = map[legacy];
      if (pair) {
        if (!stored || stored.eraserRegion === void 0) this.settings.eraserRegion = pair[0];
        if (!stored || stored.eraserScope === void 0) this.settings.eraserScope = pair[1];
      }
    }
  }
  /**
   * Measures what a page-sized canvas actually costs in this environment.
   * The stutter is outside our JS (our whole stroke path is 0.02 ms), so the
   * only way to tell "canvas is slow here" from "something else is blocking"
   * is to time the primitives directly and compare with the long tasks.
   */
  async runCanvasBenchmark() {
    const width = 1326;
    const height = 1876;
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const ctx = scratch.getContext("2d");
    if (!ctx) return;
    const measure = (fn, reps = 5) => {
      fn();
      const t0 = performance.now();
      for (let i = 0; i < reps; i++) fn();
      return Math.round((performance.now() - t0) / reps * 100) / 100;
    };
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#e03131";
    const lines = (n) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        ctx.moveTo(40 + i % 40 * 30, 60 + Math.floor(i / 40) * 60);
        ctx.lineTo(70 + i % 40 * 30, 90 + Math.floor(i / 40) * 60);
      }
      ctx.stroke();
    };
    const linesOneByOne = (n) => {
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(40 + i % 40 * 30, 60 + Math.floor(i / 40) * 60);
        ctx.lineTo(70 + i % 40 * 30, 90 + Math.floor(i / 40) * 60);
        ctx.stroke();
      }
    };
    const clearFull = measure(() => ctx.clearRect(0, 0, width, height));
    const clearBox = measure(() => ctx.clearRect(100, 100, 300, 160));
    const path300 = measure(() => lines(300), 3);
    const seg300 = measure(() => linesOneByOne(300), 3);
    const blit = measure(
      () => ctx.drawImage(scratch, 100, 100, 300, 160, 100, 100, 300, 160)
    );
    ctx.clearRect(0, 0, width, height);
    const frameTimes = [];
    let last = 0;
    await new Promise((resolve) => {
      let frames = 0;
      const step = (now) => {
        if (last > 0) frameTimes.push(now - last);
        last = now;
        ctx.beginPath();
        ctx.moveTo(100 + frames * 8, 200);
        ctx.lineTo(130 + frames * 8, 240);
        ctx.stroke();
        frames++;
        if (frames >= 24) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const frameP95 = Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10;
    const frameAvg = Math.round(frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length * 10) / 10;
    const inPage = await this.measureFramesInPage(width, height);
    let gpu = "unknown";
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl") ?? probe.getContext("experimental-webgl");
      gpu = gl ? "webgl-ok" : "no-webgl";
    } catch {
      gpu = "webgl-error";
    }
    const lines2 = `\u753B\u5E03 ${width}x${height}\uFF08${(width * height / 1e6).toFixed(1)} Mpx\uFF09\xB7 \u5168\u9875 clear ${clearFull}ms \xB7 \u533A\u57DF clear ${clearBox}ms \xB7 300 \u6BB5\u9010\u6BB5 ${seg300}ms \xB7 300 \u6BB5\u5355\u8DEF\u5F84 ${path300}ms \xB7 \u533A\u57DF blit ${blit}ms \xB7 \u9010\u5E27(\u79BB\u5C4F) avg ${frameAvg}ms p95 ${frameP95}ms \xB7 \u9010\u5E27(\u53E0\u52A0\u5728 PDF \u9875\u4E0A) avg ${inPage.avg}ms p95 ${inPage.p95}ms \xB7 ${gpu}`;
    this.log(`benchmark ${lines2}`);
    new import_obsidian9.Notice(`[PDF Ink] ${lines2}`, 2e4);
    void this.dumpDiagnostics("benchmark", true);
  }
  /** 24 frames drawn into a canvas appended to the first PDF page. */
  async measureFramesInPage(width, height) {
    const pageEl = document.querySelector(".page[data-page-number]");
    if (!pageEl) return { avg: -1, p95: -1 };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.pointerEvents = "none";
    pageEl.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return { avg: -1, p95: -1 };
    }
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#e03131";
    const gaps = [];
    let last = 0;
    await new Promise((resolve) => {
      let frames = 0;
      const step = (now) => {
        if (last > 0) gaps.push(now - last);
        last = now;
        ctx.beginPath();
        ctx.moveTo(100 + frames * 8, 200);
        ctx.lineTo(130 + frames * 8, 240);
        ctx.stroke();
        frames++;
        if (frames >= 24) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    canvas.remove();
    const sorted = [...gaps].sort((a, b) => a - b);
    return {
      avg: Math.round(gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length) * 10) / 10,
      p95: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10
    };
  }
  /**
   * Idle A/B: count long tasks with our ink canvases in different states.
   * Each phase runs twice so a single stray task cannot decide the verdict.
   * No Chrome DevTools needed — this answers "is it our canvases, and which
   * one" on this machine.
   */
  async runStutterAbTest() {
    const controller = this.getActiveController();
    if (!controller) {
      new import_obsidian9.Notice("[PDF Ink] \u8BF7\u5148\u6253\u5F00\u4E00\u4E2A PDF \u6587\u4EF6");
      return;
    }
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const sample = (ms) => new Promise((resolve) => {
      perf.reset();
      window.setTimeout(() => {
        const stat = perf.snapshot().stats["longtask"];
        resolve({ count: stat?.count ?? 0, total: Math.round(stat?.total ?? 0) });
      }, ms);
    });
    const phases = [
      { label: "\u5168\u90E8\u753B\u5E03", mode: "none" },
      { label: "\u53EA\u9690\u85CF live", mode: "live" },
      { label: "\u9690\u85CF\u5168\u90E8", mode: "all" }
    ];
    new import_obsidian9.Notice(
      `[PDF Ink] \u5F52\u56E0\u6D4B\u8BD5\uFF1A\u7EA6 15 \u79D2\uFF0C\u5168\u7A0B\u522B\u52A8\u7B14\u3001\u522B\u6EDA\u52A8\uFF08\u5F53\u524D ${controller.canvasCount} \u5757\u753B\u5E03\uFF09`,
      8e3
    );
    const results = [];
    for (const phase of phases) {
      controller.setInkHidden(phase.mode);
      await wait(500);
      let count = 0;
      let total = 0;
      for (let round2 = 0; round2 < 2; round2++) {
        const one = await sample(2e3);
        count += one.count;
        total += one.total;
      }
      results.push({ label: phase.label, count, total });
    }
    controller.setInkHidden("none");
    const byLabel = new Map(results.map((entry) => [entry.label, entry]));
    const all = byLabel.get("\u5168\u90E8\u753B\u5E03");
    const liveHidden = byLabel.get("\u53EA\u9690\u85CF live");
    const noneHidden = byLabel.get("\u9690\u85CF\u5168\u90E8");
    let verdict;
    if (all.count === 0 && noneHidden.count === 0) {
      verdict = "\u7A7A\u95F2\u65F6\u672C\u6765\u5C31\u4E0D\u5361 \u2192 \u5361\u987F\u5728\u64CD\u4F5C\u77AC\u95F4\uFF0C\u67E5\u63D0\u4EA4/\u64E6\u9664\u8DEF\u5F84";
    } else if (noneHidden.total < all.total * 0.5 && liveHidden.total < all.total * 0.7) {
      verdict = "live \u5C42\u662F\u5927\u5934 \u2192 \u76F4\u63A5\u7ED8\u5236\uFF08\u53BB\u6389 live \u5C42\uFF09";
    } else if (noneHidden.total < all.total * 0.5) {
      verdict = "committed \u5C42\u662F\u5927\u5934 \u2192 \u964D\u9884\u7B97\u6216\u5206\u5757\u6E32\u67D3";
    } else {
      verdict = "\u9690\u85CF\u753B\u5E03\u6CA1\u533A\u522B \u2192 \u963B\u585E\u6765\u81EA\u5916\u90E8\uFF08pdf.js / \u5176\u4ED6\u63D2\u4EF6\uFF09\uFF0C\u9700\u8981\u4E8C\u5206\u5173\u63D2\u4EF6";
    }
    const detail = results.map((entry) => `${entry.label} ${entry.count} \u6B21/${entry.total}ms`).join(" \xB7 ");
    const line = `\u5F52\u56E0: ${detail} \xB7 ${verdict}`;
    this.log(`stutter-ab ${line}`);
    new import_obsidian9.Notice(`[PDF Ink] ${line}`, 3e4);
    void this.dumpDiagnostics("stutter-ab", true);
  }
  /**
   * PERF: a blurred (backdrop-filter) overlay above the PDF makes Chromium
   * re-rasterize the blur on every pen sample — 100 ms+ long tasks per stroke.
   * dev.44 toggled it off for the duration of a stroke, which worked but paid
   * two re-rasters per stroke for the toggle itself; dev.62 removed it and
   * made writing visibly worse. So it is applied once at load and only ever
   * removed when the user turns it off.
   *
   * Scoped to the known offenders instead of `.workspace-leaf *`: restyling
   * the whole tree would cost more than it saves.
   */
  applyBlurShield() {
    this.blurShieldEl?.remove();
    this.blurShieldEl = null;
    if (!this.settings.blurShield) return;
    const style = document.createElement("style");
    style.id = "pdf-ink-blur-shield";
    style.textContent = [
      ":is(#editingToolbarModalBar, #editingToolbarPopoverBar) {",
      "	backdrop-filter: none !important;",
      "	-webkit-backdrop-filter: none !important;",
      "}",
      ":is(#editingToolbarModalBar, #editingToolbarPopoverBar) *::before,",
      ":is(#editingToolbarModalBar, #editingToolbarPopoverBar) *::after {",
      "	backdrop-filter: none !important;",
      "	-webkit-backdrop-filter: none !important;",
      "}"
    ].join("\n");
    document.head.appendChild(style);
    this.blurShieldEl = style;
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshUI();
  }
  /**
   * Canvas pixel budget per overlay. The blocking time after every commit
   * scales with the canvas area (measured: 10 Mpx ≈ 190 ms/stroke, 4 Mpx ≈
   * 100 ms), so this is the one knob that actually moves the needle.
   */
  applyInkQuality() {
    const budgets = {
      fast: 12e5,
      smooth: 24e5,
      balanced: 4e6,
      crisp: 8e6
    };
    setCanvasPixelBudget(budgets[this.settings.inkQuality] ?? 4e6);
    setLowLatencyLive(Boolean(this.settings.lowLatencyLive));
    for (const controller of this.controllers.values()) controller.refreshLayout();
  }
  scheduleSaveSettings() {
    if (this.settingsTimer !== null) window.clearTimeout(this.settingsTimer);
    this.settingsTimer = window.setTimeout(() => {
      this.settingsTimer = null;
      void this.saveSettings();
    }, 300);
  }
  brushFor(tool) {
    if (tool === "highlighter") {
      return {
        color: this.settings.highlighterColor,
        widthPx: this.settings.highlighterWidth,
        opacity: this.settings.highlighterOpacity
      };
    }
    if (tool === "eraser") {
      return {
        color: "#000000",
        widthPx: this.settings.eraserWidth,
        opacity: 1
      };
    }
    return {
      color: this.settings.penColor,
      widthPx: this.settings.penWidth,
      opacity: this.settings.penOpacity
    };
  }
  /** Which brush a preset kind edits (the eraser has no color). */
  applyInputMode(mode) {
    this.settings.inputMode = mode;
    if (mode === "tablet") {
      this.settings.eraserHoldEnabled = false;
      this.settings.tapGestureMenuEnabled = false;
      this.settings.eraserHoldMs = Math.max(this.settings.eraserHoldMs, 1200);
      if (!this.settings.tempEraserKey.trim()) this.settings.tempEraserKey = "f";
    } else if (mode === "touch") {
      this.settings.eraserHoldEnabled = true;
      this.settings.tapGestureMenuEnabled = true;
      this.settings.eraserHoldMs = Math.min(this.settings.eraserHoldMs, 750);
    }
    return this.saveSettings();
  }
  setTool(tool) {
    if (!this.applyingTemp && this.tempTool) {
      if (this.tempTool.channel === "mouse") this.tempSuppressed = true;
      this.tempTool = null;
    }
    if (!this.applyingTemp) this.pendingTempRestore = null;
    this.tool = tool;
    this.refreshUI();
    for (const controller of this.controllers.values()) controller.onToolChanged();
  }
  /* ------------------------------------------------------------------ */
  /* Temporary eraser (pen tablet "hold" keys / side buttons)            */
  /* ------------------------------------------------------------------ */
  /** PointerEvent.buttons bit for the side button the driver reports. */
  get mouseEraserMask() {
    const mode = this.settings.tempEraserMouse;
    if (mode === "right") return 2;
    if (mode === "middle") return 4;
    return 0;
  }
  isTempEraserKey(event) {
    const spec = this.settings.tempEraserKey?.trim();
    if (!spec) return false;
    return matchesSpec(spec, event);
  }
  /**
   * Switches to `tool` for as long as the trigger stays down.
   *
   * Two callers: the dedicated hold key (`tempEraserKey`) and any tool action
   * whose binding is set to "按住" in the settings. `spec` is the spec that
   * armed it, so the matching keyup can end it even if modifiers changed.
   */
  beginTempTool(tool, channel, spec) {
    if (this.tempTool) return;
    if (channel === "mouse" && this.tempSuppressed) return;
    const controller = this.getActiveController();
    if (controller?.isStroking) return;
    const prev = this.tool;
    this.tempTool = { prev, channel, spec };
    if (prev === tool) return;
    this.applyingTemp = true;
    this.setTool(tool);
    this.applyingTemp = false;
    this.log(
      `temp tool ${tool} on (${channel}) from ${prev}${spec ? ` via ${spec}` : ""}`
    );
  }
  endTempTool(channel) {
    const state = this.tempTool;
    if (!state) return;
    if (channel && state.channel !== channel) return;
    this.tempTool = null;
    if (state.channel === "key" && (this.penDown || this.isAnySessionOpen())) {
      this.pendingTempRestore = { prev: state.prev };
      this.log(`temp tool release deferred until pen up (${state.prev})`);
      return;
    }
    this.applyTempRestore(state.prev);
  }
  applyTempRestore(prev) {
    if (prev === this.tool) return;
    this.applyingTemp = true;
    this.setTool(prev);
    this.applyingTemp = false;
    this.log(`temp tool off back to ${prev}`);
  }
  isAnySessionOpen() {
    for (const controller of this.controllers.values()) {
      if (controller.isStroking) return true;
    }
    return false;
  }
  /** True while Shift + pen movement is resizing the brush. */
  adjustingBrush() {
    return Boolean(this.shiftAdjust);
  }
  showShiftHud(x, y, size, opacity) {
    this.shiftHud?.remove();
    const hud = document.createElement("div");
    hud.className = "pdf-ink-shift-hud";
    document.body.appendChild(hud);
    this.shiftHud = hud;
    this.positionShiftHud(x, y, size, opacity);
  }
  positionShiftHud(x, y, size, opacity) {
    const hud = this.shiftHud;
    if (!hud) return;
    hud.textContent = `\u7C97\u7EC6 ${Math.round(size * 10) / 10}px \xB7 \u4E0D\u900F\u660E\u5EA6 ${Math.round(
      opacity * 100
    )}%`;
    const w = hud.offsetWidth || 168;
    const h = hud.offsetHeight || 26;
    const gap = 14 + Math.min(28, Math.max(0, size * 0.35));
    const maxLeft = Math.max(8, window.innerWidth - w - 8);
    const maxTop = Math.max(8, window.innerHeight - h - 8);
    let left = x + gap;
    let top = y + gap;
    if (left > maxLeft) left = x - gap - w;
    if (top > maxTop) top = y - gap - h;
    hud.style.left = `${Math.round(clamp(left, 8, maxLeft))}px`;
    hud.style.top = `${Math.round(clamp(top, 8, maxTop))}px`;
  }
  endShiftAdjust() {
    this.shiftAdjust = null;
    if (this.shiftRaf) {
      window.cancelAnimationFrame(this.shiftRaf);
      this.shiftRaf = 0;
    }
    this.shiftHud?.remove();
    this.shiftHud = null;
  }
  /** True while a just-released hold gesture must not start a new stroke. */
  strokeBlocked() {
    return performance.now() < this.strokeGuardUntil;
  }
  flushPendingTempRestore() {
    const pending = this.pendingTempRestore;
    if (!pending) return;
    this.pendingTempRestore = null;
    this.applyTempRestore(pending.prev);
    this.strokeGuardUntil = performance.now() + HOLD_RELEASE_GUARD_MS;
    this.log(`hold release guard ${HOLD_RELEASE_GUARD_MS}ms`);
  }
  /** True when the keyup belongs to whatever armed the current hold. */
  keyReleasedTempTool(event) {
    const state = this.tempTool;
    if (!state || state.channel !== "key") return false;
    const armed = parseKeySpec(state.spec ?? this.settings.tempEraserKey ?? "");
    if (!armed) return false;
    const released = parseKeySpec(specFromEvent(event));
    return !!released && released.key === armed.key;
  }
  actionForSpec(spec) {
    return actionIdForSpec(spec, resolveBindings(this.settings.keyBindings));
  }
  runAction(actionId) {
    const action = ACTIONS.find((entry) => entry.id === actionId);
    if (!action) return;
    if (action.tool) {
      this.setTool(action.tool);
      return;
    }
    if (typeof action.colorIndex === "number") this.setPaletteColor(action.colorIndex);
  }
  /** Color of the pen / highlighter, regardless of the active tool. */
  setBrushColor(kind, color) {
    if (kind === "highlighter") this.settings.highlighterColor = color;
    else this.settings.penColor = color;
    this.settings.recentColors = [
      color,
      ...this.settings.recentColors.filter((entry) => entry !== color)
    ].slice(0, 8);
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  setColor(color) {
    this.setBrushColor(this.tool === "highlighter" ? "highlighter" : "pen", color);
  }
  /** Width of a specific brush, used by the panel sliders and presets. */
  setBrushWidth(kind, widthPx) {
    if (kind === "highlighter") this.settings.highlighterWidth = widthPx;
    else if (kind === "eraser") this.settings.eraserWidth = widthPx;
    else this.settings.penWidth = widthPx;
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  setWidth(widthPx) {
    const kind = this.tool === "eraser" ? "eraser" : this.tool === "highlighter" ? "highlighter" : "pen";
    this.setBrushWidth(kind, widthPx);
  }
  setBrushOpacity(kind, opacity) {
    const value = clamp(opacity, 0.05, 1);
    if (kind === "highlighter") this.settings.highlighterOpacity = value;
    else this.settings.penOpacity = value;
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  setPaletteColor(index) {
    const color = this.settings.palette[index];
    if (color) this.setColor(color);
  }
  /* ------------------------------------------------------------------ */
  /* Brushes: presets, palette, quick colors                             */
  /* ------------------------------------------------------------------ */
  newId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
  presetsOf(kind) {
    if (kind === "eraser") return this.settings.brushPresets.eraser;
    return this.settings.brushPresets[kind];
  }
  /** Applies a preset: one click sets color, width (and opacity) together. */
  applyPreset(kind, preset) {
    if (kind === "eraser") {
      const eraser = preset;
      this.settings.eraserRegion = eraser.region;
      this.settings.eraserScope = eraser.scope;
      this.settings.eraserWidth = eraser.widthPx;
      this.setTool("eraser");
    } else {
      const brush = preset;
      this.setBrushColor(kind, brush.color);
      this.setBrushWidth(kind, brush.widthPx);
      this.setBrushOpacity(kind, brush.opacity);
      if (this.tool !== kind) this.setTool(kind);
    }
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  /** Stores the current brush state as a new preset and returns it. */
  addPreset(kind) {
    if (kind === "eraser") {
      const preset2 = {
        id: this.newId("e"),
        name: eraserPresetName(this.settings.eraserRegion, this.settings.eraserWidth),
        region: this.settings.eraserRegion,
        scope: this.settings.eraserScope,
        widthPx: this.settings.eraserWidth
      };
      this.settings.brushPresets.eraser.push(preset2);
      this.scheduleSaveSettings();
      return preset2;
    }
    const brush = this.brushFor(kind);
    const preset = {
      id: this.newId(kind === "pen" ? "p" : "h"),
      name: autoPresetName(brush.color, brush.widthPx),
      color: brush.color,
      widthPx: brush.widthPx,
      opacity: brush.opacity
    };
    this.settings.brushPresets[kind].push(preset);
    this.scheduleSaveSettings();
    return preset;
  }
  /** Replaces a preset with the current brush state (long press → 覆盖). */
  overwritePreset(kind, id) {
    const list = this.presetsOf(kind);
    const preset = list.find((entry) => entry.id === id);
    if (!preset) return;
    if (kind === "eraser") {
      const eraser = preset;
      eraser.region = this.settings.eraserRegion;
      eraser.scope = this.settings.eraserScope;
      eraser.widthPx = this.settings.eraserWidth;
    } else {
      const brush = preset;
      const current = this.brushFor(kind);
      brush.color = current.color;
      brush.widthPx = current.widthPx;
      brush.opacity = current.opacity;
    }
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  renamePreset(kind, id, name) {
    const preset = this.presetsOf(kind).find((entry) => entry.id === id);
    if (!preset) return;
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    preset.name = trimmed.slice(0, 24);
    this.scheduleSaveSettings();
  }
  deletePreset(kind, id) {
    const list = this.presetsOf(kind);
    const index = list.findIndex((entry) => entry.id === id);
    if (index < 0) return;
    list.splice(index, 1);
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  setPaletteSlot(index, color) {
    if (index < 0 || index >= this.settings.palette.length) return;
    this.settings.palette[index] = color;
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  addPaletteColor(color) {
    if (this.settings.palette.includes(color)) return;
    this.settings.palette.push(color);
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  removePaletteColor(index) {
    if (this.settings.palette.length <= 1) return;
    this.settings.palette.splice(index, 1);
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  /** Long press on a quick-color swatch: replace it with the current color. */
  setQuickColor(index, color) {
    if (index < 0 || index >= this.settings.quickColors.length) return;
    this.settings.quickColors[index] = color;
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  setEraserRegion(region) {
    this.settings.eraserRegion = region;
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  setEraserScope(scope) {
    this.settings.eraserScope = scope;
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  setSelectMode(mode) {
    this.settings.selectMode = mode;
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  cycleToolbarLayout() {
    const order = ["horizontal", "vertical", "square"];
    const index = order.indexOf(this.settings.toolbarLayout);
    this.settings.toolbarLayout = order[(index + 1) % order.length];
    this.refreshUI();
    this.scheduleSaveSettings();
  }
  setToolbarPosition(position) {
    this.settings.toolbarPos = position;
    this.scheduleSaveSettings();
  }
  log(message) {
    this.logLines.push(`${(/* @__PURE__ */ new Date()).toISOString()} ${message}`);
    if (this.logLines.length > 300) this.logLines.splice(0, this.logLines.length - 300);
  }
  /** Community plugins that are actually loaded (diagnostics only). */
  enabledPluginIds() {
    try {
      const registry = this.app.plugins?.plugins;
      if (!registry) return [];
      return Object.keys(registry).filter((id) => Boolean(registry[id])).sort();
    } catch {
      return [];
    }
  }
  async dumpDiagnostics(reason, force = false) {
    const now = Date.now();
    if (!force && now - this.lastDump < 3e3) return;
    this.lastDump = now;
    const leaves = this.app.workspace.getLeavesOfType("pdf").map((leaf) => {
      const view = leaf.view;
      return {
        file: view?.file?.path ?? null,
        viewType: view?.getViewType?.(),
        hasPdfViewer: Boolean(view?.pdfViewer),
        domKeys: view?.pdfViewer?.dom ? Object.keys(view.pdfViewer.dom) : []
      };
    });
    const report = {
      reason,
      time: (/* @__PURE__ */ new Date()).toISOString(),
      obsidianVersion: this.app.version ?? null,
      pluginVersion: this.manifest?.version ?? "unknown",
      /** enabled community plugins, so a slow session can be blamed */
      plugins: this.enabledPluginIds(),
      settings: this.settings,
      leaves,
      controllers: [...this.controllers.values()].map(
        (controller) => controller.debugInfo()
      ),
      perf: perf.snapshot(),
      log: this.logLines.slice(-150)
    };
    const dir = this.manifest?.dir || ".obsidian/plugins/pdf-ink";
    try {
      await this.app.vault.adapter.write(
        `${dir}/debug.json`,
        JSON.stringify(report, null, 2)
      );
    } catch (error) {
      console.error("[pdf-ink] failed to write diagnostics", error);
    }
  }
  /* ------------------------------------------------------------------ */
  /* Views                                                               */
  /* ------------------------------------------------------------------ */
  scanLeaves() {
    const leaves = this.app.workspace.getLeavesOfType("pdf");
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!view || view.getViewType?.() !== "pdf") continue;
      const existing = this.controllers.get(leaf);
      if (existing) existing.attach();
      else {
        this.attachLeaf(leaf);
        if (!this.autoDumpScheduled) {
          this.autoDumpScheduled = true;
          window.setTimeout(() => {
            void this.dumpDiagnostics("first-pdf", true);
          }, 2500);
        }
      }
    }
    for (const [leaf, controller] of [...this.controllers]) {
      const view = leaf.view;
      const connected = view?.containerEl?.isConnected;
      if (!view || view.getViewType?.() !== "pdf" || !connected) {
        controller.destroy();
        this.controllers.delete(leaf);
        if (this.lastController === controller) this.lastController = null;
      }
    }
  }
  attachLeaf(leaf) {
    const view = leaf.view;
    if (!view || view.getViewType?.() !== "pdf") return null;
    const controller = new PdfInkController(this, leaf);
    this.controllers.set(leaf, controller);
    controller.attach();
    return controller;
  }
  trackActive() {
    const controller = this.getActiveController();
    if (controller) this.lastController = controller;
  }
  getActiveController() {
    const leaf = this.activeLeafViaDom() ?? this.app.workspace.activeLeaf ?? null;
    if (!leaf) return null;
    const view = leaf.view;
    if (view?.getViewType?.() !== "pdf") return null;
    const existing = this.controllers.get(leaf) ?? this.attachLeaf(leaf);
    if (existing?.isAlive) {
      this.lastController = existing;
      return existing;
    }
    return null;
  }
  /** The workspace leaf whose DOM is currently marked active, if resolvable. */
  activeLeafViaDom() {
    if (typeof document === "undefined") return null;
    const activeEl = document.querySelector(".workspace-leaf.mod-active");
    if (!activeEl) return null;
    const workspace = this.app.workspace;
    if (typeof workspace.iterateAllLeaves !== "function") return null;
    let found = null;
    workspace.iterateAllLeaves((leaf) => {
      if (found) return;
      const container = leaf.view?.containerEl;
      if (container && (container === activeEl || container.contains(activeEl))) {
        found = leaf;
      }
    });
    return found;
  }
  /** Active PDF controller, or the most recent one (for the sidebar panel). */
  getTargetController() {
    const active = this.getActiveController();
    if (active) return active;
    if (this.lastController?.isAlive) return this.lastController;
    return null;
  }
  findControllerByContainer(container) {
    for (const controller of this.controllers.values()) {
      if (controller.containerEl?.contains(container)) return controller;
    }
    return null;
  }
  refreshLayouts() {
    for (const controller of this.controllers.values()) controller.refreshLayout();
  }
  refreshUI() {
    for (const controller of this.controllers.values()) controller.refreshToolbar();
  }
  /** Floating layers panel; also keeps the docked view available as a fallback. */
  toggleLayersPanel(anchor = null) {
    this.layersPopover ?? (this.layersPopover = new PdfInkLayersPopover(this));
    this.layersPopover.toggle(anchor);
  }
  async openLayersView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LAYERS);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_LAYERS, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  toggleDrawing() {
    const controller = this.getActiveController() ?? this.getTargetController();
    if (!controller) {
      new import_obsidian9.Notice("[PDF Ink] \u8BF7\u5148\u6253\u5F00\u4E00\u4E2A PDF \u6587\u4EF6");
      return;
    }
    if (!controller.hasViewer) {
      new import_obsidian9.Notice("[PDF Ink] PDF \u6B63\u5728\u52A0\u8F7D\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5");
      return;
    }
    controller.toggleDrawing();
  }
  registerCommands() {
    this.addCommand({
      id: "toggle-drawing",
      name: "\u5F00\u542F/\u5173\u95ED\u7ED8\u5236\u6A21\u5F0F",
      checkCallback: (checking) => {
        const controller = this.getActiveController();
        if (!controller || !controller.hasViewer) return false;
        if (!checking) controller.toggleDrawing();
        return true;
      }
    });
    const tools = [
      ["tool-pen", "\u5DE5\u5177\uFF1A\u94A2\u7B14", "pen"],
      ["tool-highlighter", "\u5DE5\u5177\uFF1A\u8367\u5149\u7B14", "highlighter"],
      ["tool-eraser", "\u5DE5\u5177\uFF1A\u6A61\u76AE", "eraser"],
      ["tool-select", "\u5DE5\u5177\uFF1A\u9009\u62E9", "select"],
      ["tool-line", "\u5DE5\u5177\uFF1A\u76F4\u7EBF", "line"],
      ["tool-arrow", "\u5DE5\u5177\uFF1A\u7BAD\u5934", "arrow"],
      ["tool-rect", "\u5DE5\u5177\uFF1A\u77E9\u5F62", "rect"],
      ["tool-ellipse", "\u5DE5\u5177\uFF1A\u692D\u5706", "ellipse"],
      ["tool-hand", "\u5DE5\u5177\uFF1A\u62D6\u62FD\u9875\u9762", "hand"]
    ];
    for (const [id, name, tool] of tools) {
      this.addCommand({ id, name, callback: () => this.setTool(tool) });
    }
    this.addCommand({
      id: "undo-stroke",
      name: "\u64A4\u9500\u7B14\u8FF9",
      callback: () => this.getTargetController()?.undo()
    });
    this.addCommand({
      id: "redo-stroke",
      name: "\u91CD\u505A\u7B14\u8FF9",
      callback: () => this.getTargetController()?.redo()
    });
    this.addCommand({
      id: "clear-all-ink",
      name: "\u6E05\u7A7A\u672C PDF \u7684\u5168\u90E8\u58A8\u8FF9\uFF08\u4E0D\u53EF\u64A4\u9500\uFF09",
      // Plain callback on purpose: a `checkCallback` that returns false is
      // hidden from the palette, and while the palette itself is open the
      // active leaf is not always the PDF view — the command then silently
      // disappeared. Report the problem instead of hiding.
      callback: () => {
        const controller = this.getActiveController() ?? this.getTargetController();
        if (!controller?.doc) {
          new import_obsidian9.Notice("[PDF Ink] \u8BF7\u5148\u6253\u5F00\u4E00\u4E2A PDF \u6587\u4EF6\u5E76\u7B49\u5B83\u52A0\u8F7D\u5B8C");
          return;
        }
        const strokes = controller.doc.layers.reduce(
          (sum, layer) => sum + layer.strokes.length,
          0
        );
        new ConfirmModal(
          this.app,
          "\u6E05\u7A7A\u58A8\u8FF9",
          `\u5C06\u4ECE\u300A${controller.doc.file ?? "\u5F53\u524D PDF"}\u300B\u5220\u9664\u5168\u90E8 ${strokes} \u6761\u7B14\u8FF9\uFF08\u56FE\u5C42\u4FDD\u7559\uFF09\u3002\u5220\u9664\u524D\u4F1A\u5199\u4E00\u4EFD .bak \u5907\u4EFD\uFF0C\u5220\u9664\u540E\u65E0\u6CD5\u64A4\u9500\u3002`,
          "\u6E05\u7A7A\u58A8\u8FF9",
          () => {
            const removed = controller.clearAllInk();
            new import_obsidian9.Notice(
              removed > 0 ? `[PDF Ink] \u5DF2\u6E05\u7A7A ${removed} \u6761\u7B14\u8FF9` : "[PDF Ink] \u6CA1\u6709\u53EF\u6E05\u7A7A\u7684\u7B14\u8FF9"
            );
          }
        ).open();
      }
    });
    this.addCommand({
      id: "reset-input",
      name: "\u91CD\u7F6E\u7B14\u8FF9\u4F1A\u8BDD\uFF08\u7B14\u5361\u4F4F\u65F6\u7528\uFF09",
      checkCallback: (checking) => {
        const controller = this.getTargetController();
        if (!controller) return false;
        if (!checking) {
          this.endTempTool();
          this.tempSuppressed = false;
          this.pendingTempRestore = null;
          this.penDown = false;
          this.strokeGuardUntil = 0;
          controller.resetInputState();
          this.setTool("pen");
          new import_obsidian9.Notice("[PDF Ink] \u5DF2\u91CD\u7F6E\uFF1A\u4F1A\u8BDD\u5173\u95ED\u3001\u4E34\u65F6\u5DE5\u5177\u64A4\u9500\u3001\u5DE5\u5177\u56DE\u5230\u94A2\u7B14");
        }
        return true;
      }
    });
    this.addCommand({
      id: "new-layer",
      name: "\u65B0\u5EFA\u56FE\u5C42",
      callback: () => {
        const controller = this.getTargetController();
        if (!controller?.doc) {
          new import_obsidian9.Notice("[PDF Ink] \u8BF7\u5148\u6253\u5F00\u4E00\u4E2A PDF \u6587\u4EF6");
          return;
        }
        controller.addLayer();
      }
    });
    this.addCommand({
      id: "open-layers",
      name: "\u6253\u5F00\u56FE\u5C42\u9762\u677F",
      callback: () => this.toggleLayersPanel(this.getTargetController()?.toolbarEl ?? null)
    });
    this.addCommand({
      id: "export-diagnostics",
      name: "\u5BFC\u51FA\u8BCA\u65AD\u4FE1\u606F\uFF08\u8C03\u8BD5\u7528\uFF09",
      callback: () => {
        void this.dumpDiagnostics("manual", true).then(() => {
          new import_obsidian9.Notice("[PDF Ink] \u8BCA\u65AD\u4FE1\u606F\u5DF2\u5199\u5165\u63D2\u4EF6\u76EE\u5F55 debug.json");
        });
      }
    });
    this.addCommand({
      id: "perf-summary",
      name: "\u663E\u793A\u6027\u80FD\u6458\u8981\uFF08\u8C03\u8BD5\u7528\uFF09",
      callback: () => {
        const lines = perf.summary(10);
        if (lines.length === 0) {
          new import_obsidian9.Notice("[PDF Ink] \u8FD8\u6CA1\u6709\u6027\u80FD\u91C7\u6837\uFF1A\u5148\u5199\u51E0\u7B14\u518D\u8BD5");
          return;
        }
        const text = lines.join("\n");
        void navigator.clipboard?.writeText(text).catch(() => void 0);
        new import_obsidian9.Notice(`[PDF Ink] ${text}`, 15e3);
      }
    });
    this.addCommand({
      id: "canvas-benchmark",
      name: "\u753B\u5E03\u57FA\u51C6\u6D4B\u8BD5\uFF08\u6392\u67E5\u5361\u987F\u7528\uFF09",
      callback: () => {
        void this.runCanvasBenchmark();
      }
    });
    this.addCommand({
      id: "stutter-ab",
      name: "\u5361\u987F\u5F52\u56E0\u6D4B\u8BD5\uFF088 \u79D2\uFF0CA/B \u753B\u5E03\uFF09",
      checkCallback: (checking) => {
        const controller = this.getActiveController();
        if (!controller) return false;
        if (!checking) void this.runStutterAbTest();
        return true;
      }
    });
    this.addCommand({
      id: "perf-reset",
      name: "\u6E05\u7A7A\u6027\u80FD\u91C7\u6837",
      callback: () => {
        perf.reset();
        new import_obsidian9.Notice("[PDF Ink] \u6027\u80FD\u91C7\u6837\u5DF2\u6E05\u7A7A");
      }
    });
  }
  syncAlt(active) {
    for (const controller of this.controllers.values()) {
      controller.setAltPassthrough(active);
    }
  }
  handleKeyDown(event) {
    this.syncAlt(event.altKey);
    const target = event.target;
    const keySpec = specFromEvent(event);
    if (this.settings.logKeyEvents) {
      const tag = target?.tagName ? `<${target.tagName.toLowerCase()}>` : "";
      this.log(`key down ${keySpec || event.key} ${tag}`.trim());
    }
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      return;
    }
    const controller = this.getActiveController();
    if (!controller) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "c" && controller.hasSelection) {
        if (controller.copySelection()) {
          this.log(`key ctrl+c handled selection`);
          event.preventDefault();
          return;
        }
      }
      if (key === "x" && controller.hasSelection) {
        if (controller.cutSelection()) {
          this.log(`key ctrl+x handled selection`);
          event.preventDefault();
          return;
        }
      }
      if (key === "a" && controller.selectAll()) {
        this.log(`key ctrl+a select all`);
        event.preventDefault();
        return;
      }
      if (key === "v") {
        if (controller.pasteClipboard()) {
          this.log(`key ctrl+v pasted`);
          event.preventDefault();
          return;
        }
        this.log(
          `key ctrl+v ignored clipboard=${this.inkClipboard ? this.inkClipboard.strokes.length : 0}`
        );
      }
    }
    if ((event.key === "Delete" || event.key === "Backspace") && controller.hasSelection) {
      event.preventDefault();
      controller.deleteSelection();
      return;
    }
    if (controller.hasSelection && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1]
      };
      const step = direction[event.key];
      if (step) {
        const amount = event.shiftKey ? 10 : 1;
        if (controller.nudgeSelection(step[0] * amount, step[1] * amount)) {
          event.preventDefault();
          return;
        }
      }
    }
    const active = controller.drawing || this.settings.stylusFreehand;
    if (event.key === "Escape") {
      if (this.tempTool) {
        event.preventDefault();
        this.endTempTool();
        return;
      }
      if (controller.drawing) {
        event.preventDefault();
        controller.setDrawing(false);
      }
      return;
    }
    if (this.isTempEraserKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) {
        this.beginTempTool("eraser", "key", specFromEvent(event));
      }
      return;
    }
    if (keySpec) {
      const actionId = this.actionForSpec(keySpec);
      if (actionId) {
        const action = ACTIONS.find((entry) => entry.id === actionId);
        if (action?.tool && this.settings.keyHolds[actionId]) {
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) {
            this.beginTempTool(action.tool, "key", keySpec);
          }
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.runAction(actionId);
        return;
      }
    }
    if (!active) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) controller.redo();
      else controller.undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
  }
  handleKeyUp(event) {
    this.syncAlt(event.altKey);
    if (this.settings.logKeyEvents) {
      this.log(`key up ${specFromEvent(event) || event.key}`);
    }
    if (this.keyReleasedTempTool(event)) this.endTempTool("key");
    if (!event.shiftKey) this.endShiftAdjust();
  }
  async handleRename(oldPath, newPath) {
    await this.storage.move(oldPath, newPath);
    for (const controller of this.controllers.values()) {
      controller.onVaultRename(oldPath, newPath);
    }
  }
};
