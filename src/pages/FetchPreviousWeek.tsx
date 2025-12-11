import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';

export default function FetchPreviousWeek() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<any>(null);

  const handleFetchPreviousWeek = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-previous-week');

      if (error) {
        throw error;
      }

      setResult(data);
      toast({
        title: "Success!",
        description: data?.message || "Previous week data fetched successfully",
      });
    } catch (error: any) {
      logger.error('Error fetching previous week:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch previous week data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackfill52Weeks = async () => {
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-52-weeks');
      if (error) throw error;
      setBackfillResult(data);
      toast({
        title: 'Backfill complete',
        description: `Processed ${data?.weeksProcessed ?? 0} weeks, ${data?.totalPositions ?? 0} positions`,
      });
    } catch (error: any) {
      logger.error('Error backfilling 52 weeks:', error);
      toast({ title: 'Error', description: error.message || 'Backfill failed', variant: 'destructive' });
    } finally {
      setIsBackfilling(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Fetch Previous Week PNBA Data</CardTitle>
          <CardDescription>
            Fetch and store the previous week's PNBA bestseller positions from 
            https://www.bookweb.org/sites/default/files/regional_bestseller/250820pn.txt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={handleBackfill52Weeks}
            disabled={isBackfilling}
            className="w-full"
          >
            {isBackfilling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Backfilling last 52 weeks...
              </>
            ) : (
              'Backfill last 52 weeks (raw + positions)'
            )}
          </Button>

          <Button 
            onClick={handleFetchPreviousWeek} 
            disabled={isLoading}
            variant="secondary"
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching...
              </>
            ) : (
              'Fetch Previous Week Data'
            )}
          </Button>
          
          {backfillResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Backfill Results</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm bg-muted p-4 rounded overflow-auto">
                  {JSON.stringify(backfillResult, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
          
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Results</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm bg-muted p-4 rounded overflow-auto">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}