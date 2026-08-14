import type { LoanRecord } from "../types";

const MAX_KML_FEATURES = 5000;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Export a result set as a KML file (Google Earth escape hatch, spec §0/Stage 7). Caps at 5,000 features. */
export function buildKml(loans: LoanRecord[]): string {
  const capped = loans.slice(0, MAX_KML_FEATURES);
  const placemarks = capped
    .map((loan) => {
      const forgiven = (loan.forgiven_amount ?? 0) > 0;
      return `  <Placemark>
    <name>${esc(loan.borrower_name)}</name>
    <description>Approved: $${loan.approved_amount.toLocaleString()} — ${
        forgiven ? "Forgiven" : "Not forgiven"
      } — ${esc(loan.geo_precision)} precision</description>
    <Point><coordinates>${loan.lng},${loan.lat}</coordinates></Point>
  </Placemark>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>PPP Loan Map export</name>
  <description>Exported from the PPP Loan Map. Data: SBA FOIA release. Coordinates: Geocodio (CC BY 4.0). A loan record is not evidence of wrongdoing.</description>
${placemarks}
</Document>
</kml>`;
}

export function downloadKml(loans: LoanRecord[], filename = "ppp-loans-export.kml") {
  const kml = buildKml(loans);
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { MAX_KML_FEATURES };
