import { GEOCODIO_URL, SBA_SOURCE_URL } from "../lib/config";

interface FooterProps {
  onAboutClick: () => void;
}

export function Footer({ onAboutClick }: FooterProps) {
  return (
    <footer className="app-footer">
      <span>
        Loan data: <a href={SBA_SOURCE_URL} target="_blank" rel="noreferrer">SBA FOIA release</a>, public domain.
      </span>
      <span>
        Coordinates: <a href={GEOCODIO_URL} target="_blank" rel="noreferrer">Geocodio</a> (CC BY 4.0).
      </span>
      <span>A loan record is not evidence of wrongdoing.</span>
      <button type="button" onClick={onAboutClick}>
        About this map
      </button>
    </footer>
  );
}
