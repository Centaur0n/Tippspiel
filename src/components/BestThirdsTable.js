import React from 'react';

function BestThirdsTable({ teams }) {
  if (!teams || teams.length === 0) return null;

  // 1. Sortierung fixen: Punkte -> Differenz -> Erzielte Tore
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
        // Die blaue Umrandung wurde hier entfernt
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
            const isQualified = index < 8;
            
            const displayDiff = team.goalDiff !== undefined ? team.goalDiff : team.diff;
            const displayGoals = team.goalsFor !== undefined ? team.goalsFor : team.goals;
            const displayName = team.name || team.team;
            const displayGroup = team.groupId || team.group;

            return (
              <tr 
                key={displayName + index} 
                style={{ 
                  borderBottom: "1px solid #edf2f7",
                  backgroundColor: isQualified ? "#f0fff4" : "#ffffff" // Sehr dezentes Grün
                }}
              >
                <td style={{ ...tdStyle, color: "#718096", width: "30px" }}>{index + 1}.</td>
                <td style={{ ...tdCenterStyle, color: "#718096", width: "40px" }}>{displayGroup}</td>
                <td style={{ ...tdStyle, fontWeight: isQualified ? "600" : "400", color: "#2d3748" }}>
                  {displayName}
                </td>
                <td style={{ ...tdCenterStyle, fontWeight: "bold", color: "#000" }}>{team.points}</td>
                <td style={{ ...tdCenterStyle, color: displayDiff < 0 ? "#e53e3e" : "#2d3748" }}>
                  {displayDiff > 0 ? `+${displayDiff}` : displayDiff}
                </td>
                <td style={tdCenterStyle}>{displayGoals}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Styles für bessere Lesbarkeit und Abstände
const thStyle = { 
  padding: "12px 10px", 
  fontWeight: "600",
  fontSize: "0.9em",
  textTransform: "uppercase",
  letterSpacing: "0.05em"
};

const thCenterStyle = { ...thStyle, textAlign: "center" };

const tdStyle = { 
  padding: "10px 10px", 
  fontSize: "0.95em"
};

const tdCenterStyle = { ...tdStyle, textAlign: "center" };

export default BestThirdsTable;