export type AtlasPoint = { xValue: number; yValue: number };

export function meanValue(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function valueSpread(values: number[]) {
  if (values.length === 0) return 0;
  const center = meanValue(values);
  return Math.sqrt(meanValue(values.map((value) => (value - center) ** 2)));
}

export function densityRegion(points: AtlasPoint[]) {
  if (points.length === 0) throw new RangeError("A density region needs at least one point.");
  const centerX = meanValue(points.map((point) => point.xValue));
  const centerY = meanValue(points.map((point) => point.yValue));
  const width = Math.max(20, Math.min(72, 18 + valueSpread(points.map((point) => point.xValue)) * 3.4));
  const height = Math.max(20, Math.min(72, 18 + valueSpread(points.map((point) => point.yValue)) * 3.4));
  return { centerX, centerY, width, height, count: points.length };
}
