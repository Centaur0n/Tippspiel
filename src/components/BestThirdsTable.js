import React from 'react';

function BestThirdsTable({ teams }) {
  // Mapping aller Teams zu Ländercodes
  const getCountryCode = (teamName) => {
    const mapping = {
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
    return mapping[teamName] || null;
  };

  // Hilfs-Komponente für die Flagge
  const FlagIcon = ({ teamName }) => {
    const code = getCountryCode(teamName);
    if (!code) return <div style={{ width: "20px", height: "14px", backgroundColor: "#eee", borderRadius: "2px" }} />;
    return (
      <img 
        src={`https://flagcdn.com/w40/${code}.png`} 
        alt="" 
        style={{ width: "20px", height: "auto", borderRadius: "2px", border: "1px solid #f1f1f1" }}
      />
    );
  };

  if (!teams || teams.length === 0) return null;

  // 1. Sortierung: Punkte -> Differenz -> Erzielte Tore
  const sortedThirds = [...teams].sort((a, b) => {
    const diffA = a.goalDiff !== undefined ? a.goalDiff : a.diff;
    const diffB = b.goalDiff !== undefined ? b.goalDiff : b.diff;
    const goalsA = a.goalsFor !== undefined ? a.goalsFor : a.goals;
    const goalsB = b.goalsFor !== undefined ? b.goalsFor : b.goals;

    return (
      b.points - a.points || 
      diffB - diffA || 
      goalsB - goalsA
    );
  }).slice(0, 12);

  return (
    <div style={{ marginTop: "40px", width: "100%", fontFamily: "sans-serif" }}>
      <h3 style={{ marginBottom: "10px", color: "#333", fontSize: "1.2em" }}>
        Rangliste der Gruppendritten
      </h3>
      
      <table style={{ 
        width: "100%", 
        borderCollapse: "collapse",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)" 
      }}>
        <thead>
          <tr style={{ backgroundColor: "#6b94e7", color: "#ffffff", textAlign: "left" }}>
            <th style={thStyle}>#</th>
            <th style={thCenterStyle}>Grp</th>
            <th style={thStyle}>Team</th>
            <th style={thCenterStyle}>Pkt</th>
            <th style={thCenterStyle}>Diff</th>
            <th style={thCenterStyle}>Tore</th>
          </tr>
        </thead>
        <tbody>
  {sortedThirds.map((team, index) => {
    // Bedingung: Plätze 1-8 sind qualifiziert
    const isQualified = index < 8;
    
    const displayDiff = team.goalDiff !== undefined ? team.goalDiff : team.diff;
    const displayGoals = team.goalsFor !== undefined ? team.goalsFor : team.goals;
    const displayName = team.name || team.team;
    const displayGroup = team.groupId || team.group;

    // Gemeinsamer Style für die Schriftstärke
    const rowFontWeight = isQualified ? "bold" : "normal";
    const rowColor = isQualified ? "#000" : "#718096"; // Qualifizierte etwas dunkler/deutlicher

    return (
      <tr 
        key={displayName + index} 
        style={{ 
          borderBottom: "1px solid #edf2f7",
          backgroundColor: isQualified ? "#f0fff4" : "#ffffff" 
        }}
      >
        {/* Spalte # */}
        <td style={{ ...tdStyle, fontWeight: rowFontWeight, color: rowColor, width: "30px" }}>
          {index + 1}.
        </td>

        {/* Spalte GRP */}
        <td style={{ ...tdCenterStyle, fontWeight: rowFontWeight, color: rowColor, width: "40px" }}>
          {displayGroup}
        </td>

        {/* Spalte TEAM */}
        <td style={{ ...tdStyle, fontWeight: rowFontWeight, color: rowColor }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FlagIcon teamName={displayName} />
            {displayName}
          </div>
        </td>

        {/* Spalte PKT */}
        <td style={{ ...tdCenterStyle, fontWeight: rowFontWeight, color: rowColor }}>
          {team.points}
        </td>

        {/* Spalte DIFF */}
        <td style={{ 
          ...tdCenterStyle, 
          fontWeight: rowFontWeight, 
          color: displayDiff < 0 ? "#e53e3e" : rowColor 
        }}>
          {displayDiff > 0 ? `+${displayDiff}` : displayDiff}
        </td>

        {/* Spalte TORE */}
        <td style={{ ...tdCenterStyle, fontWeight: rowFontWeight, color: rowColor }}>
          {displayGoals}
        </td>
      </tr>
    );
  })}
</tbody>
      </table>
    </div>
  );
}

const thStyle = { padding: "12px 10px", fontWeight: "600", fontSize: "0.9em", textTransform: "uppercase", letterSpacing: "0.05em" };
const thCenterStyle = { ...thStyle, textAlign: "center" };
const tdStyle = { padding: "10px 10px", fontSize: "0.95em" };
const tdCenterStyle = { ...tdStyle, textAlign: "center" };

export default BestThirdsTable;