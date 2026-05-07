import React from 'react';
import TipInput from './TipInput';
import { FlagIcon } from '../Utils/teamUtils'; 
import { BRACKET_STYLES, PHASE_HEIGHTS } from '../Utils/uiConstants';

// Fixe Höhe einer Match-Box inklusive Label und Tipp-Feld
const BOX_HEIGHT = 135;

const KOBracket = ({ 
  koByRound, tips, phase, roundNames, treeHeight, getTopPosition, 
  getTeamFromPrevious, resolveSlot, context, KO_STRUCTURE, 
  saveTip, deleteKORound, isAdmin 
}) => {

  // Lade-Zustand, falls Daten noch nicht bereit sind
  if (!phase) return <div style={BRACKET_STYLES.loading}>Lade Turnierdaten...</div>;

  // Fallback für Rundennamen, falls diese nicht über Props kommen
  const safeRoundNames = roundNames || { 
    1: "Sechzehntelfinale", 2: "Achtelfinale", 3: "Viertelfinale", 4: "Halbfinale", 5: "Finale" 
  };
  
  // Bestimmt, ab welcher Runde der Baum gezeichnet wird (wichtig für die Phasen-Ansicht)
  const startIdxOfPhase = phase.id <= 2 ? 0 : phase.id - 2;

  /**
   * TeamRow: Interne Hilfskomponente für die Darstellung eines Teams innerhalb eines Spiels.
   * Nutzt die BRACKET_STYLES für Gewinner-Hervorhebung und Layout.
   */
  const TeamRow = ({ teamName, side, isFirst, winningSide }) => {
    const isWinner = winningSide === side;
    return (
      <div style={BRACKET_STYLES.teamRow(isWinner, isFirst)}>
        <div style={BRACKET_STYLES.teamInfoFlex}>
          <FlagIcon teamName={teamName} />
          <span style={{ 
            ...BRACKET_STYLES.teamNameText, 
            fontWeight: isWinner ? "700" : "400", 
            color: teamName === "?" ? "#cbd5e0" : "#1e293b" 
          }}>
            {teamName}
          </span>
        </div>
        {isWinner && <span style={BRACKET_STYLES.checkMark}>✓</span>}
      </div>
    );
  };

  return (
    <div style={BRACKET_STYLES.viewport(PHASE_HEIGHTS[phase.id])}>
      
      {/* HEADER: Anzeige der Rundennamen und Reset-Optionen pro Spalte */}
      <div style={BRACKET_STYLES.headerRow}>
        {Object.keys(koByRound)
          .sort((a, b) => Number(a) - Number(b))
          .filter(r => (Number(r)-1) >= startIdxOfPhase)
          .map(round => (
          <div key={round} style={BRACKET_STYLES.headerColumn}>
            <span style={BRACKET_STYLES.roundTitle}>{Number(round) === 5 ? "Finale" : safeRoundNames[round]}</span>
            {(!phase?.is_submitted || isAdmin) && (
              <button onClick={() => deleteKORound(Number(round), phase.id)} style={BRACKET_STYLES.resetButton}>Reset</button>
            )}
          </div>
        ))}
      </div>

      {/* DER TURNIERBAUM: Die eigentliche Visualisierung der Spiele */}
      <div style={BRACKET_STYLES.treeContainer(treeHeight)}>
        {Object.keys(koByRound)
          .sort((a, b) => Number(a) - Number(b))
          .filter(r => (Number(r)-1) >= startIdxOfPhase)
          .map((round, visibleIdx) => {
            const actualRoundIdx = Number(round) - 1;
            const isActiveTippingRound = actualRoundIdx === startIdxOfPhase;

            return (
              <div key={round}>
                {koByRound[round].map((m, matchIndex) => {
                  const tip = (tips && tips[m.id]) ? tips[m.id] : null;
                  const currentTop = getTopPosition(actualRoundIdx, matchIndex);
                  const nextTop = getTopPosition(actualRoundIdx + 1, Math.floor(matchIndex / 2));

                  // LOGIK: Woher kommen die Teams für dieses Spiel?
                  let teamA, teamB;
                  if (phase.id > 1 && isActiveTippingRound) {
                    // Aus dem Speicher der aktuellen Phase
                    teamA = m.team_a || "?";
                    teamB = m.team_b || "?";
                  } else if (actualRoundIdx === 0) {
                    // Erste Runde: Auflösung der Gruppen-Platzierungen (z.B. A1 gegen 1A)
                    const matchDef = KO_STRUCTURE.round16[matchIndex];
                    teamA = resolveSlot(matchDef[0], context);
                    teamB = resolveSlot(matchDef[1], context);
                  } else {
                    // Folgerunden: Gewinner aus den vorherigen Spielen ziehen
                    teamA = getTeamFromPrevious(actualRoundIdx, matchIndex, "A");
                    teamB = getTeamFromPrevious(actualRoundIdx, matchIndex, "B");
                  }

                  // LOGIK: Wer hat das Spiel gewonnen? (Berücksichtigt Tore und manuelle Siegerwahl)
                  const winningSide = (() => {
                    if (!tip) return null;
                    const gA = (tip.goals_a !== null && tip.goals_a !== undefined && tip.goals_a !== "") ? Number(tip.goals_a) : null;
                    const gB = (tip.goals_b !== null && tip.goals_b !== undefined && tip.goals_b !== "") ? Number(tip.goals_b) : null;
                    if (gA !== null && gB !== null) {
                      if (gA > gB) return "1";
                      if (gB > gA) return "2";
                    }
                    return tip.winner ? String(tip.winner) : null;
                  })();

                  return (
                    <div key={m.id} style={{ position: "absolute", top: `${currentTop}px`, left: `${visibleIdx * 300}px`, height: `${BOX_HEIGHT}px` }}>
                      <div style={BRACKET_STYLES.matchLabel}>
                        {actualRoundIdx === 4 ? (matchIndex === 1 ? "Spiel um Platz 3" : "Finale") : `${safeRoundNames[round]} ${matchIndex + 1}`}
                      </div>

                      <div style={BRACKET_STYLES.matchBox}>
                        <TeamRow teamName={teamA} side="1" isFirst winningSide={winningSide} />
                        <TeamRow teamName={teamB} side="2" isFirst={false} winningSide={winningSide} />
                        
                        <div style={BRACKET_STYLES.tipContainer}>
                          {isAdmin ? (
                            // Admin-Ansicht: Immer volle Eingabe möglich
                            <TipInput 
                              teamA={teamA} teamB={teamB} isKO onSave={(a,b,w) => saveTip(m.id,a,b,w)} 
                              initialGoalsA={tip?.goals_a} initialGoalsB={tip?.goals_b} initialWinner={tip?.winner} 
                              onlyWinner={false} 
                            />
                          ) : (
                            !phase?.is_submitted ? (
                              tip ? (
                                // User-Ansicht: Gespeicherte Tipps anzeigen
                                <div style={BRACKET_STYLES.savedTipDisplay}>
                                  {(tip.goals_a !== null && tip.goals_a !== undefined && tip.goals_a !== "") 
                                    ? `${tip.goals_a} : ${tip.goals_b}` 
                                    : `${String(tip.winner) === "1" ? teamA : teamB}`}
                                  {tip.goals_a !== null && tip.goals_a !== undefined && tip.goals_a !== "" && Number(tip.goals_a) === Number(tip.goals_b) && (
                                    <span style={{ fontSize: "0.65rem", color: "#666", fontWeight: "normal" }}>
                                      {String(tip.winner) === "1" ? teamA : teamB}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                // User-Ansicht: Eingabefelder anzeigen
                                (teamA !== "?" && teamB !== "?") ? (
                                  <TipInput 
                                    teamA={teamA} teamB={teamB} isKO onSave={(a,b,w) => saveTip(m.id,a,b,w)} 
                                    onlyWinner={phase.id === 5 ? false : (phase.id === 1 || !isActiveTippingRound)} 
                                  />
                                ) : (
                                  <div style={{ fontSize: "0.65rem", color: "#94a3b8", textAlign: "center" }}>Warten...</div>
                                )
                              )
                            ) : (
                              // Finale Ansicht nach Abgabe
                              <div style={BRACKET_STYLES.finalResult}>
                                {tip?.goals_a !== null && tip?.goals_a !== undefined && tip?.goals_a !== "" 
                                  ? `${tip.goals_a} : ${tip.goals_b}` 
                                  : (tip?.winner ? (Number(tip.winner) === 1 ? teamA : teamB) : "-")}
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      {/* DYNAMISCHE LINIEN: Zeichnet die Pfade zur nächsten Runde */}
                      {actualRoundIdx < 4 && (
                        <>
                          {/* Horizontale Linie direkt aus der Box */}
                          <div style={BRACKET_STYLES.lineHorizontal} />
                          {/* Vertikale Linie zur Mitte des nächsten Spiels */}
                          <div style={{ 
                            ...BRACKET_STYLES.lineVertical,
                            top: matchIndex % 2 === 0 ? "82px" : `calc(82px - ${Math.abs(nextTop - currentTop)}px)`, 
                            height: `${Math.abs(nextTop - currentTop)}px`, 
                          }} />
                          {/* Verbindungsstück zum nächsten Spiel (nur bei jedem zweiten Match nötig) */}
                          {matchIndex % 2 === 0 && (
                            <div style={{ ...BRACKET_STYLES.lineHorizontal, top: `${(nextTop - currentTop) + 82}px`, right: "-60px" }} />
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

export default KOBracket;