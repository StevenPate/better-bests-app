// src/components/Footer.tsx
import { Link } from 'react-router-dom';
import { Github, ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 gap-6">
          {/* Column 1: About & Links */}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              <Link to="/about" className="hover:text-foreground transition-colors">
                About
              </Link>
              {' • '}
              <a
                href="https://github.com/StevenPate/better-bestsellers-app/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                Give Feedback
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Column 2: Data Attribution */}
          <div className="text-sm text-muted-foreground">
            <p>
              Powered by data compiled by the{' '}
              <a
                href="https://www.bookweb.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                American Booksellers Association
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          {/* Column 3: Creator & Support */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>
              Created by Steven Pate •{' '}
              <a
                href="https://ko-fi.com/stevenpate"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                Leave me a tip
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/StevenPate/better-bestsellers-app
                "
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <Github className="w-4 h-4" />
                View Source
              </a>
              <span>© 2025 Steven Pate</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
