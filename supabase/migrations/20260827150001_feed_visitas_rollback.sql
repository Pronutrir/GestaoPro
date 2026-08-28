-- ROLLBACK — derruba a tabela de visitas.
--
-- Perde-se so a marca de "ja li". Os EVENTOS nao sao afetados: eles vem da
-- view activity_feed_events e da funcao feed_da_subarvore, criadas na fase 08.
-- O sino volta a mostrar tudo sem contador, que era o estado anterior.

DROP TABLE IF EXISTS public.activity_feed_visitas;

NOTIFY pgrst, 'reload schema';
