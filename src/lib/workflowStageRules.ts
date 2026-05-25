export interface StagePreset {
  normalizedTitle: string;
  isFinal: boolean;
  isBlocked: boolean;
  isException: boolean;
}

function normalize(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeDisplayTitle(title: string): string {
  const normalized = normalize(title);
  const lettersOnly = normalized.replace(/[^a-z]/g, "");

  if (
    normalized === "concluida" ||
    normalized === "concluada" ||
    lettersOnly === "concluida" ||
    lettersOnly === "concluada" ||
    (lettersOnly.startsWith("conclu") && lettersOnly.endsWith("da"))
  ) {
    return "Concluída";
  }

  return title.trim();
}

export function inferStagePreset(inputTitle: string, displayOrder?: number): StagePreset {
  const normalized = normalize(inputTitle);
  const title = normalizeDisplayTitle(inputTitle || "");

  const isBacklog = displayOrder === 0 || normalized === "backlog";
  const isBlocked = /\b(bloqueio|bloquead[oa]|impedid[oa])\b/.test(normalized);
  const isException = /\b(atrasad[oa]|atraso|excecao|excecoes)\b/.test(normalized);
  const isFinalByName = /\b(final|concluid[oa]|encerrad[oa])\b/.test(normalized);

  if (isBacklog) {
    return {
      normalizedTitle: title || "Backlog",
      isFinal: false,
      isBlocked: false,
      isException: false,
    };
  }

  if (isBlocked) {
    return {
      normalizedTitle: title,
      isFinal: false,
      isBlocked: true,
      isException: false,
    };
  }

  if (isException) {
    return {
      normalizedTitle: title,
      isFinal: false,
      isBlocked: false,
      isException: true,
    };
  }

  return {
    normalizedTitle: title,
    isFinal: isFinalByName,
    isBlocked: false,
    isException: false,
  };
}
