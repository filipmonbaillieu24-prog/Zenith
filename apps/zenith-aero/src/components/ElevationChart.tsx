import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { RoutePoint } from '../types/route';

interface ElevationChartProps {
  points: RoutePoint[];
  onHoverPoint: (point: RoutePoint | null) => void;
  activeWorkout?: any | null;
}

export const ElevationChart: React.FC<ElevationChartProps> = ({ points, onHoverPoint, activeWorkout }) => {
  if (points.length === 0) return null;

  // Prepare chart data by mapping RoutePoint objects
  // To avoid rendering too many points in Recharts (which slows down DOM rendering),
  // we can downsample the data if the route has more than 300 points.
  const downsampleLimit = 300;
  const step = Math.max(1, Math.ceil(points.length / downsampleLimit));
  
  const chartData = [];
  for (let i = 0; i < points.length; i += step) {
    chartData.push({
      distanceKm: parseFloat((points[i].distance / 1000).toFixed(2)),
      elevation: Math.round(points[i].ele),
      originalIndex: i, // reference back to the original points array
    });
  }

  // Ensure the very last point is always included so the chart goes to the exact end
  const lastIndex = points.length - 1;
  if (points.length > 0 && chartData[chartData.length - 1].originalIndex !== lastIndex) {
    chartData.push({
      distanceKm: parseFloat((points[lastIndex].distance / 1000).toFixed(2)),
      elevation: Math.round(points[lastIndex].ele),
      originalIndex: lastIndex,
    });
  }

  // Handle Chart Hover
  const handleMouseMove = (state: any) => {
    if (state && state.activeTooltipIndex !== undefined && state.activePayload && state.activePayload.length > 0) {
      const activePointData = state.activePayload[0].payload;
      const originalIndex = activePointData.originalIndex;
      onHoverPoint(points[originalIndex]);
    }
  };

  const handleMouseLeave = () => {
    onHoverPoint(null);
  };

  // Find min/max elevation to scale the Y axis properly
  const elevations = points.map(p => p.ele);
  const minEle = Math.max(0, Math.min(...elevations) - 10);
  const maxEle = Math.max(...elevations) + 15;

  return (
    <div className="elevation-chart-card animate-slide-up">
      <div className="chart-header">
        <h3>Elevation Profile</h3>
        <span className="chart-info">Hover over the chart to inspect map location</span>
      </div>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              {activeWorkout && activeWorkout.blocks ? (
                <linearGradient id="elevationGrad" x1="0" y1="0" x2="1" y2="0">
                  {(() => {
                    const totalWorkoutSeconds = activeWorkout.blocks.reduce((s: number, b: any) => s + b.duration, 0);
                    let currSec = 0;
                    const stops: React.ReactNode[] = [];
                    
                    activeWorkout.blocks.forEach((block: any, idx: number) => {
                      const startPct = currSec / totalWorkoutSeconds;
                      const endPct = (currSec + block.duration) / totalWorkoutSeconds;
                      currSec += block.duration;
                      
                      stops.push(<stop key={`start-${idx}`} offset={`${startPct * 100}%`} stopColor={block.color} stopOpacity={0.65} />);
                      stops.push(<stop key={`end-${idx}`} offset={`${endPct * 100}%`} stopColor={block.color} stopOpacity={0.65} />);
                    });
                    return stops;
                  })()}
                </linearGradient>
              ) : (
                <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0} />
                </linearGradient>
              )}
            </defs>
            <XAxis 
              dataKey="distanceKm" 
              stroke="#888888" 
              fontSize={11}
              tickLine={false}
              axisLine={false}
              unit=" km"
            />
            <YAxis 
              domain={[minEle, maxEle]} 
              stroke="#888888" 
              fontSize={11}
              tickLine={false}
              axisLine={false}
              unit=" m"
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="custom-chart-tooltip">
                      <p className="tooltip-distance">Distance: <span>{data.distanceKm} km</span></p>
                      <p className="tooltip-elevation">Hoogte: <span>{data.elevation} m</span></p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="elevation"
              stroke={activeWorkout ? 'rgba(255, 255, 255, 0.25)' : 'var(--color-primary)'}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#elevationGrad)"
              dot={false}
              activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 1.5, fill: 'var(--color-accent)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
