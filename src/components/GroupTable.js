import React from 'react';
import TipInput from './TipInput'; 
import { FlagIcon } from '../Utils/teamUtils';
import { GROUP_TABLE_STYLES } from '../Utils/uiConstants';

const GroupTable = ({ 
  groupName, 
  matches, 
  tips, 
  tableData, 
  isSubmitted, 
  onDeleteTips, 
  onSaveTip,
  manualRanks = {},
  onSaveManualRank,
  isAdmin = false 
}) => {

  // Prüft, ob für alle Spiele dieser Gruppe bereits Tipps abgegeben wurden
  const isGroupFinished = matches.every(m => tips[m.id] !== undefined);

  // ERMITTLUNG VON GLEICHSTAND:
  // Sucht nach Teams, die exakt dieselben Punkte, Differenz und Tore haben
  const tiedTeams = tableData.filter((teamA, i) => 
    tableData.some((teamB, j) => 
      i !== j && 
      teamA.points === teamB.points && 
      teamA.diff === teamB.diff && 
      teamA.goals === teamB.goals
    )
  );

  const hasTie = tiedTeams.length > 0;

  return (
    <div style={GROUP_TABLE_STYLES.mainContainer}>
      {/* LINKE SEITE: SPIELLISTE */}
      <div style={GROUP_TABLE_STYLES.matchSection}>
        <div style={GROUP_TABLE_STYLES.headerContainer}>
          <h3 style={GROUP_TABLE_STYLES.groupTitle}>Gruppe {groupName}</h3>
          {/* Reset-Button wird nur angezeigt, wenn noch nicht abgegeben wurde */}
          {!isSubmitted && !isAdmin && (
            <button onClick={() => onDeleteTips(groupName)} style={GROUP_TABLE_STYLES.resetButton}>
              Reset
            </button>
          )}
        </div>

        {/* Spiele werden nach ihrer festgelegten Reihenfolge sortiert */}
        {[...matches]
          .sort((a, b) => (a.match_order || 0) - (b.match_order || 0))
          .map((m) => {
            const tip = tips[m.id];
            return (
              <div key={m.id} style={GROUP_TABLE_STYLES.matchCard}>                  
                <div style={GROUP_TABLE_STYLES.matchFlex}>
                  <div style={GROUP_TABLE_STYLES.teamAContainer}>
                    <span style={GROUP_TABLE_STYLES.teamName}>{m.team_a}</span>
                    <FlagIcon teamName={m.team_a} />
                  </div>
                  
                  {/* Anzeige: Entweder der gespeicherte Tipp oder das Eingabefeld */}
                  <div style={GROUP_TABLE_STYLES.scoreDisplayContainer}>
                    {(isAdmin || !tip) ? (
                      <div style={GROUP_TABLE_STYLES.scoreDisplayContainer}>
                        <TipInput 
                          isKO={false} 
                          // Wir übergeben die vorhandenen Werte als Default, damit man sie überschreiben kann
                          initialGoalsA={tip?.goals_a} 
                          initialGoalsB={tip?.goals_b}
                          onSave={(a, b, w) => onSaveTip(m.id, a, b, w)} 
                        />
                      </div>
                    ) : (
                      <div style={GROUP_TABLE_STYLES.savedScore}>{tip.goals_a} : {tip.goals_b}</div>
                    )}  
                  </div>

                  <div style={GROUP_TABLE_STYLES.teamBContainer}>
                    <FlagIcon teamName={m.team_b} />
                    <span style={GROUP_TABLE_STYLES.teamName}>{m.team_b}</span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* RECHTE SEITE: LIVE-TABELLE */}
      <div style={GROUP_TABLE_STYLES.tableSection}>
        <table style={GROUP_TABLE_STYLES.tableBase}>
          <thead>
            <tr style={GROUP_TABLE_STYLES.tableHeaderRow}>
              <th style={GROUP_TABLE_STYLES.th}>#</th>
              <th style={GROUP_TABLE_STYLES.th}>Team</th>
              <th style={{...GROUP_TABLE_STYLES.th, textAlign: 'center'}}>PKT</th>
              <th style={{...GROUP_TABLE_STYLES.th, textAlign: 'center'}}>DIFF</th>
              <th style={{...GROUP_TABLE_STYLES.th, textAlign: 'center'}}>TORE</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, index) => {
              const isQualified = index < 2; // Die ersten beiden Plätze sind grün markiert
              return (
                <tr key={row.team} style={{ ...GROUP_TABLE_STYLES.tableRow, backgroundColor: isQualified ? "#f0fff4" : "#ffffff" }}>
                  <td style={GROUP_TABLE_STYLES.rankTd}>{index + 1}.</td>
                  <td style={{ ...GROUP_TABLE_STYLES.td, color: "#2d3748", fontWeight: isQualified ? "600" : "400" }}>
                    <div style={GROUP_TABLE_STYLES.teamCellContent}>
                      <FlagIcon teamName={row.team} />
                      {row.team}
                    </div>
                  </td>
                  <td style={GROUP_TABLE_STYLES.pointsTd}>{row.points}</td>
                  <td style={{ 
                    ...GROUP_TABLE_STYLES.td, 
                    textAlign: 'center', 
                    color: row.diff < 0 ? "#e53e3e" : "#2d3748", // Negatives Torverhältnis wird rot markiert
                    fontWeight: row.diff !== 0 ? "600" : "400" 
                  }}>
                    {row.diff > 0 ? `+${row.diff}` : row.diff}
                  </td>
                  <td style={{...GROUP_TABLE_STYLES.td, textAlign: 'center'}}>{row.goals}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* STICHWAHL-SEKTION (Manuelle Platzierung bei absolutem Gleichstand) */}
        {isGroupFinished && hasTie && (
          <div style={GROUP_TABLE_STYLES.swContainer}>
            <div style={GROUP_TABLE_STYLES.swHeader}>⚠️ Stichwahl nötig</div>
            <p style={GROUP_TABLE_STYLES.swInfoText}>Niedrigere Zahl für besseren Platz bei Gleichstand.</p>
            <div style={GROUP_TABLE_STYLES.swGrid}>
              {tiedTeams.map(row => (
                <div key={row.team} style={GROUP_TABLE_STYLES.swRow}>
                  <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                    <FlagIcon teamName={row.team} size="small" />
                    <span style={{fontSize: '0.85rem', fontWeight: '500'}}>{row.team}</span>
                  </div>
                  <input 
                    type="number" min="1" max="4"
                    value={manualRanks[row.team] || ""}
                    onChange={(e) => onSaveManualRank(row.team, e.target.value)}
                    disabled={isSubmitted}
                    style={GROUP_TABLE_STYLES.manualRankInput}
                    placeholder="-"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupTable;