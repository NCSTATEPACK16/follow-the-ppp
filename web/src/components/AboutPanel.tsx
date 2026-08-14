import { DATA_VINTAGE, GEOCODE_VINTAGE, GEOCODIO_URL, SBA_SOURCE_URL } from "../lib/config";

interface AboutPanelProps {
  onClose: () => void;
}

export function AboutPanel({ onClose }: AboutPanelProps) {
  return (
    <div className="about-overlay" onClick={onClose}>
      <div className="about-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="detail-card-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2>About this map</h2>

        <p>
          This map shows Paycheck Protection Program (PPP) loans issued to businesses and
          individuals in North Carolina, drawn from the{" "}
          <a href={SBA_SOURCE_URL} target="_blank" rel="noreferrer">
            SBA's public FOIA release
          </a>
          .
        </p>

        <h3>Data vintage</h3>
        <p>
          Loan attributes (amounts, status, forgiveness): <strong>{DATA_VINTAGE}</strong>. This
          is the source of truth for every field except location.
        </p>
        <p>
          Coordinates: <strong>{GEOCODE_VINTAGE}</strong>, from{" "}
          <a href={GEOCODIO_URL} target="_blank" rel="noreferrer">
            Geocodio's free geocoded PPP release
          </a>{" "}
          (CC BY 4.0 — used under attribution). Because this geocoding snapshot predates most
          forgiveness decisions, it is used for coordinates only and never substituted for SBA
          attribute data.
        </p>

        <h3>Precision policy</h3>
        <p>
          This build uses <strong>tiered precision (policy B)</strong>: corporations, LLCs,
          nonprofits, and all loans ≥ $150,000 render at their matched address. Sole
          proprietorships, independent contractors, and self-employed borrowers below that
          threshold render only at the ZIP-code centroid — a large share of these loans list a
          home address as the business address, and a ZIP-centroid point never indicates a
          specific residence. Approximate points are drawn hollow and translucent; exact points
          are drawn solid. The full record for any loan, regardless of precision tier, is
          reachable by search.
        </p>

        <h3>Geocode match rate</h3>
        <p>
          99.88% of loan records nationally were matched to a coordinate (rooftop, street, or
          ZIP-centroid tier). The remainder have no usable location and are excluded from the
          map, though still searchable. Full breakdown by state and tier is in{" "}
          <code>reports/03_geocode.md</code>.
        </p>

        <h3>Demographic fields</h3>
        <p>
          Race/ethnicity, gender, and veteran status were optional on most loan applications and
          are blank for the large majority of records. This build does not surface them on
          individual records; they are reserved for aggregate analysis only, where non-response
          rates would need to be shown alongside any figure to avoid misleading conclusions.
        </p>

        <h3>A note on what this data does and doesn't show</h3>
        <p>
          <strong>A loan record is not evidence of wrongdoing.</strong> Millions of these loans
          went to businesses that used the money exactly as intended — making payroll during a
          period when the alternative was closing. Some fraud did occur and has been documented
          elsewhere; this map does not attempt to identify it, and a name and dollar figure
          appearing here should not be read as an accusation.
        </p>
      </div>
    </div>
  );
}
