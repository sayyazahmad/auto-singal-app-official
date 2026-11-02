// Small hand-rolled SVG charts for the analytics view.
// Colors come from --chart-* CSS variables (validated per mode in index.css); text always uses ink tokens.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export const compact = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  : Math.abs(n) >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  : `${Math.round(n)}`;

export const money = (n: number) => `$${n >= 1000 ? compact(n) : n.toFixed(2)}`;

export const duration = (seconds: number) => {
  const s = Math.round(seconds);
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// Round axis maximum to a clean number so ticks read 0 / 2K / 4K...
function niceMax(max: number) {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find(m => m * pow >= max / 4) || 10;
  return Math.ceil(max / (step * pow)) * step * pow;
}

const AXIS_BAND = 24;

const showTick = (i: number, last: number, every: number) => i === last || (i % every === 0 && last - i >= every * 0.6);
const LEFT_GUTTER = 44;

export function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div
      className="absolute pointer-events-none z-10 -translate-x-1/2 -translate-y-full px-3 py-2 rounded-lg bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-md text-xs whitespace-nowrap"
      style={{ left, top: y - 8 }}
    >
      {children}
    </div>
  );
}

// Single-series line with a 10% area wash, crosshair tooltip and keyboard stepping
export function AreaChart({ points, format, label, height = 200 }: {
  points: Array<{ date: string; value: number }>;
  format: (n: number) => string;
  label: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const plotW = width - LEFT_GUTTER - 8;
  const max = niceMax(Math.max(...points.map(p => p.value), 0));
  const x = (i: number) => LEFT_GUTTER + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => 8 + (1 - v / max) * (height - 16);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z` : '';
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);
  const xTickEvery = Math.max(1, Math.ceil(points.length / 6));
  const last = points.length - 1;

  const pick = (clientX: number, el: SVGSVGElement) => {
    const rel = clientX - el.getBoundingClientRect().left;
    const i = Math.round(((rel - LEFT_GUTTER) / plotW) * (points.length - 1));
    setActive(Math.min(Math.max(i, 0), last));
  };

  return (
    <div ref={ref} className="relative">
      <svg
        width={width}
        height={height + AXIS_BAND}
        role="img"
        aria-label={label}
        tabIndex={0}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 rounded"
        onPointerMove={e => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(last)}
        onBlur={() => setActive(null)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') setActive(a => Math.max(0, (a ?? last) - 1));
          if (e.key === 'ArrowRight') setActive(a => Math.min(last, (a ?? last) + 1));
        }}
      >
        {ticks.map(t => (
          <g key={t}>
            <line x1={LEFT_GUTTER} x2={width - 8} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={LEFT_GUTTER - 8} y={y(t) + 4} textAnchor="end" className="fill-ink-500 dark:fill-ink-400 text-[11px] tabular-nums">{compact(t)}</text>
          </g>
        ))}
        {points.map((p, i) => showTick(i, last, xTickEvery) && (
          <text key={p.date} x={x(i)} y={height + 16} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-ink-500 dark:fill-ink-400 text-[11px]">{shortDate(p.date)}</text>
        ))}
        <path d={area} fill="var(--chart-series)" fillOpacity={0.1} />
        <path d={line} fill="none" stroke="var(--chart-series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.length > 0 && (
          <circle cx={x(last)} cy={y(points[last].value)} r={4} fill="var(--chart-series)" stroke="var(--chart-surface)" strokeWidth={2} />
        )}
        {active !== null && points[active] && (
          <g>
            <line x1={x(active)} x2={x(active)} y1={8} y2={height - 8} stroke="var(--chart-muted)" strokeWidth={1} />
            <circle cx={x(active)} cy={y(points[active].value)} r={5} fill="var(--chart-series)" stroke="var(--chart-surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {active !== null && points[active] && (
        <Tooltip x={x(active)} y={y(points[active].value)} width={width}>
          <div className="font-semibold text-ink-900 dark:text-white text-sm">{format(points[active].value)}</div>
          <div className="text-ink-500 dark:text-ink-400">{shortDate(points[active].date)}</div>
        </Tooltip>
      )}
    </div>
  );
}

// Gains above the baseline in the series color, losses below in the muted gray
export function DivergingBars({ points, upLabel, downLabel, height = 180 }: {
  points: Array<{ date: string; up: number; down: number }>;
  upLabel: string;
  downLabel: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const plotW = width - LEFT_GUTTER - 8;
  const maxUp = niceMax(Math.max(...points.map(p => p.up), 0));
  const maxDown = niceMax(Math.max(...points.map(p => p.down), 0));
  const span = maxUp + maxDown;
  const zeroY = 8 + (maxUp / span) * (height - 16);
  const scale = (height - 16) / span;
  const band = plotW / Math.max(points.length, 1);
  const barW = Math.max(2, Math.min(24, band - 2));
  const xTickEvery = Math.max(1, Math.ceil(points.length / 6));

  // Rounded data-end (4px), square at the baseline
  const bar = (x0: number, y0: number, h: number, up: boolean) => {
    if (h <= 0) return '';
    const r = Math.min(4, h, barW / 2);
    return up
      ? `M${x0},${y0} V${y0 - h + r} Q${x0},${y0 - h} ${x0 + r},${y0 - h} H${x0 + barW - r} Q${x0 + barW},${y0 - h} ${x0 + barW},${y0 - h + r} V${y0} Z`
      : `M${x0},${y0} V${y0 + h - r} Q${x0},${y0 + h} ${x0 + r},${y0 + h} H${x0 + barW - r} Q${x0 + barW},${y0 + h} ${x0 + barW},${y0 + h - r} V${y0} Z`;
  };

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-4 text-xs text-ink-600 dark:text-ink-300 mb-2">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--chart-series)' }} />{upLabel}</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: 'var(--chart-muted)' }} />{downLabel}</span>
      </div>
      <svg width={width} height={height + AXIS_BAND} role="img" aria-label={`${upLabel} and ${downLabel} per day`} className="block">
        <line x1={LEFT_GUTTER} x2={width - 8} y1={zeroY} y2={zeroY} stroke="var(--chart-grid)" strokeWidth={1} />
        <text x={LEFT_GUTTER - 8} y={8 + 4} textAnchor="end" className="fill-ink-500 dark:fill-ink-400 text-[11px] tabular-nums">+{compact(maxUp)}</text>
        <text x={LEFT_GUTTER - 8} y={zeroY + 4} textAnchor="end" className="fill-ink-500 dark:fill-ink-400 text-[11px]">0</text>
        <text x={LEFT_GUTTER - 8} y={height - 8 + 4} textAnchor="end" className="fill-ink-500 dark:fill-ink-400 text-[11px] tabular-nums">−{compact(maxDown)}</text>
        {points.map((p, i) => {
          const x0 = LEFT_GUTTER + i * band + (band - barW) / 2;
          return (
            <g key={p.date} onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)}>
              {/* Hit target spans the full band and height, bigger than the bars */}
              <rect x={LEFT_GUTTER + i * band} y={0} width={band} height={height} fill="transparent" />
              <path d={bar(x0, zeroY - 1, p.up * scale, true)} fill="var(--chart-series)" opacity={active === null || active === i ? 1 : 0.55} />
              <path d={bar(x0, zeroY + 1, p.down * scale, false)} fill="var(--chart-muted)" opacity={active === null || active === i ? 1 : 0.55} />
            </g>
          );
        })}
        {points.map((p, i) => showTick(i, points.length - 1, xTickEvery) && (
          <text key={`t${p.date}`} x={LEFT_GUTTER + i * band + band / 2} y={height + 16} textAnchor="middle" className="fill-ink-500 dark:fill-ink-400 text-[11px]">{shortDate(p.date)}</text>
        ))}
      </svg>
      {active !== null && points[active] && (
        <Tooltip x={LEFT_GUTTER + active * band + band / 2} y={zeroY - points[active].up * scale} width={width}>
          <div className="text-ink-500 dark:text-ink-400 mb-1">{shortDate(points[active].date)}</div>
          <div className="flex items-center gap-2"><span className="w-3 h-0.5" style={{ background: 'var(--chart-series)' }} /><strong className="text-ink-900 dark:text-white">+{points[active].up}</strong><span className="text-ink-500 dark:text-ink-400">{upLabel.toLowerCase()}</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-0.5" style={{ background: 'var(--chart-muted)' }} /><strong className="text-ink-900 dark:text-white">−{points[active].down}</strong><span className="text-ink-500 dark:text-ink-400">{downLabel.toLowerCase()}</span></div>
        </Tooltip>
      )}
    </div>
  );
}

// Ranked horizontal bars (one series, one color); value at the bar tip
export function BarList({ items, format }: { items: Array<{ label: string; value: number }>; format: (n: number) => string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map(item => (
        <div key={item.label} className="grid grid-cols-[minmax(0,140px)_1fr] items-center gap-3" title={`${item.label}: ${format(item.value)}`}>
          <div className="text-xs text-ink-600 dark:text-ink-300 truncate">{item.label}</div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-3 rounded-r" style={{ width: `${Math.max(1, (item.value / max) * 85)}%`, background: 'var(--chart-series)' }} />
            <span className="text-xs text-ink-700 dark:text-ink-200 tabular-nums shrink-0">{format(item.value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Fills its container's width, so it never pushes past a narrow tile
export function Sparkline({ values, height = 24 }: { values: number[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 6);
  const y = (v: number) => 3 + (1 - v / max) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} aria-hidden="true" className="block">
        <path d={d} fill="none" stroke="var(--chart-muted)" strokeWidth={1.5} strokeLinejoin="round" />
        <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill="var(--chart-series)" stroke="var(--chart-surface)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

export function StatTile({ label, value, delta, note, spark }: {
  label: string;
  value: string;
  // Change vs the previous period, in percent; null when there's nothing to compare
  delta?: number | null;
  note?: string;
  spark?: number[];
}) {
  const up = (delta ?? 0) > 0.5;
  const down = (delta ?? 0) < -0.5;
  return (
    <div className="p-4 rounded-xl bg-white dark:bg-ink-850 border border-ink-200 dark:border-ink-800">
      <div className="text-xs text-ink-500 dark:text-ink-400">{label}</div>
      <div className="text-2xl font-semibold text-ink-900 dark:text-white mt-1">{value}</div>
      {spark && <div className="mt-2"><Sparkline values={spark} /></div>}
      {delta !== undefined && delta !== null ? (
        <div title="Compared with the previous period of the same length" className={`flex items-center gap-1 text-xs mt-1.5 whitespace-nowrap ${up ? 'text-brand-700 dark:text-brand-300' : down ? 'text-red-600 dark:text-red-400' : 'text-ink-500 dark:text-ink-400'}`}>
          {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : down ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
          <span className="font-medium">{up ? '+' : ''}{delta.toFixed(1)}%</span>
          <span className="text-ink-500 dark:text-ink-400">vs prior</span>
        </div>
      ) : note ? (
        <div className="text-xs text-ink-500 dark:text-ink-400 mt-1.5">{note}</div>
      ) : null}
    </div>
  );
}

// Every chart has a table twin so no value depends on hovering
export function ChartCard({ title, subtitle, table, children, className = '' }: {
  title: string;
  subtitle?: string;
  table: { columns: string[]; rows: Array<Array<string | number>> };
  children: React.ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`p-5 rounded-xl bg-white dark:bg-ink-850 border border-ink-200 dark:border-ink-800 ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="inline-flex p-0.5 rounded-lg bg-ink-100 dark:bg-ink-900 text-xs shrink-0">
          {['Chart', 'Table'].map(v => (
            <button
              key={v}
              onClick={() => setShowTable(v === 'Table')}
              className={`px-2.5 py-1 rounded-md cursor-pointer ${(v === 'Table') === showTable ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-white font-medium' : 'text-ink-500 dark:text-ink-400'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {showTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white dark:bg-ink-850">
              <tr>{table.columns.map(c => <th key={c} className="text-left font-medium text-ink-500 dark:text-ink-400 py-1.5 pr-4">{c}</th>)}</tr>
            </thead>
            <tbody className="tabular-nums">
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-ink-100 dark:border-ink-800">
                  {r.map((cell, j) => <td key={j} className="py-1.5 pr-4 text-ink-800 dark:text-ink-100">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
}
