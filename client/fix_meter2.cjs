const fs = require('fs');

let meter = fs.readFileSync('src/components/dashboard/TDSMeterVisual.tsx', 'utf-8');
meter = meter.replace(/<<<<<<< HEAD[\s\S]*?=======\s*/g, '');
meter = meter.replace(/>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020\s*/g, '');
fs.writeFileSync('src/components/dashboard/TDSMeterVisual.tsx', meter);

let card = fs.readFileSync('src/components/dashboard/TDSCard.tsx', 'utf-8');
card = card.replace(/<<<<<<< HEAD\r?\nimport { AreaChart, Area, ResponsiveContainer } from 'recharts';\r?\n=======\r?\nimport React from 'react';\r?\nimport { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';\r?\n>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020/g, `import React from 'react';\nimport { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';`);

let cardMerge1 = `    const data = realtimeStatus || node.last_telemetry || {};
<<<<<<< HEAD
    const tdsValue = data.tdsValue ?? data.tds_value ?? 0;
    const waterQuality = data.waterQualityRating || data.water_quality_rating || "Unknown";
    
    // SYNC WITH ALLNODES: Use same status calculation logic
    const lastSeen = data.timestamp || data.created_at || data.last_seen || node.last_seen || node.last_online_at || node.updated_at || null;
    const isOnline = computeDeviceStatus(lastSeen) === "Online";

    // History for sparkline
    const history = (data.tdsHistory || data.tds_history || []).map((h: any, i: number) => ({
        index: i,
        value: h.value ?? h
    }));

    // Quality color logic
    const qualityColor = waterQuality.toLowerCase() === 'good' 
        ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' 
        : waterQuality.toLowerCase() === 'acceptable'
        ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
        : 'text-red-500 bg-red-500/10 border-red-500/20';

    const cardTint = waterQuality.toLowerCase() === 'good'
        ? 'bg-emerald-500/5 border-emerald-500/20'
        : waterQuality.toLowerCase() === 'acceptable'
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-red-500/5 border-red-500/20';
=======
    const tdsValue = data.tds_value ?? data.tdsValue ?? 0;
    const waterQuality = data.water_quality ?? data.waterQualityRating ?? data.water_quality_rating ?? "Unknown";
    const lastSeen = data.timestamp || data.lastUpdatedAt || data.last_updated_at || data.last_seen || node.last_seen || null;
    const isOnline = computeDeviceStatus(lastSeen) === "Online";

    // History for sparkline
    let historyData = (data.tdsHistory || data.tds_history || []);
    
    // If history is too short or empty, try to derive from current value
    if (historyData.length < 2) {
        historyData = Array(10).fill(tdsValue);
    }

    const history = historyData.map((h: any, i: number) => {
        const baseValue = typeof h === 'object' ? (h.value ?? h.tds_value ?? 0) : h;
        // Add a tiny bit of "up and down" noise if the user wants it to look alive
        // This is purely for aesthetics as requested
        const noise = (Math.sin(i * 1.5) * 0.5) + (Math.random() * 0.2);
        return {
            index: i,
            value: baseValue + noise
        };
    });
>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020`;

card = card.replace(cardMerge1, `    const data = realtimeStatus || node.last_telemetry || {};
    const tdsValue = data.tds_value ?? data.tdsValue ?? 0;
    const waterQuality = data.water_quality ?? data.waterQualityRating ?? data.water_quality_rating ?? "Unknown";
    
    // SYNC WITH ALLNODES logic combined with remote
    const lastSeen = data.timestamp || data.created_at || data.lastUpdatedAt || data.last_updated_at || data.last_seen || node.last_seen || node.last_online_at || node.updated_at || null;
    const isOnline = computeDeviceStatus(lastSeen) === "Online";

    // History for sparkline
    let historyData = (data.tdsHistory || data.tds_history || []);
    if (historyData.length < 2) {
        historyData = Array(10).fill({ value: tdsValue });
    }
    const history = historyData.map((h: any, i: number) => {
        const baseValue = typeof h === 'object' ? (h.value ?? h.tds_value ?? 0) : h;
        const noise = (Math.sin(i * 1.5) * 0.5) + (Math.random() * 0.2);
        return {
            index: i,
            value: baseValue + noise
        };
    });`);

card = card.replace(/<<<<<<< HEAD[\s\S]*?=======\s*/g, '');
card = card.replace(/>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020\s*/g, '');
fs.writeFileSync('src/components/dashboard/TDSCard.tsx', card);

let analytics = fs.readFileSync('src/pages/EvaraTDSAnalytics.tsx', 'utf-8');
analytics = analytics.replace(/<<<<<<< HEAD[\s\S]*?=======\s*/g, '');
analytics = analytics.replace(/>>>>>>> 1fd25b56b42cbb9b72e3b965a3a1a5e5c692f020\s*/g, '');
fs.writeFileSync('src/pages/EvaraTDSAnalytics.tsx', analytics);

console.log("Done");
