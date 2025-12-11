import { useState } from "react";
import { Clipboard, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBestsellerSwitches } from "@/hooks/useBestsellerSwitches";
import { BestsellerList } from "@/types/bestseller";
import { generateAndDownloadCSV, CSVExportType } from "@/services/csvExporter";

interface ExportActionsProps {
  region: string;
  bestsellerData: BestsellerList;
  bookAudiences: Record<string, string>;
  isPbnStaff: boolean;
}

export const ExportActions = ({ region, bestsellerData, bookAudiences, isPbnStaff }: ExportActionsProps) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ message: '', percentage: 0 });

  // Get region-aware switching data from Supabase
  const { posChecked, shelfChecked, loading: switchesLoading, loadError: switchesError } = useBestsellerSwitches(
    bestsellerData?.date || '',
    region
  );

  const handleCSVExport = (type: CSVExportType) => {
    if (!bestsellerData) return;

    const result = generateAndDownloadCSV({
      region,
      type,
      data: bestsellerData
    });

    toast({
      title: "CSV Generated",
      description: `${result.filename} has been downloaded with ${result.bookCount} books`,
    });
  };

  const handlePDFGeneration = async (includeAllBooks: boolean) => {
    if (!bestsellerData) return;

    setPdfGenerating(true);
    setPdfProgress({ message: 'Loading PDF generator...', percentage: 0 });

    try {
      // Lazy load PDF generator (includes jsPDF + html2canvas ~220KB)
      // Only loads when user clicks PDF button, not on initial page load
      const { generateBestsellerPDF } = await import('@/services/pdfGenerator');

      setPdfProgress({ message: 'Starting PDF generation...', percentage: 0 });

      const filename = await generateBestsellerPDF({
        region,
        includeAllBooks,
        bestsellerData,
        bookAudiences,
        posChecked,
        shelfChecked,
        onProgress: (progress) => {
          setPdfProgress({
            message: progress.message,
            percentage: progress.percentage,
          });
        },
      });

      toast({
        title: "PDF Generated",
        description: `${filename} has been downloaded`,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      toast({
        title: "PDF Generation Failed",
        description: "There was an error generating the PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPdfGenerating(false);
      setPdfProgress({ message: '', percentage: 0 });
    }
  };

  const copyISBNsToClipboard = () => {
    const allISBNs = bestsellerData.categories.flatMap(category =>
      category.books.map(book => book.isbn).filter(isbn => isbn)
    );
    const isbnText = allISBNs.join('\n');
    navigator.clipboard.writeText(isbnText).then(() => {
      toast({
        title: "Copied!",
        description: `${allISBNs.length} ISBNs copied to clipboard`,
      });
    }).catch(() => {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    });
  };

  if (!isPbnStaff) return null;

  // Disable exports while switches are loading or if there's an error
  const exportsDisabled = pdfGenerating || switchesLoading || !!switchesError;

  return (
    <div className="flex flex-col gap-2 w-full">
      <Button
        onClick={copyISBNsToClipboard}
        variant="outline"
        size="sm"
        className="gap-2 w-full justify-start"
        aria-label="Copy all ISBNs to clipboard"
        title="Copy all ISBNs to clipboard"
      >
        <Clipboard className="w-4 h-4" />
        ISBNs
      </Button>
      <Button
        onClick={async () => await handlePDFGeneration(true)}
        variant="outline"
        size="sm"
        className="gap-2 w-full justify-start"
        disabled={exportsDisabled}
        aria-label="Generate PDF with all books"
        title="Generate PDF with all books"
      >
        <FileText className="w-4 h-4" />
        {pdfGenerating ? 'Generating PDF' : 'PDF (all)'}
      </Button>
      <Button
        onClick={async () => await handlePDFGeneration(false)}
        variant="outline"
        size="sm"
        className="gap-2 w-full justify-start"
        disabled={exportsDisabled}
        aria-label="Generate PDF with adds and drops only"
        title="Generate PDF with adds and drops only"
      >
        <FileText className="w-4 h-4" />
        {pdfGenerating ? 'Generating PDF' : 'PDF (adds/drops)'}
      </Button>
      <Select onValueChange={(value) => handleCSVExport(value as CSVExportType)} disabled={exportsDisabled}>
        <SelectTrigger className="w-full" aria-label="Export as CSV">
          <SelectValue placeholder="CSV" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="adds_no_drops">
            <div className="flex items-center gap-2">
              <Clipboard className="w-4 h-4" />
              Current list (no drops)
            </div>
          </SelectItem>
          <SelectItem value="adds">
            <div className="flex items-center gap-2">
              <Clipboard className="w-4 h-4" />
              Adds only
            </div>
          </SelectItem>
          <SelectItem value="drops">
            <div className="flex items-center gap-2">
              <Clipboard className="w-4 h-4" />
              Drops only
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};
