---
name: TAP no diálogo de criação
description: Todos os campos do TAP (POR QUÊ/O QUÊ/PARA QUÊ + Riscos/Premissas/Dependências) ficam no diálogo de criação do projeto. A aba TAP exibe cards visuais editáveis.
type: feature
---
A captura completa da Ficha de Abertura (TAP) acontece **no diálogo de Novo Projeto** (`AddProjectDialog`), incluindo: dados básicos, POR QUÊ (Tipo do Projeto, Objetivo, Problema, Causa Raiz), O QUÊ (Escopo, Fora do Escopo, Restrições, Requisitos Regulamentares + Premissas, Riscos e Dependências inline) e PARA QUÊ (Benefícios, Problema Solucionado).

Riscos, Premissas e Dependências adicionados na criação são persistidos diretamente nas tabelas `risks`, `assumptions` e `project_dependencies` após o `INSERT` do projeto.

A aba **TAP** (`ProjectCharter`) volta ao formato visual original: grid de cards editáveis (Tipo, Objetivo, Problema, Causa, Escopo, Fora do Escopo, Restrições, Regulamentares, Benefícios, Problema Solucionado) + cards somente leitura de identificação (Título, Líder, Prazo, Status, Descrição) + Equipe + Fases. Toggle Editar/Salvar persiste em `projects`. **Não** repete inline de Riscos/Premissas/Dependências (esses seguem nos módulos dedicados).

Tipos de projeto: estrategico, operacional, novos_negocios, parceria, melhoria_processo, inovacao.
