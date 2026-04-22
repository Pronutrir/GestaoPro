import { isWeekend, format, addDays, parseISO, eachDayOfInterval } from "date-fns";

export interface Holiday { date: string; name: string; }
export interface WorkSchedule {
  weekly_hours: Record<string, number>;
  vacation_periods: { start: string; end: string }[];
}

const DOW = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

export function isHoliday(date: Date, holidays: Holiday[]): Holiday | null {
  const iso = format(date, "yyyy-MM-dd");
  return holidays.find(h => h.date === iso) || null;
}

export function isOnVacation(date: Date, schedule?: WorkSchedule): boolean {
  if (!schedule?.vacation_periods?.length) return false;
  const t = date.getTime();
  return schedule.vacation_periods.some(v => {
    const s = parseISO(v.start).getTime();
    const e = parseISO(v.end).getTime();
    return t >= s && t <= e;
  });
}

export function isWorkingDay(date: Date, holidays: Holiday[], schedule?: WorkSchedule): boolean {
  if (isHoliday(date, holidays)) return false;
  if (isOnVacation(date, schedule)) return false;
  if (schedule) {
    const dow = DOW[date.getDay()];
    return (schedule.weekly_hours[dow] ?? 0) > 0;
  }
  return !isWeekend(date);
}

/** Add `days` business days to start, skipping holidays/vacations/non-work days */
export function addBusinessDays(start: Date, days: number, holidays: Holiday[], schedule?: WorkSchedule): Date {
  let cur = start;
  let added = 0;
  while (added < days) {
    cur = addDays(cur, 1);
    if (isWorkingDay(cur, holidays, schedule)) added++;
  }
  return cur;
}

export function countBusinessDays(start: Date, end: Date, holidays: Holiday[], schedule?: WorkSchedule): number {
  if (start > end) return 0;
  return eachDayOfInterval({ start, end }).filter(d => isWorkingDay(d, holidays, schedule)).length;
}
