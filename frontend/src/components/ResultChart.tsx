import React, { useState, useMemo } from 'react';
import { 
  BarChart2, 
  TrendingUp, 
  PieChart, 
  Info
} from 'lucide-react';
import { DataFrameResult } from '../types';

interface ResultChartProps {
  dataframe: DataFrameResult;
}

const PALETTE = [
  '#38bdf8', // sky blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48', // rose
];

export const ResultChart: React.FC<ResultChartProps> = ({ dataframe }) => {
  const { columns, rows } = dataframe;

  // Infer numeric vs categorical columns
  const { numericCols, categoricalCols } = useMemo(() => {
    const numCols: string[] = [];
    const catCols: string[] = [];

    if (!rows || rows.length === 0) {
      return { numericCols: columns, categoricalCols: columns };
    }

    columns.forEach((col) => {
      let isNum = true;
      let checkCount = 0;
      for (const row of rows.slice(0, 20)) {
        const val = row[col];
        if (val !== undefined && val !== null && val !== '') {
          checkCount++;
          if (typeof val !== 'number' && isNaN(Number(val))) {
            isNum = false;
            break;
          }
        }
      }
      if (isNum && checkCount > 0) {
        numCols.push(col);
      } else {
        catCols.push(col);
      }
    });

    return {
      numericCols: numCols.length > 0 ? numCols : columns,
      categoricalCols: catCols.length > 0 ? catCols : columns,
    };
  }, [columns, rows]);

  // Initial column selections
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [xAxisCol, setXAxisCol] = useState<string>(categoricalCols[0] || columns[0] || '');
  const [yAxisCol, setYAxisCol] = useState<string>(numericCols[0] || columns[1] || columns[0] || '');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Extract chart data
  const chartData = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    return rows.slice(0, 30).map((row, idx) => {
      const rawX = row[xAxisCol];
      const label = rawX !== undefined && rawX !== null ? String(rawX) : `Row ${idx + 1}`;
      const rawY = row[yAxisCol];
      const val = typeof rawY === 'number' ? rawY : Number(rawY) || 0;
      return {
        label,
        value: val,
        raw: row,
      };
    });
  }, [rows, xAxisCol, yAxisCol]);

  const maxValue = useMemo(() => {
    if (chartData.length === 0) return 1;
    const max = Math.max(...chartData.map((d) => d.value));
    return max > 0 ? max : 1;
  }, [chartData]);

  const totalValue = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + Math.max(0, curr.value), 0) || 1;
  }, [chartData]);

  if (!rows || rows.length === 0) {
    return (
      <div className="chart-empty-state">
        <Info size={28} />
        <p>No rows available in DataFrame to visualize.</p>
      </div>
    );
  }

  // Dimensions for SVG canvas
  const svgWidth = 680;
  const svgHeight = 260;
  const padding = { top: 25, right: 30, bottom: 50, left: 60 };
  const innerWidth = svgWidth - padding.left - padding.right;
  const innerHeight = svgHeight - padding.top - padding.bottom;

  return (
    <div className="result-chart-container">
      {/* Chart Control Toolbar */}
      <div className="chart-controls-bar">
        <div className="chart-type-selector">
          <button
            className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
            onClick={() => setChartType('bar')}
            title="Bar Chart"
          >
            <BarChart2 size={14} />
            <span>Bar</span>
          </button>
          <button
            className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}
            onClick={() => setChartType('line')}
            title="Line Chart"
          >
            <TrendingUp size={14} />
            <span>Line</span>
          </button>
          <button
            className={`chart-type-btn ${chartType === 'pie' ? 'active' : ''}`}
            onClick={() => setChartType('pie')}
            title="Pie / Donut Chart"
          >
            <PieChart size={14} />
            <span>Pie</span>
          </button>
        </div>

        <div className="chart-axis-selectors">
          <div className="axis-select-group">
            <label>X-Axis (Category):</label>
            <select
              value={xAxisCol}
              onChange={(e) => setXAxisCol(e.target.value)}
              className="chart-select"
            >
              {columns.map((c) => (
                <option key={`x-${c}`} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="axis-select-group">
            <label>Y-Axis (Value):</label>
            <select
              value={yAxisCol}
              onChange={(e) => setYAxisCol(e.target.value)}
              className="chart-select"
            >
              {columns.map((c) => (
                <option key={`y-${c}`} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="chart-meta-pill">
          <span>{chartData.length} records visualized</span>
        </div>
      </div>

      {/* Main SVG Visualization Canvas */}
      <div className="chart-canvas-wrapper">
        {chartType === 'bar' && (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="chart-svg">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const y = padding.top + innerHeight * (1 - pct);
              const valLabel = (maxValue * pct).toLocaleString(undefined, { maximumFractionDigits: 1 });
              return (
                <g key={`grid-${i}`}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={svgWidth - padding.right}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 3}
                    fill="var(--text-dim)"
                    fontSize="10"
                    textAnchor="end"
                    fontFamily="monospace"
                  >
                    {valLabel}
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {chartData.map((d, i) => {
              const barWidth = Math.max(12, Math.min(48, innerWidth / chartData.length - 8));
              const gap = (innerWidth - barWidth * chartData.length) / (chartData.length + 1);
              const x = padding.left + gap + i * (barWidth + gap);
              const barHeight = Math.max(2, (Math.max(0, d.value) / maxValue) * innerHeight);
              const y = padding.top + innerHeight - barHeight;
              const color = PALETTE[i % PALETTE.length];
              const isHovered = hoveredIndex === i;

              return (
                <g 
                  key={`bar-${i}`}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill={color}
                    rx="3"
                    opacity={isHovered ? 1 : 0.85}
                    style={{ transition: 'all 0.2s ease' }}
                  />
                  {/* Category label */}
                  <text
                    x={x + barWidth / 2}
                    y={svgHeight - padding.bottom + 16}
                    fill={isHovered ? 'var(--text-main)' : 'var(--text-dim)'}
                    fontSize="9"
                    textAnchor="middle"
                    fontFamily="sans-serif"
                  >
                    {d.label.length > 10 ? d.label.substring(0, 8) + '…' : d.label}
                  </text>
                  {/* Hover value label */}
                  {isHovered && (
                    <text
                      x={x + barWidth / 2}
                      y={Math.max(12, y - 6)}
                      fill="#38bdf8"
                      fontSize="10"
                      fontWeight="bold"
                      textAnchor="middle"
                      fontFamily="monospace"
                    >
                      {d.value.toLocaleString()}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {chartType === 'line' && (
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="chart-svg">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const y = padding.top + innerHeight * (1 - pct);
              const valLabel = (maxValue * pct).toLocaleString(undefined, { maximumFractionDigits: 1 });
              return (
                <g key={`grid-line-${i}`}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={svgWidth - padding.right}
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 3}
                    fill="var(--text-dim)"
                    fontSize="10"
                    textAnchor="end"
                    fontFamily="monospace"
                  >
                    {valLabel}
                  </text>
                </g>
              );
            })}

            {/* Line Path */}
            {chartData.length > 0 && (() => {
              const points = chartData.map((d, i) => {
                const step = chartData.length > 1 ? innerWidth / (chartData.length - 1) : innerWidth / 2;
                const x = padding.left + i * step;
                const y = padding.top + innerHeight - (Math.max(0, d.value) / maxValue) * innerHeight;
                return { x, y, d };
              });

              const pathD = points.reduce((acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
              const areaD = `${pathD} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`;

              return (
                <g>
                  {/* Area fill */}
                  <path d={areaD} fill="rgba(56, 189, 248, 0.12)" />
                  {/* Stroke line */}
                  <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                  {/* Points */}
                  {points.map((p, idx) => (
                    <g 
                      key={`pt-${idx}`}
                      onMouseEnter={() => setHoveredIndex(idx)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={hoveredIndex === idx ? 6 : 4}
                        fill="#38bdf8"
                        stroke="#0c111c"
                        strokeWidth="2"
                      />
                      <text
                        x={p.x}
                        y={svgHeight - padding.bottom + 16}
                        fill="var(--text-dim)"
                        fontSize="9"
                        textAnchor="middle"
                      >
                        {p.d.label.length > 8 ? p.d.label.substring(0, 6) + '…' : p.d.label}
                      </text>
                      {hoveredIndex === idx && (
                        <text
                          x={p.x}
                          y={Math.max(12, p.y - 8)}
                          fill="#f59e0b"
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                          fontFamily="monospace"
                        >
                          {p.d.value.toLocaleString()}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              );
            })()}
          </svg>
        )}

        {chartType === 'pie' && (
          <div className="pie-chart-layout">
            <svg viewBox="0 0 280 260" className="pie-svg">
              <g transform="translate(140, 130)">
                {(() => {
                  let accumulatedAngle = 0;
                  return chartData.map((d, i) => {
                    const sliceAngle = (Math.max(0, d.value) / totalValue) * 2 * Math.PI;
                    if (sliceAngle <= 0) return null;

                    const startAngle = accumulatedAngle;
                    const endAngle = accumulatedAngle + sliceAngle;
                    accumulatedAngle = endAngle;

                    const radius = hoveredIndex === i ? 98 : 90;
                    const innerRadius = 45; // Donut style

                    const x1 = Math.cos(startAngle) * radius;
                    const y1 = Math.sin(startAngle) * radius;
                    const x2 = Math.cos(endAngle) * radius;
                    const y2 = Math.sin(endAngle) * radius;

                    const ix1 = Math.cos(startAngle) * innerRadius;
                    const iy1 = Math.sin(startAngle) * innerRadius;
                    const ix2 = Math.cos(endAngle) * innerRadius;
                    const iy2 = Math.sin(endAngle) * innerRadius;

                    const largeArc = sliceAngle > Math.PI ? 1 : 0;
                    const pathData = [
                      `M ${ix1} ${iy1}`,
                      `L ${x1} ${y1}`,
                      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
                      `L ${ix2} ${iy2}`,
                      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1}`,
                      'Z',
                    ].join(' ');

                    const color = PALETTE[i % PALETTE.length];

                    return (
                      <path
                        key={`pie-slice-${i}`}
                        d={pathData}
                        fill={color}
                        opacity={hoveredIndex === i ? 1 : 0.85}
                        stroke="#0c111c"
                        strokeWidth="2"
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                      />
                    );
                  });
                })()}
              </g>
            </svg>

            {/* Pie Legend */}
            <div className="pie-legend-list">
              {chartData.slice(0, 8).map((d, i) => {
                const pct = ((Math.max(0, d.value) / totalValue) * 100).toFixed(1);
                const color = PALETTE[i % PALETTE.length];
                const isHovered = hoveredIndex === i;

                return (
                  <div
                    key={`legend-${i}`}
                    className={`legend-item ${isHovered ? 'active' : ''}`}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <span className="legend-dot" style={{ background: color }} />
                    <span className="legend-label">{d.label}</span>
                    <span className="legend-val">{d.value.toLocaleString()} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
