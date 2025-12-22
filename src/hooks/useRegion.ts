// src/hooks/useRegion.ts
import { useContext } from 'react';
import { RegionContext } from '@/contexts/RegionContext';
import { ConfigError } from '@/lib/errors';

export function useRegion() {
  const context = useContext(RegionContext);

  if (!context) {
    throw new ConfigError(
      { component: 'useRegion', requiredProvider: 'RegionProvider' },
      'useRegion must be used within RegionProvider'
    );
  }

  return context;
}
