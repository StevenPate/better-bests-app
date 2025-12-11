import React from 'react';
import { RankChangeCellProps } from './types';
import { getRankChangeIcon, getRankChangeIconClasses, getRankChangeText, getRankChangeType } from './utils';

/**
 * Displays the rank change indicator with icon and text as a badge
 */
export const RankChangeCell: React.FC<RankChangeCellProps> = ({ book }) => {
  const Icon = getRankChangeIcon(book);
  const iconClasses = getRankChangeIconClasses(book);
  const changeText = getRankChangeText(book);
  const changeType = getRankChangeType(book);

  // NEW and DROPPED get badge styling, others get simple text
  if (changeType === 'new') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-700 dark:bg-green-950 border border-green-800 dark:border-green-900 rounded text-xs font-medium text-white dark:text-green-400">
        <Icon className="w-3.5 h-3.5" />
        {changeText}
      </div>
    );
  }

  if (changeType === 'dropped') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-700 dark:bg-red-950 border border-red-800 dark:border-red-900 rounded text-xs font-medium text-white dark:text-red-400">
        <Icon className="w-3.5 h-3.5" />
        {changeText}
      </div>
    );
  }

  // Positive changes get green badge
  if (changeType === 'up') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-700 dark:bg-green-950 border border-green-800 dark:border-green-900 rounded text-xs font-medium text-white dark:text-green-400">
        <Icon className="w-3.5 h-3.5" />
        {changeText}
      </div>
    );
  }

  // Negative changes get red badge
  if (changeType === 'down') {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-700 dark:bg-red-950 border border-red-800 dark:border-red-900 rounded text-xs font-medium text-white dark:text-red-400">
        <Icon className="w-3.5 h-3.5" />
        {changeText}
      </div>
    );
  }

  // Unchanged gets simple text
  return (
    <div className="text-sm text-muted-foreground">{changeText}</div>
  );
};
