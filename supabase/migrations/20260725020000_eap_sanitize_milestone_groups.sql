-- Saneamento pre-requisito da 20260722160000 (regra de aninhamento por papel).
--
-- Ensaio em producao (transacao + rollback) mostrou que a base tem 4 marcos que
-- SAO agrupadores — tem de 5 a 9 filhos cada:
--   "Instalação dos Equipamentos" (5), "Conquistas e pontuação" (9),
--   "Suporte e notícias" (5), "Progresso do paciente" (8)
--
-- A 150000 forca marco -> 'atividade' (folha), e a 160000 rejeita folha com
-- filhos. Sem este saneamento, qualquer UPDATE nesses 4 itens ou em seus ~27
-- filhos passaria a ser recusado pelo trigger com erro cru.
--
-- Decisao: deixam de ser marco e viram Pacote, preservando a hierarquia.
-- Roda DEPOIS da 150000 e ANTES da 160000.

UPDATE public.activities a
   SET is_milestone = false,
       item_type    = 'pacote'
 WHERE COALESCE(a.is_milestone, false)
   AND EXISTS (SELECT 1 FROM public.activities c WHERE c.parent_id = a.id);

-- Rede de seguranca: qualquer outro item que agrupe mas nao seja agrupador
-- (exceto historia_usuario, tratada como agrupador valido na 160000) vira
-- Pacote. Cobre linhas criadas entre a normalizacao e esta migration.
UPDATE public.activities a
   SET is_milestone = false,
       item_type    = 'pacote'
 WHERE EXISTS (SELECT 1 FROM public.activities c WHERE c.parent_id = a.id)
   AND a.item_type <> 'historia_usuario'
   AND (COALESCE(a.is_milestone, false) OR a.item_type NOT IN ('fase', 'pacote'));
