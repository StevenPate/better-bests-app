-- Update the check constraint to allow the correct switch_type values
ALTER TABLE public.bestseller_switches 
DROP CONSTRAINT IF EXISTS bestseller_switches_switch_type_check;

ALTER TABLE public.bestseller_switches 
ADD CONSTRAINT bestseller_switches_switch_type_check 
CHECK (switch_type = ANY (ARRAY['pos'::text, 'shelf'::text]));