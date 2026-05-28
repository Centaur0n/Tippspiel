import React from 'react';
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
  const h1 = koByRound[4]?.[0];
  const h2 = koByRound[4]?.[1];
  if (!h1 || !h2) return null;
  const semiFinalsComplete = tips[h1.id] && tips[h2.id];

  const getWinner = (matchId, currentTips) => {
    const tip = currentTips[matchId];
    if (!tip || tip.winner === null) return null;
    return Number(tip.winner);
  };

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

  const getWLphase5 = (match, type) => {
    if (!match) return "?";
    const tip = tips[match.id];
    if (!tip || !tip.winner) return "?";
    return tip.winner === "1" 
      ? (type === "SH" ? match.team_a : match.team_b) 
      : (type === "SH" ? match.team_b : match.team_a);
  };

  const renderMatrixTeamRow = (teamName, side, isFirst, winningSide) => {
    const isWinner = winningSide === side;
    return (
      <div style={{ ...UI_STYLES.teamRowSimulated, background: isWinner ? "#f0fff4" : "transparent", borderBottom: isFirst ? "1px solid #f1f5f9" : "none", justifyContent: "space-between", paddingRight: "15px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {teamName !== "?" ? (
            <div style={UI_STYLES.flagWrapper}>
              <img src={`https://flagcdn.com/w40/${getCountryCode(teamName)}.png`} alt="" style={UI_STYLES.flagImg} />
            </div>
          ) : (
            <div style={{ width: "22px", height: "16px", backgroundColor: "#f1f5f9", borderRadius: "2px" }} />
          )}
          <span style={{ fontWeight: isWinner ? "700" : "400", color: teamName === "?" ? "#cbd5e0" : "#1e293b" }}>{teamName}</span>
        </div>
        {isWinner && <span style={{ color: "#48bb78", fontWeight: "bold" }}>✓</span>}
      </div>
    );
  };

  const options = [
    { id: 2, fA: getWLphase5(h1, "SH"), fB: getWLphase5(h2, "VH"), sA: getWLphase5(h1, "VH"), sB: getWLphase5(h2, "SH") },
    { id: 3, fA: getWLphase5(h1, "VH"), fB: getWLphase5(h2, "SH"), sA: getWLphase5(h1, "SH"), sB: getWLphase5(h2, "VH") },
    { id: 4, fA: getWLphase5(h1, "VH"), fB: getWLphase5(h2, "VH"), sA: getWLphase5(h1, "SH"), sB: getWLphase5(h2, "SH") }
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
                          {m.tip ? <>{m.tip.goals_a ?? "-"} : {m.tip.goals_b ?? "-"} {m.tip.goals_a === m.tip.goals_b && <span style={UI_STYLES.winnerSubText}>{m.win === "1" ? m.tA : m.tB}</span>}</> : <span style={{color: "#94a3b8", fontSize: "0.7rem"}}>{!semiFinalsComplete ? "Warten..." : "Kein Tipp"}</span>}
                        </div>
                      ) : <TipInput teamA={m.tA} teamB={m.tB} isKO={true} onSave={(a,b,w) => saveTip(m.key, a,b,w)} />}
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