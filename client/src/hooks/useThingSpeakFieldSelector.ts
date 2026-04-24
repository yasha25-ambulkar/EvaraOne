/**
 * useThingSpeakFieldSelector
 *
 * Encapsulates ALL logic for the ThingSpeak field-selector system:
 *  - Credential state (channelId, readApiKey)
 *  - Fetching available fields from the ThingSpeak API
 *  - Multi-row field selection with duplicate prevention
 *  - Reset semantics when credentials change
 */

import { useState, useCallback, useRef } from 'react';
import axios, { AxiosError } from 'axios';
import api from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_FIELD_KEYS = [
  'field1', 'field2', 'field3', 'field4',
  'field5', 'field6', 'field7', 'field8',
] as const;

type FieldKey = typeof ALL_FIELD_KEYS[number];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThingSpeakField {
  key: string;
  label: string;
}

export interface UseThingSpeakFieldSelectorReturn {
  channelId: string;
  readApiKey: string;
  setChannelId: (value: string) => void;
  setReadApiKey: (value: string) => void;

  availableFields: ThingSpeakField[];
  isFetching: boolean;
  fetchError: string | null;
  hasFetched: boolean;

  selectedFields: string[];

  fetchFields: () => Promise<void>;
  selectField: (rowIndex: number, fieldKey: string) => void;
  addRow: () => void;
  removeRow: (rowIndex: number) => void;

  getOptionsForRow: (rowIndex: number) => Array<ThingSpeakField & { isDisabled: boolean }>;
  getSelectedFieldNames: () => string[];
  isValid: boolean;
}

// ── Types for ThingSpeak API response ────────────────────────────────────────

interface ThingSpeakChannel {
  field1?: string;
  field2?: string;
  field3?: string;
  field4?: string;
  field5?: string;
  field6?: string;
  field7?: string;
  field8?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveFieldsFromMetadata(metadata: Record<string, any>): ThingSpeakField[] {
  return ALL_FIELD_KEYS
    .filter((key) => metadata[key] && typeof metadata[key] === 'string' && metadata[key].trim() !== '')
    .map((key) => ({
      key,
      label: metadata[key] as string,
    }));
}

function parseError(err: unknown): string {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    const responseData = err.response?.data as any;
    
    // ✅ Extract the most descriptive message from our backend response
    if (responseData?.message && typeof responseData.message === 'string') {
      return responseData.message;
    }
    if (responseData?.error) {
      if (typeof responseData.error === 'string') return responseData.error;
      if (typeof responseData.error === 'object') {
        return responseData.error.message || JSON.stringify(responseData.error);
      }
    }
    
    // Fallback status-based messages
    if (status === 400) return 'Invalid Channel ID or API Key. Please verify your ThingSpeak credentials.';
    if (status === 401) return 'Unauthorized. Your API key does not have permission to access this channel.';
    if (status === 404) return 'Channel not found. Please check your Channel ID.';
    if (status === 503) return 'ThingSpeak service is unavailable. Please try again later.';
    if (!err.response) return 'Network error. Please check your internet connection.';
    
    return `API error ${status}: ${err.message}`;
  }
  return err instanceof Error ? err.message : 'Unknown error occurred.';
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useThingSpeakFieldSelector(): UseThingSpeakFieldSelectorReturn {
  const [channelId, setChannelIdRaw] = useState('');
  const [readApiKey, setReadApiKeyRaw] = useState('');
  const [availableFields, setAvailableFields] = useState<ThingSpeakField[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[]>(['']);

  const abortRef = useRef<AbortController | null>(null);

  // ── Credential setters ───────────────────────────────────────────────────

  const setChannelId = useCallback((value: string) => {
    setChannelIdRaw(value);
    setAvailableFields([]);
    setSelectedFields(['']);
    setFetchError(null);
    setHasFetched(false);
  }, []);

  const setReadApiKey = useCallback((value: string) => {
    setReadApiKeyRaw(value);
    setAvailableFields([]);
    setSelectedFields(['']);
    setFetchError(null);
    setHasFetched(false);
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchFields = useCallback(async () => {
    const id = channelId.trim();
    const key = readApiKey.trim();

    if (!id || !key) {
      setFetchError('Channel ID and Read API Key are required.');
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsFetching(true);
    setFetchError(null);
    setAvailableFields([]);
    setSelectedFields(['']);
    setHasFetched(false);

    try {
      const { data } = await api.post<{
        success: boolean;
        metadata: ThingSpeakChannel & { channel_id: string; fetched_at: string };
      }>(
        `/thingspeak/fetch-fields`,
        { channelId: id, apiKey: key },
        {
          signal: abortRef.current.signal,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const fields = deriveFieldsFromMetadata(data.metadata);
      setAvailableFields(fields);
      setHasFetched(true);

      if (fields.length === 0) {
        setFetchError('No active fields found in this channel. Make sure the channel has named fields.');
      }
    } catch (err) {
      if (axios.isCancel(err)) return;
      setFetchError(parseError(err));
      setHasFetched(true);
    } finally {
      setIsFetching(false);
    }
  }, [channelId, readApiKey]);

  // ── Row management ───────────────────────────────────────────────────────

  const selectField = useCallback((rowIndex: number, fieldKey: string) => {
    setSelectedFields((prev) => {
      const next = [...prev];
      next[rowIndex] = fieldKey;
      return next;
    });
  }, []);

  const addRow = useCallback(() => {
    setSelectedFields((prev) => [...prev, '']);
  }, []);

  const removeRow = useCallback((rowIndex: number) => {
    setSelectedFields((prev) => {
      if (prev.length === 1) return [''];
      return prev.filter((_, i) => i !== rowIndex);
    });
  }, []);

  // ── Derived helpers ──────────────────────────────────────────────────────

  const getOptionsForRow = useCallback(
    (rowIndex: number) => {
      const currentValue = selectedFields[rowIndex] ?? '';
      const otherSelections = new Set(
        selectedFields.filter((v, i) => i !== rowIndex && v !== '')
      );
      return availableFields.map((field) => ({
        ...field,
        isDisabled: otherSelections.has(field.key) && field.key !== currentValue,
      }));
    },
    [availableFields, selectedFields]
  );

  const getSelectedFieldNames = useCallback((): string[] => {
    return selectedFields
      .filter((fieldKey) => fieldKey !== '')
      .map((fieldKey) => {
        const field = availableFields.find((f) => f.key === fieldKey);
        return field?.label || fieldKey;
      });
  }, [selectedFields, availableFields]);

  const isValid = selectedFields.some((f) => f !== '');

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    channelId,
    readApiKey,
    setChannelId,
    setReadApiKey,
    availableFields,
    isFetching,
    fetchError,
    hasFetched,
    selectedFields,
    fetchFields,
    selectField,
    addRow,
    removeRow,
    getOptionsForRow,
    getSelectedFieldNames,
    isValid,
  };
}