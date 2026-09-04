# NAO RODA NESTA MAQUINA (nao ha Python instalado).
# Mantido como referencia; use `node docs/atividade-v2/gerar-matriz.cjs`,
# que e um porte fiel e produz exatamente os mesmos 108 casos.
import json, itertools, csv

PERFIS = ["admin","gestor","coordenador","colaborador","visualizador","externo"]
PAPEIS = ["dono_gestor","editar_excluir","editar_tudo","editar_minhas","ver_comentar","fora_da_equipe"]
VINCULOS = ["nenhum","participante","responsavel"]

CAPS = ["canView","canComment","canEditExecucao","canEditPlanejamento",
        "canAssign","canPromover","canAssumir","canCreate","canDelete","canManageTeam"]

def nada():
    return {c: False for c in CAPS}

def decidir(perfil, papel, vinculo):
    c = nada()
    ligado = vinculo != "nenhum"
    if perfil == "admin":
        return {k: True for k in CAPS}, "1-admin", "projeto"
    if perfil == "visualizador":
        if papel == "fora_da_equipe" and not ligado:
            return c, "6-sem-acesso", "nenhum"
        c["canView"] = True
        c["canComment"] = True  # decisão de produto (04/09/2026): Visualizador comenta
        return c, "2-perfil-visualizador", "projeto" if papel != "fora_da_equipe" else "atividade_e_trilha"
    if papel == "dono_gestor":
        return {k: True for k in CAPS}, "3-dono-gestor-do-projeto", "projeto"
    if papel == "editar_excluir":
        c.update(canView=True, canComment=True, canEditExecucao=True, canEditPlanejamento=True,
                 canAssign=True, canPromover=True, canAssumir=True, canCreate=True, canDelete=True)
        return c, "4-equipe-editar-e-excluir", "projeto"
    if papel == "editar_tudo":
        c.update(canView=True, canComment=True, canEditExecucao=True, canEditPlanejamento=True,
                 canAssign=True, canPromover=True, canAssumir=True)
        return c, "4-equipe-editar-tudo", "projeto"
    if papel == "editar_minhas":
        c.update(canView=True, canComment=True, canAssumir=True)
        if ligado:
            c.update(canEditExecucao=True, canEditPlanejamento=True)
            # 04/09/2026: criar e excluir seguem a mesma regra de atribuir —
            # só o responsável, nunca o simples participante.
            sou_responsavel = (vinculo == "responsavel")
            c["canAssign"] = sou_responsavel
            c["canCreate"] = sou_responsavel
            c["canDelete"] = sou_responsavel
        return c, "4-equipe-editar-apenas-as-minhas", "projeto"
    if papel == "ver_comentar":
        c.update(canView=True, canComment=True)
        return c, "4-equipe-visualizar-e-comentar", "projeto"
    if papel == "fora_da_equipe":
        if ligado:
            c.update(canView=True, canComment=True, canEditExecucao=True)
            # 01/09/2026: responsável edita o plano e atribui na própria (e,
            # via subárvore, nas filhas — guard próprio, fora destes 108
            # casos). 04/09/2026: o mesmo responsável também cria e exclui.
            if vinculo == "responsavel":
                c.update(canEditPlanejamento=True, canAssign=True, canCreate=True, canDelete=True)
            return c, "5-ator-da-atividade", "atividade_e_trilha"
        return c, "6-sem-acesso", "nenhum"
    return c, "6-sem-acesso", "nenhum"

casos = []
for perfil, papel, vinculo in itertools.product(PERFIS, PAPEIS, VINCULOS):
    caps, passo, escopo = decidir(perfil, papel, vinculo)
    caso = {"perfil": perfil, "papelNoProjeto": papel, "vinculoComAtividade": vinculo,
            "passoQueDecidiu": passo, "escopoDeLeitura": escopo, "esperado": caps}
    if perfil == "externo":
        caso["restricoes"] = {"podeSerResponsavel": False, "veCusto": False}
    casos.append(caso)

print(f"{len(casos)} casos")
