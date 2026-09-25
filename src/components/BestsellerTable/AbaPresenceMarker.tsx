import React from 'react';
import { cn } from '@/lib/utils';
import type { AbaPresence } from '@/hooks/useAbaRegionCounts';

interface AbaPresenceMarkerProps {
  /** Undefined when the title charted on no ABA list that week. */
  presence: AbaPresence | undefined;
  /** The region the viewer is comparing against. */
  region: string;
  className?: string;
}

/**
 * How broadly a title is charting on the ABA regional lists, and how it ranks
 * in the region the viewer picked.
 *
 * Most IPC titles chart nowhere on the ABA lists in a given week — 58 of 80 on
 * 2026-09-23 — so nothing renders in that case and the row stays quiet.
 *
 * Among the titles that DO chart, presence in any one region is close to a coin
 * flip, so both states are stated outright rather than one being implied by
 * silence. "not <REGION>" is the interesting half: selling elsewhere, not here.
 */
export const AbaPresenceMarker: React.FC<AbaPresenceMarkerProps> = ({
  presence,
  region,
  className,
}) => {
  const count = presence?.regions.size ?? 0;
  if (!presence || count === 0) return null;

  const spread = count === 1 ? '1 region' : count === 9 ? 'all 9 regions' : `${count} regions`;
  const rank = presence.rankByRegion.get(region);
  const here = rank !== undefined;

  return (
    <span className={cn('whitespace-nowrap text-xs', className)}>
      <span aria-hidden="true" className="text-muted-foreground/40">
        {' · '}
      </span>
      <span className="text-muted-foreground/70">{spread}</span>
      <span aria-hidden="true" className="text-muted-foreground/40">
        {' · '}
      </span>
      <span className={here ? 'text-muted-foreground/70' : 'text-amber-700 dark:text-amber-500'}>
        {here ? `${region} #${rank}` : `not ${region}`}
      </span>
    </span>
  );
};
