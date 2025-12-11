-- Create table for storing POS and Shelf checkbox states shared across staff users
CREATE TABLE public.bestseller_switches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_isbn TEXT NOT NULL,
  book_title TEXT NOT NULL,
  switch_type TEXT NOT NULL CHECK (switch_type IN ('pos', 'shelf')),
  is_checked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  list_date DATE NOT NULL,
  UNIQUE(book_isbn, switch_type, list_date)
);

-- Enable RLS
ALTER TABLE public.bestseller_switches ENABLE ROW LEVEL SECURITY;

-- Create policies for staff users only
CREATE POLICY "Staff can view all switches" 
ON public.bestseller_switches 
FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Staff can insert switches" 
ON public.bestseller_switches 
FOR INSERT 
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Staff can update switches" 
ON public.bestseller_switches 
FOR UPDATE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Staff can delete switches" 
ON public.bestseller_switches 
FOR DELETE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_bestseller_switches_updated_at
BEFORE UPDATE ON public.bestseller_switches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();