import polygonClipping from 'polygon-clipping';
import { circleToPolygon } from './geometry.js';

function shapeToRing(shape) {
  if (shape.type === 'circle') {
    return circleToPolygon(shape.cx, shape.cy, shape.radius, 32);
  }
  return shape.points;
}

export function mergeShapes(shapes) {
  const polys = shapes.map(s => [shapeToRing(s)]);
  const [first, ...rest] = polys;
  let result;
  try {
    result = polygonClipping.union(first, ...rest);
  } catch {
    return null;
  }
  if (!result || result.length === 0) return null;
  const outerRing = result[0][0];
  // polygon-clipping closes rings (last pt === first pt); remove duplicate
  const pts = outerRing[outerRing.length - 1][0] === outerRing[0][0] &&
              outerRing[outerRing.length - 1][1] === outerRing[0][1]
    ? outerRing.slice(0, -1)
    : outerRing;
  return pts.map(p => [p[0], p[1]]);
}
