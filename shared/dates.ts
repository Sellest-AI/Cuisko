export const compareDates = (date1: Date, date2: Date): number => {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return d1.getTime() - d2.getTime();
}

export const compareDateTimes = (date1: Date, date2: Date): number => {
  const d1 = date1.getTime();
  const d2 = date2.getTime();
  return d1 - d2;
}
