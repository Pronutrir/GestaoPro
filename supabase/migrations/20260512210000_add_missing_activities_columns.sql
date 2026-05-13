-- Adicionar colunas faltantes na tabela activities (Lote 3 GestãoPro port)

-- Colunas de datas baseline e real (variância)
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS actual_start_date timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS actual_end_date timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS baseline_start_date timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS baseline_end_date timestamp with time zone DEFAULT NULL;

-- Colunas de bloqueio
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS blocked_since timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS blocked_days_total integer DEFAULT 0;

-- Referência ao último estágio de progresso
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS last_progress_stage_id uuid DEFAULT NULL REFERENCES workflow_stages(id);

-- Código de estrutura analítica de projeto (EAP/WBS)
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS wbs_code text DEFAULT NULL UNIQUE;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_activities_blocked_since ON activities(blocked_since) WHERE blocked_since IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_baseline_dates ON activities(baseline_start_date, baseline_end_date);
CREATE INDEX IF NOT EXISTS idx_activities_actual_dates ON activities(actual_start_date, actual_end_date);
CREATE INDEX IF NOT EXISTS idx_activities_wbs_code ON activities(wbs_code) WHERE wbs_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_last_progress_stage ON activities(last_progress_stage_id);
