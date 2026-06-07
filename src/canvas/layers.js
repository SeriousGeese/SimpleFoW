import { centroid, rotatePoints, edgeMidpoint, rectFromCorners } from '../ops/geometry.js';
import { isDoorVisible } from './hit.js';

// ── path helpers ──────────────────────────────────────────────────────────────

function pathPolygon(ctx, points, vp) {
  if (points.length < 2) return;
  ctx.beginPath();
  const [fx, fy] = toScreen(points[0], vp);
  ctx.moveTo(fx, fy);
  for (let i = 1; i < points.length; i++) {
    const [sx, sy] = toScreen(points[i], vp);
    ctx.lineTo(sx, sy);
  }
  ctx.closePath();
}

function pathCircle(ctx, shape, vp) {
  const [cx, cy] = toScreen([shape.cx, shape.cy], vp);
  const r = shape.radius * vp.scale;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

function pathShape(ctx, shape, vp) {
  if (shape.type === 'circle') pathCircle(ctx, shape, vp);
  else pathPolygon(ctx, shape.points, vp);
}

export function toScreen([ix, iy], vp) {
  return [ix * vp.scale + vp.x, iy * vp.scale + vp.y];
}

export function toImage([sx, sy], vp) {
  return [(sx - vp.x) / vp.scale, (sy - vp.y) / vp.scale];
}

// ── FoW layer (drawn to offscreen canvas, then composited) ────────────────────

export function drawFow(fowCtx, shapes, fowState, vp, W, H) {
  fowCtx.clearRect(0, 0, W, H);

  // solid black void covers everything
  fowCtx.globalCompositeOperation = 'source-over';
  fowCtx.fillStyle = 'rgba(0,0,0,1)';
  fowCtx.fillRect(0, 0, W, H);

  // punch transparent holes for revealed shapes
  fowCtx.globalCompositeOperation = 'destination-out';
  for (const shape of shapes) {
    if (shape.type === 'door') continue;
    if (fowState.get(shape.id)) {
      pathShape(fowCtx, shape, vp);
      fowCtx.fill();
    }
  }

  // re-fog unrevealed shapes that overlap revealed areas (e.g. a hole inside a revealed ring)
  fowCtx.globalCompositeOperation = 'source-over';
  fowCtx.fillStyle = 'rgba(0,0,0,1)';
  for (const shape of shapes) {
    if (shape.type === 'door') continue;
    if (!fowState.get(shape.id)) {
      pathShape(fowCtx, shape, vp);
      fowCtx.fill();
    }
  }
}

// ── Map layer ─────────────────────────────────────────────────────────────────

export function drawMap(ctx, img, vp) {
  const W = img.naturalWidth * vp.scale;
  const H = img.naturalHeight * vp.scale;
  ctx.drawImage(img, vp.x, vp.y, W, H);
}

// ── Edit-mode shape layer ─────────────────────────────────────────────────────

export function drawShapes(ctx, shapes, selectedIds, vp) {
  for (const shape of shapes) {
    if (shape.type === 'door') continue;
    const sel = selectedIds.has(shape.id);
    const isStart = shape.startingArea ?? false;
    ctx.save();
    ctx.fillStyle   = sel ? 'rgba(60,120,255,0.45)' : isStart ? 'rgba(255,190,0,0.4)' : 'rgba(200,40,40,0.35)';
    ctx.strokeStyle = sel ? '#4a9aee' : isStart ? '#cc9900' : '#e02020';
    ctx.lineWidth   = 2;
    pathShape(ctx, shape, vp);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Door layer ────────────────────────────────────────────────────────────────

export function drawDoors(ctx, shapes, fowState, mode, selectedIds, vp) {
  for (const shape of shapes) {
    if (shape.type !== 'door') continue;
    if (mode === 'play' && !isDoorVisible(shape, shapes, fowState)) continue;

    const c = centroid(shape.points);
    const [cx, cy] = toScreen(c, vp);
    const rot = shape.rotation ?? 0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.translate(-cx, -cy);

    const sel = selectedIds?.has(shape.id);
    const open = mode === 'play' && (fowState.get(shape.id) ?? false);
    ctx.fillStyle   = sel ? 'rgba(60,120,255,0.55)' : open ? 'rgba(144,238,144,0.45)' : 'rgba(139,90,43,0.85)';
    ctx.strokeStyle = sel ? '#4a9aee' : open ? '#2d8a2d' : '#8b5a0a';
    ctx.lineWidth   = 2;
    pathPolygon(ctx, shape.points, vp);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Edit handles layer ────────────────────────────────────────────────────────

export function drawHandles(ctx, shapes, selectedIds, activeTool, vp) {
  if (activeTool !== 'select') return;
  for (const shape of shapes) {
    if (!selectedIds.has(shape.id)) continue;

    if (shape.type === 'circle') {
      drawCircleHandles(ctx, shape, vp);
    } else {
      drawPolygonHandles(ctx, shape, vp);
      if (shape.type === 'door') drawRotationHandle(ctx, shape, vp);
    }
  }
}

function dot(ctx, sx, sy, color, size) {
  ctx.beginPath();
  ctx.arc(sx, sy, size, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPolygonHandles(ctx, shape, vp) {
  // For doors, show handles at rotated positions so they align with visible corners
  const pts = shape.type === 'door'
    ? rotatePoints(shape.points, shape.rotation ?? 0, centroid(shape.points))
    : shape.points;

  for (const pt of pts) {
    const [sx, sy] = toScreen(pt, vp);
    dot(ctx, sx, sy, '#fff', 5);
  }
  // midpoint handles (not shown for doors — they can't add vertices)
  if (shape.type === 'door') return;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const mid = edgeMidpoint(pts[i], pts[j]);
    const [sx, sy] = toScreen(mid, vp);
    ctx.beginPath();
    ctx.rect(sx - 4, sy - 4, 8, 8);
    ctx.fillStyle = '#aaa';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawCircleHandles(ctx, shape, vp) {
  const [cx, cy] = toScreen([shape.cx, shape.cy], vp);
  dot(ctx, cx, cy, '#fff', 5);
  const [rx, ry] = toScreen([shape.cx + shape.radius, shape.cy], vp);
  dot(ctx, rx, ry, '#ffcc00', 5);
}

function drawRotationHandle(ctx, shape, vp) {
  const c = centroid(shape.points);
  const handleImg = [c[0], c[1] - 28];
  const rotated = rotatePoints([handleImg], shape.rotation ?? 0, c)[0];
  const [sx, sy] = toScreen(rotated, vp);

  // draw line from centroid to handle
  const [cx, cy] = toScreen(c, vp);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(sx, sy);
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1;
  ctx.stroke();

  dot(ctx, sx, sy, '#ffaa00', 6);
}

// ── In-progress drawing preview ───────────────────────────────────────────────

export function drawDrawingPreview(ctx, drawing, type, vp) {
  if (!drawing.active || drawing.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = type === 'door' ? '#8b5a0a' : '#e02020';
  ctx.fillStyle   = type === 'door' ? 'rgba(139,90,43,0.85)' : 'rgba(200,40,40,0.2)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);

  if (type === 'circle') {
    const [cx, cy] = toScreen(drawing.points[0], vp);
    if (drawing.previewPoint) {
      const [px, py] = toScreen(drawing.previewPoint, vp);
      const r = Math.hypot(px - cx, py - cy);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (type === 'door' || type === 'polygon') {
    // both rectangle-draw tools
    if (drawing.points.length >= 1 && drawing.previewPoint) {
      const rectPts = rectFromCorners(drawing.points[0], drawing.previewPoint);
      pathPolygon(ctx, rectPts, vp);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    const pts = [...drawing.points];
    if (drawing.previewPoint) pts.push(drawing.previewPoint);
    if (pts.length >= 2) {
      pathPolygon(ctx, pts, vp);
      if (pts.length >= 3) ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}
