import { useState, useEffect } from 'react';
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
 * BookCoverImage - A resilient book cover component with multiple fallbacks
 *
 * Fallback chain:
 * 1. initialSrc (Google Books URL from cache)
 * 2. Open Library cover API
 * 3. Styled placeholder with Book icon
 *
 * Handles broken images gracefully by detecting load failures
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
  const [currentSrc, setCurrentSrc] = useState<string | null>(initialSrc || null);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const [showPlaceholder, setShowPlaceholder] = useState(!initialSrc);

  // Size mappings
  const sizeStyles = {
    sm: 'w-12 h-16',
    md: 'w-20 h-28 md:w-24 md:h-32',
    lg: 'w-32 h-44 md:w-40 md:h-56',
  };

  const openLibrarySize = size === 'sm' ? 'S' : size === 'lg' ? 'L' : 'M';

  // Reset state when ISBN changes
  useEffect(() => {
    setCurrentSrc(initialSrc || null);
    setFallbackAttempted(false);
    setShowPlaceholder(!initialSrc);
  }, [isbn, initialSrc]);

  // If no initial source, try Open Library directly
  useEffect(() => {
    if (!initialSrc && !fallbackAttempted) {
      setCurrentSrc(getOpenLibraryCoverUrl(isbn, openLibrarySize));
      setShowPlaceholder(false);
    }
  }, [isbn, initialSrc, fallbackAttempted, openLibrarySize]);

  const handleImageError = () => {
    if (!fallbackAttempted) {
      // Try Open Library as fallback
      setFallbackAttempted(true);
      setCurrentSrc(getOpenLibraryCoverUrl(isbn, openLibrarySize));
    } else {
      // All sources failed, show placeholder
      setShowPlaceholder(true);
      setCurrentSrc(null);
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
