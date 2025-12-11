import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { BookInfoCellProps } from './types';

/**
 * Displays book title, author, and ISBN with copy functionality
 */
export const BookInfoCell: React.FC<BookInfoCellProps> = ({ book, onCopyISBN }) => {
  return (
    <div className="flex flex-col">
      {book.isbn ? (
        <Link
          to={`/book/${book.isbn}`}
          className="text-base font-semibold text-primary hover:underline cursor-pointer transition-colors"
        >
          {book.title}
        </Link>
      ) : (
        <span className="text-base font-semibold">{book.title}</span>
      )}
      <span className="text-sm text-muted-foreground">{book.author}</span>
      <div className="flex items-center gap-1 mt-1">
        <span className="font-mono text-xs text-muted-foreground/70">{book.isbn}</span>
        {book.isbn && (
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 text-muted-foreground/60 hover:text-muted-foreground"
            onClick={() => onCopyISBN(book.isbn)}
            aria-label={`Copy ISBN ${book.isbn} to clipboard`}
          >
            <Copy className="w-2.5 h-2.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
