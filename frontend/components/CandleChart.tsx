"use client";

// Candlestick chart built on TradingView Lightweight Charts.
import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import type { Candle } from "@/lib/types";

interface Props {
  candles: Candle[];
  symbol: string;
  interval: string;
  onIntervalChange: (interval: string) => void;
}

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default function CandleChart({
  candles,
  symbol,
  interval,
  onIntervalChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema9Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref = useRef<ISeriesApi<"Line"> | null>(null);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#12161c" },
        textColor: "#848e9c",
      },
      grid: {
        vertLines: { color: "#1b212b" },
        horzLines: { color: "#1b212b" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#232a35" },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#0ecb81",
      downColor: "#f6465d",
      borderUpColor: "#0ecb81",
      borderDownColor: "#f6465d",
      wickUpColor: "#0ecb81",
      wickDownColor: "#f6465d",
    });
    const volume = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    const ema9 = chart.addLineSeries({
      color: "#f0b90b",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ema21 = chart.addLineSeries({
      color: "#7b61ff",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeRef.current = volume;
    ema9Ref.current = ema9;
    ema21Ref.current = ema21;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeRef.current = null;
      ema9Ref.current = null;
      ema21Ref.current = null;
    };
  }, []);

  // Compute + update EMA overlays when candles change
  useEffect(() => {
    if (!ema9Ref.current || !ema21Ref.current || candles.length === 0) return;

    function calcEma(period: number): { time: never; value: number }[] {
      const k = 2 / (period + 1);
      let prev: number | null = null;
      const out: { time: never; value: number }[] = [];
      for (let i = 0; i < candles.length; i++) {
        const close = candles[i].close;
        prev =
          prev === null
            ? i >= period - 1
              ? candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
              : null
            : close * k + prev * (1 - k);
        if (prev !== null && i >= period - 1) {
          out.push({ time: candles[i].time as never, value: prev });
        }
      }
      return out;
    }

    ema9Ref.current?.setData(calcEma(9));
    ema21Ref.current?.setData(calcEma(21));
  }, [candles]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || !volumeRef.current || candles.length === 0) return;
    seriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as never,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );
    volumeRef.current.setData(
      candles.map((c) => ({
        time: c.time as never,
        value: c.volume,
        color: c.close >= c.open ? "rgba(14,203,129,0.4)" : "rgba(246,70,93,0.4)",
      }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div className="relative h-full min-h-0">
      <div className="absolute left-3 top-2 z-10 flex items-center gap-1">
        <span className="mr-2 text-sm font-semibold text-accent">{symbol}</span>
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            onClick={() => onIntervalChange(iv)}
            className={`rounded px-2 py-0.5 text-xs ${
              iv === interval
                ? "bg-accent/20 text-accent"
                : "text-muted hover:bg-bg-hover"
            }`}
          >
            {iv}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}