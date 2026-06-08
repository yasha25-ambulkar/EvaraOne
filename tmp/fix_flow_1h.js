const fs = require('fs');
let c = fs.readFileSync('D:/17-04-26/main/client/src/pages/EvaraFlowAnalytics.tsx', 'utf8');

// Replace default period from 24H to 1H
c = c.replace(/useState<'24H' \| '1W' \| '1M' \| 'RANGE'>\('24H'\)/g, "useState<'1H' | '24H' | '1W' | '1M' | 'RANGE'>('1H')");

// Update period selector buttons
c = c.replace(/\(\['24H', '1W', '1M', 'RANGE'\] as const\)/g, "([ '1H', '24H', '1W', '1M', 'RANGE'] as const)");

// Add 1H filtering logic for chartData
const chartDataPattern = /if \(period === '24H'\) \{/;
const chartData1HLogic = `if (period === '1H') {
              const now = new Date();
              const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
              let sorted = [...history].map((d) => ({
                  ...d,
                  timestampMs: new Date(d.date!).getTime(),
                  current: d.value || 0
              })).sort((a, b) => a.timestampMs - b.timestampMs)
              .filter(d => d.timestampMs >= oneHourAgo.getTime());

              if (sorted.length === 0) return [];

              const interpolated = [];
              const startBoundary = Math.floor(oneHourAgo.getTime() / 60000) * 60000;
              const endBoundary = Math.floor(now.getTime() / 60000) * 60000;

              for (let t = startBoundary; t <= endBoundary; t += 60000) {
                  let dataIdx = 0;
                  while (dataIdx < sorted.length - 1 && sorted[dataIdx + 1].timestampMs <= t) {
                      dataIdx++;
                  }
                  const point = sorted[dataIdx];
                  const nextPoint = sorted[dataIdx + 1];
                  let value = point?.current || 0;
                  if (nextPoint && point && nextPoint.timestampMs !== point.timestampMs) {
                      const progress = (t - point.timestampMs) / (nextPoint.timestampMs - point.timestampMs);
                      value = point.current + (nextPoint.current - point.current) * progress;
                  }
                  interpolated.push({
                      timestampMs: t,
                      time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      fullTime: new Date(t).toLocaleString(),
                      label: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                      current: value
                  });
              }
              return interpolated;
          } else if (period === '24H') {`;

c = c.replace(chartDataPattern, chartData1HLogic);

// Add 1H filtering logic for totalUsageData
const totalUsagePattern = /if \(period === '24H'\) \{[\s]*const yesterday/;
if (c.match(totalUsagePattern)) {
    c = c.replace(totalUsagePattern, `if (period === '1H') {
              const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
              filtered = history.filter(h => h.date && h.date >= oneHourAgo);
          } else if (period === '24H') {
              const yesterday`);
}

fs.writeFileSync('D:/17-04-26/main/client/src/pages/EvaraFlowAnalytics.tsx', c);
console.log('Fixed Flow Analytics to show 1H data');
