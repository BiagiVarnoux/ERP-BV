-- Programa el backup automático con pg_cron: cada hora en punto.
-- La función run_scheduled_backups() decide qué empresa respaldar según su
-- interval_hours configurado (diario por defecto, personalizable por empresa).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotente: quitar job previo con el mismo nombre si existe
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'auto-company-backups';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('auto-company-backups', '0 * * * *', $$SELECT public.run_scheduled_backups();$$);
