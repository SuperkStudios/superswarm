import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, RefreshCw } from 'lucide-react';
import type { ClaudeTokens } from '@/shared/styles/claudeTokens';
import { Knob } from './WashDials';
import { HARMONY_BY_COUNT, clampToPad, harmonyPositions, hexToPos, posToHex, type PadGeom, type PadPoint } from './zenColorMath';

export const ACCENT_PRESETS = [
  '#ae5630', '#b0453c', '#8e5cb8', '#3a6fc4', '#2e8f6f', '#b08b2e', '#c2588f', '#5c6470',
  '#e8b4b8', '#f2d0a4', '#a8d8b9', '#9ec5e8', '#c3aed6', '#f7e8a4', '#87d1c6', '#d98cb3',
];
const PRESETS_PER_PAGE = 8;
const MAX_STOPS = 3;

export interface WashControls {
  opacity: number;
  onOpacity: (v: number) => void;
}

// Zen Browser's picker model, ported one-for-one (minus their texture dial): a circular pad where
// only the PRIMARY dot is draggable, secondaries ride the color harmony at the same radius, + and -
// promote/demote the harmony, the cycle button rotates same-count harmonies, and a right-click on
// the pad removes the newest dot. The pad still just reports hex stops; nobody downstream changed.
const AccentColorPad: React.FC<{
  c: ClaudeTokens;
  stops: string[];
  onChange: (stops: string[] | null) => void;
  height?: number;
  wash?: WashControls;
}> = ({ c, stops, onChange, height = 240, wash }) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const lastApplyRef = useRef(0);
  const [presetPage, setPresetPage] = useState(0);
  // Which harmony within the current count family; Zen's cycle button rotates this.
  const [harmonyIdx, setHarmonyIdx] = useState(0);
  const presetPages = Math.ceil(ACCENT_PRESETS.length / PRESETS_PER_PAGE);
  const harmony = (HARMONY_BY_COUNT[stops.length] ?? ['floating'])[harmonyIdx % (HARMONY_BY_COUNT[stops.length]?.length ?? 1)];

  const geometry = useCallback((): { rect: DOMRect; g: PadGeom } | null => {
    const pad = padRef.current;
    if (!pad) return null;
    const rect = pad.getBoundingClientRect();
    const g: PadGeom = { cx: rect.width / 2, cy: rect.height / 2, rx: rect.width / 2 - 18, ry: rect.height / 2 - 18 };
    return { rect, g };
  }, []);

  // The primary drives everything: secondaries are regenerated from its position + the harmony.
  const emitFromPrimary = useCallback((px: number, py: number, count: number, harm: string) => {
    const g = geometry();
    if (!g) return;
    const primary = clampToPad(px, py, g.g);
    const secondaries = harmonyPositions(primary, g.g, harm).slice(0, count - 1);
    onChange([primary, ...secondaries].map((p: PadPoint) => posToHex(p.x, p.y, g.g)));
  }, [geometry, onChange]);

  const applyAt = useCallback((clientX: number, clientY: number) => {
    // ~30ms throttle: a live listener re-derives tokens and re-renders the tree per apply.
    const now = performance.now();
    if (now - lastApplyRef.current < 30) return;
    lastApplyRef.current = now;
    const g = geometry();
    if (!g) return;
    emitFromPrimary(clientX - g.rect.left, clientY - g.rect.top, Math.max(1, stops.length), harmony);
  }, [geometry, emitFromPrimary, stops.length, harmony]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    lastApplyRef.current = 0;
    applyAt(e.clientX, e.clientY);
  }, [applyAt]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) applyAt(e.clientX, e.clientY);
  }, [applyAt]);

  const onPointerUp = useCallback(() => { draggingRef.current = false; }, []);

  // Zen: right-click removes the newest dot (demoting the harmony).
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (stops.length <= 1) return;
    setHarmonyIdx(0);
    const g = geometry();
    if (!g) { onChange(stops.slice(0, -1)); return; }
    const p = hexToPos(stops[0], g.g);
    emitFromPrimary(p.x, p.y, stops.length - 1, (HARMONY_BY_COUNT[stops.length - 1] ?? ['floating'])[0]);
  }, [stops, geometry, emitFromPrimary, onChange]);

  const changeCount = useCallback((delta: number) => {
    const count = Math.min(MAX_STOPS, Math.max(1, stops.length + delta));
    if (count === stops.length) return;
    setHarmonyIdx(0);
    const g = geometry();
    const harm = (HARMONY_BY_COUNT[count] ?? ['floating'])[0];
    if (!g || stops.length === 0) { onChange(stops.length === 0 ? [ACCENT_PRESETS[0]] : stops.slice(0, count)); return; }
    const p = hexToPos(stops[0], g.g);
    emitFromPrimary(p.x, p.y, count, harm);
  }, [stops, geometry, emitFromPrimary, onChange]);

  const cycleHarmony = useCallback(() => {
    const family = HARMONY_BY_COUNT[stops.length] ?? ['floating'];
    if (family.length < 2) return;
    const nextIdx = (harmonyIdx + 1) % family.length;
    setHarmonyIdx(nextIdx);
    const g = geometry();
    if (!g) return;
    const p = hexToPos(stops[0], g.g);
    emitFromPrimary(p.x, p.y, stops.length, family[nextIdx]);
  }, [stops, harmonyIdx, geometry, emitFromPrimary]);

  // Dot render positions: primary from its stored color, secondaries re-derived from the harmony.
  const dotPositions = useMemo((): PadPoint[] => {
    const g = geometry();
    if (!g || stops.length === 0) return [];
    const primary = hexToPos(stops[0], g.g);
    return [primary, ...harmonyPositions(primary, g.g, harmony).slice(0, stops.length - 1)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, harmony, geometry, padRef.current]);

  const btn = (disabled: boolean): React.CSSProperties => ({
    width: 26, height: 22, borderRadius: 7, border: 'none', cursor: disabled ? 'default' : 'pointer',
    background: 'rgba(20,20,19,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.4 : 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div
        ref={padRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
        style={{
          // Zen's pad: a dark dotted-grid field; position IS the color, so no painted spectrum.
          position: 'relative', height, borderRadius: c.radius.lg, cursor: 'crosshair',
          border: `1px solid ${c.border.medium}`, touchAction: 'none',
          background: [
            'radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1.4px)',
            'linear-gradient(rgba(24,23,22,0.97), rgba(24,23,22,0.97))',
          ].join(', '),
          backgroundSize: '12px 12px, auto',
        }}
      >
        {dotPositions.map((p, i) => (
          <span key={i} style={{
            position: 'absolute', left: p.x, top: p.y,
            transform: 'translate(-50%, -50%)',
            width: i === 0 ? 28 : 20, height: i === 0 ? 28 : 20,
            borderRadius: 999, background: stops[i],
            border: i === 0 ? '3px solid #fff' : '2px solid rgba(255,255,255,0.75)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)', pointerEvents: 'none',
            transition: draggingRef.current ? 'none' : 'left 300ms cubic-bezier(0.34,1.4,0.64,1), top 300ms cubic-bezier(0.34,1.4,0.64,1)',
          }} />
        ))}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}
        >
          <button onClick={() => changeCount(-1)} disabled={stops.length <= 1} style={btn(stops.length <= 1)}>
            <Minus size={13} />
          </button>
          <button onClick={() => changeCount(1)} disabled={stops.length >= MAX_STOPS} style={btn(stops.length >= MAX_STOPS)}>
            <Plus size={13} />
          </button>
          {(HARMONY_BY_COUNT[stops.length]?.length ?? 0) > 1 && (
            <button onClick={cycleHarmony} title="Cycle color harmony" style={btn(false)}>
              <RefreshCw size={12} />
            </button>
          )}
        </div>
      </div>
      {/* Arc's preset carousel: a page of dots between chevrons. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <button
          onClick={() => setPresetPage((p) => Math.max(0, p - 1))}
          disabled={presetPage === 0}
          style={{ border: 'none', background: 'transparent', padding: 0, cursor: presetPage === 0 ? 'default' : 'pointer', color: c.text.tertiary, opacity: presetPage === 0 ? 0.35 : 1, display: 'flex' }}
        >
          <ChevronLeft size={15} />
        </button>
        {ACCENT_PRESETS.slice(presetPage * PRESETS_PER_PAGE, (presetPage + 1) * PRESETS_PER_PAGE).map((hex) => (
          <button
            key={hex}
            onClick={() => { setHarmonyIdx(0); onChange([hex]); }}
            style={{
              width: 26, height: 26, borderRadius: 999, background: hex, cursor: 'pointer',
              border: stops[0] === hex && stops.length === 1 ? '2.5px solid #fff' : '2.5px solid transparent',
              boxShadow: stops[0] === hex && stops.length === 1 ? `0 0 0 2px ${hex}` : 'none', padding: 0,
            }}
          />
        ))}
        <button
          onClick={() => setPresetPage((p) => Math.min(presetPages - 1, p + 1))}
          disabled={presetPage >= presetPages - 1}
          style={{ border: 'none', background: 'transparent', padding: 0, cursor: presetPage >= presetPages - 1 ? 'default' : 'pointer', color: c.text.tertiary, opacity: presetPage >= presetPages - 1 ? 0.35 : 1, display: 'flex' }}
        >
          <ChevronRight size={15} />
        </button>
        <button
          onClick={() => { setHarmonyIdx(0); onChange(null); }}
          style={{
            marginLeft: 'auto', border: 'none', background: 'transparent', padding: 0,
            color: '#8a8a86', fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
          }}
        >
          Reset
        </button>
      </div>
      {/* Intensity knob only; the grain squiggle is gone on purpose (Eric's call, one dial fewer). */}
      {wash && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, color: c.text.tertiary }}>
          <Knob value={wash.opacity} onChange={wash.onOpacity} />
        </div>
      )}
    </div>
  );
};

export default AccentColorPad;
