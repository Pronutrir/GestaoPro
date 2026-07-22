-- Registra data/hora em que cada notificação foi marcada como lida.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Backfill: notificações já lidas (antes desta coluna existir) recebem o
-- created_at como aproximação, para não ficarem sem carimbo de leitura.
UPDATE public.notifications
  SET read_at = created_at
  WHERE is_read = true AND read_at IS NULL;
