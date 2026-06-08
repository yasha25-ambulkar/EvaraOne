const fs = require('fs');

// Fix Flow Analytics
console.log('Fixing EvaraFlowAnalytics.tsx...');
let flowContent = fs.readFileSync('D:/17-04-26/main/client/src/pages/EvaraFlowAnalytics.tsx', 'utf8');

// Replace Status card with Assigned To in Node Info modal
flowContent = flowContent.replace(
  /<p className="text\[10px\] font-bold uppercase tracking-wider" style={{\s*color: 'var\(--text-muted\)'\s*}}>Status<\/p>\s*<p className="text-sm font-bold mt-1" style={{\s*color: effectiveIsOffline \? '#e74c3c' : '#27ae60'\s*}}>\s*{effectiveIsOffline \? 'Offline' : 'Online'}\s*<\/p>/,
  `<p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Assigned To</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>{user?.displayName || 'Unassigned'}</p>`
);

// Update Copy Info function
flowContent = flowContent.replace(
  /const info = `Device Name:\s*\${deviceName}\\nHardware ID: \${hardwareId}\\nDevice Type: EvaraFlow Monitor\\nLocation: \${zoneName \|\| 'Not specified'}\\nSubscription: PRO\\nStatus:\s*\${effectiveIsOffline \? 'Offline' : 'Online'}`/,
  `const info = \`Device Name: \${deviceName}\\nHardware ID: \${hardwareId}\\nDevice Type: EvaraFlow Monitor\\nLocation: \${zoneName || 'Not specified'}\\nSubscription: PRO\\nAssigned To: \${user?.displayName || 'Unassigned'}\``
);

fs.writeFileSync('D:/17-04-26/main/client/src/pages/EvaraFlowAnalytics.tsx', flowContent);
console.log('✓ Fixed EvaraFlowAnalytics.tsx');

// Fix TDS Analytics (if it exists)
try {
  console.log('Fixing EvaraTDSAnalytics.tsx...');
  let tdsContent = fs.readFileSync('D:/17-04-26/main/client/src/pages/EvaraTDSAnalytics.tsx', 'utf8');
  
  // Replace Status card with Assigned To
  tdsContent = tdsContent.replace(
    /Status<\/p>\s*<p className="text-sm font-bold mt-1" style={{\s*color: isOffline \? '#e74c3c' : '#27ae60'\s*}}>\s*{isOffline \? 'Offline' : 'Online'}\s*<\/p>/,
    `Assigned To</p>
                                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>{user?.displayName || 'Unassigned'}</p>`
  );

  // Update Copy Info
  tdsContent = tdsContent.replace(
    /Status: \${isOffline \? 'Offline' : 'Online'}/,
    `Assigned To: \${user?.displayName || 'Unassigned'}`
  );

  fs.writeFileSync('D:/17-04-26/main/client/src/pages/EvaraTDSAnalytics.tsx', tdsContent);
  console.log('✓ Fixed EvaraTDSAnalytics.tsx');
} catch (e) {
  console.log('⊘ TDS Analytics file not found or already fixed');
}

console.log('All Node Information modals updated!');
