import React from "react";
import { FlagIcon } from "../Utils/teamUtils";

const MatchTendencyCard = ({ match, allCommunityTips, localPlayer, isMyPhase1Submitted }) => {
  // 1. FILTER: Nur Tipps mit echten Tor-Eingaben berücksichtigen
  const matchTips = allCommunityTips.filter(t => 
    Number(t.match_id) === Number(match.id) &&
    t.goals_a !== null && t.goals_a !== undefined && t.goals_a !== '' &&
    t.goals_b !== null && t.goals_b !== undefined && t.goals_b !== ''
  );
  
  const totalTips = matchTips.length;
  const isKoMatch = match.stage === "ko";

  // Tendenzen berechnen
  const winA = matchTips.filter(t => Number(t.goals_a) > Number(t.goals_b)).length;
  const winB = matchTips.filter(t => Number(t.goals_a) < Number(t.goals_b)).length;

  // Split-Logik für Unentschieden in der KO-Runde vs. Gruppenphase (mit robustem String-Cast)
  const drawA = isKoMatch ? matchTips.filter(t => Number(t.goals_a) === Number(t.goals_b) && String(t.winner) === "1").length : 0;
  const drawB = isKoMatch ? matchTips.filter(t => Number(t.goals_a) === Number(t.goals_b) && String(t.winner) === "2").length : 0;
  const pureDraw = matchTips.filter(t => Number(t.goals_a) === Number(t.goals_b) && (!isKoMatch || (!t.winner))).length;

  // Prozentanteile
  const pctA = totalTips > 0 ? (winA / totalTips) * 100 : 0;
  const pctDrawA = totalTips > 0 ? (drawA / totalTips) * 100 : 0;
  const pctPureDraw = totalTips > 0 ? (pureDraw / totalTips) * 100 : 0;
  const pctDrawB = totalTips > 0 ? (drawB / totalTips) * 100 : 0;
  const pctB = totalTips > 0 ? (winB / totalTips) * 100 : 0;

  // Erwartete Tore
  let expectedGoalsA = "0,00";
  let expectedGoalsB = "0,00";
  if (totalTips > 0) {
    const totalGoalsA = matchTips.reduce((sum, t) => sum + Number(t.goals_a || 0), 0);
    const totalGoalsB = matchTips.reduce((sum, t) => sum + Number(t.goals_b || 0), 0);
    expectedGoalsA = (totalGoalsA / totalTips).toFixed(2).replace(".", ",");
    expectedGoalsB = (totalGoalsB / totalTips).toFixed(2).replace(".", ",");
  }

  const myTip = matchTips.find(t => Number(t.player_id) === Number(localPlayer.id));
  const hasRealResult = match.goals_a_real !== null && match.goals_b_real !== null && match.goals_a_real !== undefined && match.goals_a_real !== '';

  // Reales Ergebnis & korrekte Tendenz ermitteln
  let correctTendency = null;
  if (hasRealResult) {
    const realA = Number(match.goals_a_real);
    const realB = Number(match.goals_b_real);
    if (realA > realB) {
      correctTendency = "A";
    } else if (realA < realB) {
      correctTendency = "B";
    } else {
      // FIX: winner_real statt winner nutzen, da es sich um das reale Match-Objekt handelt!
      if (isKoMatch && (match.winner_real !== null && match.winner_real !== undefined)) {
        const matchW = String(match.winner_real).trim();
        if (matchW === "1" || matchW === String(match.team_a) || (match.team_a_id && matchW === String(match.team_a_id))) {
          correctTendency = "DrawA";
        } else if (matchW === "2" || matchW === String(match.team_b) || (match.team_b_id && matchW === String(match.team_b_id))) {
          correctTendency = "DrawB";
        } else {
          correctTendency = "Draw";
        }
      } else {
        correctTendency = "Draw";
      }
    }
  }

  // Eigene Tipp-Farbe bestimmen
  let tipColor = "#2563eb"; 
  if (hasRealResult && myTip) {
    const realA = Number(match.goals_a_real);
    const realB = Number(match.goals_b_real);
    const tipA = Number(myTip.goals_a);
    const tipB = Number(myTip.goals_b);

    if (realA === tipA && realB === tipB) {
      tipColor = "#eab308"; // Gold bei Volltreffer
    } else {
      const tipTendency = tipA > tipB ? "A" : tipA < tipB ? "B" : (isKoMatch && String(myTip.winner) === "1" ? "DrawA" : "DrawB");
      if (tipTendency === correctTendency || (!isKoMatch && tipA === tipB && correctTendency === "Draw")) {
        tipColor = "#2563eb"; // Blau bei richtiger Tendenz
      } else {
        tipColor = "#ef4444"; // Rot bei komplett falschem Riecher
      }
    }
  }

  return (
    <div style={{
      backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px",
      padding: "16px", marginBottom: "14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
    }}>
      
      {/* Header-Bereich mit Match-Infos */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ 
              backgroundColor: '#e2e8f0', color: '#475569', fontWeight: '700', fontSize: '0.65rem',
              padding: '2px 5px', borderRadius: '4px', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: '1'
            }}>
              {match.match_no || match.match_order}
            </span>
            <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: "600" }}>
              {isKoMatch ? "KO-Phase" : `Gruppe ${match.group_name}`}
            </span>
          </div>

          <span style={{ color: "#cbd5e1" }}>|</span>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.95rem", fontWeight: "700", color: "#0f172a" }}>
            <FlagIcon teamName={match.team_a} />
            <span>{match.team_a}</span>
            <span style={{ color: "#94a3b8", fontWeight: "500", fontSize: "0.85rem", margin: "0 2px" }}>vs.</span>
            <FlagIcon teamName={match.team_b} />
            <span>{match.team_b}</span>
          </div>

          {totalTips > 0 && (
            <>
              <span style={{ color: "#cbd5e1" }}>|</span>
              <span style={{ fontSize: "0.85rem", color: "#475569", backgroundColor: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", fontWeight: "500" }}>
                erwartete Tore: <strong style={{ color: "#0f172a" }}>{expectedGoalsA} : {expectedGoalsB}</strong>
              </span>
            </>
          )}
        </div>

        {hasRealResult && (
          <span style={{ backgroundColor: "#10b981", color: "white", padding: "3px 10px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "700" }}>
            Endergebnis: {match.goals_a_real} : {match.goals_b_real}
          </span>
        )}
      </div>

      {/* Visualisierungs-Balken der Community-Tendenzen */}
      <div style={{ display: "flex", height: "22px", width: "100%", borderRadius: "6px", overflow: "hidden", backgroundColor: "#f1f5f9", marginBottom: "12px" }}>
        {!isMyPhase1Submitted ? (
          <div style={{ width: "100%", backgroundColor: "#e2e8f0", color: "#64748b", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "600", fontStyle: "italic", gap: "4px" }}>
            🔒 Tendenzen der Tipper erst sichtbar nach deiner Abgabe von Phase 1
          </div>
        ) : totalTips === 0 ? (
          <div style={{ width: "100%", backgroundColor: "#cbd5e1", color: "#475569", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
            Keine Tipps abgegeben
          </div>
        ) : (
          <>
            {/* 1. Sieg Team A */}
            {winA > 0 && (
              <div style={{ 
                width: `${pctA}%`, backgroundColor: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "0.75rem", fontWeight: "700",
                opacity: hasRealResult ? (correctTendency === "A" ? 1 : 0.25) : 1,
                boxShadow: hasRealResult && correctTendency === "A" ? "inset 0 0 0 2px #166534" : "none",
                transition: "opacity 0.2s ease"
              }} title={`${match.team_a} gewinnt nach regulärer Spielzeit: ${winA} Tipps`}>
                {winA}
              </div>
            )}
            
            {/* 2. Unentschieden + Team A kommt weiter */}
            {drawA > 0 && (
              <div style={{ 
                width: `${pctDrawA}%`, backgroundColor: "#86efac", display: "flex", alignItems: "center", justifyContent: "center", color: "#166534", fontSize: "0.75rem", fontWeight: "700",
                opacity: hasRealResult ? (correctTendency === "DrawA" ? 1 : 0.25) : 1,
                boxShadow: hasRealResult && correctTendency === "DrawA" ? "inset 0 0 0 2px #166534" : "none",
                transition: "opacity 0.2s ease"
              }} title={`Unentschieden + ${match.team_a} kommt weiter: ${drawA} Tipps`}>
                {drawA}
              </div>
            )}

            {/* 3. Reines Unentschieden */}
            {pureDraw > 0 && (
              <div style={{ 
                width: `${pctPureDraw}%`, backgroundColor: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "0.75rem", fontWeight: "700",
                opacity: hasRealResult ? (correctTendency === "Draw" ? 1 : 0.25) : 1,
                boxShadow: hasRealResult && correctTendency === "Draw" ? "inset 0 0 0 2px #334155" : "none",
                transition: "opacity 0.2s ease"
              }} title={`Unentschieden: ${pureDraw} Tipps`}>
                {pureDraw}
              </div>
            )}

            {/* 4. Unentschieden + Team B kommt weiter */}
            {drawB > 0 && (
              <div style={{ 
                width: `${pctDrawB}%`, backgroundColor: "#c084fc", display: "flex", alignItems: "center", justifyContent: "center", color: "#581c87", fontSize: "0.75rem", fontWeight: "700",
                opacity: hasRealResult ? (correctTendency === "DrawB" ? 1 : 0.25) : 1,
                boxShadow: hasRealResult && correctTendency === "DrawB" ? "inset 0 0 0 2px #6d28d9" : "none",
                transition: "opacity 0.2s ease"
              }} title={`Unentschieden + ${match.team_b} kommt weiter: ${drawB} Tipps`}>
                {drawB}
              </div>
            )}

            {/* 5. Sieg Team B */}
            {winB > 0 && (
              <div style={{ 
                width: `${pctB}%`, backgroundColor: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "0.75rem", fontWeight: "700",
                opacity: hasRealResult ? (correctTendency === "B" ? 1 : 0.25) : 1,
                boxShadow: hasRealResult && correctTendency === "B" ? "inset 0 0 0 2px #6d28d9" : "none",
                transition: "opacity 0.2s ease"
              }} title={`${match.team_b} gewinnt nach regulärer Spielzeit: ${winB} Tipps`}>
                {winB}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer-Bereich mit eigenem Tipp & dynamischer Legende */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ fontWeight: "600", color: "#334155" }}>
          Dein Tipp: <span style={{ color: tipColor, fontWeight: "800" }}>
            {myTip ? `${myTip.goals_a} : ${myTip.goals_b}` : "—"}
            {isKoMatch && myTip && Number(myTip.goals_a) === Number(myTip.goals_b) && (
              <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "#64748b" }}>
                {" "}(weiter: {String(myTip.winner) === "1" ? match.team_a : match.team_b})
              </span>
            )}
          </span>
        </div>

        {isMyPhase1Submitted && (
          <div style={{ display: "flex", gap: "12px", fontSize: "0.75rem", color: "#64748b", fontWeight: "600", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: "#22c55e", borderRadius: "50%" }}></span>
              {match.team_a} Sieg
            </span>
            
            {isKoMatch ? (
              <>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: "#86efac", borderRadius: "50%" }}></span>
                  Remis ({match.team_a} weiter)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: "#c084fc", borderRadius: "50%" }}></span>
                  Remis ({match.team_b} weiter)
                </span>
              </>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: "#94a3b8", borderRadius: "50%" }}></span>
                Unentschieden
              </span>
            )}

            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: "#8b5cf6", borderRadius: "50%" }}></span>
              {match.team_b} Sieg
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchTendencyCard;