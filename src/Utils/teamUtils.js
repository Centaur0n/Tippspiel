// teamUtils.js

/**
 * Mapping-Objekt: Verknüpft Teamnamen mit den ISO-Codes für FlagCDN.
 * Wichtig: Die Namen müssen exakt mit den Daten aus der Datenbank/State übereinstimmen.
 */
const countryMapping = {
  "Mexiko": "mx", "Südafrika": "za", "Südkorea": "kr", "Tschechien": "cz",
  "Kanada": "ca", "Bosnien": "ba", "USA": "us", "Paraguay": "py",
  "Katar": "qa", "Schweiz": "ch", "Brasilien": "br", "Marokko": "ma",
  "Haiti": "ht", "Schottland": "gb-sct", "Australien": "au", "Türkei": "tr",
  "Deutschland": "de", "Curaçao": "cw", "Niederlande": "nl", "Japan": "jp",
  "Elfenbeinküste": "ci", "Ecuador": "ec", "Schweden": "se", "Tunesien": "tn",
  "Spanien": "es", "Kap Verde": "cv", "Belgien": "be", "Ägypten": "eg",
  "Saudi-Arabien": "sa", "Uruguay": "uy", "Iran": "ir", "Neuseeland": "nz",
  "Frankreich": "fr", "Senegal": "sn", "Irak": "iq", "Norwegen": "no",
  "Argentinien": "ar", "Algerien": "dz", "Österreich": "at", "Jordanien": "jo",
  "Portugal": "pt", "Kongo": "cd", "England": "gb-eng", "Kroatien": "hr",
  "Ghana": "gh", "Panama": "pa", "Usbekistan": "uz", "Kolumbien": "co"
};

/**
 * Hilfsfunktion zum Abrufen des ISO-Codes.
 */
export const getCountryCode = (teamName) => {
  return countryMapping[teamName] || null;
};

export const ALL_TEAMS = Object.keys(countryMapping).sort();
export const POT_4_TEAMS = [
  "Jordanien", "Kap Verde", "Ghana", "Curaçao", "Haiti", 
  "Neuseeland", "Bosnien", "Kongo", "Irak", 
  "Schweden", "Tschechien", "Türkei"
].sort();

/**
 * React-Komponente: Zeigt die Flagge eines Teams an.
 * @param {string} teamName - Der Name des Teams (muss im countryMapping existieren).
 */
export const FlagIcon = ({ teamName }) => {
  const code = getCountryCode(teamName);
  
  // Fallback: Wenn kein Code gefunden wird, zeige einen grauen Platzhalter
  if (!code) {
    return (
      <div style={{ 
        width: "20px", 
        height: "14px", 
        backgroundColor: "#eee", 
        borderRadius: "2px",
        display: "inline-block" 
      }} />
    );
  }

  // Flagge von FlagCDN laden
  return (
    <img 
      src={`https://flagcdn.com/w40/${code}.png`} 
      alt={teamName} 
      style={{ 
        width: "20px", 
        height: "auto", 
        borderRadius: "2px", 
        border: "1px solid #f1f1f1",
        display: "inline-block",
        verticalAlign: "middle"
      }}
    />
  );
};