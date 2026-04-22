
const fs = require('fs');

function fixTank() {
  let c = fs.readFileSync('D:/17-04-26/main/client/src/pages/EvaraTankAnalytics.tsx', 'utf8');
  c = c.replace(/<XAxis[\s\S]*?tickFormatter=\{[\s\S]*?\}\n\s*\/>/g, \<XAxis dataKey={tankChartRange === '24H' ? 'time' : 'time'} minTickGap={40} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--text-muted)', fontWeight: 500 }} />\);
  fs.writeFileSync('D:/17-04-26/main/client/src/pages/EvaraTankAnalytics.tsx', c);
  console.log('Fixed Tank XAxis');
}

function fixFlow() {
  let c = fs.readFileSync('D:/17-04-26/main/client/src/pages/EvaraFlowAnalytics.tsx', 'utf8');
  c = c.replace(/<XAxis[\s\S]*?tickFormatter=\{[\s\S]*?\/>/g, \<XAxis dataKey={period === '24H' ? 'label' : 'label'} minTickGap={40} axisLine={{ stroke: '#e2e8f0', strokeWidth: 1 }} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)', fontWeight: 600 }} padding={{ left: 20, right: 20 }} />\);
  fs.writeFileSync('D:/17-04-26/main/client/src/pages/EvaraFlowAnalytics.tsx', c);
  console.log('Fixed Flow XAxis');
}

fixTank();
fixFlow();

