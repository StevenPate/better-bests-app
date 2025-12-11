-- Create table to store book positions by week
CREATE TABLE public.book_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  isbn TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publisher TEXT,
  category TEXT NOT NULL,
  rank INTEGER NOT NULL,
  price TEXT,
  week_date DATE NOT NULL,
  list_title TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_book_positions_isbn ON public.book_positions(isbn);
CREATE INDEX idx_book_positions_week_date ON public.book_positions(week_date);
CREATE INDEX idx_book_positions_isbn_week ON public.book_positions(isbn, week_date);
CREATE INDEX idx_book_positions_category ON public.book_positions(category);

-- Create unique constraint to prevent duplicate entries
CREATE UNIQUE INDEX idx_book_positions_unique ON public.book_positions(isbn, week_date, category);

-- Enable Row Level Security
ALTER TABLE public.book_positions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Allow public read access to book positions" 
ON public.book_positions 
FOR SELECT 
USING (true);

-- Create policy to allow public insert access  
CREATE POLICY "Allow public insert access to book positions" 
ON public.book_positions 
FOR INSERT 
WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_book_positions_updated_at
BEFORE UPDATE ON public.book_positions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();