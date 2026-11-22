/**
 * Krótkie PDF-y sprawozdań dla stanowisk z OSP (demo / seed).
 * node scripts/generate_osp_reports.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "public", "sprawozdania");
const fontPath = path.join(root, "public", "fonts", "arial.ttf");

const reports = [
  {
    file: "sprawozdanie_starszy_specjalista_dc_wzksoc.pdf",
    employee: "Magdalena Kowalska",
    jobTitle: "starszy specjalista",
    orgUnit:
      "Departament Cyberbezpieczeństwa / Wydział Zarządzania Kryzysowego, Spraw Obronnych i Cyberbezpieczeństwa",
    symbol: "DC WZKSOiC 6",
    period: "01.07.2025 – 31.12.2025",
    date: "12.01.2026",
    paragraphs: [
      "W okresie sprawozdawczym prowadziłam sprawy z zakresu zarządzania kryzysowego w cyberprzestrzeni pozostające w kompetencjach ministra właściwego ds. informatyzacji.",
      "Brałam udział w aktualizacji dokumentacji zarządzania kryzysowego, w tym materiałów związanych z krajowym planem reagowania na incydenty. Współpracowałam z zespołami CSIRT przy wymianie informacji o zagrożeniach.",
      "Przygotowałam notatki i opinie dotyczące oceny odporności podmiotów kluczowych oraz uczestniczyłam w pracach nad integracją systemów cyberbezpieczeństwa z procedurami zarządzania kryzysowego.",
      "Największe wyzwanie stanowiła koordynacja terminów między jednostkami — ustalono wspólny kalendarz przeglądów. Planuję dalsze doskonalenie w obszarze analizy zagrożeń hybrydowych.",
    ],
  },
  {
    file: "sprawozdanie_radca_dsi_wwi.pdf",
    employee: "Anna Wiśniewska",
    jobTitle: "radca",
    orgUnit:
      "Departament Rozwoju i Bezpieczeństwa Sztucznej Inteligencji / Wydział Wspierania Innowacyjności",
    symbol: "DSI WWI 5",
    period: "01.07.2025 – 31.12.2025",
    date: "10.01.2026",
    paragraphs: [
      "W okresie sprawozdawczym wspierałam merytorycznie rozwój innowacyjnych rozwiązań opartych na sztucznej inteligencji, ze szczególnym uwzględnieniem zgodności z prawem krajowym i unijnym.",
      "Przygotowałam analizy przepisów i orzecznictwa w obszarze SI oraz projekty stanowisk i wyjaśnień dotyczących stosowania regulacji. Odpowiadałam na pisma i wnioski jednostek w sprawach barier innowacyjności.",
      "Uczestniczyłam w konsultacjach międzyresortowych dotyczących projektów aktów związanych z SI oraz przygotowałam materiały informacyjne dla kierownictwa Departamentu.",
      "W kolejnym okresie zamierzam pogłębić wiedzę o praktyce stosowania AI Act i usprawnić obiegi opinii prawnych w Wydziale.",
    ],
  },
  {
    file: "sprawozdanie_naczelnik_dwm_wkam.pdf",
    employee: "Jakub Woźniak",
    jobTitle: "naczelnik wydziału",
    orgUnit:
      "Departament Współpracy Międzynarodowej / Wydział Koordynacji Aktywności Międzynarodowych",
    symbol: "DWM WKAM 1",
    period: "01.01.2025 – 31.12.2025",
    date: "15.01.2026",
    paragraphs: [
      "W okresie sprawozdawczym kierowałem Wydziałem (zespół 6 osób): planowanie zadań, delegowanie spraw oraz bieżący nadzór nad terminowością i jakością materiałów.",
      "Koordynowałem organizację wizyt zagranicznych kierownictwa Ministerstwa oraz przygotowanie materiałów tezowych. Nadzorowałem sprawy budżetowe Departamentu, umowy biletowe i rozliczenia delegacji.",
      "Prowadziłem sprawy zamówień publicznych związanych z obsługą aktywności międzynarodowej oraz współpracę z innymi komórkami MC przy wydarzeniach międzynarodowych.",
      "Wyzwaniem była kumulacja terminów wizyt w IV kwartale — wdrożono tygodniowy przegląd obciążenia zespołu. W kolejnym roku planuję rozwijać kompetencje zespołu w zakresie protokołu i obsługi delegacji.",
    ],
  },
];

function wrapText(text, font, size, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildPdf(report) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const page = pdf.addPage([595.28, 841.89]); // A4
  const margin = 50;
  const maxW = 595.28 - margin * 2;
  let y = 790;
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.35, 0.38, 0.42);

  const draw = (text, size, color, gap = 4) => {
    const lines = wrapText(text, font, size, maxW);
    for (const ln of lines) {
      page.drawText(ln, { x: margin, y, size, font, color });
      y -= size + gap;
    }
  };

  draw("SPRAWOZDANIE Z WYKONANIA OBOWIĄZKÓW", 14, ink, 6);
  draw("(materiał demonstracyjny — Kompas Kompetencji)", 9, muted, 10);
  y -= 6;

  draw(`Pracownik: ${report.employee}`, 11, ink, 5);
  draw(`Stanowisko: ${report.jobTitle}`, 11, ink, 5);
  draw(`Komórka: ${report.orgUnit}`, 10, ink, 5);
  draw(`Symbol OSP: ${report.symbol}`, 10, ink, 5);
  draw(`Okres: ${report.period}`, 10, ink, 5);
  draw(`Data sporządzenia: ${report.date}`, 10, ink, 8);
  y -= 4;

  page.drawLine({
    start: { x: margin, y: y + 8 },
    end: { x: margin + maxW, y: y + 8 },
    thickness: 0.8,
    color: rgb(0.75, 0.78, 0.82),
  });
  y -= 6;

  draw("Opis wykonanych zadań", 12, ink, 8);

  for (const p of report.paragraphs) {
    draw(p, 10, ink, 3);
    y -= 8;
  }

  y -= 10;
  draw("Podpis pracownika: ______________________", 10, muted, 4);
  draw("Podpis przełożonego: ____________________", 10, muted, 4);

  return pdf.save();
}

fs.mkdirSync(outDir, { recursive: true });

for (const r of reports) {
  const bytes = await buildPdf(r);
  const out = path.join(outDir, r.file);
  fs.writeFileSync(out, bytes);
  console.log("OK", path.relative(root, out), `(${bytes.length} B)`);
}
