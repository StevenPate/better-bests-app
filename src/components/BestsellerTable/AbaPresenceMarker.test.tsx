import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AbaPresenceMarker } from './AbaPresenceMarker';
import type { AbaPresence } from '@/hooks/useAbaRegionCounts';

const presence = (regions: string[], ranks: Record<string, number> = {}): AbaPresence => ({
  regions: new Set(regions),
  rankByRegion: new Map(Object.entries(ranks)),
});

describe('AbaPresenceMarker', () => {
  it('renders nothing when the title charts nowhere', () => {
    const { container } = render(<AbaPresenceMarker presence={undefined} region="PNBA" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an empty region set', () => {
    const { container } = render(<AbaPresenceMarker presence={presence([])} region="PNBA" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says "1 region" in the singular', () => {
    render(<AbaPresenceMarker presence={presence(['SIBA'], { SIBA: 4 })} region="PNBA" />);
    expect(screen.getByText(/1 region\b/)).toBeInTheDocument();
  });

  it('says "all 9 regions" at full spread', () => {
    const all = ['PNBA', 'SIBA', 'NEIBA', 'NAIBA', 'MIBA', 'MPIBA', 'GLIBA', 'CALIBAN', 'CALIBAS'];
    render(<AbaPresenceMarker presence={presence(all, { PNBA: 2 })} region="PNBA" />);
    expect(screen.getByText(/all 9 regions/)).toBeInTheDocument();
  });

  it('shows the rank in the selected region when present', () => {
    render(
      <AbaPresenceMarker
        presence={presence(['PNBA', 'SIBA', 'NEIBA'], { PNBA: 3, SIBA: 7 })}
        region="PNBA"
      />
    );
    expect(screen.getByText(/3 regions/)).toBeInTheDocument();
    expect(screen.getByText(/PNBA #3/)).toBeInTheDocument();
  });

  // The opportunity set: charting elsewhere but not here.
  it('calls out absence from the selected region', () => {
    render(
      <AbaPresenceMarker presence={presence(['SIBA', 'NEIBA'], { SIBA: 7 })} region="PNBA" />
    );
    expect(screen.getByText(/2 regions/)).toBeInTheDocument();
    expect(screen.getByText(/not PNBA/)).toBeInTheDocument();
  });

  it('follows the selected region rather than hardcoding one', () => {
    render(
      <AbaPresenceMarker presence={presence(['SIBA', 'NEIBA'], { SIBA: 7 })} region="SIBA" />
    );
    expect(screen.getByText(/SIBA #7/)).toBeInTheDocument();
    expect(screen.queryByText(/not SIBA/)).not.toBeInTheDocument();
  });
});
