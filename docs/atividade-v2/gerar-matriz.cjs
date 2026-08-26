#!/usr/bin/env node
/**
 * Gera matriz-acesso.json e matriz-acesso.csv (108 casos).
 *
 * Porte fiel de `gerar-matriz.py` — a lógica de `decidir()` é a mesma, caso a
 * caso. O `.py` fica no repositório como referência; esta versão existe porque
 * não há Python nesta máquina, e o Node o projeto já usa.
 *
 *   node docs/atividade-v2/gerar-matriz.cjs
 */
const fs = require("fs");
const path = require("path");

const PERFIS = ["admin", "gestor", "coordenador", "colaborador", "visualizador", "externo"];
const PAPEIS = ["dono_gestor", "editar_excluir", "editar_tudo", "editar_minhas", "ver_comentar", "fora_da_equipe"];
const VINCULOS = ["nenhum", "participante", "responsavel"];

const CAPS = ["canView", "canComment", "canEditExecucao", "canEditPlanejamento",
  "canAssign", "canPromover", "canAssumir", "canDelete", "canManageTeam"];

const nada = () => CAPS.reduce((o, c) => (o[c] = false, o), {});
const tudo = () => CAPS.reduce((o, c) => (o[c] = true, o), {});

/**
 * Ordem de decisão:
 *   1 admin -> tudo
 *   2 perfil Visualizador -> só leitura, encerra
 *   3 dono/gestor do projeto -> tudo no projeto
 *   4 papel na equipe
 *   5 responsável ou participante da atividade
 *   6 nada
 */
function decidir(perfil, papel, vinculo) {
  const c = nada();
  const ligado = vinculo !== "nenhum";

  // 1
  if (perfil === "admin") return [tudo(), "1-admin", "projeto"];

  // 2 — canWrite = false anula qualquer papel de projeto
  if (perfil === "visualizador") {
    if (papel === "fora_da_equipe" && !ligado) return [c, "6-sem-acesso", "nenhum"];
    c.canView = true;
    return [c, "2-perfil-visualizador", papel !== "fora_da_equipe" ? "projeto" : "atividade_e_trilha"];
  }

  // 3
  if (papel === "dono_gestor") return [tudo(), "3-dono-gestor-do-projeto", "projeto"];

  // 4
  if (papel === "editar_excluir") {
    Object.assign(c, {
      canView: true, canComment: true, canEditExecucao: true, canEditPlanejamento: true,
      canAssign: true, canPromover: true, canAssumir: true, canDelete: true,
    });
    return [c, "4-equipe-editar-e-excluir", "projeto"];
  }

  if (papel === "editar_tudo") {
    Object.assign(c, {
      canView: true, canComment: true, canEditExecucao: true, canEditPlanejamento: true,
      canAssign: true, canPromover: true, canAssumir: true,
    });
    return [c, "4-equipe-editar-tudo", "projeto"];
  }

  if (papel === "editar_minhas") {
    Object.assign(c, { canView: true, canComment: true, canAssumir: true });
    if (ligado) {
      Object.assign(c, { canEditExecucao: true, canEditPlanejamento: true });
      // só o responsável atribui, e só dentro da própria atividade
      c.canAssign = (vinculo === "responsavel");
    }
    return [c, "4-equipe-editar-apenas-as-minhas", "projeto"];
  }

  if (papel === "ver_comentar") {
    Object.assign(c, { canView: true, canComment: true });
    return [c, "4-equipe-visualizar-e-comentar", "projeto"];
  }

  // 5 — chega só pela atribuição, sem papel na equipe
  if (papel === "fora_da_equipe") {
    if (ligado) {
      Object.assign(c, { canView: true, canComment: true, canEditExecucao: true });
      return [c, "5-ator-da-atividade", "atividade_e_trilha"];
    }
    return [c, "6-sem-acesso", "nenhum"];
  }

  return [c, "6-sem-acesso", "nenhum"];
}

const casos = [];
for (const perfil of PERFIS) {
  for (const papel of PAPEIS) {
    for (const vinculo of VINCULOS) {
      const [caps, passo, escopo] = decidir(perfil, papel, vinculo);
      const caso = {
        perfil,
        papelNoProjeto: papel,
        vinculoComAtividade: vinculo,
        passoQueDecidiu: passo,
        escopoDeLeitura: escopo,
        esperado: caps,
      };
      // externo só alcança projeto ao qual está ligado
      if (perfil === "externo") caso.restricoes = { podeSerResponsavel: false, veCusto: false };
      casos.push(caso);
    }
  }
}

const AQUI = __dirname;

fs.writeFileSync(path.join(AQUI, "matriz-acesso.json"), JSON.stringify({
  descricao: "Matriz de acesso a uma atividade no Gestao Pro v2. Fixture para os testes da Fase 03 (camada de acesso) e para conferir a RLS.",
  ordemDeDecisao: [
    "1. E administrador do sistema?",
    "2. O perfil e Visualizador? (canWrite=false anula o papel de projeto; encerra aqui)",
    "3. E dono ou gestor deste projeto?",
    "4. Qual o papel na equipe do projeto?",
    "5. E responsavel ou participante desta atividade?",
    "6. Sem acesso.",
  ],
  capacidades: {
    canView: "abrir e listar a atividade",
    canComment: "comentar e mencionar",
    canEditExecucao: "status, datas reais, horas apontadas, anexos",
    canEditPlanejamento: "previsto, GUT, custo, posicao na EAP",
    canAssign: "definir responsaveis e participantes",
    canPromover: "mover do backlog para o quadro",
    canAssumir: "pegar para si atividade sem responsavel ja no quadro",
    canDelete: "excluir",
    canManageTeam: "adicionar pessoas a equipe do projeto",
  },
  totalDeCasos: casos.length,
  casos,
}, null, 2), "utf8");

const linhas = [
  ["perfil", "papelNoProjeto", "vinculoComAtividade", "passoQueDecidiu", "escopoDeLeitura", ...CAPS].join(","),
  ...casos.map((c) => [
    c.perfil, c.papelNoProjeto, c.vinculoComAtividade, c.passoQueDecidiu, c.escopoDeLeitura,
    ...CAPS.map((k) => (c.esperado[k] ? "sim" : "nao")),
  ].join(",")),
];
fs.writeFileSync(path.join(AQUI, "matriz-acesso.csv"), linhas.join("\n") + "\n", "utf8");

console.log(`${casos.length} casos`);
const porPasso = {};
for (const c of casos) porPasso[c.passoQueDecidiu] = (porPasso[c.passoQueDecidiu] || 0) + 1;
for (const k of Object.keys(porPasso).sort()) console.log(`  ${k}: ${porPasso[k]}`);
