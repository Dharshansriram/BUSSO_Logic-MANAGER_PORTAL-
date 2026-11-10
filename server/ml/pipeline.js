import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "models"
);
const METRICS_PATH = path.join(MODEL_DIR, "model_metrics.json");
export const MODEL_VERSION = "logistic-js-v1.0";
export const FEATURE_NAMES = [
  "blocked",
  "priority_score",
  "urgency_score",
  "overrun_ratio",
  "overload_ratio",
];

let cachedModel = null;
let cachedMetrics = null;

// ---- seeded randomness (deterministic training data) -----------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const makeNormal = rand => (mean, sd) => {
  const u = Math.max(rand(), 1e-12);
  return (
    mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
  );
};
const choice = (rand, values, probs) => {
  let r = rand();
  for (let i = 0; i < values.length; i++) {
    r -= probs[i];
    if (r < 0) return values[i];
  }
  return values[values.length - 1];
};
const clip = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sigmoid = z => 1 / (1 + Math.exp(-z));

/** Synthetic operational history: features + a noisy delay label from the canonical risk formula. */
export function generateSyntheticData(n = 1000, seed = 42) {
  const rand = mulberry32(seed);
  const normal = makeNormal(rand);
  const X = [];
  const y = [];
  for (let i = 0; i < n; i++) {
    const blocked = rand() < 0.15 ? 1 : 0;
    const priority = choice(rand, [0, 0.35, 0.7, 1], [0.25, 0.35, 0.25, 0.15]);
    const urgency = choice(rand, [0, 0.3, 0.65, 1], [0.4, 0.3, 0.2, 0.1]);
    const overrun = clip(-0.25 * Math.log(1 - rand()), 0, 1);
    const overload = clip(normal(0.3, 0.4), 0, 1.5);
    const logit =
      -2.15 +
      1.45 * blocked +
      1.05 * priority +
      1.35 * urgency +
      1.1 * overrun +
      1.25 * overload +
      normal(0, 0.25);
    X.push([blocked, priority, urgency, overrun, overload]);
    y.push(sigmoid(logit) >= 0.5 ? 1 : 0);
  }
  return { X, y };
}

// ---- logistic regression (Newton / IRLS, L2-regularised, balanced classes) --
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++)
      if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
    [M[c], M[pivot]] = [M[pivot], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

export function fitLogistic(X, y, { l2 = 1, iterations = 25 } = {}) {
  const n = X.length;
  const d = X[0].length + 1; // + intercept (index 0)
  const positives = y.reduce((s, v) => s + v, 0);
  const classWeight = [
    n / (2 * Math.max(1, n - positives)),
    n / (2 * Math.max(1, positives)),
  ];
  let w = new Array(d).fill(0);

  for (let iter = 0; iter < iterations; iter++) {
    const grad = new Array(d).fill(0);
    const hess = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < n; i++) {
      const row = [1, ...X[i]];
      const p = sigmoid(row.reduce((s, v, j) => s + v * w[j], 0));
      const cw = classWeight[y[i]];
      const err = cw * (p - y[i]);
      const curv = cw * p * (1 - p);
      for (let j = 0; j < d; j++) {
        grad[j] += err * row[j];
        for (let k = 0; k < d; k++) hess[j][k] += curv * row[j] * row[k];
      }
    }
    for (let j = 1; j < d; j++) {
      grad[j] += l2 * w[j];
      hess[j][j] += l2;
    }
    const step = solve(hess, grad);
    w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return { intercept: w[0], coef: w.slice(1) };
}

export const predictProbability = (model, features) =>
  sigmoid(
    model.intercept + model.coef.reduce((s, c, i) => s + c * features[i], 0)
  );

function rocAuc(yTrue, scores) {
  const order = scores.map((s, i) => [s, yTrue[i]]).sort((a, b) => a[0] - b[0]);
  let rankSumPos = 0;
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (order[k][1] === 1) rankSumPos += avgRank;
    i = j + 1;
  }
  const pos = yTrue.filter(v => v === 1).length;
  const neg = yTrue.length - pos;
  return pos && neg ? (rankSumPos - (pos * (pos + 1)) / 2) / (pos * neg) : 0.5;
}

function stratifiedSplit(y, testFraction, seed) {
  const rand = mulberry32(seed);
  const train = [];
  const test = [];
  for (const label of [0, 1]) {
    const idx = y.map((v, i) => (v === label ? i : -1)).filter(i => i >= 0);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const cut = Math.round(idx.length * testFraction);
    test.push(...idx.slice(0, cut));
    train.push(...idx.slice(cut));
  }
  return { train, test };
}

const pct = v => Math.round(v * 1000) / 10;
const r3 = v => Math.round(v * 1000) / 1000;

export function trainAndEvaluateModel() {
  const { X, y } = generateSyntheticData(1000, 42);
  const { train, test } = stratifiedSplit(y, 0.2, 42);
  const model = fitLogistic(
    train.map(i => X[i]),
    train.map(i => y[i])
  );

  const yTest = test.map(i => y[i]);
  const probs = test.map(i => predictProbability(model, X[i]));
  const pred = probs.map(p => (p >= 0.5 ? 1 : 0));
  const count = (a, b) =>
    pred.filter((p, i) => p === a && yTest[i] === b).length;
  const tp = count(1, 1);
  const fp = count(1, 0);
  const fn = count(0, 1);
  const tn = count(0, 0);
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);

  const metrics = {
    modelVersion: MODEL_VERSION,
    trainedSamples: X.length,
    testSamples: test.length,
    accuracy: pct((tp + tn) / yTest.length),
    precision: pct(precision),
    recall: pct(recall),
    f1Score: pct((2 * precision * recall) / Math.max(1e-9, precision + recall)),
    rocAuc: pct(rocAuc(yTest, probs)),
    featureWeights: Object.fromEntries(
      FEATURE_NAMES.map((name, i) => [name, r3(model.coef[i])])
    ),
    intercept: r3(model.intercept),
    status: "active",
  };

  cachedModel = model;
  cachedMetrics = metrics;
  try {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
    fs.writeFileSync(METRICS_PATH, JSON.stringify(metrics));
  } catch {
    /* metrics are still served from memory */
  }
  return metrics;
}

export function getMlMetrics() {
  if (cachedMetrics) return cachedMetrics;
  try {
    const saved = JSON.parse(fs.readFileSync(METRICS_PATH, "utf8"));
    if (saved.modelVersion === MODEL_VERSION) return (cachedMetrics = saved);
  } catch {
    /* no cached metrics yet */
  }
  return trainAndEvaluateModel();
}

export function predictSingle(features) {
  if (!cachedModel) trainAndEvaluateModel();
  const vector = FEATURE_NAMES.map(name => Number(features[name] ?? 0));
  const probability = predictProbability(cachedModel, vector);
  return {
    delayProbability: Math.round(probability * 100),
    predictedClass: probability >= 0.5 ? 1 : 0,
    modelUsed: MODEL_VERSION,
  };
}
