import { Sparkles, MapPin, Calendar, BookOpen } from 'lucide-react';

interface HeroSectionProps {
  year: number;
  stats?: {
    totalBooks?: number;
    totalWeeks?: number;
    totalRegions?: number;
  };
}

export function HeroSection({ year, stats }: HeroSectionProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20">
      {/* Decorative elements */}
      <div className="absolute top-4 left-8 text-primary/20">
        <Sparkles className="w-8 h-8" />
      </div>
      <div className="absolute top-12 right-12 text-primary/15">
        <Sparkles className="w-6 h-6" />
      </div>
      <div className="absolute bottom-8 left-16 text-primary/10">
        <Sparkles className="w-5 h-5" />
      </div>
      <div className="absolute bottom-16 right-24 text-primary/20">
        <Sparkles className="w-4 h-4" />
      </div>

      <div className="relative px-6 py-12 md:py-16 text-center">
        {/* Year badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium text-sm mb-6">
          <Sparkles className="w-4 h-4" />
          <span>{year}</span>
          <Sparkles className="w-4 h-4" />
        </div>

        {/* Main heading */}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
          Year in Review
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
          Celebrating the books that defined indie bookseller bestseller lists across America
        </p>

        {/* Stats row */}
        {stats && (
          <div className="flex flex-wrap justify-center gap-6 md:gap-12">
            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-background/50 border border-border/50">
              <MapPin className="w-5 h-5 text-primary" />
              <div className="text-left">
                <div className="text-2xl font-bold">{stats.totalRegions || 9}</div>
                <div className="text-xs text-muted-foreground">Regions</div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-background/50 border border-border/50">
              <Calendar className="w-5 h-5 text-primary" />
              <div className="text-left">
                <div className="text-2xl font-bold">{stats.totalWeeks || 52}</div>
                <div className="text-xs text-muted-foreground">Weeks</div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-background/50 border border-border/50">
              <BookOpen className="w-5 h-5 text-primary" />
              <div className="text-left">
                <div className="text-2xl font-bold">{stats.totalBooks?.toLocaleString() || '800+'}</div>
                <div className="text-xs text-muted-foreground">Books Ranked</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
