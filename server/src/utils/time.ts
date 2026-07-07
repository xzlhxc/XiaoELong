export function getDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function getResetDayInTimezone(date: Date, timeZone: string, resetHour: number): string {
  const shiftedDate = new Date(date.getTime() - resetHour * 60 * 60 * 1000);
  return getDateInTimezone(shiftedDate, timeZone);
}

const MYSQL_DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?$/;

export function toIsoString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const normalized = value.trim();
  const mysqlDateTime = MYSQL_DATETIME_PATTERN.exec(normalized);
  if (mysqlDateTime) {
    return new Date(`${mysqlDateTime[1]}T${mysqlDateTime[2]}${mysqlDateTime[3] ?? ""}Z`).toISOString();
  }

  return new Date(normalized).toISOString();
}
