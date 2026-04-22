import { differenceInDays, parseISO, addDays, format } from "date-fns";

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
  const succ = new Map<string, { id: string; lag: number }[]>();
  const pred = new Map<string, { id: string; lag: number }[]>();
  valid.forEach(a => { succ.set(a.id, []); pred.set(a.id, []); });

  dependencies.forEach(d => {
    if (byId.has(d.predecessor_id) && byId.has(d.successor_id)) {
      succ.get(d.predecessor_id)!.push({ id: d.successor_id, lag: d.lag_days ?? 0 });
      pred.get(d.successor_id)!.push({ id: d.predecessor_id, lag: d.lag_days ?? 0 });
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
    const baseEs = differenceInDays(parseISO(a.start_date!), minDate);
    let earliest = baseEs;
    pred.get(id)!.forEach(p => {
      const pEf = ef.get(p.id);
      if (pEf !== undefined) earliest = Math.max(earliest, pEf + p.lag);
    });
    es.set(id, earliest);
    ef.set(id, earliest + dur.get(id)!);
  });

  const projectEnd = Math.max(...Array.from(ef.values()));

  // Backward pass
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  [...order].reverse().forEach(id => {
    const succs = succ.get(id)!;
    let latest = projectEnd;
    if (succs.length > 0) {
      latest = Math.min(...succs.map(s => (ls.get(s.id) ?? projectEnd) - s.lag));
    }
    lf.set(id, latest);
    ls.set(id, latest - dur.get(id)!);
  });

  const critical = new Set<string>();
  valid.forEach(a => {
    const slack = (ls.get(a.id) ?? 0) - (es.get(a.id) ?? 0);
    if (slack <= 0) critical.add(a.id);
  });
  return critical;
}

/**
 * When a predecessor end_date moves, push successors forward respecting lag.
 * Returns a list of updates {id, start_date, end_date} (ISO yyyy-MM-dd).
 */
export function cascadeDates(
  changedId: string,
  newEndDateISO: string,
  activities: CPMActivity[],
  dependencies: CPMDependency[]
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
        const minStart = addDays(parseISO(cur.end_date!), (d.lag_days ?? 0) + 1);
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