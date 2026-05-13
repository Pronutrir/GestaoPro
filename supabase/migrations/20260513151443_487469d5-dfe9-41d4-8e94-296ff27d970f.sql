DROP TRIGGER IF EXISTS set_activity_created_by_trigger ON public.activities;
CREATE TRIGGER set_activity_created_by_trigger
BEFORE INSERT ON public.activities
FOR EACH ROW
EXECUTE FUNCTION public.set_activity_created_by();
