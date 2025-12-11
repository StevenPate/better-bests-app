-- Create inventory_cache table for caching book inventory data
CREATE TABLE public.inventory_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  isbn TEXT NOT NULL UNIQUE,
  on_hand INTEGER NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT 'Port Book & News',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.inventory_cache ENABLE ROW LEVEL SECURITY;

-- Create policies for inventory_cache
CREATE POLICY "PBN Staff can view inventory data" 
ON public.inventory_cache 
FOR SELECT 
USING (has_role(auth.uid(), 'pbn_staff'::app_role));

CREATE POLICY "PBN Staff can manage inventory data" 
ON public.inventory_cache 
FOR ALL 
USING (has_role(auth.uid(), 'pbn_staff'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_inventory_cache_isbn ON public.inventory_cache(isbn);
CREATE INDEX idx_inventory_cache_last_updated ON public.inventory_cache(last_updated);