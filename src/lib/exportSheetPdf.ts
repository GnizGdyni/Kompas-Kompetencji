import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Competency, PartialScores } from "./competencyModel";
import type { Employee, EvaluationCase, Profile } from "../types";

export type SheetPdfInput = {
  caseRow: EvaluationCase;
  employee: Employee;
  competencies: Competency[];
  scores: PartialScores;
  average: number | null;
  supervisor: Profile | null;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function splitName(full: string | null | undefined): {
  first: string;
  last: string;
} {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** PyMuPDF y (od góry) → pdf-lib y (od dołu, baseline). */
function yBase(pageH: number, yTop: number, fontSize = 9): number {
  // lekko wyżej w komórce tabeli (unikamy „klejenia” do dolnej kreski)
  return pageH - yTop - fontSize * 0.35;
}

function draw(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  yTop: number,
  size = 9,
) {
  if (!text) return;
  const pageH = page.getHeight();
  page.drawText(text, {
    x,
    y: yBase(pageH, yTop, size),
    size,
    font,
    color: rgb(0.05, 0.15, 0.45),
  });
}

function drawX(
  page: PDFPage,
  font: PDFFont,
  x: number,
  yTop: number,
  size = 10,
) {
  draw(page, font, "X", x, yTop, size);
}

async function loadAssets(templateUrl: string) {
  const [pdfBytes, fontBytes] = await Promise.all([
    fetch(templateUrl).then((r) => {
      if (!r.ok) throw new Error(`Brak szablonu: ${templateUrl}`);
      return r.arrayBuffer();
    }),
    fetch("/fonts/arial.ttf").then((r) => {
      if (!r.ok) throw new Error("Brak czcionki /fonts/arial.ttf");
      return r.arrayBuffer();
    }),
  ]);
  const doc = await PDFDocument.load(pdfBytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  return { doc, font };
}

function saveBlob(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const VALUE_X = 232;

function fillArkuszA(
  pages: PDFPage[],
  font: PDFFont,
  input: SheetPdfInput,
) {
  const { caseRow: c, employee: e, scores, average, supervisor } = input;
  const p0 = pages[0];
  const p1 = pages[1];
  const p2 = pages[2];
  const empFirst = e.first_name || splitName(e.full_name).first;
  const empLast = e.last_name || splitName(e.full_name).last;
  const sup = splitName(supervisor?.full_name || supervisor?.email || "");

  // strona 1 — część ogólna
  draw(p0, font, c.office_name || "Ministerstwo Cyfryzacji", VALUE_X, 138, 9);
  draw(p0, font, empFirst, VALUE_X, 175);
  draw(p0, font, empLast, VALUE_X, 191);
  draw(p0, font, e.org_unit || c.employee_org_unit || "", VALUE_X, 207);
  draw(p0, font, e.job_title || c.employee_job_title || "", VALUE_X, 222);
  draw(p0, font, fmtDate(e.hired_at), 430, 239);

  draw(p0, font, sup.first, VALUE_X, 277);
  draw(p0, font, sup.last, VALUE_X, 293);
  draw(p0, font, supervisor?.org_unit || "", VALUE_X, 308);
  draw(p0, font, supervisor?.job_title || "", VALUE_X, 324);

  // kierujący — MVP: ten sam lub puste
  if (c.unit_head_id && c.unit_head_id === c.supervisor_id) {
    draw(p0, font, sup.first, VALUE_X, 361);
    draw(p0, font, sup.last, VALUE_X, 377);
    draw(p0, font, supervisor?.org_unit || "", VALUE_X, 392);
    draw(p0, font, supervisor?.job_title || "", VALUE_X, 408);
  }

  draw(p0, font, fmtDate(c.intro_talk_at), 430, 463);
  draw(
    p0,
    font,
    `${fmtDate(c.report_due_from)} – ${fmtDate(c.report_due_to)}`,
    400,
    501,
    8,
  );
  draw(
    p0,
    font,
    `${fmtDate(c.assessment_window_from)} – ${fmtDate(c.assessment_window_to)}`,
    400,
    527,
    8,
  );

  // strona 2 — rozmowa + oceny
  draw(p1, font, fmtDate(c.assessment_interview_at), 430, 70);

  const scoreRows: { code: string; y: number }[] = [
    { code: "rzetelnosc", y: 270 },
    { code: "wiedza", y: 288 },
    { code: "organizacja", y: 305 },
    { code: "komunikacja", y: 325 },
    { code: "wspolpraca", y: 343 },
  ];
  const cols: Record<number, number> = { 3: 238, 5: 345, 7: 455 };
  for (const row of scoreRows) {
    const s = scores[row.code];
    if (s === 3 || s === 5 || s === 7) {
      drawX(p1, font, cols[s], row.y);
    }
  }
  if (average !== null) {
    draw(p1, font, average.toFixed(2), VALUE_X, 361);
  }

  // egzamin
  if (c.exam_result === "pass") drawX(p1, font, 70, 419);
  else if (c.exam_result === "fail") drawX(p1, font, 210, 419);
  else if (c.exam_result === "na" || !c.exam_required) drawX(p1, font, 365, 419);

  if (c.report_on_time === true) drawX(p1, font, 70, 463);
  else if (c.report_on_time === false) drawX(p1, font, 320, 463);

  if (c.verdict === "positive") drawX(p1, font, 70, 508);
  else if (c.verdict === "negative") drawX(p1, font, 320, 508);

  // strona 3 — uzasadnienie / wnioski
  if (c.verdict_justification) {
    const lines = wrap(c.verdict_justification, 95);
    lines.forEach((ln, i) => draw(p2, font, ln, 60, 80 + i * 12, 9));
  }
  if (c.development_notes) {
    const lines = wrap(c.development_notes, 95);
    lines.forEach((ln, i) => draw(p2, font, ln, 60, 285 + i * 12, 9));
  }
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 12);
}

function fillPeriodic(
  pages: PDFPage[],
  font: PDFFont,
  input: SheetPdfInput,
  sheet: "B" | "C",
) {
  const { caseRow: c, employee: e, competencies, scores, average, supervisor } =
    input;
  const p0 = pages[0];
  const p1 = pages[1];
  const p2 = pages[2];
  const empFirst = e.first_name || splitName(e.full_name).first;
  const empLast = e.last_name || splitName(e.full_name).last;
  const sup = splitName(supervisor?.full_name || supervisor?.email || "");

  // Współrzędne dopasowane do A4 arkuszy B/C (PyMuPDF, od góry).
  const empY = sheet === "B" ? 227 : 225.9;
  const empStep = sheet === "B" ? 15.7 : 15.6;
  const supY = sheet === "B" ? 310.8 : 308.5;
  const terminY = sheet === "B" ? 485 : 478;
  const extraPage0Ys =
    sheet === "B" ? [422, 438, 454] : [422, 437.5, 453];
  const interviewY = 90;
  // OD6)/DO7) + placeholdery (dd.mm.rrrr) na stronie Część II
  const odX = 312;
  const doX = 440;
  const okresY = 118;
  const extraPage1Ys = [350, 375, 399];
  // wartość średniej — na prawo od „…kryteria oceny:”
  const avgX = 475;
  const avgY = 449.5;
  // X tuż przed słowem POZYTYWNA / NEGATYWNA (nie za daleko w lewo)
  const verdictPosX = sheet === "B" ? 208 : 205;
  const verdictNegX = sheet === "B" ? 398 : 395;
  const verdictY = sheet === "B" ? 608 : 605;
  // X w LEWEJ kolumnie tabeli poziomów (kratka 65–157)
  // ostatni wiersz (8–9) celowo wyżej — wcześniej „wyjeżdżał” w dół
  const bandCheckX = 105;
  const bandRowsY =
    sheet === "B"
      ? [524, 541, 557, 573, 586]
      : [522, 538, 554, 570, 583];

  // —— Część I ——
  draw(p0, font, c.office_name || "Ministerstwo Cyfryzacji", VALUE_X, 192, 9);
  draw(p0, font, empFirst, VALUE_X, empY);
  draw(p0, font, empLast, VALUE_X, empY + empStep);
  draw(p0, font, e.org_unit || c.employee_org_unit || "", VALUE_X, empY + empStep * 2);
  draw(p0, font, e.job_title || c.employee_job_title || "", VALUE_X, empY + empStep * 3);

  draw(p0, font, sup.first, VALUE_X, supY);
  draw(p0, font, sup.last, VALUE_X, supY + empStep);
  draw(p0, font, supervisor?.org_unit || "", VALUE_X, supY + empStep * 2);
  draw(p0, font, supervisor?.job_title || "", VALUE_X, 355.5);

  // Termin sporządzenia — pole przy (dd.mm.rrrr) w wierszu „Termin…”
  draw(p0, font, fmtDate(c.cycle_due_at), 420, terminY, 9);

  const extras = (c.extra_criteria || []).slice(0, 3);
  extras.forEach((code, i) => {
    const name = competencies.find((x) => x.code === code)?.name || code;
    draw(p0, font, name.slice(0, 40), 302, extraPage0Ys[i], 8);
  });

  // —— Część II ——
  draw(p1, font, fmtDate(c.assessment_interview_at), 430, interviewY, 9);
  draw(
    p1,
    font,
    fmtDate(c.cycle_anchor_at || c.assessment_window_from),
    odX,
    okresY,
    9,
  );
  draw(
    p1,
    font,
    fmtDate(c.cycle_due_at || c.assessment_window_to),
    doX,
    okresY,
    9,
  );

  const cols: Record<number, number> = {
    1: 310,
    3: 359,
    5: 408,
    7: 457,
    9: 506,
  };

  const mandatoryRowsB: { code: string; y: number }[] = [
    { code: "zarzadzanie_ludzmi", y: 226 },
    { code: "podejmowanie_decyzji", y: 250 },
    { code: "organizacja", y: 274 },
    { code: "wspolpraca", y: 299 },
    { code: "komunikacja", y: 323 },
  ];
  const mandatoryRowsC: { code: string; y: number }[] = [
    { code: "wiedza", y: 226 },
    { code: "rzetelnosc", y: 250 },
    { code: "organizacja", y: 274 },
    { code: "wspolpraca", y: 299 },
    { code: "komunikacja", y: 323 },
  ];
  const rows = sheet === "B" ? mandatoryRowsB : mandatoryRowsC;
  for (const row of rows) {
    const s = scores[row.code];
    if (s && cols[s] !== undefined) drawX(p1, font, cols[s], row.y + 2);
  }

  extras.forEach((code, i) => {
    const y = extraPage1Ys[i];
    const name = competencies.find((x) => x.code === code)?.name || code;
    draw(p1, font, name.slice(0, 34), 72, y, 8);
    const s = scores[code];
    if (s && cols[s] !== undefined) drawX(p1, font, cols[s], y + 2);
  });

  if (average !== null) {
    draw(p1, font, average.toFixed(2), avgX, avgY, 10);
    // Progi jak w arkuszu: 1–2 / 2–4 / 4–6 / 6–8 / 8–9
    const bandIndex =
      average <= 2 ? 0 : average <= 4 ? 1 : average <= 6 ? 2 : average <= 8 ? 3 : 4;
    drawX(p1, font, bandCheckX, bandRowsY[bandIndex], 11);
  }

  if (c.verdict === "positive") drawX(p1, font, verdictPosX, verdictY, 11);
  else if (c.verdict === "negative") drawX(p1, font, verdictNegX, verdictY, 11);

  // —— Uzasadnienie / wnioski / dane oceniającego ——
  if (c.verdict_justification) {
    wrap(c.verdict_justification, 95).forEach((ln, i) =>
      draw(p2, font, ln, 70, 75 + i * 12, 9),
    );
  }
  if (c.development_notes) {
    wrap(c.development_notes, 95).forEach((ln, i) =>
      draw(p2, font, ln, 70, 268 + i * 12, 9),
    );
  }

  // Dane oceniającego (nie ocenianego!)
  const ocenY = sheet === "B" ? 452.6 : 446;
  draw(p2, font, sup.first, VALUE_X, ocenY);
  draw(p2, font, sup.last, VALUE_X, ocenY + 15.6);
  draw(p2, font, supervisor?.org_unit || "", VALUE_X, ocenY + 31.2);
  draw(p2, font, supervisor?.job_title || "", VALUE_X, ocenY + 46.8);
}

export async function downloadFilledSheetPdf(
  input: SheetPdfInput,
): Promise<void> {
  const sheet =
    input.caseRow.sheet_type === "B" || input.caseRow.sheet_type === "C"
      ? input.caseRow.sheet_type
      : input.caseRow.evaluation_type === "periodic"
        ? "C"
        : "A";

  const template =
    sheet === "A"
      ? "/templates/arkuszA.pdf"
      : sheet === "B"
        ? "/templates/arkuszB.pdf"
        : "/templates/arkuszC.pdf";

  const { doc, font } = await loadAssets(template);
  const pages = doc.getPages();

  if (sheet === "A") fillArkuszA(pages, font, input);
  else fillPeriodic(pages, font, input, sheet);

  const bytes = await doc.save();
  const emp =
    [
      input.employee.last_name || splitName(input.employee.full_name).last,
      input.employee.first_name || splitName(input.employee.full_name).first,
    ]
      .filter(Boolean)
      .join("_") || "pracownik";
  const stamp = new Date().toISOString().slice(0, 10);
  saveBlob(bytes, `arkusz_${sheet}_${emp}_${stamp}.pdf`);
}
