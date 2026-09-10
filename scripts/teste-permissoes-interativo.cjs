#!/usr/bin/env node

/**
 * Validação Manual Interativa: 32 Testes de Permissões
 * 
 * Este script guia você passo a passo através de 32 testes
 * e coleta os resultados interativamente.
 * 
 * Pré-requisito: Estar logado em http://localhost:3000
 */

const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

const ACCOUNTS = {
  'e2e-resp': { email: 'e2e-resp@e2e.local', role: 'Editar apenas as minhas (can_edit_own)', responsabilidades: 'P1, P2.1, Subatividade A' },
  'e2e-del': { email: 'e2e-del@e2e.local', role: 'Criar e excluir (can_edit, can_create, can_delete, can_move)', responsabilidades: 'P2' },
  'e2e-tudo': { email: 'e2e-tudo@e2e.local', role: 'Editar tudo (can_edit, can_move)', responsabilidades: 'Atividade Solta' },
  'e2e-ver': { email: 'e2e-ver@e2e.local', role: 'Visualizar e comentar (todas falsas)', responsabilidades: 'Nenhuma' },
  'e2e-part': { email: 'e2e-part@e2e.local', role: 'Participante (não responsável)', responsabilidades: 'Subatividade B (participante)' },
  'e2e-fora': { email: 'e2e-fora@e2e.local', role: 'Fora da equipe', responsabilidades: 'Nenhuma (não enxerga projeto)' },
  'e2e-pendente': { email: 'e2e-pendente@e2e.local', role: 'Convite Pendente (NEW)', responsabilidades: 'N/A' },
};

const SENHAUNI = 'E2eTeste!2026#Acesso';

const ATIVIDADES = {
  'P1': '53c268f6-27a9-4a02-b783-ffb2350a6879',
  'P1.1': '7002e389-1c18-433b-b4a0-2fb397da653e',
  'P2': '9ef6d99c-8e3d-4908-8b57-57cdc3670d57',
  'P2.1': '7f6728e2-08a2-4d63-9d74-730f4b227ea5',
  'Subatividade B': '4772bf00-f125-4a83-abc6-d06b6d16610d',
};

const PROJECT_ID = 'cbca8b9c-279b-4aba-adc8-e6fb5cfedef0';
const BASE_URL = 'https://gestaopro.pronutrir.com.br';

const TESTES = [
  {
    bloco: 'L.1',
    nome: 'Backlog Menu ⋯ (Controle de Permissão)',
    itens: [
      {
        id: 'L.1.1',
        acao: 'Logue como e2e-resp, abra Backlog, localize P1.1 (seu ramo), clique ⋯',
        esperado: 'Menu oferece: Concluir · Adicionar · Editar · Abrir · Mover · Arquivar (nenhum cinzento)',
        resposta: null,
      },
      {
        id: 'L.1.2',
        acao: 'Mesmo usuário (e2e-resp), clique ⋯ em P2 (fora do seu ramo)',
        esperado: 'Menu oferece as mesmas ações, mas Arquivar e Mover aparecem grisealhos ou desabilitados',
        resposta: null,
      },
      {
        id: 'L.1.3',
        acao: 'Tente clicar "Concluir tarefa" em P2 (fora do escopo)',
        esperado: 'Zero requisições ao servidor, zero mensagem, nada muda no banco (falha silenciosa)',
        resposta: null,
      },
      {
        id: 'L.1.4',
        acao: 'Logout, logue como e2e-tudo, abra Backlog, clique ⋯ em qualquer atividade',
        esperado: 'Menu completo, nenhuma ação grisealha',
        resposta: null,
      },
      {
        id: 'L.1.5',
        acao: 'Logout, logue como e2e-ver, abra Backlog, clique ⋯ em qualquer atividade',
        esperado: 'Menu vazio ou apenas "Comentar" (sem Concluir, Editar, Mover, Arquivar)',
        resposta: null,
      },
      {
        id: 'L.1.6',
        acao: 'Logout, logue como e2e-pendente, tente acessar Backlog',
        esperado: 'Redireciona para onboarding ou avisa "Convite pendente — clique para aceitar"',
        resposta: null,
      },
    ],
  },
  {
    bloco: 'L.2',
    nome: 'Backlog: Lote com Permissão',
    itens: [
      {
        id: 'L.2.1',
        acao: 'Logue como e2e-resp, selecione P1.1 + P2 (checkbox), clique "Mudar Status"',
        esperado: 'Toast: "1 atualizada · 1 ficou de fora — sem permissão" (P2 rejeitada silenciosamente)',
        resposta: null,
      },
      {
        id: 'L.2.2',
        acao: 'Selecione apenas Atividade Solta (resp=e2e-tudo), tente Arquivar',
        esperado: 'Bloqueado: botão cinza ou toast "Sem permissão sobre seleção"',
        resposta: null,
      },
      {
        id: 'L.2.3',
        acao: 'Logout, logue como e2e-tudo, selecione todas as atividades, clique Arquivar',
        esperado: 'Toast: "5 atualizadas" (todas arquivadas)',
        resposta: null,
      },
      {
        id: 'L.2.4',
        acao: 'Logout, logue como e2e-ver, tente selecionar checkbox em qualquer atividade',
        esperado: 'Checkboxes não aparecem ou estão desabilitados (visualizador não seleciona lote)',
        resposta: null,
      },
    ],
  },
  {
    bloco: 'L.3',
    nome: 'Kanban: Arrasto com Permissão',
    itens: [
      {
        id: 'L.3.1',
        acao: 'Logue como e2e-resp, abra Kanban, arraste card P1.1 entre colunas',
        esperado: 'Move sem erro, pai (P1) acompanha coluna',
        resposta: null,
      },
      {
        id: 'L.3.2',
        acao: 'Mesmo usuário, tente arrastar P2 (fora escopo) entre colunas',
        esperado: 'Bloqueado (animação de rejeição) ou move + reverte',
        resposta: null,
      },
      {
        id: 'L.3.3',
        acao: 'Logout, logue como e2e-tudo, arraste qualquer card',
        esperado: 'Move livremente',
        resposta: null,
      },
      {
        id: 'L.3.4',
        acao: 'Logout, logue como e2e-ver, tente arrastar qualquer card',
        esperado: 'Cards não são draggable (cursor não muda, arrasto não funciona)',
        resposta: null,
      },
    ],
  },
  {
    bloco: 'L.4',
    nome: 'Convite Pendente (Estado Novo)',
    itens: [
      {
        id: 'L.4.1',
        acao: 'Logout, logue como e2e-pendente',
        esperado: 'Redireciona para tela de onboarding ou exibe aviso "Você foi convidado — [Aceitar] [Recusar]"',
        resposta: null,
      },
      {
        id: 'L.4.2',
        acao: 'Se houver botão "Aceitar", clique nele',
        esperado: 'Aceita convite, redireciona para dashboard, login completo',
        resposta: null,
      },
      {
        id: 'L.4.3',
        acao: 'Se não aceitou, tente acessar diretamente /project/cbca8b9c',
        esperado: 'Bloqueado com 403 ou redireciona para convite',
        resposta: null,
      },
      {
        id: 'L.4.4',
        acao: 'Abra Backlog (se conseguir acessar)',
        esperado: 'Menu vazio ou aviso "Convite pendente"',
        resposta: null,
      },
      {
        id: 'L.4.5',
        acao: 'Abra Kanban (se conseguir acessar)',
        esperado: 'Sem cards ou aviso "Convite pendente"',
        resposta: null,
      },
    ],
  },
  {
    bloco: 'L.5',
    nome: 'Onboarding (Aceitar/Recusar Convite)',
    itens: [
      {
        id: 'L.5.1',
        acao: 'Tela de convite pendente deve exibir nome do projeto e [Aceitar] [Recusar]',
        esperado: 'Projeto, descrição curta e dois botões de ação',
        resposta: null,
      },
      {
        id: 'L.5.2',
        acao: 'Clique em "Aceitar"',
        esperado: 'Redirecionado para dashboard/projeto, sessão atualizada',
        resposta: null,
      },
      {
        id: 'L.5.3',
        acao: 'Atualize a página (F5)',
        esperado: 'Continua logado (sessão persistida)',
        resposta: null,
      },
      {
        id: 'L.5.4',
        acao: 'Volte a fazer logout com e2e-pendente e aceite novamente, depois clique "Recusar"',
        esperado: 'Logout do convite, usuário não está mais na equipe do projeto ou fica bloqueado',
        resposta: null,
      },
    ],
  },
  {
    bloco: 'L.6',
    nome: 'Lixeira: Excluir Permanente (Permissão)',
    itens: [
      {
        id: 'L.6.1',
        acao: 'Logout, logue como e2e-del, abra Lixeira, localize um item, clique "Excluir permanente"',
        esperado: 'Item excluído do banco permanentemente (sem soft-delete)',
        resposta: null,
      },
      {
        id: 'L.6.2',
        acao: 'Logout, logue como e2e-resp, abra Lixeira, procure "Excluir permanente"',
        esperado: 'Botão ausente, cinza ou desabilitado (não consegue excluir)',
        resposta: null,
      },
      {
        id: 'L.6.3',
        acao: 'Logout, logue como e2e-tudo, abra Lixeira',
        esperado: 'Botão "Excluir permanente" visível e ativo (pode excluir)',
        resposta: null,
      },
      {
        id: 'L.6.4',
        acao: 'Logout, logue como e2e-ver, abra Lixeira',
        esperado: 'Sem botão de excluir (visualizador só vê, não age)',
        resposta: null,
      },
    ],
  },
  {
    bloco: 'L.7',
    nome: 'Tela /atividade/:id (Validação Anterior)',
    itens: [
      {
        id: 'L.7.1',
        acao: 'Logout, logue como e2e-resp, abra Backlog, clique em P1.1 (seu ramo)',
        esperado: 'Tela /atividade exibe botões: Editar, Concluir, Mover, Arquivar (todos habilitados)',
        resposta: null,
      },
      {
        id: 'L.7.2',
        acao: 'Volte ao Backlog, clique em P2 (fora do seu ramo)',
        esperado: 'Tela /atividade: botões Editar, Concluir, Mover, Arquivar **ausentes** (ocultos)',
        resposta: null,
      },
      {
        id: 'L.7.3',
        acao: 'Logout, logue como e2e-ver, abra qualquer atividade via Backlog',
        esperado: 'Tela /atividade: botão "Comentar" visível, demais botões ausentes',
        resposta: null,
      },
      {
        id: 'L.7.4',
        acao: 'Logout, logue como e2e-pendente, tente acessar /atividade/:id diretamente',
        esperado: 'Bloqueado 403 ou redireciona para convite',
        resposta: null,
      },
    ],
  },
];

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                 VALIDAÇÃO MANUAL: 32 TESTES DE PERMISSÕES                        ║');
  console.log('║                     GestãoPro — 10 de setembro de 2026                           ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════════╝\n');
  
  console.log('📋 INSTRUÇÕES:');
  console.log(`  1. Abra ${BASE_URL}/project/${PROJECT_ID} no navegador`);
  console.log('  2. Leia cada instrução abaixo');
  console.log('  3. Execute a ação no navegador');
  console.log('  4. Responda aqui: [S]im (passou) ou [N]ão (falhou)\n');
  console.log('⚠️  Contas (login direto, sem e-mail):');
  Object.entries(ACCOUNTS).forEach(([key, acc]) => {
    const resp = acc.responsabilidades ? ` → ${acc.responsabilidades}` : '';
    console.log(`  • ${key}: ${acc.email} (${acc.role})${resp}`);
  });
  console.log(`  Senha (todas): ${SENHAUNI}\n`);
  console.log('📍 Atividades:');
  Object.entries(ATIVIDADES).forEach(([nome, id]) => {
    console.log(`  • ${nome}: ${BASE_URL}/project/${PROJECT_ID}/atividade/${id}`);
  });
  
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  
  for (const bloco of TESTES) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`${bloco.bloco} — ${bloco.nome}`);
    console.log(`${'═'.repeat(80)}\n`);
    
    for (const teste of bloco.itens) {
      totalTests++;
      console.log(`\n[${teste.id}]`);
      console.log(`  Ação: ${teste.acao}`);
      console.log(`  Esperado: ${teste.esperado}`);
      
      let resposta = '';
      while (!['S', 'N', 's', 'n'].includes(resposta)) {
        resposta = await question(`  Resultado: [S]im ou [N]ão? `);
      }
      
      const passou = ['S', 's'].includes(resposta);
      if (passou) {
        passed++;
        console.log(`  ✅ PASSOU`);
      } else {
        failed++;
        console.log(`  ❌ FALHOU`);
      }
      
      teste.resposta = passou ? 'PASS' : 'FAIL';
    }
  }
  
  // Resumo
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`RESUMO FINAL`);
  console.log(`${'═'.repeat(80)}\n`);
  console.log(`Total de testes: ${totalTests}`);
  console.log(`✅ Passaram: ${passed} (${((passed/totalTests)*100).toFixed(1)}%)`);
  console.log(`❌ Falharam: ${failed} (${((failed/totalTests)*100).toFixed(1)}%)`);
  console.log(`\n`);
  
  // Detalhes de falhas
  if (failed > 0) {
    console.log(`TESTES QUE FALHARAM:\n`);
    TESTES.forEach(bloco => {
      const falhas = bloco.itens.filter(t => t.resposta === 'FAIL');
      if (falhas.length > 0) {
        console.log(`${bloco.bloco}:`);
        falhas.forEach(t => {
          console.log(`  • ${t.id}: ${t.acao}`);
        });
        console.log('');
      }
    });
  }
  
  // Salvar resultado
  const resultado = {
    data: new Date().toISOString(),
    totalTests,
    passed,
    failed,
    percentual: ((passed / totalTests) * 100).toFixed(1),
    testes: TESTES,
  };
  
  fs.writeFileSync('/tmp/teste-permissoes-resultado.json', JSON.stringify(resultado, null, 2));
  console.log(`\n📁 Resultado salvo em: /tmp/teste-permissoes-resultado.json`);
  console.log(`\n✨ Validação concluída!\n`);
  
  rl.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Erro:', err);
  rl.close();
  process.exit(1);
});
