import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

type SwitchType = 'pos' | 'shelf';
type SwitchMap = Record<string, boolean>;
type PendingMap = Record<string, boolean>;
type MutationStatus = 'success' | 'error';
type MutationStatusMap = Record<string, MutationStatus>;

interface BulkTarget {
  key: string;
  title: string;
}

const buildPendingKey = (type: SwitchType, key: string) => `${type}|${key}`;

export const useBestsellerSwitches = (currentListDate: string, region: string = 'PNBA') => {
  const [posChecked, setPosChecked] = useState<SwitchMap>({});
  const [shelfChecked, setShelfChecked] = useState<SwitchMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingMap, setPendingMap] = useState<PendingMap>({});
  const [bulkPending, setBulkPending] = useState<{ pos: boolean; shelf: boolean }>({ pos: false, shelf: false });
  const [mutationStatus, setMutationStatus] = useState<MutationStatusMap>({});
  const statusTimers = useRef<Record<string, number>>({});
  const { toast } = useToast();

  const clearStatusLater = useCallback((key: string, delay: number) => {
    if (statusTimers.current[key]) {
      clearTimeout(statusTimers.current[key]);
    }

    statusTimers.current[key] = window.setTimeout(() => {
      setMutationStatus(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      delete statusTimers.current[key];
    }, delay);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(statusTimers.current).forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
    };
  }, []);

  const setPending = useCallback((type: SwitchType, key: string, pending: boolean) => {
    const pendingKey = buildPendingKey(type, key);
    setPendingMap(prev => {
      if (pending) {
        return { ...prev, [pendingKey]: true };
      }
      if (!prev[pendingKey]) return prev;
      const next = { ...prev };
      delete next[pendingKey];
      return next;
    });
  }, []);

  const setBulkState = useCallback((type: SwitchType, value: boolean) => {
    setBulkPending(prev => {
      if (prev[type] === value) return prev;
      return { ...prev, [type]: value };
    });
  }, []);

  const applySwitchState = useCallback((type: SwitchType, key: string, checked: boolean) => {
    if (type === 'pos') {
      setPosChecked(prev => {
        if (checked) {
          return { ...prev, [key]: true };
        }
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setShelfChecked(prev => {
        if (checked) {
          return { ...prev, [key]: true };
        }
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }, []);

  const noteMutationResult = useCallback((type: SwitchType, key: string, status: MutationStatus) => {
    const mutationKey = buildPendingKey(type, key);
    setMutationStatus(prev => ({ ...prev, [mutationKey]: status }));
    clearStatusLater(mutationKey, status === 'success' ? 2000 : 4000);
  }, [clearStatusLater]);

  const loadSwitches = useCallback(async () => {
    if (!currentListDate) return;

    setLoading(true);
    setLoadError(null);

    try {
      const { data, error } = await supabase
        .from('bestseller_switches')
        .select('book_isbn, switch_type')
        .eq('region', region)
        .eq('list_date', currentListDate);

      if (error) {
        throw error;
      }

      const newPosChecked: SwitchMap = {};
      const newShelfChecked: SwitchMap = {};

      data?.forEach((row: { book_isbn: string; switch_type: SwitchType }) => {
        if (row.switch_type === 'pos') {
          newPosChecked[row.book_isbn] = true;
        } else if (row.switch_type === 'shelf') {
          newShelfChecked[row.book_isbn] = true;
        }
      });

      setPosChecked(newPosChecked);
      setShelfChecked(newShelfChecked);
    } catch (error) {
      logger.error('Error loading switches:', error);
      setLoadError('Unable to load switching data. Please retry.');
      toast({
        title: 'Switch data unavailable',
        description: 'Unable to load current POS/Shelf selections. Please retry.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [region, currentListDate, toast]);

  useEffect(() => {
    if (currentListDate) {
      loadSwitches();
    }
  }, [currentListDate, loadSwitches]);

  const runSwitchMutation = useCallback(
    async (
      bookKey: string,
      bookTitle: string,
      switchType: SwitchType,
      checked: boolean,
      options?: { context?: 'single' | 'bulk' }
    ) => {
      const context = options?.context ?? 'single';
      setPending(switchType, bookKey, true);
      if (context === 'bulk') {
        setBulkState(switchType, true);
      }

      try {
        if (checked) {
          const { error } = await supabase
            .from('bestseller_switches')
            .upsert({
              region: region,
              book_isbn: bookKey,
              switch_type: switchType,
              list_date: currentListDate,
            }, {
              onConflict: 'region,book_isbn,switch_type'
            });

          if (error) {
            throw error;
          }
        } else {
          const { error } = await supabase
            .from('bestseller_switches')
            .delete()
            .eq('region', region)
            .eq('book_isbn', bookKey)
            .eq('switch_type', switchType)
            .eq('list_date', currentListDate);

          if (error) {
            throw error;
          }
        }

        applySwitchState(switchType, bookKey, checked);
        noteMutationResult(switchType, bookKey, 'success');
        return true;
      } catch (error) {
        logger.error('Error updating switch:', error);
        toast({
          title: 'Update failed',
          description: `Unable to update ${switchType.toUpperCase()} for ${bookTitle}. Please try again.`,
          variant: 'destructive',
        });
        noteMutationResult(switchType, bookKey, 'error');
        return false;
      } finally {
        setPending(switchType, bookKey, false);
        if (context === 'bulk') {
          setBulkState(switchType, false);
        }
      }
    },
    [region, applySwitchState, noteMutationResult, setPending, setBulkState, toast, currentListDate]
  );

  const handlePosChange = useCallback(
    async (bookKey: string, bookTitle: string, checked: boolean) => runSwitchMutation(bookKey, bookTitle, 'pos', checked),
    [runSwitchMutation]
  );

  const handleShelfChange = useCallback(
    async (bookKey: string, bookTitle: string, checked: boolean) => runSwitchMutation(bookKey, bookTitle, 'shelf', checked),
    [runSwitchMutation]
  );

  const bulkUpdateSwitches = useCallback(
    async (switchType: SwitchType, targets: BulkTarget[], checked: boolean) => {
      if (targets.length === 0) return true;

      setBulkState(switchType, true);

      try {
        // Get current session for authentication
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          throw new Error('Authentication required for bulk operations');
        }

        // Build updates array for batch endpoint
        const updates = targets.map(target => ({
          book_isbn: target.key,
          switch_type: switchType,
          checked,
        }));

        // Call batch endpoint
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(
          `${supabaseUrl}/functions/v1/batch-switch-operations`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              region: region,
              list_date: currentListDate,
              updates,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Batch update failed');
        }

        const result = await response.json();
        logger.debug('Batch update result:', result);

        // Update local state optimistically
        targets.forEach(target => {
          applySwitchState(switchType, target.key, checked);
        });

        toast({
          title: 'Success',
          description: `Updated ${switchType.toUpperCase()} for ${targets.length} book${targets.length > 1 ? 's' : ''}`,
        });

        return true;
      } catch (error) {
        logger.error('Bulk update error:', error);
        toast({
          title: 'Bulk update failed',
          description: error instanceof Error ? error.message : 'Please try again',
          variant: 'destructive',
        });
        return false;
      } finally {
        setBulkState(switchType, false);
      }
    },
    [region, applySwitchState, setBulkState, currentListDate, toast]
  );

  const clearAllSwitches = useCallback(async () => {
    setBulkState('pos', true);
    setBulkState('shelf', true);

    try {
      const { error } = await supabase
        .from('bestseller_switches')
        .delete()
        .eq('region', region)
        .eq('list_date', currentListDate)
        .in('switch_type', ['pos', 'shelf']);

      if (error) {
        throw error;
      }

      setPosChecked({});
      setShelfChecked({});
      toast({
        title: 'Cleared',
        description: 'All switching values have been cleared.',
      });
      return true;
    } catch (error) {
      logger.error('Error clearing switches:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear switches. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setBulkState('pos', false);
      setBulkState('shelf', false);
    }
  }, [region, setBulkState, toast, currentListDate]);

  return {
    posChecked,
    shelfChecked,
    loading,
    loadError,
    pendingSwitches: pendingMap,
    bulkPending,
    mutationStatus,
    retryLoad: loadSwitches,
    handlePosChange,
    handleShelfChange,
    bulkUpdateSwitches,
    clearAllSwitches,
  };
};