// Textract text detection reads a table band by band, so a wrapped cell's next line lands after the
// whole row. Regions with MIN_COLUMNS lines side by side are rebuilt from LINE geometry, one row per
// line with cells joined by " | "; everything else keeps Textract's order.

const MIN_COLUMNS = 3;
const MAX_ROW_GAP = 3;
const MAX_CELL_GAP = 1;
const SAME_BAND = 0.5;
const LOCAL_COLUMNS = 2;
const WRAP_WIDTH = 0.95;
const NUMBER = /^[\s$%*.,:()+\-–/\d]*\d[\s$%*.,:()+\-–/\d]*$/;

const pageOf = (line) => (Number.isInteger(line.Page) && line.Page > 0 ? line.Page : 1);

function boxOf(line) {
  const b = line.Geometry?.BoundingBox;
  if (!b || ![b.Left, b.Top, b.Width, b.Height].every(Number.isFinite) || b.Width <= 0 || b.Height <= 0) return null;
  return { left: b.Left, right: b.Left + b.Width, top: b.Top, bottom: b.Top + b.Height, height: b.Height };
}

const xOverlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left);
const yOverlap = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function mergeIntervals(spans) {
  const out = [];
  for (const { left, right } of [...spans].sort((a, b) => a.left - b.left)) {
    const last = out.at(-1);
    if (last && left < last.right) last.right = Math.max(last.right, right);
    else out.push({ left, right });
  }
  return out;
}

function bandsOf(items) {
  const bands = [];
  for (const item of [...items].sort((a, b) => a.top - b.top || a.left - b.left || a.index - b.index)) {
    const band = bands.at(-1);
    if (band && yOverlap(band.lines[0], item) >= SAME_BAND * Math.min(band.lines[0].height, item.height)) {
      band.lines.push(item);
      band.bottom = Math.max(band.bottom, item.bottom);
    } else {
      bands.push({ lines: [item], top: item.top, bottom: item.bottom });
    }
  }
  for (const band of bands) band.columns = mergeIntervals(band.lines).length;
  return bands;
}

function fitsColumns(band, columns) {
  return band.lines.every((line) => {
    const width = line.right - line.left;
    return columns.filter((c) => xOverlap(line, c) > 0.15 * Math.min(width, c.right - c.left)).length <= 1;
  });
}

function tableRegions(bands) {
  const regions = [];
  const used = new Set();
  const height = median(bands.flatMap((b) => b.lines.map((l) => l.height)));
  const near = (upper, lower) => lower.top - upper.bottom <= MAX_ROW_GAP * height;
  // Textract splits a justified paragraph line at its wide spaces; the lines right above or below run across the pieces.
  const inParagraph = (k) =>
    [bands[k - 1], bands[k + 1]].some(
      (b) =>
        b &&
        Math.max(b.top, bands[k].top) - Math.min(b.bottom, bands[k].bottom) <= MAX_CELL_GAP * height &&
        !fitsColumns(b, mergeIntervals(bands[k].lines))
    );
  for (let k = 0; k < bands.length; k += 1) {
    if (used.has(k) || bands[k].columns < MIN_COLUMNS || inParagraph(k)) continue;
    let columns = mergeIntervals(bands[k].lines);
    let first = k;
    let last = k;
    used.add(k);
    for (let j = k - 1; j >= 0 && !used.has(j) && near(bands[j], bands[first]) && fitsColumns(bands[j], columns); j -= 1) {
      if (bands[j].columns >= MIN_COLUMNS) columns = mergeIntervals([...columns, ...bands[j].lines]);
      used.add(j);
      first = j;
    }
    for (let j = k + 1; j < bands.length && near(bands[last], bands[j]); j += 1) {
      if (bands[j].columns >= MIN_COLUMNS) columns = mergeIntervals([...columns, ...bands[j].lines]);
      else if (!fitsColumns(bands[j], columns)) break;
      used.add(j);
      last = j;
    }
    regions.push({ bands: bands.slice(first, last + 1), columns });
  }
  return regions;
}

// Line spacing alone cannot tell a wrapped cell from the next row, so a line only continues the one
// above it when its first word would not have fit there.
function wrapPartners(lines, seedColumns) {
  const height = median(lines.map((l) => l.height));
  const columns = seedColumns.map((c) => ({ ...c }));
  for (const line of lines) {
    const hits = columns.filter((c) => xOverlap(line, c) > 0);
    if (hits.length !== 1) continue;
    hits[0].left = Math.min(hits[0].left, line.left);
    hits[0].right = Math.max(hits[0].right, line.right);
  }
  const wrapsInto = (upper, lower) => {
    if (NUMBER.test(upper.text) && NUMBER.test(lower.text)) return false;
    const spans = columns.filter((c) => xOverlap(upper, c) > 0);
    const width = Math.max(upper.right, ...spans.map((c) => c.right)) - Math.min(upper.left, ...spans.map((c) => c.left));
    const charWidth = (lower.right - lower.left) / Math.max(1, lower.text.length);
    const firstWord = lower.text.trim().split(/\s+/)[0].length;
    return upper.right - upper.left + charWidth * (firstWord + 1) >= WRAP_WIDTH * width;
  };
  const below = new Map();
  const above = new Map();
  for (const upper of lines) {
    for (const lower of lines) {
      if (lower.top <= upper.top || xOverlap(upper, lower) <= 0) continue;
      if (!below.has(upper) || lower.top < below.get(upper).top) below.set(upper, lower);
      if (!above.has(lower) || upper.top > above.get(lower).top) above.set(lower, upper);
    }
  }
  const partners = new Map();
  for (const [lower, upper] of above) {
    if (below.get(upper) === lower && lower.top - upper.bottom <= MAX_CELL_GAP * height && wrapsInto(upper, lower)) {
      partners.set(lower, upper);
    }
  }
  return partners;
}

function rowsOf({ bands, columns }) {
  const all = bands.flatMap((b) => b.lines);
  const partners = wrapPartners(all, columns);
  const margin = LOCAL_COLUMNS * median(all.map((l) => l.height));
  const covers = (lines, cols) => cols.every((column) => lines.some((line) => xOverlap(line, column) > 0));
  const localColumns = (band) =>
    columns.filter((column) =>
      all.some((line) => line.bottom > band.top - margin && line.top < band.bottom + margin && xOverlap(line, column) > 0)
    );
  const reach = (band) => all.filter((line) => line.top >= band.top && line.top < band.bottom);
  const lineAbove = (line, lines) =>
    lines
      .filter((other) => other.top < line.top && xOverlap(other, line) > 0)
      .reduce((best, other) => (best && best.top >= other.top ? best : other), null);
  const rows = [];
  for (const band of bands) {
    const row = rows.at(-1);
    const local = localColumns(band);
    const wrapped = row ? band.lines.filter((line) => row.lines.includes(partners.get(line))).length : 0;
    const prose = wrapped === band.lines.length && band.lines.some((line) => /^[a-z]/.test(line.text));
    const amounts = band.lines.filter((line) => NUMBER.test(line.text) && !/^\(.*\)$/.test(line.text.trim()));
    // A row's amount under another row's amount is two rows, never one cell. "(55%)" annotates the
    // amount above it, and "$451,25" over "0" is one amount Textract cut in two.
    const stacksNumbers =
      row &&
      band.lines.length > 1 &&
      amounts.some((line) => {
        const upper = lineAbove(line, row.lines)?.text.trim() ?? "";
        return NUMBER.test(upper) && !/,\d{0,2}$/.test(upper);
      });
    // "Label:" alone over a row of values heads that row's group rather than wrapping into its first cell.
    const heading = row?.lines.length === 1 && /:\s*$/.test(row.lines[0].text) && amounts.length > 0;
    // A band filling every column in use after a row that already does is a new row, unless all of it runs on from that row.
    const joins =
      row &&
      !stacksNumbers &&
      !heading &&
      (band.top < row.bottom || wrapped > 0) &&
      !(covers(reach(band), local) && covers(row.lines, local) && !prose);
    if (joins) {
      row.lines.push(...band.lines);
      row.bottom = Math.max(row.bottom, band.bottom);
    } else {
      rows.push({ lines: [...band.lines], bottom: band.bottom });
    }
  }
  return rows.flatMap(({ lines: row }) => {
    const cells = [];
    for (const line of [...row].sort((a, b) => a.left - b.left)) {
      const cell = cells.at(-1);
      if (cell && line.left < cell.right) {
        cell.lines.push(line);
        cell.right = Math.max(cell.right, line.right);
      } else {
        cells.push({ lines: [line], right: line.right });
      }
    }
    if (cells.length === 1) return row.sort((a, b) => a.index - b.index).map((l) => l.text);
    const text = (cell) => cell.lines.sort((a, b) => a.top - b.top || a.left - b.left).map((l) => l.text).join(" ");
    return [cells.map(text).join(" | ")];
  });
}

/** One page's tables: `indexes` into `lines` that each table replaces, and its `rows` as text. */
export function pageTables(lines) {
  const items = [];
  lines.forEach((line, index) => {
    const box = boxOf(line);
    if (box) items.push({ ...box, index, text: line.Text ?? "" });
  });
  if (items.length < MIN_COLUMNS) return [];
  return tableRegions(bandsOf(items)).map((region) => ({
    indexes: region.bands.flatMap((b) => b.lines.map((l) => l.index)).sort((a, b) => a - b),
    rows: rowsOf(region),
  }));
}

/** `lines` with each table replaced, at its first line, by one `{ Text, Page }` per row. */
export function withTableRows(lines) {
  const byPage = new Map();
  lines.forEach((line, index) => {
    const page = pageOf(line);
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(index);
  });
  const replace = new Map();
  for (const [page, indexes] of byPage) {
    for (const table of pageTables(indexes.map((i) => lines[i]))) {
      const at = table.indexes.map((i) => indexes[i]);
      at.forEach((i) => replace.set(i, null));
      replace.set(at[0], table.rows.map((Text) => ({ Text, Page: page })));
    }
  }
  if (!replace.size) return lines;
  return lines.flatMap((line, i) => (replace.has(i) ? replace.get(i) ?? [] : [line]));
}
