import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Book } from "@/types/book";
import { BookOpen, DollarSign, Hash } from "lucide-react";

interface BookCardProps {
  book: Book;
  category: string;
}

export const BookCard = ({ book, category }: BookCardProps) => {
  return (
    <Card className="group hover:shadow-elegant transition-all duration-300 hover:scale-[1.02] bg-gradient-subtle border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {book.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {book.author}
            </p>
          </div>
          <Badge 
            variant="secondary" 
            className="shrink-0 bg-primary/10 text-primary border-primary/20"
          >
            #{book.rank}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="w-4 h-4" />
            <span className="truncate">{book.publisher}</span>
          </div>
          
          {book.price && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-foreground">{book.price}</span>
            </div>
          )}
          
          {book.isbn && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Hash className="w-3 h-3" />
              <span className="font-mono">{book.isbn}</span>
            </div>
          )}
          
          <Badge variant="outline" className="text-xs bg-accent/30">
            {category}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};