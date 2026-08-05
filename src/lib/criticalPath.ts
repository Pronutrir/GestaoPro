import { differenceInDays, parseISO, addDays, format } from "date-fns";
import { isWorkingDay, type Holiday, type WorkSchedule } from "./workCalendar";

export interface CPMActivity {
  id: string;
  start_date: string | null;
  end_date: string | null;
}

export interface CPMDependency {
  predecessor_id: string;
  successor_id: string;
  lag_days: number | null;
  dependency_type?: string;
}

/**
 * Identify critical path activities. An activity is on the critical path when
 * its early-start equals its late-start (zero slack). Activities without dates
 * are skipped.
 */
export function calculateCriticalPath(
  activities: CPMActivity[],
  dependencies: CPMDependency[]
): Set<string> {
  const valid = activities.filter(a => a.start_date && a.end_date);
  if (valid.length === 0) return new Set();

  const byId = new Map(valid.map(a => [a.id, a]));
  const succ = new Map<string, { id: string; lag: number; type: string }[]>();
  const pred = new Map<string, { id: string; lag: number; type: string }[]>();
  valid.forEach(a => { succ.set(a.id, []); pred.set(a.id, []); });

  dependencies.forEach(d => {
    if (byId.has(d.predecessor_id) && byId.has(d.successor_id)) {
      const type = d.dependency_type || "finish_to_start";
      succ.get(d.predecessor_id)!.push({ id: d.successor_id, lag: d.lag_days ?? 0, type });
      pred.get(d.successor_id)!.push({ id: d.predecessor_id, lag: d.lag_days ?? 0, type });
    }
  });

  const dur = new Map<string, number>();
  valid.forEach(a => {
    const days = Math.max(differenceInDays(parseISO(a.end_date!), parseISO(a.start_date!)), 1);
    dur.set(a.id, days);
  });

  // Forward pass — earliest finish (in days from epoch min)
  const minDate = valid.reduce((m, a) => {
    const d = parseISO(a.start_date!);
    return d < m ? d : m;
  }, parseISO(valid[0].start_date!));

  const ef = new Map<string, number>();
  const es = new Map<string, number>();

  const forwardConstraint = (type: string, esPred: number, durPred: number, durCur: number, lag: number) => {
    switch (type) {
      case "start_to_start":
        return esPred + lag;
      case "finish_to_finish":
        return esPred + durPred + lag - durCur;
      case "start_to_finish":
        return esPred + lag - durCur;
      case "finish_to_start":
      default:
        return esPred + durPred + lag;
    }
  };

  // Topological order (Kahn)
  const inDeg = new Map<string, number>();
  valid.forEach(a => inDeg.set(a.id, pred.get(a.id)!.length));
  const queue = valid.filter(a => inDeg.get(a.id) === 0).map(a => a.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    succ.get(id)!.forEach(s => {
      inDeg.set(s.id, (inDeg.get(s.id) ?? 0) - 1);
      if (inDeg.get(s.id) === 0) queue.push(s.id);
    });
  }

  order.forEach(id => {
    const a = byId.get(id)!;
    const durCur = dur.get(id)!;
    const baseEs = differenceInDays(parseISO(a.start_date!), minDate);
    let earliest = baseEs;
    pred.get(id)!.forEach(p => {
      const esPred = es.get(p.id);
      if (esPred === undefined) return;
      const durPred = dur.get(p.id) ?? 1;
      const candidate = forwardConstraint(p.type, esPred, durPred, durCur, p.lag);
      earliest = Math.max(earliest, candidate);
    });
    es.set(id, earliest);
    ef.set(id, earliest + durCur);
  });

  const projectEnd = Math.max(...Array.from(ef.values()));

  // Backward pass
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  const backwardConstraint = (type: string, lsSucc: number, durPred: number, durSucc: number, lag: number) => {
    switch (type) {
      case "start_to_start":
        return lsSucc - lag;
      case "finish_to_finish":
        return lsSucc + durSucc - durPred - lag;
      case "start_to_finish":
        return lsSucc + durSucc - lag;
      case "finish_to_start":
      default:
        return lsSucc - durPred - lag;
    }
  };

  [...order].reverse().forEach(id => {
    const succs = succ.get(id)!;
    const durPred = dur.get(id)!;
    let latestStart = projectEnd - durPred;
    if (succs.length > 0) {
      latestStart = Math.min(...succs.map(s => {
        const lsSucc = ls.get(s.id) ?? (projectEnd - (dur.get(s.id) ?? 1));
        const durSucc = dur.get(s.id) ?? 1;
        return backwardConstraint(s.type, lsSucc, durPred, durSucc, s.lag);
      }));
    }
    ls.set(id, latestStart);
    lf.set(id, latestStart + durPred);
  });

  const critical = new Set<string>();
  valid.forEach(a => {
    // Quem ficou fora da ordenação topológica está num ciclo: es/ls indefinidos.
    // Antes o `?? 0` fazia a folga dar zero e a atividade entrava como crítica
    // em silêncio. Ciclo é defeito de cadastro, não caminho crítico.
    const esA = es.get(a.id);
    const lsA = ls.get(a.id);
    if (esA === undefined || lsA === undefined) return;
    if (lsA - esA <= 0) critical.add(a.id);
  });
  return critical;
}

export interface ScheduleSlack {
  /** Folga total em dias. Zero = caminho crítico. */
  totalSlack: Map<string, number>;
  /** Atividades no caminho crítico. */
  critical: Set<string>;
  /** Envolvidas em dependência circular — não têm cálculo confiável. */
  cycles: Set<string>;
  /** Têm dependência mas ficam fora do cálculo por falta de data. */
  semData: Set<string>;
  /**
   * Dependências que as datas atuais desrespeitam (a sucessora começa antes do
   * que a ligação permite). A ligação existe, mas o cronograma a ignora.
   */
  violadas: { predecessor_id: string; successor_id: string; dias: number }[];
}

/**
 * Mesma travessia do caminho crítico, devolvendo também a folga de cada
 * atividade e o que o cálculo teve de descartar. Sem isto, a tela não tem como
 * distinguir "sem folga" de "não foi possível calcular".
 */
export function calculateScheduleSlack(
  activities: CPMActivity[],
  dependencies: CPMDependency[]
): ScheduleSlack {
  const vazio: ScheduleSlack = {
    totalSlack: new Map(), critical: new Set(),
    cycles: new Set(), semData: new Set(), violadas: [],
  };

  const valid = activities.filter(a => a.start_date && a.end_date);
  if (valid.length === 0) return vazio;

  const byId = new Map(valid.map(a => [a.id, a]));
  const todos = new Set(activities.map(a => a.id));

  // Com dependência mas sem data: sai do cálculo. Se for uma predecessora, a
  // sucessora perde a restrição e o caminho crítico sai menor que a realidade.
  const semData = new Set<string>();
  dependencies.forEach(d => {
    [d.predecessor_id, d.successor_id].forEach(id => {
      if (todos.has(id) && !byId.has(id)) semData.add(id);
    });
  });

  const succ = new Map<string, { id: string; lag: number; type: string }[]>();
  const pred = new Map<string, { id: string; lag: number; type: string }[]>();
  valid.forEach(a => { succ.set(a.id, []); pred.set(a.id, []); });

  dependencies.forEach(d => {
    if (byId.has(d.predecessor_id) && byId.has(d.successor_id)) {
      const type = d.dependency_type || "finish_to_start";
      succ.get(d.predecessor_id)!.push({ id: d.successor_id, lag: d.lag_days ?? 0, type });
      pred.get(d.successor_id)!.push({ id: d.predecessor_id, lag: d.lag_days ?? 0, type });
    }
  });

  const dur = new Map<string, number>();
  valid.forEach(a => {
    dur.set(a.id, Math.max(differenceInDays(parseISO(a.end_date!), parseISO(a.start_date!)), 1));
  });

  const minDate = valid.reduce((m, a) => {
    const d = parseISO(a.start_date!);
    return d < m ? d : m;
  }, parseISO(valid[0].start_date!));

  const fwd = (type: string, esPred: number, durPred: number, durCur: number, lag: number) => {
    switch (type) {
      case "start_to_start": return esPred + lag;
      case "finish_to_finish": return esPred + durPred + lag - durCur;
      case "start_to_finish": return esPred + lag - durCur;
      default: return esPred + durPred + lag;
    }
  };
  const bwd = (type: string, lsSucc: number, durPred: number, durSucc: number, lag: number) => {
    switch (type) {
      case "start_to_start": return lsSucc - lag;
      case "finish_to_finish": return lsSucc + durSucc - durPred - lag;
      case "start_to_finish": return lsSucc + durSucc - lag;
      default: return lsSucc - durPred - lag;
    }
  };

  const inDeg = new Map<string, number>();
  valid.forEach(a => inDeg.set(a.id, pred.get(a.id)!.length));
  const queue = valid.filter(a => inDeg.get(a.id) === 0).map(a => a.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    succ.get(id)!.forEach(s => {
      inDeg.set(s.id, (inDeg.get(s.id) ?? 0) - 1);
      if (inDeg.get(s.id) === 0) queue.push(s.id);
    });
  }

  // Sobrou de fora da ordenação => está num ciclo.
  const ordenadas = new Set(order);
  const cycles = new Set(valid.filter(a => !ordenadas.has(a.id)).map(a => a.id));

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  order.forEach(id => {
    const a = byId.get(id)!;
    const durCur = dur.get(id)!;
    let earliest = differenceInDays(parseISO(a.start_date!), minDate);
    pred.get(id)!.forEach(p => {
      const esPred = es.get(p.id);
      if (esPred === undefined) return;
      earliest = Math.max(earliest, fwd(p.type, esPred, dur.get(p.id) ?? 1, durCur, p.lag));
    });
    es.set(id, earliest);
    ef.set(id, earliest + durCur);
  });

  if (ef.size === 0) return { ...vazio, cycles, semData };
  const projectEnd = Math.max(...Array.from(ef.values()));

  const ls = new Map<string, number>();
  [...order].reverse().forEach(id => {
    const succs = succ.get(id)!;
    const durPred = dur.get(id)!;
    let latestStart = projectEnd - durPred;
    if (succs.length > 0) {
      latestStart = Math.min(...succs.map(s => {
        const lsSucc = ls.get(s.id) ?? (projectEnd - (dur.get(s.id) ?? 1));
        return bwd(s.type, lsSucc, durPred, dur.get(s.id) ?? 1, s.lag);
      }));
    }
    ls.set(id, latestStart);
  });

  const totalSlack = new Map<string, number>();
  const critical = new Set<string>();
  valid.forEach(a => {
    const esA = es.get(a.id), lsA = ls.get(a.id);
    if (esA === undefined || lsA === undefined) return; // ciclo
    const slack = lsA - esA;
    totalSlack.set(a.id, slack);
    if (slack <= 0) critical.add(a.id);
  });

  // Violação: comparar as datas REAIS com o que a ligação exige. Usa a data
  // cadastrada, não o ES calculado — o ponto é justamente que as duas divergem.
  const violadas: ScheduleSlack["violadas"] = [];
  dependencies.forEach(d => {
    const p = byId.get(d.predecessor_id), s = byId.get(d.successor_id);
    if (!p || !s) return;
    if (cycles.has(p.id) || cycles.has(s.id)) return;
    const lag = d.lag_days ?? 0;
    const pIni = differenceInDays(parseISO(p.start_date!), minDate);
    const pDur = dur.get(p.id) ?? 1;
    const sIni = differenceInDays(parseISO(s.start_date!), minDate);
    const sDur = dur.get(s.id) ?? 1;
    const exigido = fwd(d.dependency_type || "finish_to_start", pIni, pDur, sDur, lag);
    if (sIni < exigido) {
      violadas.push({ predecessor_id: p.id, successor_id: s.id, dias: exigido - sIni });
    }
  });

  return { totalSlack, critical, cycles, semData, violadas };
}

/**
 * When a predecessor end_date moves, push successors forward respecting lag.
 * Returns a list of updates {id, start_date, end_date} (ISO yyyy-MM-dd).
 */
export function cascadeDates(
  changedId: string,
  newEndDateISO: string,
  activities: CPMActivity[],
  dependencies: CPMDependency[],
  holidays: Holiday[] = [],
  schedule?: WorkSchedule
): { id: string; start_date: string; end_date: string }[] {
  const updates: { id: string; start_date: string; end_date: string }[] = [];
  const byId = new Map(activities.map(a => [a.id, { ...a }]));
  byId.set(changedId, { ...byId.get(changedId)!, end_date: newEndDateISO });

  const visited = new Set<string>();
  const queue: string[] = [changedId];

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const cur = byId.get(id);
    if (!cur?.end_date) continue;

    dependencies
      .filter(d => d.predecessor_id === id)
      .forEach(d => {
        const succ = byId.get(d.successor_id);
        if (!succ?.start_date || !succ?.end_date) return;
        let minStart = addDays(parseISO(cur.end_date!), (d.lag_days ?? 0) + 1);
        // Pula dias não-úteis (feriados, fins de semana, férias)
        if (holidays.length > 0 || schedule) {
          while (!isWorkingDay(minStart, holidays, schedule)) {
            minStart = addDays(minStart, 1);
          }
        }
        const curStart = parseISO(succ.start_date);
        if (minStart > curStart) {
          const shift = differenceInDays(minStart, curStart);
          const newStart = format(minStart, "yyyy-MM-dd");
          const newEnd = format(addDays(parseISO(succ.end_date), shift), "yyyy-MM-dd");
          byId.set(succ.id, { ...succ, start_date: newStart, end_date: newEnd });
          updates.push({ id: succ.id, start_date: newStart, end_date: newEnd });
          queue.push(succ.id);
        }
      });
  }

  return updates;
}