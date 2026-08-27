-- ============================================================================
-- ROLLBACK DA FATIA CIRURGICA — os 68 voltam ao item_type que tinham
--
-- Devolve cada um dos 68 ao valor de ANTES da 20260827140000. A lista traz o
-- valor original de cada id — nao le a sombra, que e outra coisa: a sombra
-- guarda o estado de antes do pacote_e_posicao (24/08), e este rollback
-- precisa do estado de antes da fatia (27/08). Sao momentos diferentes.
--
-- Para 57 deles os dois coincidem ('fase'). Para os 11 que o pacote_e_posicao
-- converteu, NAO: a sombra diz 'atividade' e o valor de antes da fatia diz
-- 'fase'. Reverter pela sombra deixaria esses 11 como 'atividade' — que e o
-- que a fatia queria — e o rollback nao teria revertido nada neles.
--
-- ATENCAO: reverter devolve os 68 ao estado de nao gerar cartao. So faz
-- sentido se a fatia tiver causado algum problema — nao como faxina.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _volta(id uuid PRIMARY KEY, item_type_antes text) ON COMMIT DROP;
INSERT INTO _volta(id, item_type_antes) VALUES
  ('1d6cbcfe-acc4-437c-886e-263d650c08d0', 'fase'),  -- 1.1.1 Kick Off com Thayanne Matos (Marketing)
  ('c930901c-8ca1-41ca-8d02-428093d468ba', 'fase'),  -- 1.1.10 Kick Off com Juliana Palácio (Posto de Enfer
  ('9ed6bd4d-81d6-429f-baa8-9434328965c7', 'fase'),  -- 1.1.11 Kick Off com Antonio Ventura (Compras)
  ('295dc7b9-645c-4ff9-8f19-5ff4bae9c5f9', 'fase'),  -- 1.1.2 Kick Off com Renata Ferreira (Comercial Part
  ('99368928-4cfc-47d4-bbb3-7b8f675d8a63', 'fase'),  -- 1.1.3 Kick Off com Rochelle Peregrino (Financeiro)
  ('75e00f18-30c6-435a-b629-deff95c2a37a', 'fase'),  -- 1.1.4 Kick Off com Ana Paula (Contratos)
  ('46e0a3dd-9033-4184-837b-86de05391a5f', 'fase'),  -- 1.1.5 Kick Off com Felipe Cavalcanti (TI)
  ('46eeb672-6050-47c7-9b81-eea622505f35', 'fase'),  -- 1.1.6 Kick Off com Fábio Lima (Recepção)
  ('b3865c0d-0f21-412d-8af7-feb311ebdd12', 'fase'),  -- 1.1.7 Kick Off com Juliana Ferreira (Rh)
  ('fc2abd62-c937-48b7-9ad6-47e062dc5c7c', 'fase'),  -- 1.1.8 Kick Off com Albertina Proença (Rh)
  ('57ed17a4-f659-4eda-8065-d7912a22b9ec', 'fase'),  -- 1.1.9 Kick Off com Virginia Moreira (Pesquisa Clín
  ('f9d4d707-99c3-4481-9744-f0eeb0aa623a', 'fase'),  -- 1.2.1 Pesquisa com Virginia Moreira (Pesquisa Clin
  ('f28e52f9-c433-4c7e-802c-d02ce3f19be7', 'fase'),  -- 1.2.10 Pesquisa com Juliana Ferreira (Rh)
  ('3d198128-6629-4925-a594-b7f69e54771f', 'fase'),  -- 1.2.11 Pesquisa com Fábio Lima (Recepção)
  ('eda695bd-cdd3-4c47-9bc2-742a57dfeeb6', 'fase'),  -- 1.2.2 Pesquisa com Thayanne Matos (Marketing)
  ('49db6b11-1d69-4150-accc-34a4d69edd6f', 'fase'),  -- 1.2.3 Pesquisa com Renata Ferreira (Comercial Part
  ('f58b529f-5973-4c9d-9e9f-0776fc671e20', 'fase'),  -- 1.2.4 Pesquisa com Rochelle Peregrino (Financeiro)
  ('551d2a12-c1eb-4cb3-a560-94a4b44f041c', 'fase'),  -- 1.2.5 Pesquisa com Juliana Palacio (Posto de Enfer
  ('9b47f263-7c48-4289-8f6f-79053af92bc0', 'fase'),  -- 1.2.6 Pesquisa com Antonio Ventura (Compras)
  ('bb663efc-5820-4e0c-8d11-97c5c7dd5893', 'fase'),  -- 1.2.7 Pesquisa com Ana Paula (Contratos)
  ('97912db5-52a6-4378-8dde-33f75bc18eeb', 'fase'),  -- 1.2.8 Pesquisa com Felipe Cavalcanti (TI)
  ('042d6c15-609c-428e-be96-5b73c17d9e36', 'fase'),  -- 1.2.9 Pesquisa com Albertina Proença (Rh)
  ('aaa12f4f-34e6-4197-83ec-23feb3ddcff5', 'fase'),  -- 1.3.1 Análise dos dados
  ('4771cb4f-c5a1-4125-96c7-50b9a8979135', 'fase'),  -- 1.3.2 Relatório de maturidade
  ('233dea3d-1ef3-4bc1-bfe0-96015cf29123', 'fase'),  -- 1.3.3 Apresentação executiva
  ('82413241-aa9c-49c8-b443-3da6f65b4acb', 'fase'),  -- 2.1.1 Treinamento com Virginia Moreira (Pesquisa C
  ('f26b6e31-3b7e-48da-a79b-7c8951d404be', 'fase'),  -- 2.1.10 Treinamento com Juliana Ferreira (Rh)
  ('eef4d4a0-d424-44dd-9948-411e20744699', 'fase'),  -- 2.1.11 Treinamento Fábio Lima (Recepção)
  ('8356fb33-2a71-40e4-b527-ca50b7fde7e1', 'fase'),  -- 2.1.12 Treinamento Daniela Veras (Marketing - Estra
  ('325c067e-aeee-4e12-b664-bd66ef0de732', 'fase'),  -- 2.1.2 Treinamento com Thayanne Matos (Marketing)
  ('0b22bddd-66a0-4e09-8c4d-15f63a7ca413', 'fase'),  -- 2.1.3 Treinamento com Renata Ferreira (Comercial P
  ('d11cdd4a-7e3d-40eb-94a1-202e153331f8', 'fase'),  -- 2.1.4 Treinamento com Rochelle Peregrino (Financei
  ('009775c7-a889-47c0-8396-37ecf5e47dc1', 'fase'),  -- 2.1.5 Treinamento com Juliana Palacio (Posto de En
  ('f0c28c04-8046-4458-86c2-01bba361993f', 'fase'),  -- 2.1.6 Treinamento com Antonio Ventura (Compras)
  ('b7500871-0d03-4c74-b3b9-a4983112e99e', 'fase'),  -- 2.1.7 Treinamento com Ana Paula (Contratos)
  ('2a19a014-876b-4dcf-b136-e30f3db7a339', 'fase'),  -- 2.1.8 Treinamento com Felipe Cavalcanti (TI)
  ('e2d5670a-0958-4215-a5e8-839a18e3429c', 'fase'),  -- 2.1.9 Treinamento com Albertina Proença (Rh)
  ('9fdc1400-2d14-41b8-b49a-c33454ebcae1', 'fase'),  -- - PESQUISA ÚNICA DE TRATAMENTO
  ('3ff80b13-17a3-4653-9418-8cf4d1e441ad', 'fase'),  -- 1.3.4 Obter aprovação do termo de imagem e voz das
  ('2af09aa1-c5ae-4448-8b5b-963604456ef9', 'fase'),  -- 2.1.2 Definir e travar versões das dependências
  ('cef446c8-f83b-4034-b4a7-48a59c63552b', 'fase'),  -- 2.1.3 Extrair paleta e tipografia do app antigo
  ('9399a783-4ff8-450f-ac36-fd75c17fdc71', 'fase'),  -- 2.1.4 Criar design system tokenizado
  ('a3c15c03-62b4-482e-b4f0-9c931a6bc96c', 'fase'),  -- 2.1.5 Documentar o design system para evolução
  ('dd756c09-ccaf-4e7e-8b7b-dbba5f8ce535', 'fase'),  -- 2.1.6 Construir cabeçalho do aplicativo
  ('92833b62-6a6f-4699-bc0e-b8b2d8523eb6', 'fase'),  -- 2.1.7 Construir navegação inferior de 4 abas
  ('fb8f4b95-3591-49a0-95d0-96be4b41b78c', 'fase'),  -- 2.1.8 Criar as 11 rotas navegáveis
  ('2e58e6b5-ff0a-4ead-8aa8-bc608bf77d85', 'fase'),  -- 2.1.9 Validar build, tipos e qualidade de código
  ('52a6b631-e358-4509-bd3d-f8d32e5a3162', 'fase'),  -- 2.1.2 Classificar os setores por criticidade opera
  ('0b417297-60fd-41e9-bcae-2bd5963305b0', 'fase'),  -- 2.1.3 Definir as ondas de mapeamento (críticos pri
  ('0d06de54-8218-44fd-a235-b690a0893693', 'fase'),  -- 2.1.5 Identificar o dono e o executor de cada proc
  ('7877071f-a73a-4ca5-ad6b-27b70e5b4d0c', 'fase'),  -- 2.1.6 Agendar as sessões com gestores e executores
  ('2ffb4360-6c9b-403f-8d52-69447309d90f', 'fase'),  -- 1.1 Instalação do GLPI (novo)
  ('5c34b97b-386f-4437-9aa2-9c21c6240168', 'fase'),  -- 1.2 Analisar as duas plataformas de IA da Pronut
  ('527cda82-2535-4608-ba4c-cf7fb7c6c5ed', 'fase'),  -- 1.3 Configuração dos Setores e classificações
  ('01660b57-5642-4049-8512-f252cc8fe1a6', 'fase'),  -- 2.1 Simulação do Ambiente em base teste
  ('cbb4c449-7d0c-4d16-b3ee-1a0801b0743b', 'fase'),  -- 2.2 Ajustes e correções
  ('74de7ffe-63fb-4d81-b668-e6b4201adc08', 'fase'),  -- 3.1 Planejar a Migração dos dados do GLPI atual 
  ('7b1f3379-8476-40d3-86b8-919f9e4bc40d', 'fase'),  -- 3.2 Efetuar Migração dos dados
  ('f02c5c0c-7b74-4f21-b5b1-617c736d0aa0', 'fase'),  -- 3.3 Simulações Finais com dados migrados
  ('c5feed07-4bfd-46f8-a3c7-d67b627b323e', 'fase'),  -- 4.1 Go Live
  ('40b7cc84-f566-46db-b68a-dc17aa7232bb', 'fase'),  -- 4.2 Acompanhamento pós produção
  ('2f676953-dd9b-4c2b-9f28-6d8fcefebbf1', 'fase'),  -- 4.4 Encerramento do Projeto
  ('980dc376-b97c-4bf0-b6c9-6f17ff6bb2c7', 'fase'),  -- 1.1.1 1.1.1 Lançamento do Projeto
  ('35b72681-5af7-412c-8561-73b5ef55197a', 'fase'),  -- 1.1.2 1.1.2 Reunião de Kickoff
  ('4e29e019-c438-4b06-8857-41819cbe66b4', 'fase'),  -- 1.1.3 1.1.3 Tasy Native
  ('78ff79d0-caeb-4ebd-9659-8db17c559eed', 'fase'),  -- 1.1.1 Lançamento do Projeto
  ('4c3083a9-260f-41d6-8e7f-3147e8c59d21', 'fase'),  -- 1.1.2 Reunião de Kickoff
  ('2c092a32-fe93-4fd3-9251-94224b8cbf64', 'fase')  -- 1.1.3 Tasy Native
;

UPDATE public.activities a
   SET item_type = v.item_type_antes
  FROM _volta v
 WHERE v.id = a.id AND a.item_type IS DISTINCT FROM v.item_type_antes;

DO $conf$
DECLARE v_fora int; v_sombra int;
BEGIN
  SELECT count(*) INTO v_fora
    FROM public.activities a JOIN _volta v ON v.id = a.id
   WHERE a.item_type IS DISTINCT FROM v.item_type_antes;
  IF v_fora > 0 THEN
    RAISE EXCEPTION '% dos 68 nao voltaram ao valor original', v_fora;
  END IF;

  -- A sombra nao pode ter sido tocada nem na ida nem na volta.
  SELECT count(*) INTO v_sombra
    FROM public.activities a JOIN _volta v ON v.id = a.id
   WHERE a.item_type_antes_congelar IS NULL;
  IF v_sombra > 0 THEN
    RAISE EXCEPTION 'a sombra sumiu em % linhas', v_sombra;
  END IF;

  RAISE NOTICE 'os 68 voltaram ao item_type anterior a fatia';
END $conf$;

-- CONFIRA E ENTAO:  COMMIT;  ou  ROLLBACK;
