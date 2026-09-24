import React from 'react';
import { cn } from '@/lib/utils';
import { normalizeIsbn13, vendorLinks } from '@/lib/vendorLinks';

interface VendorLinksProps {
  /** The title's ISBN; hyphens and spaces are fine. */
  isbn: string | null | undefined;
  className?: string;
}

/**
 * Subtle inline links that open a title in the trade's lookup tools, meant to
 * sit immediately after the ISBN copy button. Renders nothing for titles
 * without a valid ISBN-13.
 */
export const VendorLinks: React.FC<VendorLinksProps> = ({ isbn, className }) => {
  const isbn13 = normalizeIsbn13(isbn);
  const links = vendorLinks(isbn);

  if (!isbn13 || links.length === 0) return null;

  return (
    <span className={cn('inline-flex items-center gap-x-1.5 whitespace-nowrap', className)}>
      {links.map((link, index) => (
        <React.Fragment key={link.label}>
          {index > 0 && (
            <span aria-hidden="true" className="text-[0.6rem] text-muted-foreground/40">
              ·
            </span>
          )}
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${isbn13} in ${link.label}`}
            // "inline-flex" opts this link out of the global content-link
            // color rule in index.css; these are meant to read as muted.
            className="inline-flex text-xs text-muted-foreground/70 underline underline-offset-2 transition-colors hover:text-foreground"
          >
            {link.label}
          </a>
        </React.Fragment>
      ))}
    </span>
  );
};
