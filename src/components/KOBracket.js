import React from 'react';

const KOBracket = ({ 
  koByRound, 
  tips, 
  phase, 
  roundNames, 
  treeHeight, 
  getTopPosition, 
  getTeamFromPrevious, 
  resolveSlot, 
  context, 
  KO_STRUCTURE, 
  saveTip, 
  deleteKORound,
  baseSpacing, 
}) => {

  const safeRoundNames = roundNames || {
    1: "Sechzehntelfinale",
    2: "Achtelfinale",
    3: "Viertelfinale",
    4: "Halbfinale",
    5: "Finale"
  };

  // Konstante Höhe für die Box, um Linien-Verschiebungen zu verhindern
  const BOX_HEIGHT = 135; 

  return (
    <div style={{ minWidth: "1400px", padding: "20px" }}>
      
      {/* 🔄 RESET-HEADER (Oben wie in der Gruppenphase) */}
      <div style={{ display: "flex", marginBottom: "60px", marginLeft: "0px" }}>
        {Object.keys(koByRound)
          .sort((a, b) => Number(a) - Number(b))
          .map((round, idx) => (
          <div
            key={round}
            style={{ 
              width: "200px", 
              marginRight: "60px", 
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            }}
          >
            <span style={{ fontWeight: "bold", fontSize: "1rem", color: "#2d3748" }}>
              {safeRoundNames[round]}
            </span>
            {!phase?.is_submitted && (
              <button 
                onClick={() => deleteKORound(Number(round))}
                style={{
                  padding: "4px 8px",
                  fontSize: "0.75rem",
                  backgroundColor: "#fff",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "#666",
                  transition: "all 0.2s"
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = "#e2e8f0"}
                onMouseOut={(e) => e.target.style.backgroundColor = "#edf2f7"}
              >
                Reset
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 🔽 KO-BAUM AREA */}
      <div style={{ position: "relative", height: `${treeHeight / 2}px` }}>
        {Object.keys(koByRound)
          .sort((a, b) => Number(a) - Number(b))
          .map((round, roundIndex) => (
            <div key={round}>
              {koByRound[round].map((m, matchIndex) => {
                const tip = tips[m.id];
                const currentTop = getTopPosition(roundIndex, matchIndex);
                const nextTop = getTopPosition(roundIndex + 1, Math.floor(matchIndex / 2));

                let teamA, teamB;
                if (roundIndex === 0) {
                  const matchDef = KO_STRUCTURE.round16[matchIndex];
                  teamA = resolveSlot(matchDef[0], context);
                  teamB = resolveSlot(matchDef[1], context);
                } else {
                  teamA = getTeamFromPrevious(roundIndex, matchIndex, "A", koByRound, tips, context);
                  teamB = getTeamFromPrevious(roundIndex, matchIndex, "B", koByRound, tips, context);
                }

                return (
                  <div
                    key={m.id}
                    style={{
                      position: "absolute",
                      top: `${currentTop}px`,
                      left: `${roundIndex * 260}px`,
                      transition: "all 0.3s ease",
                      height: `${BOX_HEIGHT}px`
                    }}
                  >
                    {/* UNTERTITEL ÜBER BOX */}
                    <div style={{
                      fontSize: "0.65rem",
                      fontWeight: "800",
                      color: "#cbd5e0",
                      textTransform: "uppercase",
                      marginBottom: "4px",
                      letterSpacing: "0.05em"
                    }}>
                      {/* Zeigt jetzt wieder z.B. "ACHTELFINALE 1" an */}
                      {safeRoundNames[round]} {matchIndex + 1}
                    </div>

                    {/* MATCH BOX MIT FIXER HÖHE */}
                    <div style={{
                      width: "200px",
                      height: "110px", // Festgelegt, damit Linien mittig bleiben
                      background: "#fff",
                      borderRadius: "10px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      overflow: "hidden"
                    }}>
                      {/* Team A */}
                      <div style={{ 
                        padding: "10px 12px", 
                        borderBottom: "1px solid #f1f5f9",
                        display: "flex",
                        justifyContent: "space-between",
                        background: tip?.winner === "1" ? "#f0fff4" : "transparent" 
                      }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: tip?.winner === "1" ? "700" : "400" }}>{teamA}</span>
                        {tip?.winner === "1" && <span style={{ color: "#48bb78" }}>✓</span>}
                      </div>

                      {/* Team B */}
                      <div style={{ 
                        padding: "10px 12px", 
                        display: "flex",
                        justifyContent: "space-between",
                        background: tip?.winner === "2" ? "#f0fff4" : "transparent"
                      }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: tip?.winner === "2" ? "700" : "400" }}>{teamB}</span>
                        {tip?.winner === "2" && <span style={{ color: "#48bb78" }}>✓</span>}
                      </div>

                      {/* Footer / Selector */}
                      <div style={{ padding: "6px 10px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", height: "34px" }}>
                        {!phase?.is_submitted ? (
                          (teamA !== "?" && teamB !== "?") ? (
                            <select 
                              value={tip?.winner || ""} 
                              onChange={(e) => saveTip(m.id, null, null, e.target.value)}
                              style={{ width: "100%", fontSize: "0.7rem", padding: "2px" }}
                            >
                              <option value="">Sieger...</option>
                              <option value="1">{teamA}</option>
                              <option value="2">{teamB}</option>
                            </select>
                          ) : (
                            <div style={{ fontSize: "0.65rem", color: "#94a3b8", textAlign: "center", marginTop: "4px" }}>Warten...</div>
                          )
                        ) : (
                          <div style={{ fontSize: "0.75rem", textAlign: "center", fontWeight: "bold" }}>
                            {tip?.winner ? (Number(tip.winner) === 1 ? teamA : teamB) : "-"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 🛠️ LINIEN-FIX: Die Linien nutzen jetzt BOX_HEIGHT / 2 für perfekte Zentrierung */}
                    {roundIndex < Object.keys(koByRound).length - 1 && (
                      <>
                        {/* Horizontale Linie aus der Box raus */}
                        <div style={{ 
                          position: "absolute", 
                          top: "75px", // Exakte Mitte der Matchbox inkl. Titel-Offset
                          right: "-30px", 
                          width: "30px", 
                          height: "2px", 
                          background: "#cbd5e0" 
                        }} />
                        
                        {matchIndex % 2 === 0 && (
                          <>
                            {/* Vertikale Verbindungslinie */}
                            <div style={{ 
                              position: "absolute", 
                              top: "75px", 
                              right: "-30px", 
                              width: "2px", 
                              height: `${baseSpacing * Math.pow(2, roundIndex)}px`, 
                              background: "#cbd5e0" 
                            }} />
                            {/* Horizontale Linie in die nächste Box rein */}
                            <div style={{ 
                              position: "absolute", 
                              top: `calc(${nextTop - currentTop}px + 75px)`, 
                              right: "-60px", 
                              width: "30px", 
                              height: "2px", 
                              background: "#cbd5e0" 
                            }} />
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
};

export default KOBracket;