import { useEffect, useRef, useState } from 'react';
import axios from 'axios';

interface TSFeed {
  created_at: string;
  entry_id?: number;
  [key: string]: any;
}

interface Reading {
  timestamp: string; // ISO
  values: Record<string, string | null>;
  entry_id?: number;
}

export const useThingSpeakReader = (
  channelId: string | undefined,
  readApiKey: string | undefined,
  fieldKeys: string[],
  options?: { pollIntervalMs?: number; windowSeconds?: number }
) => {
  const pollIntervalMs = options?.pollIntervalMs ?? 15000; // default 15s to match ThingSpeak chart update
  const windowSeconds = options?.windowSeconds ?? 3600; // default 1 hour window
  const results = (options as any)?.results ?? 150;

  const [readings, setReadings] = useState<Reading[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const normalizeTimestamp = (ts: string) => {
    if (!ts) return new Date().toISOString();
    // ThingSpeak sometimes returns timestamps without timezone; append Z when missing
    if (/Z|\+|\-/.test(ts)) return new Date(ts).toISOString();
    return new Date(ts + 'Z').toISOString();
  };

  const fetchOnce = async () => {
    const id = channelId?.trim();
    const key = readApiKey?.trim();
    if (!id) return;

    setIsLoading(true);
    setError(null);

    try {
      const url = `https://api.thingspeak.com/channels/${encodeURIComponent(id)}/feeds.json`;
      const params: any = { results };
      if (key) params.api_key = key;

      const res = await axios.get(url, { params, timeout: 10000 });
      const feeds: TSFeed[] = Array.isArray(res.data?.feeds) ? res.data.feeds : [];

      // Map feeds preserving ThingSpeak's returned values, ignore invalid entries
      const mapped: Reading[] = feeds
        .filter((f) => f && f.created_at)
        .map((f) => ({
          timestamp: normalizeTimestamp(f.created_at),
          entry_id: f.entry_id,
          values: fieldKeys.reduce((acc, fk) => {
            acc[fk] = f[fk] ?? null;
            return acc;
          }, {} as Record<string, string | null>),
        }));

      // Merge with existing, dedupe by entry_id (preferred) or timestamp, keep chronological order
      setReadings((prev) => {
        const byId = new Map<string | number, Reading>();
        for (const r of [...prev, ...mapped]) {
          const idKey = r.entry_id ?? r.timestamp;
          byId.set(idKey, r);
        }
        const arr = Array.from(byId.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const cutoff = Date.now() - windowSeconds * 1000;
        return arr.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
      });
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    setReadings([]);
    setError(null);
    if (!channelId || !readApiKey || fieldKeys.length === 0) return;

    fetchOnce();

    const id = window.setInterval(fetchOnce, pollIntervalMs);
    timerRef.current = id;

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, readApiKey, fieldKeys.join(','), pollIntervalMs, windowSeconds]);

  const latest = readings.length > 0 ? readings[readings.length - 1] : null;

  return { readings, latest, isLoading, error };
};

export default useThingSpeakReader;
