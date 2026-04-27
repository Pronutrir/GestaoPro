---
name: Matriz de Risco 3×3 (Impacto × Probabilidade)
description: Matriz interativa 3x3 com eixos 30/60/90% e 5 níveis de risco
type: feature
---
Matriz de risco 3×3 (Impacto × Probabilidade) com escala 30% / 60% / 90% em ambos eixos. Resulta em 5 níveis classificados visualmente: Muito Baixa (azul), Baixa (verde), Média (amarelo), Alta (laranja), Muito Alta (vermelho).

Mapeamento Imp-Prob → Nível:
- low-low → Muito Baixa | low-medium → Baixa | low-high → Média
- medium-low → Baixa | medium-medium → Média | medium-high → Alta
- high-low → Média | high-medium → Alta | high-high → Muito Alta

Formulário "Itens do Risco" segue o padrão visual: Descrição, Responsável, Status (Monitorar/Mitigar/Aceitar/Transferir/Eliminar), matriz interativa para selecionar Nível, toggle Ocorreu (Sim/Não), Contramedida.

Persistência: campos low/medium/high em `risks.probability` e `risks.impact` (sem mudança de schema). "Ocorreu Sim" é gravado como `status='ocorreu'`. "Contramedida" é gravado em `risks.mitigation`. Card 13 do TAP (PMBOK) reflete automaticamente os riscos cadastrados com badge do nível calculado.
