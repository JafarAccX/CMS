type MetricLabels = Record<string, string | number | boolean | null | undefined>;

type Histogram = {
  count: number;
  sum: number;
  min: number;
  max: number;
};

const counters = new Map<string, number>();
const histograms = new Map<string, Histogram>();

function metricKey(name: string, labels: MetricLabels = {}) {
  const cleanLabels = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  if (cleanLabels.length === 0) return name;
  return `${name}{${cleanLabels.map(([key, value]) => `${key}=${String(value)}`).join(",")}}`;
}

export function incrementCounter(name: string, labels?: MetricLabels, value = 1) {
  const key = metricKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + value);
}

export function observeHistogram(name: string, value: number, labels?: MetricLabels) {
  const key = metricKey(name, labels);
  const current = histograms.get(key);
  if (!current) {
    histograms.set(key, { count: 1, sum: value, min: value, max: value });
    return;
  }
  current.count += 1;
  current.sum += value;
  current.min = Math.min(current.min, value);
  current.max = Math.max(current.max, value);
}

export function getMetricsSnapshot() {
  return {
    counters: Object.fromEntries(counters.entries()),
    histograms: Object.fromEntries(
      Array.from(histograms.entries()).map(([key, value]) => [
        key,
        {
          ...value,
          avg: value.count ? value.sum / value.count : 0,
        },
      ])
    ),
  };
}
