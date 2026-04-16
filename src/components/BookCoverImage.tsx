import { useState, useEffect, useMemo } from 'react';
import { Book } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BookCoverImageProps {
  isbn: string;
  title?: string;
  initialSrc?: string | null;
  className?: string;
  placeholderClassName?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Get Open Library cover URL for an ISBN
 * Open Library provides free book covers with good coverage
 */
function getOpenLibraryCoverUrl(isbn: string, size: 'S' | 'M' | 'L' = 'M'): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg`;
}

/**
 * Build BookSense image URLs from a 13-digit ISBN.
 * BookSense hosts covers for titles that appear on indie bestseller lists.
 * Returns null if ISBN isn't a valid 13-digit numeric string.
 */
function getBookSenseUrls(isbn: string): { large: string; small: string } | null {
  const clean = isbn.replace(/[-\s]/g, '');
  if (!/^\d{13}$/.test(clean)) return null;
  const last3 = clean.slice(10, 13);
  const mid3 = clean.slice(7, 10);
  return {
    large: `https://images.booksense.com/images/${last3}/${mid3}/${clean}.jpg`,
    small: `https://images.booksense.com/images/books/${last3}/${mid3}/FC${clean}.JPG`,
  };
}

/**
 * BookCoverImage - A resilient book cover component with multiple fallbacks
 *
 * Fallback chain:
 * 1. initialSrc (Google Books URL from cache)
 * 2. BookSense large (indie bestseller cover host)
 * 3. BookSense small (alt format, FC-prefixed)
 * 4. Open Library cover API
 * 5. Styled placeholder with Book icon
 *
 * Handles broken images gracefully by detecting load failures
 * (including Open Library's 1×1 pixel "missing" response)
 * and automatically trying the next source in the chain.
 */
export function BookCoverImage({
  isbn,
  title = 'Book cover',
  initialSrc,
  className,
  placeholderClassName,
  size = 'md',
}: BookCoverImageProps) {
  // Size mappings
  const sizeStyles = {
    sm: 'w-12 h-16',
    md: 'w-20 h-28 md:w-24 md:h-32',
    lg: 'w-32 h-44 md:w-40 md:h-56',
  };

  const openLibrarySize = size === 'sm' ? 'S' : size === 'lg' ? 'L' : 'M';

  // Build ordered source chain for this ISBN
  const sources = useMemo(() => {
    const list: string[] = [];
    if (initialSrc) list.push(initialSrc);
    const bs = getBookSenseUrls(isbn);
    if (bs) {
      list.push(bs.large);
      list.push(bs.small);
    }
    list.push(getOpenLibraryCoverUrl(isbn, openLibrarySize));
    return list;
  }, [isbn, initialSrc, openLibrarySize]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(sources.length === 0);
  const currentSrc = sources[sourceIndex] ?? null;

  // Reset when ISBN or source chain changes
  useEffect(() => {
    setSourceIndex(0);
    setShowPlaceholder(sources.length === 0);
  }, [isbn, sources]);

  const handleImageError = () => {
    if (sourceIndex + 1 < sources.length) {
      setSourceIndex(sourceIndex + 1);
    } else {
      setShowPlaceholder(true);
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    // Open Library returns a 1x1 pixel for missing covers
    // Check if image is too small (likely a placeholder)
    if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
      handleImageError();
    }
  };

  if (showPlaceholder || !currentSrc) {
    return (
      <div
        className={cn(
          sizeStyles[size],
          'bg-muted rounded-lg flex items-center justify-center border border-border',
          placeholderClassName,
          className
        )}
        role="img"
        aria-label={`No cover available for ${title}`}
      >
        <Book className="w-1/3 h-1/3 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={`Cover of ${title}`}
      className={cn(sizeStyles[size], 'object-cover rounded-lg shadow-md', className)}
      onError={handleImageError}
      onLoad={handleImageLoad}
      loading="lazy"
    />
  );
}
