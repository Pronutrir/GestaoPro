## Alterações exclusivas para o módulo Gestão da Qualidade

### 1. Dashboard do projeto — reorganizar layout
- **Remover**: cards "Atividades por Fase" e "Evolução Semanal"
- **Manter**: Total de Atividades, Taxa de Conclusão, Atrasadas, Prazos Próximos, Alta Prioridade, Horas Registradas + cards de flags (Em dia, Atenção, Vencido) + gráfico de Distribuição por Status
- **Layout**: os 6 KPIs no topo em grid, os 3 cards de flags logo abaixo, e o gráfico de distribuição ocupando largura total — sem espaços vazios

### 2. Filtro de histórias no Kanban
- Ao abrir histórias de uma atividade, adicionar um seletor de ordenação: **Recente** (padrão) e **Antiga**, ordenando pelo `created_at` das histórias

### 3. Botão "Concluir atividade" na edição
- No `EditActivityDialog`, quando o projeto for da categoria `qualidade`, exibir um botão "Concluir Atividade" que altera o status para `completed` e preenche `completed_at` — disponível em todas as telas que usem edição de atividade (Kanban, Backlog, etc.)

### 4. Nova aba "Pendências do Dia"
- Criar uma aba ao lado do Kanban chamada **"Pendências do Dia"**
- Exibe atividades onde `end_date = hoje` **OU** `last_update_date = hoje`
- Layout em lista/tabela com título, responsável, flags, datas e ações rápidas de edição
- Exclusivo para projetos da categoria `qualidade`

---

**Nenhuma** dessas alterações afetará outros módulos ou projetos fora da categoria `qualidade`.