type BacklinksDateRange = {
  dateFrom: string;
  dateTo: string;
};

export function buildBacklinksDateRange(now: Date): BacklinksDateRange {
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dateToUtc = new Date(todayUtc);
  dateToUtc.setUTCDate(dateToUtc.getUTCDate() - 1);

  const fromYear = dateToUtc.getUTCFullYear() - 1;
  const fromMonth = dateToUtc.getUTCMonth();
  const lastDayOfFromMonth = new Date(
    Date.UTC(fromYear, fromMonth + 1, 0),
  ).getUTCDate();
  const dateFromUtc = new Date(
    Date.UTC(
      fromYear,
      fromMonth,
      Math.min(dateToUtc.getUTCDate(), lastDayOfFromMonth),
    ),
  );

  return {
    dateFrom: dateFromUtc.toISOString().slice(0, 10),
    dateTo: dateToUtc.toISOString().slice(0, 10),
  };
}
