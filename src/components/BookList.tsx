import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ParsedBookData } from "@/types/book";
import { Search, Download, Filter, Calendar, BookOpen, Copy, TrendingUp, TrendingDown, Minus, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logger } from '@/lib/logger';

interface BookListProps {
  data: ParsedBookData;
}

export const BookList = ({ data }: BookListProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { toast } = useToast();

  const allBooks = data.categories.flatMap(category => 
    category.books.map(book => ({ ...book, categoryName: category.name }))
  );

  const filteredCategories = data.categories.map(category => ({
    ...category,
    books: category.books.filter(book => {
      const matchesSearch = 
        book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.author.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.publisher.toLowerCase().includes(searchTerm.toLowerCase());
      
      return matchesSearch;
    })
  })).filter(category => {
    const matchesCategory = !selectedCategory || category.name === selectedCategory;
    return matchesCategory && category.books.length > 0;
  });

  const totalFilteredBooks = filteredCategories.reduce((sum, category) => sum + category.books.length, 0);

  const handleExport = () => {
    const exportData = {
      metadata: {
        title: data.title,
        date: data.date,
        totalBooks: allBooks.length,
        categories: data.categories.length,
        exportedAt: new Date().toISOString()
      },
      books: allBooks
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `books-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (isbn: string) => {
    try {
      await navigator.clipboard.writeText(isbn);
      toast({
        title: "Copied!",
        description: `ISBN ${isbn} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const getRankChangeIcon = (book: any) => {
    logger.debug('Book data for icon:', { title: book.title, isNew: book.isNew, rankChange: book.rankChange });
    if (book.isNew) {
      return <Star className="w-4 h-4 text-yellow-500" />;
    }
    if (book.rankChange && book.rankChange > 0) {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    }
    if (book.rankChange && book.rankChange < 0) {
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    }
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getRankChangeText = (book: any) => {
    if (book.isNew) {
      return "NEW";
    }
    if (book.rankChange && book.rankChange !== 0) {
      return `${book.rankChange > 0 ? '+' : ''}${book.rankChange}`;
    }
    return "—";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <Card className="bg-gradient-primary text-primary-foreground shadow-book">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <BookOpen className="w-6 h-6" />
                {data.title}
              </CardTitle>
              {data.date && (
                <p className="text-primary-foreground/80 flex items-center gap-2 mt-2">
                  <Calendar className="w-4 h-4" />
                  Week ended {data.date}
                </p>
              )}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{allBooks.length}</div>
              <div className="text-sm text-primary-foreground/80">Total Books</div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Controls */}
      <Card className="bg-gradient-subtle border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search books, authors, or publishers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Export */}
            <Button onClick={handleExport} variant="elegant" className="shrink-0">
              <Download className="w-4 h-4" />
              Export JSON
            </Button>
          </div>

          {/* Category Filter */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filter by category:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedCategory === null ? "default" : "outline"}
                className="cursor-pointer hover:bg-primary/90 transition-colors"
                onClick={() => setSelectedCategory(null)}
              >
                All ({allBooks.length})
              </Badge>
              {data.categories.map(category => (
                <Badge
                  key={category.name}
                  variant={selectedCategory === category.name ? "default" : "outline"}
                  className="cursor-pointer hover:bg-primary/90 transition-colors"
                  onClick={() => setSelectedCategory(category.name)}
                >
                  {category.name} ({category.books.length})
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="space-y-8">
        <div className="mb-4">
          <p className="text-muted-foreground">
            Showing {totalFilteredBooks} of {allBooks.length} books
            {selectedCategory && ` in ${selectedCategory}`}
            {searchTerm && ` matching "${searchTerm}"`}
          </p>
        </div>

        {filteredCategories.map((category) => (
          <Card key={category.name} className="bg-gradient-subtle border-border/50">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                {category.name}
                <Badge variant="secondary" className="ml-2">
                  {category.books.length} books
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Rank</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Publisher</TableHead>
                    <TableHead className="w-20">Change</TableHead>
                    <TableHead>ISBN</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {category.books.map((book) => (
                    <TableRow key={book.rank} className="hover:bg-muted/50 h-10">
                      <TableCell className="font-medium py-2">#{book.rank}</TableCell>
                      <TableCell className="font-medium py-2">{book.title}</TableCell>
                      <TableCell className="py-2">{book.author}</TableCell>
                      <TableCell className="py-2">{book.publisher}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          {getRankChangeIcon(book)}
                          <span className="text-xs font-medium">
                            {getRankChangeText(book)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm py-2">
                        <div className="flex items-center gap-2">
                          {book.isbn}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-muted"
                            onClick={() => copyToClipboard(book.isbn)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}

        {filteredCategories.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <div className="text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No books found</p>
                <p>Try adjusting your search terms or category filter</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};