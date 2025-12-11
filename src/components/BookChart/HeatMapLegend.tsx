// src/components/BookChart/HeatMapLegend.tsx
export function HeatMapLegend() {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-medium text-muted-foreground">Rank:</span>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="px-2 py-1 rounded bg-emerald-700 text-white font-medium text-xs">
          1-5
        </div>
        <div className="px-2 py-1 rounded bg-emerald-500 text-white font-medium text-xs">
          6-10
        </div>
        <div className="px-2 py-1 rounded bg-emerald-300 text-emerald-900 font-medium text-xs">
          11-20
        </div>
        <div className="px-2 py-1 rounded bg-muted text-muted-foreground font-medium text-xs">
          Not on list
        </div>
      </div>
    </div>
  );
}
