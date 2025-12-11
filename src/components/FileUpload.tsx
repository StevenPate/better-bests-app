import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, Link, FileText, Loader2 } from "lucide-react";

interface FileUploadProps {
  onFileContent: (content: string, isPreviousWeek?: boolean) => void;
  isLoading: boolean;
}

export const FileUpload = ({ onFileContent, isLoading }: FileUploadProps) => {
  const [url, setUrl] = useState("");
  const { toast } = useToast();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        onFileContent(content);
      };
      reader.readAsText(file);
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast({
        title: "Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use CORS proxy for external URLs
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const content = data.contents;
      onFileContent(content);
      toast({
        title: "Success",
        description: "File loaded successfully from URL",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch file from URL. Please check the URL and try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto bg-gradient-subtle border-border/50 shadow-elegant">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-2xl">
          <FileText className="w-6 h-6 text-primary" />
          Load Book Data
        </CardTitle>
        <p className="text-muted-foreground">
          Upload a text file or provide a URL to parse book bestseller data
        </p>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* URL Input */}
        <form onSubmit={handleUrlSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url" className="flex items-center gap-2">
              <Link className="w-4 h-4" />
              Load from URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="url"
                type="url"
                placeholder="https://example.com/bestsellers.txt"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1"
                disabled={isLoading}
              />
              <Button 
                type="submit" 
                variant="hero" 
                disabled={isLoading}
                className="shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Load"
                )}
              </Button>
            </div>
          </div>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        {/* File Upload */}
        <div className="space-y-2">
          <Label htmlFor="file" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Text File
          </Label>
          <Input
            id="file"
            type="file"
            accept=".txt,.text"
            onChange={handleFileUpload}
            disabled={isLoading}
            className="cursor-pointer file:cursor-pointer file:bg-primary file:text-primary-foreground file:border-0 file:rounded-md file:px-3 file:py-1 file:mr-3"
          />
        </div>
      </CardContent>
    </Card>
  );
};