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

export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
