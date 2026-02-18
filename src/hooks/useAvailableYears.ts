import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function fetchAvailableYears(): Promise<number[]> {
  const { data, error } = await supabase
    .from('book_performance_metrics')
    .select('year')
    .order('year', { ascending: true });

  if (error) throw error;

  const years = [...new Set(data.map((row: { year: number }) => row.year))];
  return years;
}

export function useAvailableYears() {
  return useQuery({
    queryKey: ['availableYears'],
    queryFn: fetchAvailableYears,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
