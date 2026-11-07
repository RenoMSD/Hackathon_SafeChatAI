import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { HISTORY_LIMIT, HISTORY_STORAGE_KEY, type HistoryEntry } from '../types';

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false;

  const entry = value as Partial<HistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.text === 'string' &&
    (entry.source === 'share' || entry.source === 'manual') &&
    typeof entry.createdAt === 'string' &&
    typeof entry.analysis === 'object' &&
    entry.analysis !== null
  );
}

export interface UseHistoryResult {
  items: HistoryEntry[];
  loading: boolean;
  add: (entry: HistoryEntry) => void;
  clear: () => void;
}

/** Giữ tối đa 5 kết quả gần nhất trong AsyncStorage (chỉ trên thiết bị). */
export function useHistory(): UseHistoryResult {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
        if (!active || raw === null) return;

        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setItems(parsed.filter(isHistoryEntry).slice(0, HISTORY_LIMIT));
        }
      } catch {
        if (active) setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const add = useCallback((entry: HistoryEntry) => {
    setItems((previous) => {
      const next = [entry, ...previous].slice(0, HISTORY_LIMIT);
      void AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    void AsyncStorage.removeItem(HISTORY_STORAGE_KEY).catch(() => undefined);
  }, []);

  return { items, loading, add, clear };
}
