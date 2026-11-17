import path from "node:path";
import PDFDocument from "pdfkit";
import { CROWN_PATHS, MISSING_OUTLINE_HEX, ROOT_X, TOOTH_BOX, TOOTH_COLOR_HEX, rootPath } from "@/domain/dental/tooth-geometry";
import type { Block, ChartTooth, SummaryDocument } from "@/domain/summary/summary";

/**
 * Draws the summary for the animal's owner as a PDF (A4). It only draws the
 * blocks `buildSummary` made; every text is already resolved, so the PDF and
 * the print view always say the same.
 *
 * The letters come from `assets/fonts` (DejaVu Sans knows the Hungarian ő and
 * ű); the built-in PDF fonts do not.
 */

const PAGE = { width: 595.28, height: 841.89, margin: 48 } as const;
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
const BOTTOM = PAGE.height - PAGE.margin;

/** The `--color-*` tokens of `globals.css`, as hex values for the PDF. */
const COLOR = {
  ink: "#14212a",
  muted: "#556873",
  line: "#d5dee3",
  primary: "#0f766e",
  accent: "#e1f2f0",
  notice: "#fff4d6",
  noticeLine: "#e0ad00",
} as const;

const FONT = { regular: "regular", bold: "bold" } as const;

export interface PdfOptions {
  /** The photos by attachment id: JPEG or PNG bytes. A photo without bytes is left out. */
  images?: ReadonlyMap<string, Uint8Array>;
  /** Folder with `DejaVuSans.ttf` and `DejaVuSans-Bold.ttf`. */
  fontsDir?: string;
  /** The title in the document properties. */
  title?: string;
  /** Compress the content (default). Only a test turns it off, to read what was written. */
  compress?: boolean;
}

export function defaultFontsDir(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "assets", "fonts");
}

/** The summary as the bytes of a PDF file. */
export function renderSummaryPdf(summary: SummaryDocument, options: PdfOptions = {}): Promise<Buffer> {
  const fontsDir = options.fontsDir ?? defaultFontsDir();
  const regularFont = path.join(fontsDir, "DejaVuSans.ttf");
  const boldFont = path.join(fontsDir, "DejaVuSans-Bold.ttf");

  // The default font is replaced at once, so the built-in fonts (separate data files) are never read.
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    font: regularFont,
    info: { Title: options.title ?? "", Producer: "VetDent" },
    compress: options.compress ?? true,
  });
  doc.registerFont(FONT.regular, regularFont);
  doc.registerFont(FONT.bold, boldFont);

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const painter = new Painter(doc, options.images ?? new Map());
  for (const block of summary.blocks) painter.draw(block);
  doc.end();
  return finished;
}

class Painter {
  constructor(
    private readonly doc: PDFKit.PDFDocument,
    private readonly images: ReadonlyMap<string, Uint8Array>,
  ) {
    doc.fillColor(COLOR.ink);
  }

  /** Starts a new page unless `height` still fits on this one. */
  private ensure(height: number): void {
    if (this.doc.y + height > BOTTOM) this.doc.addPage();
  }

  private text(text: string, options: { font?: string; size?: number; color?: string; width?: number; x?: number; gap?: number; align?: "left" | "center" | "right" } = {}): void {
    const doc = this.doc;
    doc.font(options.font ?? FONT.regular).fontSize(options.size ?? 10.5).fillColor(options.color ?? COLOR.ink);
    const width = options.width ?? CONTENT_WIDTH;
    const x = options.x ?? PAGE.margin;
    // A paragraph is not cut in the middle of a line: make room for it first.
    this.ensure(doc.heightOfString(text, { width }) + (options.gap ?? 0));
    doc.text(text, x, doc.y, { width, align: options.align ?? "left" });
    if (options.gap) doc.y += options.gap;
  }

  draw(block: Block): void {
    const doc = this.doc;
    switch (block.type) {
      case "organization": {
        this.text(block.name, { font: FONT.bold, size: 13, color: COLOR.primary });
        for (const line of block.lines) this.text(line, { size: 9, color: COLOR.muted });
        const y = doc.y + 6;
        doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + CONTENT_WIDTH, y).lineWidth(0.75).strokeColor(COLOR.line).stroke();
        doc.y = y + 14;
        return;
      }
      case "title":
        this.text(block.text, { font: FONT.bold, size: 22, gap: 2 });
        this.text(block.subtitle, { size: 11, color: COLOR.muted, gap: 12 });
        return;
      case "notice": {
        const height = doc.font(FONT.regular).fontSize(10).heightOfString(block.text, { width: CONTENT_WIDTH - 20 }) + 16;
        this.ensure(height + 10);
        const top = doc.y;
        doc.roundedRect(PAGE.margin, top, CONTENT_WIDTH, height, 4).fillAndStroke(COLOR.notice, COLOR.noticeLine);
        doc.fillColor(COLOR.ink).text(block.text, PAGE.margin + 10, top + 8, { width: CONTENT_WIDTH - 20 });
        doc.y = top + height + 10;
        return;
      }
      case "facts":
        this.facts(block.rows);
        return;
      case "heading":
        this.ensure(60);
        doc.y += 10;
        this.text(block.text, { font: FONT.bold, size: 14, color: COLOR.primary, gap: 4 });
        return;
      case "paragraph":
        this.text(block.text, { gap: 6 });
        return;
      case "chart":
        this.chart(block);
        return;
      case "list":
        for (const item of block.items) {
          const title = item.detail ? `${item.name} (${item.detail})` : item.name;
          const height =
            doc.font(FONT.bold).fontSize(10.5).heightOfString(`${title} – ${item.teeth}`, { width: CONTENT_WIDTH }) +
            doc.font(FONT.regular).fontSize(9.5).heightOfString(item.explanation, { width: CONTENT_WIDTH });
          this.ensure(height + 8);
          doc.font(FONT.bold).fontSize(10.5).fillColor(COLOR.ink).text(`${title} – ${item.teeth}`, PAGE.margin, doc.y, { width: CONTENT_WIDTH });
          doc.font(FONT.regular).fontSize(9.5).fillColor(COLOR.muted).text(item.explanation, PAGE.margin, doc.y, { width: CONTENT_WIDTH });
          doc.y += 6;
        }
        return;
      case "table":
        this.table(block.columns, block.rows);
        return;
      case "highlight": {
        const height = doc.font(FONT.bold).fontSize(12).heightOfString(block.text, { width: CONTENT_WIDTH - 24 }) + 20;
        this.ensure(height + 10);
        doc.y += 6;
        const top = doc.y;
        doc.roundedRect(PAGE.margin, top, CONTENT_WIDTH, height, 6).fill(COLOR.accent);
        doc.fillColor(COLOR.primary).text(block.text, PAGE.margin + 12, top + 10, { width: CONTENT_WIDTH - 24 });
        doc.y = top + height + 10;
        return;
      }
      case "photos":
        this.photos(block);
        return;
      case "footer":
        this.ensure(30);
        doc.y += 14;
        this.text(block.text, { size: 8.5, color: COLOR.muted });
        return;
    }
  }

  /** Label and value in two columns. */
  private facts(rows: { label: string; value: string }[]): void {
    const doc = this.doc;
    const labelWidth = 120;
    const valueWidth = CONTENT_WIDTH - labelWidth;
    for (const row of rows) {
      const height = Math.max(
        doc.font(FONT.regular).fontSize(10).heightOfString(row.label, { width: labelWidth }),
        doc.font(FONT.bold).fontSize(10.5).heightOfString(row.value, { width: valueWidth }),
      );
      this.ensure(height + 4);
      const top = doc.y;
      doc.font(FONT.regular).fontSize(10).fillColor(COLOR.muted).text(row.label, PAGE.margin, top, { width: labelWidth });
      doc.font(FONT.bold).fontSize(10.5).fillColor(COLOR.ink).text(row.value, PAGE.margin + labelWidth, top, { width: valueWidth });
      doc.y = top + height + 4;
    }
    doc.y += 4;
  }

  private table(columns: string[], rows: string[][]): void {
    const doc = this.doc;
    const columnWidth = CONTENT_WIDTH / columns.length;
    const rowHeight = (cells: string[], font: string, size: number) =>
      Math.max(...cells.map((cell) => doc.font(font).fontSize(size).heightOfString(cell, { width: columnWidth - 8 }))) + 6;

    const drawRow = (cells: string[], font: string, size: number, color: string) => {
      const height = rowHeight(cells, font, size);
      this.ensure(height);
      const top = doc.y;
      cells.forEach((cell, index) => {
        doc.font(font).fontSize(size).fillColor(color).text(cell, PAGE.margin + index * columnWidth, top + 3, { width: columnWidth - 8 });
      });
      doc.y = top + height;
      doc.moveTo(PAGE.margin, doc.y).lineTo(PAGE.margin + CONTENT_WIDTH, doc.y).lineWidth(0.5).strokeColor(COLOR.line).stroke();
    };

    drawRow(columns, FONT.bold, 9.5, COLOR.muted);
    for (const row of rows) drawRow(row, FONT.regular, 10, COLOR.ink);
    doc.y += 8;
  }

  // -- the dental chart ---------------------------------------------------------

  private chart(block: Extract<Block, { type: "chart" }>): void {
    const doc = this.doc;
    const labelWidth = 62;
    const perRow = Math.max(...block.jaws.flatMap((jaw) => jaw.rows.map((row) => row.teeth.length)));
    const cell = Math.min(44, (CONTENT_WIDTH - labelWidth) / perRow);
    const scale = cell / TOOTH_BOX.width;
    const toothHeight = TOOTH_BOX.height * scale;
    const rowHeight = toothHeight + 22;

    // A jaw is kept in one piece; the two jaws may be on different pages.
    for (const jaw of block.jaws) {
      this.ensure(16 + jaw.rows.length * rowHeight);
      doc.font(FONT.bold).fontSize(10).fillColor(COLOR.muted).text(jaw.label, PAGE.margin, doc.y, { width: CONTENT_WIDTH });
      doc.y += 3;
      for (const row of jaw.rows) {
        const top = doc.y;
        doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted).text(row.label, PAGE.margin, top + toothHeight / 2 - 5, { width: labelWidth - 6 });
        row.teeth.forEach((tooth, index) => this.tooth(tooth, PAGE.margin + labelWidth + index * cell, top, scale));
        doc.y = top + rowHeight;
      }
      doc.y += 4;
    }

    // The legend: colour chips, as many lines as needed.
    this.ensure(40);
    let x = PAGE.margin;
    let y = doc.y + 2;
    doc.font(FONT.regular).fontSize(8.5);
    for (const entry of block.legend) {
      const width = doc.widthOfString(entry.text) + 22;
      if (x + width > PAGE.margin + CONTENT_WIDTH) {
        x = PAGE.margin;
        y += 14;
      }
      const fill = TOOTH_COLOR_HEX[entry.color];
      if (fill) doc.roundedRect(x, y, 10, 10, 2).fill(fill);
      else doc.roundedRect(x, y, 10, 10, 2).dash(2, { space: 1.5 }).stroke(MISSING_OUTLINE_HEX).undash();
      doc.fillColor(COLOR.ink).text(entry.text, x + 14, y + 1, { lineBreak: false });
      x += width + 6;
    }
    doc.y = y + 20;
  }

  /** One tooth: the figure, its number and the short marks (badges) under it. */
  private tooth(tooth: ChartTooth, x: number, y: number, scale: number): void {
    const doc = this.doc;
    const fill = TOOTH_COLOR_HEX[tooth.color];
    const missing = tooth.color === "gray";
    const cell = TOOTH_BOX.width * scale;

    doc.save();
    doc.translate(x, y).scale(scale);
    if (tooth.jaw === "mandible") doc.translate(0, TOOTH_BOX.height).scale(1, -1);
    const shapes = [...ROOT_X[tooth.roots].map((rootX) => rootPath(rootX)), CROWN_PATHS[tooth.type]];
    for (const shape of shapes) {
      doc.path(shape).lineWidth(1.5).lineJoin("round");
      if (missing) doc.dash(3, { space: 2 }).stroke(MISSING_OUTLINE_HEX).undash();
      else doc.fillAndStroke(fill ?? "#ffffff", COLOR.muted);
    }
    doc.restore();

    doc.font(FONT.bold).fontSize(7.5).fillColor(COLOR.ink).text(String(tooth.number), x, y + TOOTH_BOX.height * scale + 1, { width: cell, align: "center", lineBreak: false });
    if (tooth.badges.length > 0) {
      doc.font(FONT.regular).fontSize(6).fillColor(COLOR.muted).text(tooth.badges.join(" "), x - 2, y + TOOTH_BOX.height * scale + 9.5, { width: cell + 4, align: "center", lineBreak: false });
    }
  }

  // -- photos -------------------------------------------------------------------

  /** Fits a photo into the box and draws it; `false` if there is no usable photo. */
  private photo(id: string, x: number, y: number, width: number, maxHeight: number): number | null {
    const bytes = this.images.get(id);
    if (!bytes) return null;
    try {
      // `openImage` exists at run time but is missing from the type definitions.
      const open = (this.doc as unknown as { openImage(source: Buffer): { width: number; height: number } }).openImage;
      const image = open.call(this.doc, Buffer.from(bytes));
      const scale = Math.min(width / image.width, maxHeight / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      this.doc.image(image as never, x + (width - w) / 2, y, { width: w, height: h });
      return h;
    } catch {
      // Not a JPEG or PNG: left out rather than failing the whole summary.
      return null;
    }
  }

  private photos(block: Extract<Block, { type: "photos" }>): void {
    const doc = this.doc;
    const gap = 14;
    const half = (CONTENT_WIDTH - gap) / 2;
    const maxHeight = 170;

    const slots = [
      ...block.pairs.map((pair) => ({ title: pair.place, items: [pair.before, pair.after] })),
      ...chunk(block.singles, 2).map((group) => ({ title: group.length === 1 ? group[0].place : "", items: group })),
    ];

    for (const slot of slots) {
      const usable = slot.items.filter((item) => this.images.has(item.id));
      if (usable.length === 0) continue;
      this.ensure(maxHeight + 40);
      if (slot.title) this.text(slot.title, { font: FONT.bold, size: 10, color: COLOR.muted, gap: 2 });
      const top = doc.y;
      let used = 0;
      slot.items.forEach((item, index) => {
        const x = PAGE.margin + index * (half + gap);
        const height = this.photo(item.id, x, top, half, maxHeight);
        if (height === null) return;
        used = Math.max(used, height);
        const label = "place" in item && item.place && !slot.title ? `${item.place} – ${item.caption}` : item.caption;
        doc.font(FONT.regular).fontSize(8.5).fillColor(COLOR.muted).text(label, x, top + height + 3, { width: half, align: "center" });
      });
      doc.y = top + used + 24;
    }
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}
