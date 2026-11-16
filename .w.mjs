import fs from 'node:fs';
const edit = (file, pairs) => {
  let s = fs.readFileSync(file, 'utf8');
  const crlf = s.includes('\r\n');
  const fix = (t) => (crlf ? t.replace(/\r?\n/g, '\r\n') : t);
  for (const [a, b] of pairs) { if (!s.includes(fix(a))) throw new Error(file + ' missing: ' + a.slice(0, 70)); s = s.replace(fix(a), () => fix(b)); }
  fs.writeFileSync(file, s);
};
edit('src/components/dental/tooth-sheet.tsx', [
 ['  onChange: (parts: ToothParts) => void;\n  onClose: () => void;\n}', '  onChange: (parts: ToothParts) => void;\n  onClose: () => void;\n  /** Anything else that belongs to this tooth (its attachments), shown above the note. */\n  extras?: React.ReactNode;\n}'],
 ['export function ToothSheet({ tooth, species, entry, locked, onChange, onClose }: ToothSheetProps) {', 'export function ToothSheet({ tooth, species, entry, locked, onChange, onClose, extras }: ToothSheetProps) {'],
 ['        <section aria-labelledby="sheet-note" className="flex flex-col gap-2">', '        {extras}\n\n        <section aria-labelledby="sheet-note" className="flex flex-col gap-2">'],
]);
edit('src/components/dental/odontogram.tsx', [
 ['  onSelectionChange?: (selected: readonly number[]) => void;\n}', '  onSelectionChange?: (selected: readonly number[]) => void;\n  /** What else the sheet of a tooth shows (the attachments of that tooth). */\n  renderToothExtras?: (tooth: number) => React.ReactNode;\n}'],
 ['export function Odontogram({ species, chart, locked, save, onSelectionChange }: OdontogramProps) {', 'export function Odontogram({ species, chart, locked, save, onSelectionChange, renderToothExtras }: OdontogramProps) {'],
 ['          onChange={(parts) => void save(new Map([[openDefinition.number, parts]]))}\n          onClose={() => setOpen(null)}', '          onChange={(parts) => void save(new Map([[openDefinition.number, parts]]))}\n          onClose={() => setOpen(null)}\n          extras={renderToothExtras?.(openDefinition.number)}'],
]);
edit('src/components/visits/visit-editor.tsx', [
 ['const SECTIONS = ["header", "history", "dental", "procedures", "aftercare"] as const;', 'const SECTIONS = ["header", "history", "dental", "attachments", "procedures", "aftercare"] as const;'],
 ['import { Dictation } from "@/components/dictation/dictation";', 'import { AttachmentsPanel } from "@/components/attachments/attachments-panel";\nimport { Dictation } from "@/components/dictation/dictation";'],
 ['            onSelectionChange={setSelectedTeeth}\n', '            onSelectionChange={setSelectedTeeth}\n            renderToothExtras={(number) => (\n              <section aria-labelledby="sheet-attachments" className="flex flex-col gap-3">\n                <h3 id="sheet-attachments" className="text-lg font-semibold">\n                  {t("attachmentsOfTooth")}\n                </h3>\n                <AttachmentsPanel visitId={visit.id} species={patient.species} tooth={number} locked={locked} />\n              </section>\n            )}\n'],
 ['      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-8">\n        <section id="visit-procedures"', '      <section id="visit-attachments" aria-labelledby="visit-attachments-title" className="flex scroll-mt-24 flex-col gap-3">\n        <h2 id="visit-attachments-title" className="text-xl font-semibold">\n          {t("sections.attachments")}\n        </h2>\n        {patient ? (\n          <AttachmentsPanel visitId={visit.id} species={patient.species} selectedTeeth={selectedTeeth} locked={locked} />\n        ) : (\n          <p className="text-muted-foreground">{t("loading")}</p>\n        )}\n      </section>\n\n      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-8">\n        <section id="visit-procedures"'],
]);
edit('messages/hu.json', [
 ['      "dental": "Fogászati státusz",\n      "procedures"', '      "dental": "Fogászati státusz",\n      "attachments": "Csatolmányok: fotók és röntgen",\n      "procedures"'],
 ['    "sectionNav": "A lap szekciói",', '    "attachmentsOfTooth": "Fotók és röntgen ehhez a fogához",\n    "sectionNav": "A lap szekciói",'],
 ['  "dictation": {', `  "attachments": {
    "kind": "Típus",
    "kinds": {
      "xray": "Röntgen",
      "before": "Előtte",
      "after": "Utána",
      "other": "Egyéb"
    },
    "target": "Hová tartozik?",
    "targets": {
      "visit": "A teljes vizithez",
      "quadrant": "{number}. kvadráns",
      "tooth": "{number} fog"
    },
    "takePhoto": "Fotó készítése",
    "chooseFile": "Fájl feltöltése",
    "quickTitle": "Előtte–utána gyorsfotó",
    "quickBefore": "Előtte fotó",
    "quickAfter": "Utána fotó",
    "quickToTooth": "A fotó a(z) {number} fogához kerül.",
    "quickToTarget": "A fotó a fent választott helyhez kerül. Egy fog kijelölésekor automatikusan ahhoz.",
    "none": "Még nincs csatolmány.",
    "pairsTitle": "Előtte–utána párok",
    "stored": "Feltöltve",
    "waiting": "Feltöltésre vár",
    "uploading": "{count, plural, one {1 fájl feltöltése folyamatban…} other {# fájl feltöltése folyamatban…}}",
    "waitingForConnection": "{count, plural, one {1 fájl az eszközön van, és a kapcsolat visszatérésekor feltöltődik.} other {# fájl az eszközön van, és a kapcsolat visszatérésekor feltöltődik.}}",
    "quotaFull": "A csomag tárhelye betelt, ezért a fotók nem töltődnek fel. Törölhet régi csatolmányokat, vagy válthat nagyobb csomagra.",
    "denied": "A szerver nem fogadta el a fájlt feltöltésre. Ellenőrizze a jogosultságát és az előfizetést.",
    "retry": "Újrapróbálom",
    "delete": "Törlés",
    "deleteConfirm": "Biztosan törli ezt a csatolmányt?",
    "noPreview": "Nincs előnézet",
    "close": "Bezárás",
    "zoomIn": "Nagyítás",
    "zoomOut": "Kicsinyítés",
    "zoomReset": "Eredeti méret",
    "openPdf": "A PDF megnyitása új lapon",
    "pdfHint": "A PDF a kapcsolat visszatérése után nyitható meg.",
    "notAvailable": "A kép most nem érhető el (nincs kapcsolat, és az eszközön nincs másolata).",
    "fileErrors": {
      "type": "Csak JPEG, PNG, WebP és PDF csatolható.",
      "size": "A fájl túl nagy (legfeljebb 15 MB).",
      "empty": "A fájl üres.",
      "finalVisit": "A lezárt lapra nem tölthető fel új csatolmány; előbb nyissa újra."
    }
  },
  "dictation": {`],
]);
