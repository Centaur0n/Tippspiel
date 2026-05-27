import React from 'react';
import { FlagIcon } from '../Utils/teamUtils';
import { BEST_THIRDS_STYLES } from '../Utils/uiConstants';

/**
 * BestThirdsTable: Komponente zur Darstellung der Rangliste der Gruppendritten.
 * Blendet die Stichwahl-Box erst ein, wenn alle Gruppenspiele abgeschlossen sind.
 */
function BestThirdsTable({ 
  teams, 
  manualRanks = {}, 
  onSaveManualRank, 
  isSubmitted, 
  canEditRanks = true // Steuert, ob alle 72 Spiele eingetragen sind
}) {
  
  if (!teams || teams.length === 0) return null;

  // --- 1. LOGIK: RELEVANTEN GLEICHSTAND AN DER QUALIFIKATIONSGRENZE PRÜFEN ---
  const cutoffIndex = 7; // 8. Platz (Index 7) ist die Grenze
  const targetTeam = teams[cutoffIndex];
  const nextTeam = teams[cutoffIndex + 1];

  const isBorderTied = targetTeam && nextTeam &&
    targetTeam.points === nextTeam.points &&
    targetTeam.diff === nextTeam.diff &&
    targetTeam.goals === nextTeam.goals;

  const tiedTeams = isBorderTied 
    ? teams.filter(team => 
        team.points === targetTeam.points &&
        team.diff === targetTeam.diff &&
        team.goals === targetTeam.goals
      )
    : [];

  // --- NEU: Box NUR anzeigen bei echtem Gleichstand UND wenn alle Spiele eingetragen sind ---
  const showTieBox = tiedTeams.length > 0 && canEditRanks;

  return (
    <div style={BEST_THIRDS_STYLES.container}>
      <h3 style={BEST_THIRDS_STYLES.title}>Rangliste der Gruppendritten</h3>

      {/* --- FEHLERMELDUNG & MANUELLE STICHWAHL (Wird erst nach 72 Spielen sichtbar) --- */}
      {showTieBox && (
        <div style={BEST_THIRDS_STYLES.errorBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <strong style={{ color: "#c53030" }}>Gleichstand bei den Gruppendritten!</strong>
          </div>
          <p style={{ fontSize: "0.85rem", marginBottom: "15px", color: "#4a5568" }}>
            Punkte, Tordifferenz und Tore sind identisch. Bitte lege die Reihenfolge manuell fest:
          </p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {tiedTeams.map((team) => {
              const displayName = team.team;
              return (
                <div key={`tie-${displayName}`} style={BEST_THIRDS_STYLES.tieRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                    <FlagIcon teamName={displayName} />
                    <span style={{ fontSize: "0.9rem", fontWeight: "600" }}>
                      {displayName} <span style={{ fontWeight: "400", color: "#718096" }}>(Gruppe {team.group})</span>
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    placeholder="Rang"
                    value={manualRanks[displayName] || ""}
                    onChange={(e) => {
                      if (typeof onSaveManualRank === 'function' && canEditRanks) {
                        onSaveManualRank(displayName, e.target.value);
                      }
                    }}
                    disabled={isSubmitted || !canEditRanks}
                    style={{
                      ...BEST_THIRDS_STYLES.tieInput,
                      backgroundColor: (!canEditRanks) ? "#edf2f7" : "white",
                      cursor: (!canEditRanks) ? "not-allowed" : "text"
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- HAUPTTABELLE --- */}
      <table style={BEST_THIRDS_STYLES.tableBase}>
        <thead>
          <tr style={BEST_THIRDS_STYLES.headerRow}>
            <th style={BEST_THIRDS_STYLES.th}>#</th>
            <th style={BEST_THIRDS_STYLES.thCenter}>Grp</th>
            <th style={BEST_THIRDS_STYLES.th}>Team</th>
            <th style={BEST_THIRDS_STYLES.thCenter}>Pkt</th>
            <th style={BEST_THIRDS_STYLES.thCenter}>Diff</th>
            <th style={BEST_THIRDS_STYLES.thCenter}>Tore</th>
          </tr>
        </thead>
        
        <tbody>
          {teams.slice(0, 12).map((team, index) => {
            const isQualified = index < 8;

            return (
              <tr key={`${team.team}-${index}`} style={BEST_THIRDS_STYLES.row(isQualified)}>
                <td style={{ ...BEST_THIRDS_STYLES.td(isQualified), width: "30px" }}>
                  {index + 1}.
                </td>

                <td style={{ ...BEST_THIRDS_STYLES.tdCenter(isQualified), width: "40px" }}>
                  {team.group}
                </td>

                <td style={BEST_THIRDS_STYLES.td(isQualified)}>
                  <div style={BEST_THIRDS_STYLES.teamCell}>
                    <FlagIcon teamName={team.team} />
                    {team.team}
                  </div>
                </td>

                <td style={BEST_THIRDS_STYLES.tdCenter(isQualified)}>
                  {team.points}
                </td>

                <td style={{ 
                  ...BEST_THIRDS_STYLES.tdCenter(isQualified), 
                  color: team.diff < 0 ? "#e53e3e" : (team.diff > 0 ? "#38a169" : (isQualified ? "#000" : "#718096")) 
                }}>
                  {team.diff > 0 ? `+${team.diff}` : team.diff}
                </td>

                <td style={BEST_THIRDS_STYLES.tdCenter(isQualified)}>
                  {team.goals}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default BestThirdsTable;