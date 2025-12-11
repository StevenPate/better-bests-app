// src/components/BookChart/TimeRangeSelector.tsx
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TimeRangeSelectorProps } from './types';

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <Tabs
      value={value.toString()}
      onValueChange={(v) => {
        if (v === '26' || v === '52') {
          onChange(parseInt(v) as 26 | 52);
        } else {
          onChange('all');
        }
      }}
    >
      <TabsList>
        <TabsTrigger value="26">26 weeks</TabsTrigger>
        <TabsTrigger value="52">52 weeks</TabsTrigger>
        <TabsTrigger value="all">All history</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
