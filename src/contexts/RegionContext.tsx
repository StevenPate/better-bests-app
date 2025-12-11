// src/contexts/RegionContext.tsx
import { createContext, ReactNode, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Region } from '@/types/region';
import { REGIONS, DEFAULT_REGION, getRegionByAbbreviation } from '@/config/regions';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';

interface RegionContextValue {
  currentRegion: Region;
  regions: Region[];
  switchRegion: (regionAbbr: string, preservePath?: boolean) => void;
}

export const RegionContext = createContext<RegionContextValue | undefined>(undefined);

interface RegionProviderProps {
  children: ReactNode;
}

export function RegionProvider({ children }: RegionProviderProps) {
  const { region } = useParams<{ region: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Get current region from URL or default to PNBA
  const regionFromUrl = getRegionByAbbreviation(region?.toUpperCase() || '');
  const currentRegion = regionFromUrl || getRegionByAbbreviation(DEFAULT_REGION)!;

  // Handle invalid region slugs by redirecting to default region
  useEffect(() => {
    if (region && !regionFromUrl) {
      logger.warn('[RegionContext] Invalid region slug, redirecting to default:', region);
      toast({
        title: 'Invalid Region',
        description: `Region "${region}" not found. Redirecting to ${DEFAULT_REGION}.`,
        variant: 'destructive',
      });
      navigate(`/region/${DEFAULT_REGION.toLowerCase()}${location.pathname.replace(`/region/${region}`, '')}${location.search}${location.hash}`, { replace: true });
    }
  }, [region, regionFromUrl, navigate, location.pathname, location.search, location.hash, toast]);

  const switchRegion = (newRegionAbbr: string, preservePath = true) => {
    // Short-circuit if already on this region to avoid unnecessary navigation
    if (newRegionAbbr === currentRegion.abbreviation) {
      logger.debug('[RegionContext] Already on region:', newRegionAbbr);
      return;
    }

    logger.debug('[RegionContext] Switching region to:', newRegionAbbr);

    // Save preference to localStorage
    localStorage.setItem('preferred-region', newRegionAbbr);

    if (preservePath) {
      // Preserve current path structure, query string, and hash when switching regions
      const currentPath = location.pathname.replace(`/region/${region}`, '');
      navigate(`/region/${newRegionAbbr.toLowerCase()}${currentPath}${location.search}${location.hash}`);
    } else {
      navigate(`/region/${newRegionAbbr.toLowerCase()}`);
    }
  };

  const value: RegionContextValue = {
    currentRegion,
    regions: REGIONS.filter(r => r.is_active),
    switchRegion,
  };

  return (
    <RegionContext.Provider value={value}>
      {children}
    </RegionContext.Provider>
  );
}
