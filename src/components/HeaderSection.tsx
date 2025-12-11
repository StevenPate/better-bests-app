import { Link } from "react-router-dom";
import { RefreshCw, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExportActions } from "@/components/ExportActions";
import { useIsMobile } from "@/hooks/use-mobile";
import { BestsellerList } from "@/types/bestseller";

interface HeaderSectionProps {
  user: any;
  isPbnStaff: boolean;
  isLoading: boolean;
  bestsellerData: BestsellerList | null;
  bookAudiences: Record<string, string>;
  comparisonWeek: string;
  onSignOut: () => void;
  onRefreshLists: () => void;
}

export const HeaderSection = ({
  user,
  isPbnStaff,
  isLoading,
  bestsellerData,
  bookAudiences,
  comparisonWeek,
  onSignOut,
  onRefreshLists
}: HeaderSectionProps) => {
  const isMobile = useIsMobile();

  return (
    <div className="text-center space-y-4 animate-fade-in">
      <div className="flex items-center justify-end mb-6">
        <div className="flex items-center gap-3">
          {user ? (
            <div className={`${isMobile ? "flex flex-col items-end gap-2" : "flex items-center gap-3"} bg-card/50 backdrop-blur-sm border border-border rounded-lg px-4 py-2`}>
              {isMobile ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {user.email}
                    </span>
                    {isPbnStaff && <Badge variant="secondary" className="text-xs px-2 py-0.5">PBN</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={onSignOut} className="h-7 px-2 text-xs">
                    <LogOut className="w-3 h-3 mr-1" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground font-medium truncate max-w-[160px]">
                      {user.email}
                    </span>
                    {isPbnStaff && <Badge variant="secondary" className="text-xs px-2 py-1">PBN Staff</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={onSignOut} className="h-8 px-3 text-sm hover:bg-muted/50">
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Button variant="outline" asChild className="bg-card/50 backdrop-blur-sm border-border hover:bg-card/70">
              <Link to="/auth">
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </Link>
            </Button>
          )}
        </div>
      </div>
      <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">
        Better Bestsellers
      </h1>
      <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
        Pacific Northwest Booksellers Association bestseller lists with bells and whistles
      </p>
      <p className="text-sm text-muted-foreground max-w-4xl mx-auto">
        A parsed and formatted rendering of <a href="https://www.pnba.org/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">PNBA</a> data provided by the American Booksellers Association (<a href="https://www.bookweb.org/indiebound/bestsellers/regional" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">available here</a>). We use this to track and switch our displays at <a href="https://portbooknews.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Port Book and News</a>. This info is from the most-recently published list {bestsellerData?.date && `(for the week ending `}<span className="font-bold">{bestsellerData?.date || 'loading...'}</span>{bestsellerData?.date && `)`}.
      </p>
      
      <div className={`flex items-center gap-4 justify-center ${isMobile ? 'flex-col' : ''}`}>
        <Button
          onClick={onRefreshLists}
          disabled={isLoading}
          variant="secondary"
          className="gap-2"
          aria-label={isLoading ? "Refreshing bestseller lists..." : "Refresh latest bestseller lists"}
          title={isLoading ? "Refreshing..." : "Refresh latest bestseller lists"}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Latest Lists
        </Button>
        {bestsellerData && (
          <ExportActions 
            bestsellerData={bestsellerData}
            bookAudiences={bookAudiences}
            isPbnStaff={isPbnStaff}
          />
        )}
      </div>
    </div>
  );
};