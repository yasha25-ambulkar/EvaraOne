import { useState, useEffect } from 'react';

type Timeframe = '24H' | '7D' | '30D';
export interface DataPoint { name: string; value: number; }

const THINGSPEAK_BASE = 'https://api.thingspeak.com';

// Fetch a single channel's field as array of {ts, value}
async function fetchField(channelId: string, apiKey: string, field: string, results: number) {
  try {
    const res = await fetch(
      `${THINGSPEAK_BASE}/channels/${channelId}/fields/${field.replace('field','')}.json?api_key=${apiKey}&results=${results}`
    );
    const json = await res.json();
    return (json.feeds || []).map((f: any) => ({
      ts: new Date(f.created_at),
      value: parseFloat(f[field]) || 0,
    }));
  } catch { return []; }
}

// Group and sum data points into labelled buckets
function bucketData(points: { ts: Date; value: number }[], timeframe: Timeframe): DataPoint[] {
  const buckets: Record<string, number> = {};

  if (timeframe === '24H') {
    for (let h = 0; h < 24; h++) buckets[`${String(h).padStart(2,'0')}:00`] = 0;
    points.forEach(({ ts, value }) => {
      const key = `${String(ts.getHours()).padStart(2,'0')}:00`;
      if (key in buckets && value >= 0) buckets[key] += value;
    });
  } else if (timeframe === '7D') {
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    days.forEach(d => buckets[d] = 0);
    points.forEach(({ ts, value }) => {
      const key = days[ts.getDay()];
      buckets[key] += value;
    });
  } else {
    for (let d = 1; d <= 30; d++) buckets[`Day ${d}`] = 0;
    points.forEach(({ ts, value }) => {
      const key = `Day ${ts.getDate()}`;
      if (key in buckets && value >= 0) buckets[key] += value;
    });
  }

  return Object.entries(buckets).map(([name, value]) => ({
    name,
    value: Math.round(value),
  }));
}

// For EvaraTank: consumption = sum of level DROPS (level going down = water used)
function calcTankConsumption(feeds: { ts: Date; value: number }[]) {
  let total = 0;
  for (let i = 1; i < feeds.length; i++) {
    const drop = feeds[i - 1].value - feeds[i].value;
    if (drop > 0) total += drop; // only count drops, not refills
  }
  return total;
}

export function useConsumptionTrend(
  nodes: any[],
  timeframe: Timeframe
) {
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const nodeIds = nodes.map((n: any) => n.id || n.hardwareId).join(',');

  useEffect(() => {
    const onlineNodes = nodes.filter(n => {
      const ts = n.lastPing || n.last_seen || n.last_telemetry?.timestamp;
      if (!ts) return n.status === 'Online';
      const diff = Date.now() - new Date(ts).getTime();
      return diff < 15 * 60 * 1000; // online = pinged within 15 min
    });

    const flowDevices = onlineNodes.filter(n =>
      (n.asset_type || n.device_type || n.deviceType || '').toLowerCase().includes('flow')
    );
    const tankDevices = onlineNodes.filter(n =>
      (n.asset_type || n.device_type || n.deviceType || '').toLowerCase().includes('tank')
    );

    if (flowDevices.length === 0 && tankDevices.length === 0) {
      setData([]);
      return;
    }

    const results = timeframe === '24H' ? 144 : timeframe === '7D' ? 1000 : 4000;

    setLoading(true);

    const allPoints: { ts: Date; value: number }[] = [];

    const fetches = [
      // EvaraFlow: field2 = totalizer
      ...flowDevices.map(async (n) => {
        const channelId = n.thingspeak_channel_id || n.channelId || n.channel_id || n.thingspeakChannelId;
        const apiKey = n.thingspeak_read_api_key || n.readApiKey || n.read_api_key || n.apiKey || n.thingspeak_api_key || n.readKey;
        if (!channelId || !apiKey) return;
        const feeds = await fetchField(channelId, apiKey, 'field2', results);
        feeds.forEach((f: any) => { if (f.value >= 0) allPoints.push(f); });
      }),
      // EvaraTank: field2 = level, calculate drops
      ...tankDevices.map(async (n) => {
        const channelId = n.thingspeak_channel_id || n.channelId || n.channel_id || n.thingspeakChannelId;
        const apiKey = n.thingspeak_read_api_key || n.readApiKey || n.read_api_key || n.apiKey || n.thingspeak_api_key || n.readKey;
        if (!channelId || !apiKey) return;
        const feeds = await fetchField(channelId, apiKey, 'field2', results);
        // Convert level drops into consumption points
        for (let i = 1; i < feeds.length; i++) {
          const drop = feeds[i - 1].value - feeds[i].value;
          if (drop > 0 && drop < 500) allPoints.push({ ts: feeds[i].ts, value: drop });
        }
      }),
    ];

    Promise.all(fetches).then(() => {
      setData(bucketData(allPoints, timeframe));
      setLoading(false);
    });

  }, [nodeIds, timeframe]);

  return { data, loading };
}
