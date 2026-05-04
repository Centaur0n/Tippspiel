import React from 'react';
import TipInput from './TipInput';

/**
 * KOBracket: Visualisiert den Turnierbaum ab der KO-Phase.
 * Berechnet dynamisch Linienverbindungen und Team-Platzierungen.
 */
const KOBracket = ({ 
  koByRound, tips, phase, roundNames, treeHeight, getTopPosition, 
  getTeamFromPrevious, resolveSlot, context, KO_STRUCTURE, 
  saveTip, deleteKORound, isAdmin 
}) => {

  // --- INITIALISIERUNG & HELFER ---

  if (!phase) {
    return <div style={loadingStyle}>Lade Turnierdaten...</div>;
  }

  // Fallback für Rundennamen
  const safeRoundNames = roundNames || {
    1: "Sechzehntelfinale", 2: "Achtelfinale", 3: "Viertelfinale", 4: "Halbfinale", 5: "Finale"
  };

  // Hilfsfunktion für Flaggen-Ländercodes
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

  const BOX_HEIGHT = 135; 
  const phaseHeights = { 1: "4000px", 2: "3300px", 3: "1650px", 4: "900px", 5: "600px" };
  const currentMinHeight = phase ? phaseHeights[phase.id] : "100%";
  const viewportStyle = { minHeight: currentMinHeight, padding: "20px", backgroundColor: "#fff", display: "inline-block", verticalAlign: "top" };

  const startIdxOfPhase = phase.id <= 2 ? 0 : phase.id - 2;
  const treeContainerStyle = (treeHeight) => ({ position: "relative", height: `${treeHeight}px`, backgroundColor: "#fff", width: "fit-content", minWidth: "100%"});

  // --- INTERNE RENDER-FUNKTIONEN ---

  // Zeichnet eine einzelne Team-Zeile innerhalb eines Spiel-Blocks
  const renderTeamRow = (teamName, side, isFirst, winningSide) => {
    const isWinner = winningSide === side;
    return (
      <div style={{ 
        ...teamRowBaseStyle, 
        background: isWinner ? "#f0fff4" : "transparent", 
        borderBottom: isFirst ? "1px solid #f1f5f9" : "none",
        position: "relative",
        width: '${visibleRounds * 300}px' 
      }}>
        <div style={teamInfoFlexStyle}>
          {teamName !== "?" ? (
            <div style={flagWrapperStyle}>
              <img 
                src={`https://flagcdn.com/w40/${getCountryCode(teamName)}.png`} 
                alt="" 
                style={flagImgStyle} 
              />
            </div>
          ) : (
            <div style={flagPlaceholderStyle} />
          )}
          <span style={{ 
            ...teamNameTextStyle, 
            fontWeight: isWinner ? "700" : "400", 
            color: teamName === "?" ? "#cbd5e0" : "#1e293b" 
          }}>
            {teamName}
          </span>
        </div>
        {isWinner && <span style={checkMarkStyle}>✓</span>}
      </div>
    );
  };

  return (
    <div style={viewportStyle}>
      
      {/* 🔄 RESET-HEADER: Zeigt Rundennamen und Reset-Buttons über den Spalten */}
      <div style={headerRowStyle}>
        {Object.keys(koByRound)
          .sort((a, b) => Number(a) - Number(b))
          .filter((roundKey) => (Number(roundKey) - 1) >= startIdxOfPhase)
          .map((round) => (
            <div key={round} style={headerColumnStyle}>
              <span style={roundTitleStyle}>
                {Number(round) === 5 ? "Finale" : safeRoundNames[round]}
              </span>
              
              {/* Der Button verschwindet, wenn isAdmin wahr ist */}
              {!phase?.is_submitted && !isAdmin && ( 
                <button 
                  onClick={() => deleteKORound(Number(round), phase?.id)}
                  style={resetButtonStyle}
                >
                  Reset
                </button>
              )}
            </div>
          ))}
      </div>

      {/* 🌲 DER BAUM: Absolute Positionierung der Spiele und Linien */}
      <div style={ treeContainerStyle(treeHeight)}>
        {Object.keys(koByRound)
          .sort((a, b) => Number(a) - Number(b))
          .filter((roundKey) => (Number(roundKey) - 1) >= startIdxOfPhase)
          .map((round, visibleRoundIndex) => {
            const actualRoundIdx = Number(round) - 1;
            const isActiveTippingRound = actualRoundIdx === startIdxOfPhase;

            return (
              <div key={round}>
                {koByRound[round].map((m, matchIndex) => {
                  const tip = tips[m.id];
                  const currentTop = getTopPosition(actualRoundIdx, matchIndex);
                  const nextTop = getTopPosition(actualRoundIdx + 1, Math.floor(matchIndex / 2));

                  // --- LOGIK: TEAM-HERKUNFT ERMITTELN ---
                  let teamA, teamB;
                  if (phase.id > 1 && isActiveTippingRound) {
                    teamA = m.team_a || "?";
                    teamB = m.team_b || "?";
                  } else if (actualRoundIdx === 0) {
                    const matchDef = KO_STRUCTURE.round16[matchIndex];
                    teamA = resolveSlot(matchDef[0], context);
                    teamB = resolveSlot(matchDef[1], context);
                  } else {
                    teamA = getTeamFromPrevious(actualRoundIdx, matchIndex, "A");
                    teamB = getTeamFromPrevious(actualRoundIdx, matchIndex, "B");
                  }

                  // --- LOGIK: GEWINNER ERMITTELN (für visuelle Hervorhebung) ---
                  const winningSide = (() => {
                    if (!tip) return null;
                    const gA = (tip.goals_a !== null && tip.goals_a !== "") ? Number(tip.goals_a) : null;
                    const gB = (tip.goals_b !== null && tip.goals_b !== "") ? Number(tip.goals_b) : null;
                    if (gA !== null && gB !== null) {
                      if (gA > gB) return "1";
                      if (gB > gA) return "2";
                      return tip.winner ? String(tip.winner) : null;
                    }
                    return tip.winner ? String(tip.winner) : null;
                  })();

                  return (
                    <div key={m.id} style={{ 
                      position: "absolute", 
                      top: `${currentTop}px`, 
                      left: `${visibleRoundIndex * 300}px`, 
                      height: `${BOX_HEIGHT}px` 
                    }}>
                      {/* Match-Label (z.B. "Viertelfinale 1") */}
                      <div style={matchLabelStyle}>
                        {actualRoundIdx === 4 ? (matchIndex === 1 ? "Spiel um Platz 3" : "Finale") : `${safeRoundNames[round]} ${matchIndex + 1}`}
                      </div>

                      {/* Die Match-Box */}
                      <div style={matchBoxStyle}>
                        {renderTeamRow(teamA, "1", true, winningSide)}
                        {renderTeamRow(teamB, "2", false, winningSide)}

                        {/* TIPP-EINGABE / ANZEIGE-BEREICH */}
                        <div style={tipContainerStyle}>
                          {/* Wenn Admin, zeige IMMER das Eingabefeld (TipInput) */}
                          {isAdmin ? (
                            <TipInput 
                              teamA={teamA} 
                              teamB={teamB} 
                              isKO={true}
                              onSave={(a, b, w) => saveTip(m.id, a, b, w)}
                              initialGoalsA={tip?.goals_a} 
                              initialGoalsB={tip?.goals_b} 
                              initialWinner={tip?.winner}
                              // Im Admin-Modus erlauben wir immer die Tore-Eingabe
                              onlyWinner={false} 
                            />
                          ) : (
                            /* Logik für normale User (nur zur Info, nicht ändern) */
                            !phase?.is_submitted ? (
                              tip ? (
                                <div style={savedTipDisplayStyle}>
                                  {(tip.goals_a !== null && tip.goals_b !== null && tip.goals_a !== "") 
                                    ? `${tip.goals_a} : ${tip.goals_b}` 
                                    : (String(tip.winner) === "1" ? teamA : teamB) 
                                  }
                                  {tip.goals_a !== null && tip.goals_a !== "" && Number(tip.goals_a) === Number(tip.goals_b) && (
                                    <span style={winnerSubTextStyle}>
                                      Sieger: {String(tip.winner) === "1" ? teamA : teamB}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                (teamA !== "?" && teamB !== "?") ? (
                                  <TipInput 
                                    teamA={teamA} teamB={teamB} isKO={true}
                                    onSave={(a, b, w) => saveTip(m.id, a, b, w)}
                                    initialGoalsA={tip?.goals_a} initialGoalsB={tip?.goals_b} initialWinner={tip?.winner}
                                    onlyWinner={phase.id === 1 || !isActiveTippingRound} 
                                  />
                                ) : (
                                  <div style={waitingTextStyle}>Warten...</div>
                                )
                              )
                            ) : (
                              <div style={finalResultStyle}>
                                {tip?.goals_a !== null && tip?.goals_a !== "" ? `${tip.goals_a} : ${tip.goals_b}` : (tip?.winner ? (Number(tip.winner) === 1 ? teamA : teamB) : "-")}
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      {/* 📐 LINIEN: Verbindungen zur nächsten Runde */}
                      {actualRoundIdx < 4 && (
                        <>
                          <div style={horizontalLineStyle} />
                          <div style={{ 
                            ...verticalLineBaseStyle,
                            top: matchIndex % 2 === 0 ? "82px" : `calc(82px - ${Math.abs(nextTop - currentTop)}px)`, 
                            height: `${Math.abs(nextTop - currentTop)}px`, 
                          }} />
                          {matchIndex % 2 === 0 && (
                            <div style={{ ...horizontalLineStyle, top: `${(nextTop - currentTop) + 82}px`, right: "-60px" }} />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </div>
  );
};

// --- STYLES ---

const loadingStyle = { padding: "20px", color: "#666" };

const headerRowStyle = { display: "flex", marginBottom: "60px" };
const headerColumnStyle = { width: "240px", marginRight: "60px", textAlign: "center", display: "flex", flexDirection: "column", gap: "8px" };
const roundTitleStyle = { fontWeight: "bold", fontSize: "1rem", color: "#2d3748" };
const resetButtonStyle = { padding: "4px 8px", fontSize: "0.75rem", backgroundColor: "#fff", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer", color: "#666", zIndex: 10 };

const matchLabelStyle = { fontSize: "0.65rem", fontWeight: "bold", color: "#878b8e", textTransform: "uppercase", marginBottom: "4px" };
const matchBoxStyle = { width: "240px", minHeight: "115px", background: "#fff", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" };

const teamRowBaseStyle = { padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "40px" };
const teamInfoFlexStyle = { display: "flex", alignItems: "center", gap: "10px" };
const teamNameTextStyle = { fontSize: "0.85rem" };
const checkMarkStyle = { color: "#48bb78", fontWeight: "bold" };

const flagWrapperStyle = { width: "22px", height: "16px", overflow: "hidden", borderRadius: "2px", border: "1px solid #eee", display: "flex", alignItems: "center" };
const flagImgStyle = { width: "100%", height: "auto" };
const flagPlaceholderStyle = { width: "22px", height: "16px", backgroundColor: "#f1f5f9", borderRadius: "2px" };

const tipContainerStyle = { padding: "6px 10px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" };
const savedTipDisplayStyle = { fontSize: "0.9rem", textAlign: "center", fontWeight: "bold", color: "#1a73e8", display: "flex", flexDirection: "column", gap: "2px" };
const winnerSubTextStyle = { fontSize: "0.65rem", color: "#666", fontWeight: "normal" };
const waitingTextStyle = { fontSize: "0.65rem", color: "#94a3b8", textAlign: "center" };
const finalResultStyle = { fontSize: "0.75rem", textAlign: "center", fontWeight: "bold", color: "#475569" };

const horizontalLineStyle = { position: "absolute", top: "82px", right: "-30px", width: "30px", height: "2px", background: "#cbd5e0" };
const verticalLineBaseStyle = { position: "absolute", right: "-30px", width: "2px", background: "#cbd5e0" };

export default KOBracket;