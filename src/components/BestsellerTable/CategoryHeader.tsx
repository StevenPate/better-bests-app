import React from 'react';
import { CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { CategoryHeaderProps } from './types';

/**
 * Header for a category card with collapse toggle and clear button
 */
export const CategoryHeader: React.FC<CategoryHeaderProps> = ({
  categoryName,
  bookCount,
  isOpen,
  onToggle,
  isPbnStaff,
  hasValues,
  onClearSwitching,
  isMobile
}) => {
  return (
    <CardHeader>
      <CardTitle className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <CollapsibleTrigger
            className="flex items-center gap-2 hover:bg-muted/50 p-2 rounded -m-2"
            aria-label={`${categoryName} ${bookCount} books, ${isOpen ? 'collapse' : 'expand'} category`}
            onClick={onToggle}
          >
            <div className="flex items-center gap-2">
              {categoryName}
              <Badge variant="secondary">{bookCount} books</Badge>
            </div>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </CollapsibleTrigger>
        </div>
        <div className="flex items-center gap-2">
          {isPbnStaff && hasValues && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-muted-foreground border-muted-foreground/30"
                >
                  <X className="w-4 h-4" />
                  {isMobile ? 'Clear' : 'Clear Switching Values'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all switching values?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will clear all POS checkboxes and Shelf values for all books. This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onClearSwitching}>Clear All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardTitle>
    </CardHeader>
  );
};
