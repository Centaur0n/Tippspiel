import React from 'react';
import { FlagIcon } from '../Utils/teamUtils';
import { BEST_THIRDS_STYLES } from '../Utils/uiConstants';

/**
 * BestThirdsTable: Komponente zur Darstellung der Rangliste der Gruppendritten.
 * Nutzt nun zentralisierte Styles aus uiConstants.
 */
function BestThirdsTable({ 
  teams, 
  manualRanks = {}, 
  onSaveManualRank, 
  isSubmitted, 
  canEditRanks = true
}) {
  
  if (!teams || teams.length === 0) return null;

  // --- 1. LOGIK: GLEICHSTAND IDENTIFIZIEREN ---
  const tiedTeams = teams.filter((team, index) => {
    const next = teams[index + 1];
    const prev = teams[index - 1];
    
    const isTiedWithNext = next && 
      team.points === next.points && 
      (team.goalDiff ?? team.diff) === (next.goalDiff ?? next.diff) && 
      (team.goalsFor ?? team.goals) === (next.goalsFor ?? next.goals);
      
    const isTiedWithPrev = prev && 
      team.points === prev.points && 
      (team.goalDiff ?? team.diff) === (prev.goalDiff ?? prev.diff) && 
      (team.goalsFor ?? team.goals) === (prev.goalsFor ?? prev.goals);

    return isTiedWithNext || isTiedWithPrev;
  });

  const hasTies = tiedTeams.length > 0;

  return (
    <div style={BEST_THIRDS_STYLES.container}>
      <h3 style={BEST_THIRDS_STYLES.title}>Rangliste der Gruppendritten</h3>

      {/* --- FEHLERMELDUNG & MANUELLE STICHWAHL --- */}
      {hasTies && (
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
              const displayName = team.team || team.name;
              return (
                <div key={`tie-${displayName}`} style={BEST_THIRDS_STYLES.tieRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                    <FlagIcon teamName={displayName} />
                    <span style={{ fontSize: "0.9rem", fontWeight: "600" }}>
                      {displayName} <span style={{ fontWeight: "400", color: "#718096" }}>(Gruppe {team.group || team.groupId})</span>
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    placeholder="Rang"
                    value={manualRanks[displayName] || ""}
                    // ABSICHERUNG: Nur rufen, wenn Funktion da ist UND editiert werden darf
                    onChange={(e) => {
                      if (typeof onSaveManualRank === 'function' && canEditRanks) {
                        onSaveManualRank(displayName, e.target.value);
                      }
                    }}
                    // Input sperren, wenn Phase abgegeben oder Admin noch nicht alle Spiele hat
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
          {!canEditRanks && (
            <p style={{ color: "#e53e3e", fontSize: "0.75rem", marginTop: "10px" }}>
              * Eingabe erst möglich, wenn alle Gruppenspiele eingetragen sind.
            </p>
          )}
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
            const displayDiff = team.goalDiff !== undefined ? team.goalDiff : team.diff;
            const displayGoals = team.goalsFor !== undefined ? team.goalsFor : team.goals;
            const displayName = team.name || team.team;
            const displayGroup = team.groupId || team.group;

            return (
              <tr key={`${displayName}-${index}`} style={BEST_THIRDS_STYLES.row(isQualified)}>
                <td style={{ ...BEST_THIRDS_STYLES.td(isQualified), width: "30px" }}>
                  {index + 1}.
                </td>

                <td style={{ ...BEST_THIRDS_STYLES.tdCenter(isQualified), width: "40px" }}>
                  {displayGroup}
                </td>

                <td style={BEST_THIRDS_STYLES.td(isQualified)}>
                  <div style={BEST_THIRDS_STYLES.teamCell}>
                    <FlagIcon teamName={displayName} />
                    {displayName}
                  </div>
                </td>

                <td style={BEST_THIRDS_STYLES.tdCenter(isQualified)}>
                  {team.points}
                </td>

                <td style={{ 
                  ...BEST_THIRDS_STYLES.tdCenter(isQualified), 
                  color: displayDiff < 0 ? "#e53e3e" : (displayDiff > 0 ? "#38a169" : (isQualified ? "#000" : "#718096")) 
                }}>
                  {displayDiff > 0 ? `+${displayDiff}` : displayDiff}
                </td>

                <td style={BEST_THIRDS_STYLES.tdCenter(isQualified)}>
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

export default BestThirdsTable;