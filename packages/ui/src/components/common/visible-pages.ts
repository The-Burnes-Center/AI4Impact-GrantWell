/** Pages to show: the first, the last, and the current page with two on each side; null marks a gap. */
export function visiblePages(current: number, total: number): (number | null)[] {
  const pages: (number | null)[] = [];
  for (let page = 1; page <= total; page++) {
    if (page === 1 || page === total || Math.abs(page - current) <= 2) pages.push(page);
    else if (pages[pages.length - 1] !== null) pages.push(null);
  }
  return pages;
}
