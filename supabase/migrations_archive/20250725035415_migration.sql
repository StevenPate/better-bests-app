-- Create table to store audience information for ISBNs
CREATE TABLE public.book_audiences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  isbn TEXT NOT NULL UNIQUE,
  audience CHAR(1) NOT NULL CHECK (audience IN ('A', 'T', 'C')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.book_audiences ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (anyone can read and update)
CREATE POLICY "Anyone can view book audiences" 
ON public.book_audiences 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert book audiences" 
ON public.book_audiences 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update book audiences" 
ON public.book_audiences 
FOR UPDATE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_book_audiences_updated_at
BEFORE UPDATE ON public.book_audiences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_book_audiences_isbn ON public.book_audiences(isbn);