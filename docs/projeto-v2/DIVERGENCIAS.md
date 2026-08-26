# Projeto v2 — o que foi conferido no código

Levantado em **26/08/2026**, antes de instalar o kit. Cada item foi verificado, não inferido.

---

## 1. O furo de visibilidade é MAIOR do que o kit descreve — e é P00

O kit acrescenta à fase 03 do Atividade v2 um item sobre as listas que atravessam projetos:
*"alguém que enxerga apenas a própria atividade passa a ver as irmãs pela lista global"*.

**Confirmado — e a causa não é a consulta.**

### O que a consulta faz

`app/(dashboard)/pendencias/page.tsx:95` seleciona `activities` **sem nenhum filtro de
visibilidade**, confiando inteiramente na RLS. Isso, por si, seria correto — se a RLS
recortasse.

### O que a RLS faz

```sql
-- 20260818150000_convidado_da_atividade.sql:151
CREATE POLICY ... ON public.activities
FOR SELECT TO authenticated
USING (public.can_view_project_work_v2(project_id, auth.uid()));
```

E `can_view_project_work_v2` (`:116-126`) devolve `true` para quem tem **qualquer** atividade
no projeto:

```sql
SELECT can_view_project_v2(...) OR tem_atividade_no_projeto_v2(...)
```

**Consequência:** quem entra só por atribuição recebe **todas as atividades do projeto** —
as irmãs inclusive. Não é furo da tela de Pendências; é a policy da tabela.

### Por que isso não aparecia

Dentro do projeto, a página aplica `isActivityScoped` e zera as quatro permissões — a pessoa
*vê* mas não *edita*. A restrição é de escrita, não de leitura. E o kit do Atividade v2 previa
resolver isso com as views `activity_breadcrumb` e `activity_dependency_card` (fase 02,
migration `20260826120000`), que **existem mas ainda não estão aplicadas na VM**.

### O tamanho da correção

Fechar de verdade exige apertar a policy de SELECT para o escopo:

- **projeto** — equipe, líder, gestor, admin: vê tudo (como hoje)
- **atividade e subárvore** — quem entra por atribuição: vê a própria e as descendentes
- a trilha de ancestrais vem pela view, sem as irmãs

A função `eh_descendente_de_atividade_do_ator` da fase 02 já foi escrita para isso. O que
falta é a policy consumi-la — e isso é **migration**, não ajuste de consulta.

**Por que não fiz agora:** apertar policy de SELECT em produção sem poder testar tira leitura
de gente que trabalha. É a única classe de mudança desta revisão em que o erro é silencioso
*e* imediato — a pessoa abre a tela e o item sumiu. Vai para a P00, junto com as outras
migrations, para ser aplicada com sonda antes e depois.

---

## 2. As migrations do Atividade v2 ainda não foram aplicadas

Quatro scripts pendentes na VM (`docs/atividade-v2/LEIAME.md`). Isso afeta este kit:

| Fase daqui | Depende de | Por quê |
|---|---|---|
| P05 (custo real) | fase 09 aplicada | a derivação de pai/filha no servidor é o que faz o custo subir na EAP |
| P06 (linha de base de prazo) | fase 09 aplicada | idem, para as datas |
| P09 (origem vira atividade) | fase 02 aplicada | `activity_assignees` é onde o responsável da atividade gerada vai morar |
| P11 (biblioteca) | a policy da P00 | busca entre projetos com a policy atual vaza o mesmo que Pendências |

---

## 3. Onde o kit acerta, e vale registrar

- **"Zero vazio não é zero"** é a melhor formulação do problema da faixa do topo. Um painel
  que mostra "0 atrasadas" num projeto sem datas está afirmando algo que não sabe.
- **"A linha de base existe uma vez só"** endereça uma assimetria real: o Financeiro tem base
  versionada, o Cronograma não tem nada — e por isso reprogramar apaga o atraso.
- **A P12 vir por último** está certo, e o kit diz o porquê: *"reagrupar antes de ligar só
  muda onde as ilhas ficam"*.
- **O aviso da P05** — "avise no PR que o valor da carteira vai mudar no deploy" — é o tipo de
  cuidado que evita o número novo ser lido como regressão.

---

## 4. Uma ressalva sobre a P02

O kit diz que a fase aparece duas vezes no Cronograma, *"uma sem ID e 0%, outra com ID e
100%"*. **Não confirmei** — a P01 é quem levanta isso, e não a rodei.

O que sei do inventário anterior é que existem **três fórmulas de progresso vivas** com
profundidades diferentes (`docs/atividade-v2/inventario.md`, item 4). Se a linha "0%" vier de
uma dessas fórmulas e a "100%" de outra, a causa pode ser a mesma que a fase 09 corrige — e a
P02 pode ficar menor do que parece. Vale conferir na P01 antes de reescrever a consulta.
