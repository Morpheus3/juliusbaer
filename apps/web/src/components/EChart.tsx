import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef, type JSX } from 'react';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export type EChartOption = echarts.EChartsCoreOption;

/** Thin wrapper: owns one chart instance, resizes with its container, re-applies options on change. */
export function EChart({
  option,
  height = 240,
  className = '',
}: {
  option: EChartOption;
  height?: number;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const instance = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const ro = new ResizeObserver(() => {
      instance.resize();
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} className={className} style={{ height, width: '100%' }} role="img" />;
}

/** Palette shared by every chart so the workbench reads as one system. */
export const CHART = {
  ink: '#16202e',
  muted: '#66728a',
  line: '#d9dfe8',
  accent: '#1f4e79',
  brass: '#8f6f3a',
  crit: '#b3261e',
  warn: '#9a6a00',
  ok: '#1f7a4d',
  assetClass: {
    'Cash and Equivalents': '#8fa3bf',
    'Fixed Income': '#1f4e79',
    Equity: '#3f7cb4',
    Alternatives: '#8f6f3a',
    Commodities: '#c9a961',
    'Structured Products': '#6b4c9a',
  } as Record<string, string>,
  font: 'IBM Plex Sans, Helvetica Neue, Arial, sans-serif',
  mono: 'IBM Plex Mono, Menlo, monospace',
};

export const usdCompact = (v: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v);
