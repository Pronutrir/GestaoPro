-- ============================================================================
-- MARCO NÃO TEM CÓDIGO EAP
--
-- Marco é elemento do CRONOGRAMA, não da EAP: ponto no tempo, sem duração, sem
-- horas e sem custo. A EAP decompõe TRABALHO, e a regra dos 100% do PMBOK diz
-- que os filhos somam 100% do trabalho do pai — somar um marco nessa conta é
-- ruído.
--
-- Dar código a ele deixava a numeração do trabalho com buracos: apagar
-- "1.1.1.3 Marco: TAP aprovado" abria um vão entre 1.1.1.2 e 1.1.1.4.
--
-- O marco continua ANCORADO: `parent_id` não é tocado. O que ele perde é a
-- numeração — passa a ter posição na ÁRVORE, não na EAP.
--
-- NÃO renumera os vizinhos. Os vãos que já existem continuam existindo; a
-- migration só impede que novos apareçam. Reordenar códigos de trabalho que as
-- pessoas usam para conversar (atas, documentos, e-mails) seria um estrago
-- maior que o problema — decisão de 11/08/2026.
--
-- IRREVERSÍVEL na prática: o código anterior é guardado em
-- `wbs_code_prev_marco` para auditoria, mas nada no sistema o lê de volta.
-- ============================================================================

-- Guarda o valor anterior antes de limpar. Sem isto não há como responder
-- "que código este marco tinha?" depois — e a pergunta vai aparecer.
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS wbs_code_prev_marco text;

UPDATE public.activities
   SET wbs_code_prev_marco = wbs_code
 WHERE is_milestone = true
   AND wbs_code IS NOT NULL
   AND wbs_code_prev_marco IS NULL;

UPDATE public.activities
   SET wbs_code = NULL
 WHERE is_milestone = true
   AND wbs_code IS NOT NULL;

-- Trava a regra no banco, não só na aplicação. A UI já não grava código em
-- marco, mas import antigo, script solto ou uma tela futura poderiam — e o
-- defeito voltaria calado.
--
-- NOT VALID: aplica-se ao que entrar daqui pra frente sem varrer a tabela
-- inteira agora. Os UPDATEs acima já deixaram os dados em conformidade; o
-- VALIDATE abaixo confirma sem travar escrita.
ALTER TABLE public.activities
  DROP CONSTRAINT IF EXISTS activities_marco_sem_wbs;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_marco_sem_wbs
  CHECK (NOT (COALESCE(is_milestone, false) AND wbs_code IS NOT NULL))
  NOT VALID;

ALTER TABLE public.activities
  VALIDATE CONSTRAINT activities_marco_sem_wbs;

COMMENT ON CONSTRAINT activities_marco_sem_wbs ON public.activities IS
  'Marco é do cronograma, não da EAP: ponto no tempo, sem código. Ver lib/eapModel.ts (eapCodeToPersist).';

COMMENT ON COLUMN public.activities.wbs_code_prev_marco IS
  'Código EAP que o marco tinha antes de 20260811140000. Só auditoria — nada lê de volta.';
