// src/pages/About.tsx
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Github, ExternalLink, Heart, Book, Sparkles } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Footer } from '@/components/Footer';

export default function About() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Simple header with home link and theme toggle */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="relative">
              <Book className="w-8 h-8 text-primary" />
              <Sparkles className="w-4 h-4 text-accent absolute -top-1 -right-1" />
            </div>
            <span className="text-xl font-bold">Better Bestsellers</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Hero Section */}
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-4xl font-bold">About Better Bestsellers</h1>
            <p className="text-lg text-muted-foreground">
              Enhanced regional independent bookstore bestseller tracking
            </p>
          </div>

          {/* Project Overview */}
          <Card>
            <CardHeader>
              <CardTitle>What is Better Bestsellers?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Better Bestsellers is an enhanced view of regional independent bookstore
                bestseller lists. It takes data from various regional bookseller associations
                and provides some ways of looking at trends across regions and time.
              </p>
              <p>
                Originally built for Port Book and News in Port Angeles, Washington, this
                tool helps bookstore staff quickly identify new titles hitting the lists,
                books that have dropped off, and generate reports for ordering and shelving.
              </p>
            </CardContent>
          </Card>

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle>Features</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 list-disc list-inside">
                <li>
                  <strong>Multi-Region Support:</strong> Track bestsellers across 8 regional
                  associations (PNBA, CALIBAN, CALIBAS, GLIBA, MPIBA, NAIBA, NEIBA, SIBA)
                </li>
                <li>
                  <strong>Add/Drop Tracking:</strong> Instantly see which books are new to
                  the lists and which have fallen off
                </li>
                <li>
                  <strong>Audience Filtering:</strong> Filter by Adult, Teen, or Children's
                  audiences
                </li>
                <li>
                  <strong>Regional Heat Maps:</strong> Visualization showing
                  book performance across regions over time
                </li>
                <li>
                  <strong>Export Tools:</strong> Generate PDFs for shelf management and CSVs
                  for retail systems
                </li>
                <li>
                  <strong>Search & Compare:</strong> Search across titles and compare
                  different weeks
                </li>
                <li>
                  <strong>Historical Data:</strong> Track individual book performance over
                  time
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Data Source */}
          <Card>
            <CardHeader>
              <CardTitle>Data Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                All bestseller data is compiled by the{' '}
                <a
                  href="https://www.bookweb.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  American Booksellers Association
                  <ExternalLink className="w-3 h-3" />
                </a>{' '}
                and its regional affiliates. This application parses and enhances that
                data to provide additional insights and tools.
              </p>
              <p className="text-sm text-muted-foreground">
                Better Bestsellers is not affiliated with or endorsed by the American
                Booksellers Association or any regional bookseller association.
              </p>
            </CardContent>
          </Card>

          {/* Technology */}
          <Card>
            <CardHeader>
              <CardTitle>Technology</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                This application is built with modern web technologies and is fully
                open-source:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>React 18 with TypeScript for type-safe UI development</li>
                <li>Vite for fast builds and development experience</li>
                <li>Supabase for database and authentication</li>
                <li>shadcn/ui component library built on Radix UI</li>
                <li>Tailwind CSS for styling</li>
                <li>React Query for data fetching and caching</li>
              </ul>
              <div className="mt-4">
                <a
                  href="https://github.com/StevenPate/book-parse-hub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <Github className="w-5 h-5" />
                  View Source Code on GitHub
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Creator */}
          <Card>
            <CardHeader>
              <CardTitle>Creator</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Better Bestsellers is created and maintained by{' '}
                <a
                  href="https://github.com/StevenPate"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Steven Pate
                  <ExternalLink className="w-3 h-3" />
                </a>
                , a developer and book enthusiast based in the Pacific Northwest.
              </p>
              <p>
                If you find this tool useful, consider supporting its development:
              </p>
              <a
                href="https://ko-fi.com/stevenpate"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <Heart className="w-4 h-4" />
                Leave me a tip on Ko-fi
              </a>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Feedback & Support</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Have a bug report, feature request, or question? Please open an issue on
                GitHub:
              </p>
              <a
                href="https://github.com/StevenPate/book-parse-hub/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <Github className="w-5 h-5" />
                Submit Feedback on GitHub
              </a>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Site Footer */}
      <Footer />
    </div>
  );
}
