import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MANUAL_SECTIONS, type ManualSection, type ManualBlock } from "./content";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveScreenshotsDir(): string {
  // In dev (tsx), __dirname resolves to artifacts/api-server/src/manual.
  // In prod (esbuild bundles to dist/), screenshots are copied alongside.
  const candidates = [
    path.resolve(__dirname, "screenshots"),
    path.resolve(__dirname, "manual/screenshots"),
    path.resolve(process.cwd(), "src/manual/screenshots"),
    path.resolve(process.cwd(), "artifacts/api-server/src/manual/screenshots"),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isDirectory()) return c;
    } catch { /* ignore */ }
  }
  return candidates[0];
}

const SCREENSHOTS_DIR = resolveScreenshotsDir();

const COLORS = {
  primary: "#1B2A4A",
  accent: "#4A90D9",
  text: "#1F2937",
  muted: "#5C6E84",
  light: "#F4F6F8",
  border: "#E1E7EE",
  badgeAdmin: "#1B66CC",
  badgeFunc: "#1B7A3E",
  badgeBoth: "#7C5BB6",
  badgeSuper: "#B8470A",
};

const PAGE = {
  size: "A4" as const,
  marginX: 55,
  marginY: 55,
  width: 595.28,
  height: 841.89,
};

const CONTENT_WIDTH = PAGE.width - PAGE.marginX * 2;

interface RenderContext {
  doc: InstanceType<typeof PDFDocument>;
  empresaNome: string;
  /** Page index (0-based) where each section starts; populated during render. */
  sectionPageIndices: number[];
}

function profileBadgeColor(profile: ManualSection["profile"]): string {
  if (profile === "Admin") return COLORS.badgeAdmin;
  if (profile === "Funcionário") return COLORS.badgeFunc;
  if (profile === "Super Admin") return COLORS.badgeSuper;
  return COLORS.badgeBoth;
}

function ensureSpace(doc: InstanceType<typeof PDFDocument>, needed: number): void {
  const bottom = PAGE.height - PAGE.marginY;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function drawCover(ctx: RenderContext): void {
  const { doc, empresaNome } = ctx;
  // Header band
  doc.rect(0, 0, PAGE.width, 220).fill(COLORS.primary);

  doc.fillColor(COLORS.accent)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("SISTEMA", PAGE.marginX, 90, { characterSpacing: 3 });

  doc.fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(38)
    .text("Controle de Ponto", PAGE.marginX, 110, { width: CONTENT_WIDTH });

  doc.fillColor("#A8BDD4")
    .font("Helvetica")
    .fontSize(16)
    .text("Manual do Usuário", PAGE.marginX, 165);

  // Empresa box
  doc.fillColor(COLORS.text)
    .font("Helvetica")
    .fontSize(11);

  const yEmpresa = 280;
  doc.rect(PAGE.marginX, yEmpresa, CONTENT_WIDTH, 70)
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .stroke();

  doc.fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(10)
    .text("Empresa", PAGE.marginX + 14, yEmpresa + 12);

  doc.fillColor(COLORS.primary)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(empresaNome, PAGE.marginX + 14, yEmpresa + 28, { width: CONTENT_WIDTH - 28 });

  // What's in this manual
  doc.fillColor(COLORS.text)
    .font("Helvetica")
    .fontSize(11)
    .text(
      "Este manual cobre todas as funcionalidades do sistema, tanto a marcação diária do ponto pelo funcionário quanto a gestão completa pelo Administrador (RH/Gestor) e pelo Super Administrador.",
      PAGE.marginX,
      yEmpresa + 110,
      { width: CONTENT_WIDTH, align: "justify" },
    );

  doc.fillColor(COLORS.text)
    .text(
      "Use o sumário na próxima página para navegar pelas seções. As capturas de tela ilustram cada funcionalidade exatamente como ela aparece no sistema.",
      PAGE.marginX,
      doc.y + 12,
      { width: CONTENT_WIDTH, align: "justify" },
    );

  // Footer
  const footerY = PAGE.height - 80;
  doc.fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Documento gerado em ${new Date().toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })}`,
      PAGE.marginX,
      footerY,
      { width: CONTENT_WIDTH, align: "center" },
    );
}

function drawTOC(ctx: RenderContext, pageNumbers: number[]): void {
  const { doc } = ctx;
  doc.addPage();

  doc.fillColor(COLORS.primary)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("Sumário", PAGE.marginX, PAGE.marginY);

  doc.moveDown(1);
  doc.fontSize(11).font("Helvetica").fillColor(COLORS.text);

  MANUAL_SECTIONS.forEach((section, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const y = doc.y;
    const pageStr = String(pageNumbers[idx] ?? "");
    // Section title (left)
    doc.fillColor(COLORS.text)
      .font("Helvetica")
      .fontSize(11)
      .text(`${num}. ${section.title}`, PAGE.marginX, y, { width: CONTENT_WIDTH - 40, continued: false });
    // Page number (right)
    const titleHeight = doc.heightOfString(`${num}. ${section.title}`, { width: CONTENT_WIDTH - 40 });
    doc.fillColor(COLORS.muted)
      .font("Helvetica")
      .fontSize(10)
      .text(pageStr, PAGE.marginX + CONTENT_WIDTH - 30, y, { width: 30, align: "right" });
    doc.y = y + titleHeight + 6;
  });
}

function drawSectionHeader(ctx: RenderContext, section: ManualSection, idx: number): void {
  const { doc } = ctx;
  const num = String(idx + 1).padStart(2, "0");
  const startY = doc.y;

  // Number badge (38x38) at startY
  doc.fillColor(COLORS.accent)
    .rect(PAGE.marginX, startY, 38, 38)
    .fill();
  doc.fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(num, PAGE.marginX, startY + 11, { width: 38, align: "center", lineBreak: false });

  // Title beside the number badge — measure and center vertically.
  doc.font("Helvetica-Bold").fontSize(20);
  const titleWidth = CONTENT_WIDTH - 50;
  const titleHeight = doc.heightOfString(section.title, { width: titleWidth });
  const titleY = startY + Math.max(0, (38 - titleHeight) / 2);
  doc.fillColor(COLORS.primary)
    .text(section.title, PAGE.marginX + 50, titleY, { width: titleWidth });

  // Move doc.y past whichever is taller (number badge or wrapped title).
  doc.y = startY + Math.max(38, titleHeight + Math.max(0, (38 - titleHeight) / 2));

  // Profile badge
  const badgeY = doc.y + 10;
  const badgeText = `Perfil: ${section.profile}`;
  doc.font("Helvetica-Bold").fontSize(8);
  const badgeWidth = doc.widthOfString(badgeText) + 14;
  doc.fillColor(profileBadgeColor(section.profile))
    .roundedRect(PAGE.marginX, badgeY, badgeWidth, 16, 8)
    .fill();
  doc.fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(badgeText, PAGE.marginX + 7, badgeY + 4, { lineBreak: false });

  doc.y = badgeY + 16 + 18;
}

function drawBlock(ctx: RenderContext, block: ManualBlock): void {
  const { doc } = ctx;
  if (block.kind === "p") {
    ensureSpace(doc, 30);
    doc.fillColor(COLORS.text)
      .font("Helvetica")
      .fontSize(10.5)
      .text(block.text, PAGE.marginX, doc.y, {
        width: CONTENT_WIDTH,
        align: "justify",
        lineGap: 2,
      });
    doc.moveDown(0.5);
    return;
  }
  if (block.kind === "h") {
    ensureSpace(doc, 40);
    doc.moveDown(0.4);
    doc.fillColor(COLORS.primary)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(block.text, PAGE.marginX, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.3);
    return;
  }
  if (block.kind === "ul") {
    ensureSpace(doc, 20);
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(10.5);
    for (const item of block.items) {
      ensureSpace(doc, 18);
      const startY = doc.y;
      doc.fillColor(COLORS.accent).text("•", PAGE.marginX + 4, startY, { width: 12, continued: false });
      doc.fillColor(COLORS.text).text(item, PAGE.marginX + 18, startY, {
        width: CONTENT_WIDTH - 18,
        align: "left",
        lineGap: 2,
      });
      doc.moveDown(0.15);
    }
    doc.moveDown(0.4);
    return;
  }
  if (block.kind === "img") {
    drawScreenshot(ctx, block.file, block.caption);
  }
}

function drawScreenshot(ctx: RenderContext, fileName: string, caption?: string): void {
  const { doc } = ctx;
  const fullPath = path.join(SCREENSHOTS_DIR, fileName);
  doc.moveDown(0.3);

  if (!fs.existsSync(fullPath)) {
    // Placeholder box
    ensureSpace(doc, 120);
    const y = doc.y;
    const w = CONTENT_WIDTH;
    const h = 100;
    doc.rect(PAGE.marginX, y, w, h)
      .lineWidth(1)
      .dash(4, { space: 3 })
      .strokeColor(COLORS.muted)
      .stroke()
      .undash();
    doc.fillColor(COLORS.muted)
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text(`[Captura de tela: ${fileName}]`, PAGE.marginX, y + h / 2 - 6, {
        width: w,
        align: "center",
      });
    doc.y = y + h + 6;
    if (caption) drawCaption(ctx, caption);
    doc.moveDown(0.5);
    return;
  }

  // Compute target size while preserving aspect ratio.
  const maxW = CONTENT_WIDTH;
  const maxH = 380;
  // Probe natural dimensions BEFORE deciding on a page break, so we know
  // the actual rendered height instead of guessing.
  const img = (doc as unknown as { openImage: (p: string) => { width: number; height: number } }).openImage(fullPath);
  const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
  const renderedH = img.height * ratio;
  const renderedW = img.width * ratio;
  const captionReserve = caption ? 18 : 0;
  // Need room for image + small gap + caption + bottom-of-section padding.
  const needed = renderedH + 4 + captionReserve + 8;
  ensureSpace(doc, needed);

  const yBefore = doc.y;
  // Center horizontally within content area.
  const xCentered = PAGE.marginX + Math.max(0, (maxW - renderedW) / 2);
  doc.image(fullPath, xCentered, yBefore, { width: renderedW, height: renderedH });
  doc.y = yBefore + renderedH + 4;

  if (caption) drawCaption(ctx, caption);
  doc.moveDown(0.5);
}

function drawCaption(ctx: RenderContext, caption: string): void {
  const { doc } = ctx;
  doc.fillColor(COLORS.muted)
    .font("Helvetica-Oblique")
    .fontSize(9)
    .text(caption, PAGE.marginX, doc.y, { width: CONTENT_WIDTH, align: "center" });
  doc.moveDown(0.3);
}

function drawFooters(doc: InstanceType<typeof PDFDocument>): void {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    // Skip footer on cover (first page).
    if (i === range.start) continue;
    // Footer sits below the normal bottom margin. Zero out the page's
    // bottom margin temporarily so doc.text() doesn't see overflow and
    // trigger an automatic addPage() for every footer (which would
    // create dozens of blank pages and break the TOC page numbers).
    const page = (doc as unknown as { page: { margins: { bottom: number } } }).page;
    const oldBottom = page.margins.bottom;
    page.margins.bottom = 0;
    try {
      const pageNum = i - range.start + 1;
      doc.fillColor(COLORS.muted)
        .font("Helvetica")
        .fontSize(9)
        .text(
          `Manual do Usuário · Controle de Ponto`,
          PAGE.marginX,
          PAGE.height - 35,
          { width: CONTENT_WIDTH / 2, align: "left", lineBreak: false },
        );
      doc.text(
        `Página ${pageNum} de ${total}`,
        PAGE.marginX + CONTENT_WIDTH / 2,
        PAGE.height - 35,
        { width: CONTENT_WIDTH / 2, align: "right", lineBreak: false },
      );
    } finally {
      page.margins.bottom = oldBottom;
    }
  }
}

/**
 * Render the manual to a Node Buffer. Two-pass: first pass discards output
 * but records page indices; second pass writes the real PDF with TOC page
 * numbers filled in.
 */
export async function buildManualPdf(empresaNome: string): Promise<Buffer> {
  // Pass 1: render once to determine page numbers per section.
  const sectionPagesPass1: number[] = await measureSections(empresaNome);

  // Pass 2: render with known page numbers.
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: PAGE.size,
      margins: { top: PAGE.marginY, bottom: PAGE.marginY, left: PAGE.marginX, right: PAGE.marginX },
      bufferPages: true,
      info: {
        Title: "Manual do Usuário — Controle de Ponto",
        Author: "Controle de Ponto",
        Subject: "Manual do Usuário",
        Creator: "Controle de Ponto",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ctx: RenderContext = { doc, empresaNome, sectionPageIndices: [] };
    drawCover(ctx);
    drawTOC(ctx, sectionPagesPass1);

    MANUAL_SECTIONS.forEach((section, idx) => {
      doc.addPage();
      drawSectionHeader(ctx, section, idx);
      for (const block of section.body) drawBlock(ctx, block);
    });

    drawFooters(doc);
    doc.end();
  });
}

async function measureSections(empresaNome: string): Promise<number[]> {
  return await new Promise<number[]>((resolve, reject) => {
    const doc = new PDFDocument({
      size: PAGE.size,
      margins: { top: PAGE.marginY, bottom: PAGE.marginY, left: PAGE.marginX, right: PAGE.marginX },
      bufferPages: true,
    });
    // Drain chunks to avoid backpressure; we discard the bytes here.
    doc.on("data", () => { /* discard */ });
    doc.on("error", reject);

    const ctx: RenderContext = { doc, empresaNome, sectionPageIndices: [] };
    const sectionStarts: number[] = [];
    try {
      drawCover(ctx);
      drawTOC(ctx, MANUAL_SECTIONS.map(() => 0));
      MANUAL_SECTIONS.forEach((section, idx) => {
        doc.addPage();
        // bufferedPageRange().count is total pages so far including the one
        // we just added. Since pages are 1-based for humans, that count is
        // exactly the page number where this section starts.
        const startPage = doc.bufferedPageRange().count;
        sectionStarts.push(startPage);
        drawSectionHeader(ctx, section, idx);
        for (const block of section.body) drawBlock(ctx, block);
      });
    } catch (err) {
      reject(err);
      return;
    }
    doc.on("end", () => resolve(sectionStarts));
    doc.end();
  });
}
