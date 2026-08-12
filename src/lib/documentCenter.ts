/**
 * CENTRAL DE DOCUMENTOS — apoio à fusão das antigas abas "Páginas" e
 * "Documentos".
 *
 * O sistema tinha duas abas fazendo metades do mesmo trabalho: uma escrevia e
 * não distribuía; a outra distribuía e não aceitava nem arquivo — só URL
 * colada. Aqui ficam as regras compartilhadas pelos dois lados: limites e
 * nomenclatura de upload, e a leitura de arquivo em bucket privado.
 */

/** Extensão a partir do nome, para o ícone e o rótulo do arquivo. */
export function fileExtension(name: string): string {
  const m = name.match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toLowerCase() : "";
}

/** Tamanho legível — "2,4 MB" em vez de 2516582. */
export function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(v < 10 && u > 0 ? 1 : 0).replace(".", ",")} ${units[u]}`;
}

/**
 * Limite de upload. Não é arbitrário: o Supabase Storage tem teto por
 * requisição, e arquivo grande em documento de projeto quase sempre é o
 * sintoma errado (vídeo, backup) — o lugar certo é um link.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Link de leitura de um documento.
 *
 * O bucket `project-files` é privado, então a URL não é fixa: pede-se ao
 * Supabase uma URL assinada de validade curta, e só quem tem sessão e enxerga o
 * projeto consegue gerá-la. Documentos antigos (link externo colado) não têm
 * `storage_path` e continuam abrindo direto.
 */
export async function resolveFileUrl(
  storage: {
    from: (b: string) => {
      createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null }>;
    };
  },
  doc: { file_url: string; storage_path?: string | null },
): Promise<string> {
  if (!doc.storage_path) return doc.file_url;
  const { data } = await storage.from("project-files").createSignedUrl(doc.storage_path, 300);
  return data?.signedUrl ?? doc.file_url;
}

/**
 * É link externo? `storage_path` nulo já era o critério usado na edição para
 * decidir se a URL pode ser trocada à mão — aqui vira função para as duas
 * telas perguntarem a mesma coisa do mesmo jeito.
 */
export function ehLink(doc: { storage_path?: string | null; file_type?: string | null }): boolean {
  return !doc.storage_path;
}

/** Domínio de uma URL, para a lista dizer PARA ONDE o link aponta. */
export function dominioDe(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Nome sugerido a partir do endereço.
 *
 * Uma URL externa não informa nome — está escrito no comentário da tela de
 * edição, e digitá-lo à mão era o atrito que sobrava. O último trecho do
 * caminho costuma ser o título ("rdc-15-2012" → "Rdc 15 2012"); sem caminho
 * útil, o domínio serve.
 */
export function nomeSugeridoDaUrl(url: string): string {
  const limpo = url.trim();
  if (!limpo) return "";
  let u: URL;
  try {
    u = new URL(limpo);
  } catch {
    return "";
  }
  const ultimo = u.pathname.split("/").filter(Boolean).pop() || "";
  // Tira a extensão e troca separadores por espaço: o caminho é feito para
  // máquina, o nome é para gente.
  const base = decodeURIComponent(ultimo)
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[-_+]+/g, " ")
    .trim();
  if (!base) return u.hostname.replace(/^www\./, "");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** URL utilizável? Só http(s) — evita `javascript:` e caminho relativo. */
export function urlValida(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Nome de arquivo seguro para o storage: sem acento, espaço nem barra. */
export function safeFileName(name: string): string {
  // ̀-ͯ é o bloco de marcas de acento que o NFD separa da letra.
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
}
