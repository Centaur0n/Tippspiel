import React, { useMemo } from 'react';
import { UI_STYLES } from '../Utils/uiConstants';
import { getCountryCode } from '../Utils/teamUtils';
import TipInput from './TipInput';

export default function Phase5Matrix({
  koByRound,
  tips,
  isReadOnly,
  resetOption,
  saveTip
}) {

  // Halbfinal-Matches sicher auslesen (als reguläre Variablen okay, da keine Hooks)
  const h1 = koByRound?.[4]?.[0];
  const h2 = koByRound?.[4]?.[1];
  const tipH1 = h1 ? tips[h1.id] : null;
  const tipH2 = h2 ? tips[h2.id] : null;

  // Hook 1: Haben wir valide Tipps für beide Halbfinals?
  const semiFinalsComplete = useMemo(() => {
    if (!tipH1 || !tipH2) return false;
    const hasTip1 = tipH1.goals_a !== null && tipH1.goals_a !== undefined && tipH1.goals_a !== "";
    const hasTip2 = tipH2.goals_a !== null && tipH2.goals_a !== undefined && tipH2.goals_a !== "";
    return !!(hasTip1 && hasTip2);
  }, [tipH1, tipH2]);

  // Hilfsfunktion (muss nicht gememoed werden, ist eine einfache Pure-Function)
  const getWinnerSideOfMatch = (match, tip) => {
    if (!tip) return null;
    const gA = (tip.goals_a !== null && tip.goals_a !== undefined && tip.goals_a !== "") ? Number(tip.goals_a) : null;
    const gB = (tip.goals_b !== null && tip.goals_b !== undefined && tip.goals_b !== "") ? Number(tip.goals_b) : null;
    
    if (gA !== null && gB !== null) {
      if (gA > gB) return "1";
      if (gB > gA) return "2";
    }
    return tip.winner ? String(tip.winner) : null;
  };

  // Hook 2: Sieger und Verlierer der Halbfinals STATISCH berechnen
  const matchPositions = useMemo(() => {
    if (!semiFinalsComplete || !h1 || !h2) {
      return { h1_winner: "?", h1_loser: "?", h2_winner: "?", h2_loser: "?" };
    }

    const winSide1 = getWinnerSideOfMatch(h1, tipH1);
    const winSide2 = getWinnerSideOfMatch(h2, tipH2);

    return {
      h1_winner: winSide1 === "1" ? h1.team_a : (winSide1 === "2" ? h1.team_b : "?"),
      h1_loser:  winSide1 === "1" ? h1.team_b : (winSide1 === "2" ? h1.team_a : "?"),
      h2_winner: winSide2 === "1" ? h2.team_a : (winSide2 === "2" ? h2.team_b : "?"),
      h2_loser:  winSide2 === "1" ? h2.team_b : (winSide2 === "2" ? h2.team_a : "?")
    };
  }, [semiFinalsComplete, h1, h2, tipH1, tipH2]);
  
  // Falls die Matches noch nicht existieren, rendern wir nichts
  if (!h1 || !h2) return null;

  const getWinningSide = (tip) => {
    if (!tip) return null;
    const gA = (tip.goals_a !== undefined && tip.goals_a !== null && tip.goals_a !== "") ? Number(tip.goals_a) : null;
    const gB = (tip.goals_b !== undefined && tip.goals_b !== null && tip.goals_b !== "") ? Number(tip.goals_b) : null;
    if (gA !== null && gB !== null) {
      if (gA > gB) return "1";
      if (gB > gA) return "2";
    }
    return tip.winner ? String(tip.winner) : null;
  };

  const renderMatrixTeamRow = (teamName, side, isFirst, winningSide) => {
    const isWinner = winningSide === side;
    return (
      <div style={{ ...UI_STYLES.teamRowSimulated, background: isWinner ? "#f0fff4" : "transparent", borderBottom: isFirst ? "1px solid #f1f5f9" : "none", justifyContent: "space-between", paddingRight: "15px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {teamName && teamName !== "?" ? (
            <div style={UI_STYLES.flagWrapper}>
              <img src={`https://flagcdn.com/w40/${getCountryCode(teamName)}.png`} alt="" style={UI_STYLES.flagImg} />
            </div>
          ) : (
            <div style={{ width: "22px", height: "16px", backgroundColor: "#f1f5f9", borderRadius: "2px" }} />
          )}
          <span style={{ fontWeight: isWinner ? "700" : "400", color: (!teamName || teamName === "?") ? "#cbd5e0" : "#1e293b" }}>
            {teamName || "?"}
          </span>
        </div>
        {isWinner && <span style={{ color: "#48bb78", fontWeight: "bold" }}>✓</span>}
      </div>
    );
  };

  // Die 3 statischen Varianten-Kombinationen befüllen
  const options = [
    { 
      id: 2, 
      fA: matchPositions.h1_winner, // SH1
      fB: matchPositions.h2_loser,  // VH2
      sA: matchPositions.h1_loser,  // VH1
      sB: matchPositions.h2_winner  // SH2
    },
    { 
      id: 3, 
      fA: matchPositions.h1_loser,  // VH1
      fB: matchPositions.h2_winner, // SH2
      sA: matchPositions.h1_winner, // SH1
      sB: matchPositions.h2_loser   // VH2
    },
    { 
      id: 4, 
      fA: matchPositions.h1_loser,  // VH1
      fB: matchPositions.h2_loser,  // VH2
      sA: matchPositions.h1_winner, // SH1
      sB: matchPositions.h2_winner  // SH2
    }
  ];

  return (
    <div style={{ display: "flex", gap: "30px", marginLeft: "40px", padding: "10px" }}>
      {options.map(opt => {
        const tipF = tips[`OPT${opt.id}_F`];
        const tipS3 = tips[`OPT${opt.id}_S3`];
        const winF = getWinningSide(tipF);
        const winS3 = getWinningSide(tipS3);
        const canEdit = !isReadOnly && semiFinalsComplete;

        return (
          <div key={opt.id} style={{ display: "flex", flexDirection: "column", opacity: semiFinalsComplete ? 1 : 0.6 }}>
            <div style={UI_STYLES.headerColumn}>
              <span style={UI_STYLES.roundTitle}>Variante {opt.id} F/Sp3</span>
              {canEdit && <button onClick={() => resetOption(opt.id)} style={UI_STYLES.resetButton}>Reset</button>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "35px", marginTop: "120px" }}>
              {[ 
                {label: 'Finale', key: `OPT${opt.id}_F`, tA: opt.fA, tB: opt.fB, tip: tipF, win: winF}, 
                {label: 'Platz 3', key: `OPT${opt.id}_S3`, tA: opt.sA, tB: opt.sB, tip: tipS3, win: winS3} 
              ].map(m => (
                <div key={m.key}>
                  <div style={UI_STYLES.matrixLabel}>{m.label} (V{opt.id})</div>
                  <div style={UI_STYLES.matrixBoxOuter}>
                    {renderMatrixTeamRow(m.tA, "1", true, m.win)}
                    {renderMatrixTeamRow(m.tB, "2", false, m.win)}
                    <div style={UI_STYLES.tipContainer}>
                      {m.tip || !canEdit ? (
                        <div style={UI_STYLES.savedTipDisplay}>
                          {m.tip ? (
                            <>{m.tip.goals_a ?? "-"} : {m.tip.goals_b ?? "-"} {m.tip.goals_a === m.tip.goals_b && <span style={UI_STYLES.winnerSubText}>{m.win === "1" ? m.tA : m.tB}</span>}</>
                          ) : (
                            <span style={{color: "#94a3b8", fontSize: "0.7rem"}}>
                              {!semiFinalsComplete ? "Warten..." : "Kein Tipp"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <TipInput teamA={m.tA} teamB={m.tB} isKO={true} onSave={(a,b,w) => saveTip(m.key, a,b,w)} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}