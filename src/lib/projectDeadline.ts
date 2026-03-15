export const parseProjectDueDate = (dateValue: string): Date => {
  const base = dateValue.slice(0, 10);
  const [year, month, day] = base.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

export const getProjectDeadlineInfo = (dateValue: string) => {
  const dueDate = parseProjectDueDate(dateValue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isOverdue = diffDays < 0;
  const isUrgent = diffDays >= 0 && diffDays <= 30;

  return { dueDate, diffDays, isOverdue, isUrgent };
};

export const formatProjectDueDate = (dateValue: string) =>
  parseProjectDueDate(dateValue).toLocaleDateString("pt-BR");
