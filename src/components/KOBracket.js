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

  // Mapping aller deiner Teams zu Ländercodes
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

  return (
    <div style={{ minWidth: "1600px", padding: "20px" }}>
      
      {/* 🔄 RESET-HEADER (Stil wie Gruppenphase) */}
      <div style={{ display: "flex", marginBottom: "60px" }}>
        {Object.keys(koByRound)
          .sort((a, b) => Number(a) - Number(b))
          .map((round) => (
          <div key={round} style={{ width: "240px", marginRight: "60px", textAlign: "center", display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontWeight: "bold", fontSize: "1rem", color: "#2d3748" }}>{safeRoundNames[round]}</span>
            {!phase?.is_submitted && (
              <button onClick={() => deleteKORound(Number(round))} style={{ padding: "4px 8px", fontSize: "0.75rem", backgroundColor: "#fff", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer", color: "#666" }}>
                Reset
              </button>
            )}
          </div>
        ))}
      </div>

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

                // Hilfsfunktion für die Team-Zeilen (macht den Code kürzer & sauberer)
                const renderTeamRow = (teamName, isWinner, isFirst) => (
                  <div style={{ 
                    padding: "10px 12px", 
                    display: "flex", 
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: isWinner ? "#f0fff4" : "transparent",
                    borderBottom: isFirst ? "1px solid #f1f5f9" : "none",
                    height: "40px"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      {teamName !== "?" ? (
                        <div style={{ width: "22px", height: "16px", overflow: "hidden", borderRadius: "2px", border: "1px solid #eee", display: "flex", alignItems: "center" }}>
                           <img 
                            src={`https://flagcdn.com/w40/${getCountryCode(teamName)}.png`} 
                            alt="" 
                            style={{ width: "100%", height: "auto" }}
                            onError={(e) => e.target.style.visibility = 'hidden'} 
                           />
                        </div>
                      ) : (
                        <div style={{ width: "22px", height: "16px", backgroundColor: "#f1f5f9", borderRadius: "2px" }} />
                      )}
                      <span style={{ fontSize: "0.85rem", fontWeight: isWinner ? "700" : "400", color: teamName === "?" ? "#cbd5e0" : "#1e293b" }}>
                        {teamName}
                      </span>
                    </div>
                    {isWinner && <span style={{ color: "#48bb78", fontWeight: "bold" }}>✓</span>}
                  </div>
                );

                return (
                  <div key={m.id} style={{ position: "absolute", top: `${currentTop}px`, left: `${roundIndex * 300}px`, height: `${BOX_HEIGHT}px` }}>
                    {/* Überschrift über dem Match */}
                    <div style={{ fontSize: "0.65rem", fontWeight: "1000", color: "#878b8e", textTransform: "uppercase", marginBottom: "4px", letterSpacing: "0.05em" }}>
                      {roundIndex === 4 
                        ? (matchIndex === 1 ? "Spiel um Platz 3" : "Finale") 
                        : `${safeRoundNames[round]} ${matchIndex + 1}`
                      }
                    </div>

                    {/* MATCH BOX */}
                    <div style={{ width: "240px", height: "115px", background: "#fff", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
                      {renderTeamRow(teamA, tip?.winner === "1", true)}
                      {renderTeamRow(teamB, tip?.winner === "2", false)}

                      <div style={{ padding: "6px 10px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", height: "35px" }}>
                        {!phase?.is_submitted ? (
                          (teamA !== "?" && teamB !== "?") ? (
                            <select value={tip?.winner || ""} onChange={(e) => saveTip(m.id, null, null, e.target.value)} style={{ width: "100%", fontSize: "0.7rem", padding: "2px" }}>
                              <option value="">Sieger wählen...</option>
                              <option value="1">{teamA}</option>
                              <option value="2">{teamB}</option>
                            </select>
                          ) : (
                            <div style={{ fontSize: "0.65rem", color: "#94a3b8", textAlign: "center", marginTop: "4px" }}>Warten...</div>
                          )
                        ) : (
                          <div style={{ fontSize: "0.75rem", textAlign: "center", fontWeight: "bold", color: "#475569" }}>
                            {tip?.winner ? (Number(tip.winner) === 1 ? teamA : teamB) : "-"}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* LINIEN-LOGIK (Fixiert auf 82px) */}
                    {roundIndex < Object.keys(koByRound).length - 1 && (
                      <>
                        <div style={{ position: "absolute", top: "82px", right: "-30px", width: "30px", height: "2px", background: "#cbd5e0" }} />
                        {matchIndex % 2 === 0 && (
                          <>
                            <div style={{ position: "absolute", top: "82px", right: "-30px", width: "2px", height: `${baseSpacing * Math.pow(2, roundIndex)}px`, background: "#cbd5e0" }} />
                            <div style={{ position: "absolute", top: `calc(${nextTop - currentTop}px + 82px)`, right: "-60px", width: "30px", height: "2px", background: "#cbd5e0" }} />
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