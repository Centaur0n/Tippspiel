import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Dashboard from "./components/Dashboard"; // Das neue Dashboard

/**
 * 🟢 APP KOMPONENTE (Tactical Slate Pitch - Balanced Alternate Edition)
 * Abwechselnde Befüllung der Teams + Dynamische Auswechselbank für > 22 Spieler
 */
function App() {
  // --- 1. STATE ---
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  // --- 2. INITIALES LADEN (JETZT MIT GEFESTIGTER SORTIERUNG) ---
  useEffect(() => {
    async function loadPlayers() {
      // 🌟 HIER IST DIE RETTUNG: .order("id", { ascending: true })
      // Das sorgt dafür, dass die Spieler IMMER in derselben Reihenfolge geladen werden.
      // Kein Suchen mehr am nächsten Tag!
      const { data } = await supabase
        .from("player")
        .select("*")
        .order("id", { ascending: true }); 
      
      setPlayers(data || []);
    }
    loadPlayers();
  }, []);

  // --- 3. HANDLER (LOGIK) ---
  const checkPin = () => {
    if (selectedPlayer && pin === selectedPlayer.pin) {
      setLoggedIn(true);
      setError("");
    } else {
      setError("Falscher PIN");
    }
  };

  const handleLogout = () => {
    setSelectedPlayer(null);
    setPin("");
    setLoggedIn(false);
    setError("");
  };

  // --- 4. ABWECHSELNDE TAKTISCHE FORMATIONEN ---
  const alternatingPositions = [
    { left: "6%", top: "50%" },   // 1. Spieler: Team Links (TW)
    { left: "94%", top: "50%" },  // 2. Spieler: Team Rechts (TW)
    
    { left: "18%", top: "15%" },  // 3. Spieler: Team Links (LV)
    { left: "84%", top: "25%" },  // 4. Spieler: Team Rechts (IVL)
    
    { left: "16%", top: "38%" },  // 5. Spieler: Team Links (IVL)
    { left: "82%", top: "50%" },  // 6. Spieler: Team Rechts (IVZ)
    
    { left: "16%", top: "62%" },  // 7. Spieler: Team Links (IVR)
    { left: "84%", top: "75%" },  // 8. Spieler: Team Rechts (IVR)
    
    { left: "18%", top: "85%" },  // 9. Spieler: Team Links (RV)
    { left: "70%", top: "15%" },  // 10. Spieler: Team Rechts (LM)
    
    { left: "30%", top: "15%" },  // 11. Spieler: Team Links (LM)
    { left: "72%", top: "38%" },  // 12. Spieler: Team Rechts (ZML)
    
    { left: "28%", top: "38%" },  // 13. Spieler: Team Links (ZML)
    { left: "72%", top: "62%" },  // 14. Spieler: Team Rechts (ZMR)
    
    { left: "28%", top: "62%" },  // 15. Spieler: Team Links (ZMR)
    { left: "70%", top: "85%" },  // 16. Spieler: Team Rechts (RM)
    
    { left: "30%", top: "85%" },  // 17. Spieler: Team Links (RM)
    { left: "60%", top: "33%" },  // 18. Spieler: Team Rechts (RAM)
    
    { left: "42%", top: "33%" },  // 19. Spieler: Team Links (STL)
    { left: "60%", top: "67%" },  // 20. Spieler: Team Rechts (LAM)
    
    { left: "42%", top: "67%" },  // 21. Spieler: Team Links (STR)
    { left: "52%", top: "50%" }   // 22. Spieler: Team Rechts (ST)
  ];

  const pitchPlayers = players.slice(0, 22);
  const benchPlayers = players.slice(22);

  return (
    <div style={appContainerStyle}>
      {loggedIn ? (
        <Dashboard 
          player={selectedPlayer} 
          onLogout={handleLogout} 
        />
      ) : (
        <div style={loginWrapperStyle}>
          <h1 style={titleStyle}>🏆 WM 2026 Tippspiel</h1>
          
          {!selectedPlayer ? (
            <div style={scrollWrapperStyle}>
              {/* SPIELFELD */}
              <div style={pitchContainerStyle}>
                <div style={midlineStyle} />
                <div style={centerCircleStyle} />
                <div style={leftPenaltyBoxStyle} />
                <div style={leftGoalBoxStyle} />
                <div style={rightPenaltyBoxStyle} />
                <div style={rightGoalBoxStyle} />

                {/* Spielfeld-Akteure */}
                {pitchPlayers.map((p, index) => {
                  const coords = alternatingPositions[index];
                  return (
                    <button 
                      key={p.id} 
                      onClick={() => setSelectedPlayer(p)} 
                      style={{
                        ...playerTacticalGlassStyle,
                        left: coords.left,
                        top: coords.top,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.25)";
                        e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.5)";
                        e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                        e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.15)";
                        e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)";
                      }}
                    >
                      <div style={playerNameStyle}>{p.name || p.display_name}</div>
                    </button>
                  );
                })}
              </div>

              {/* DYNAMISCHE AUSWECHSELBANK */}
              {benchPlayers.length > 0 && (
                <div style={benchContainerStyle}>
                  <h3 style={benchTitleStyle}>Fankurve ({benchPlayers.length})</h3>
                  <div style={benchGridStyle}>
                    {benchPlayers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPlayer(p)}
                        style={benchPlayerButtonStyle}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.25)";
                          e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.5)";
                          e.currentTarget.style.transform = "scale(1.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                          e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.15)";
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                      >
                        {p.name || p.display_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // SCHRITT 2: PIN-Eingabe (Spielfeld blendet komplett aus)
            <section style={glassPinCardStyle}>
              <h3 style={{ marginTop: 0, color: "#ffffff", fontSize: "1.3rem" }}>
                Hallo, {selectedPlayer.display_name || selectedPlayer.name}
              </h3>
              <input 
                type="password" 
                placeholder="PIN" 
                value={pin} 
                onChange={(e) => setPin(e.target.value)} 
                style={inputStyle} 
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && checkPin()}
              />
              <button onClick={checkPin} style={loginConfirmButtonStyle}>
                Einloggen
              </button>
              <button 
                onClick={() => { setSelectedPlayer(null); setError(""); setPin(""); }} 
                style={backLinkStyle}
              >
                ← Zurück zur Aufstellung
              </button>
              {error && <p style={errorStyle}>{error}</p>}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// --- 🟢 STYLES ---
const appContainerStyle = { 
  fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", 
  minHeight: "100vh",
  color: "#f8fafc",
  backgroundColor: "#051410",
  backgroundImage: `
    radial-gradient(circle at 50% 50%, transparent 119px, rgba(255, 255, 255, 0.015) 120px, rgba(255, 255, 255, 0.015) 122px, transparent 123px),
    linear-gradient(to right, transparent calc(50% - 1px), rgba(255, 255, 255, 0.02) calc(50% - 1px), rgba(255, 255, 255, 0.02) calc(50% + 1px), transparent calc(50% + 1px)),
    radial-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
    radial-gradient(circle at 50% 45%, #12402f 0%, #04120e 100%)
  `,
  backgroundSize: "100% 100%, 100% 100%, 32px 32px, 100% 100%",
  backgroundAttachment: "fixed"
};

const loginWrapperStyle = { 
  display: "flex", 
  flexDirection: "column", 
  alignItems: "center", 
  padding: "30px 16px",
  boxSizing: "border-box",
  width: "100%"
};

const titleStyle = {
  margin: "0 0 25px 0", 
  fontSize: "2.6rem", 
  fontWeight: "800",
  color: "#ffffff",
  textShadow: "0 2px 12px rgba(0,0,0,0.4)"
};

const scrollWrapperStyle = {
  width: "100%",
  maxWidth: "1350px",
  overflowX: "auto",
  borderRadius: "24px",
  boxShadow: "0 25px 60px rgba(0, 0, 0, 0.6)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  backgroundColor: "rgba(4, 18, 14, 0.2)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)"
};

const pitchContainerStyle = {
  position: "relative",
  width: "100%",
  minWidth: "1200px", 
  height: "720px",
  boxSizing: "border-box",
  overflow: "hidden"
};

const lineColor = "rgba(255, 255, 255, 0.22)";

const midlineStyle = {
  position: "absolute", left: "50%", top: 0, bottom: 0, width: "2px", backgroundColor: lineColor, transform: "translateX(-50%)"
};
const centerCircleStyle = {
  position: "absolute", left: "50%", top: "50%", width: "180px", height: "180px", border: `2px solid ${lineColor}`, borderRadius: "50%", transform: "translate(-50%, -50%)"
};
const leftPenaltyBoxStyle = {
  position: "absolute", left: 0, top: "16%", width: "16.5%", height: "68%", border: `2px solid ${lineColor}`, borderLeft: "none"
};
const leftGoalBoxStyle = {
  position: "absolute", left: 0, top: "33%", width: "5.5%", height: "34%", border: `2px solid ${lineColor}`, borderLeft: "none"
};
const rightPenaltyBoxStyle = {
  position: "absolute", right: 0, top: "16%", width: "16.5%", height: "68%", border: `2px solid ${lineColor}`, borderRight: "none"
};
const rightGoalBoxStyle = {
  position: "absolute", right: 0, top: "33%", width: "5.5%", height: "34%", border: `2px solid ${lineColor}`, borderRight: "none"
};

const playerTacticalGlassStyle = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  padding: "14px 18px", 
  cursor: "pointer",
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  color: "#ffffff",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  borderRadius: "14px",
  boxShadow: "0 6px 16px rgba(0, 0, 0, 0.3)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minWidth: "125px", 
  zIndex: 10,
  boxSizing: "border-box"
};

const playerNameStyle = {
  fontSize: "1rem", 
  fontWeight: "600",
  whiteSpace: "nowrap",
  textShadow: "0 1px 4px rgba(0,0,0,0.6)"
};

const benchContainerStyle = {
  padding: "24px",
  borderTop: "1px solid rgba(255, 255, 255, 0.12)",
  backgroundColor: "rgba(0, 0, 0, 0.2)",
  textAlign: "left"
};

const benchTitleStyle = {
  margin: "0 0 16px 10px",
  fontSize: "1.1rem",
  fontWeight: "700",
  color: "rgba(255, 255, 255, 0.6)",
  textTransform: "uppercase",
  letterSpacing: "0.05em"
};

const benchGridStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  paddingLeft: "10px"
};

const benchPlayerButtonStyle = {
  padding: "12px 18px",
  cursor: "pointer",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  color: "#ffffff",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "12px",
  fontSize: "0.95rem",
  fontWeight: "600",
  transition: "all 0.2s ease",
  boxSizing: "border-box",
  minWidth: "110px"
};

const glassPinCardStyle = {
  backgroundColor: "rgba(255, 255, 255, 0.07)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.15)",
  padding: "30px",
  borderRadius: "16px",
  boxShadow: "0 15px 35px rgba(0, 0, 0, 0.4)",
  textAlign: "center",
  width: "330px",
  boxSizing: "border-box"
};

const inputStyle = {
  padding: "14px", width: "100%", boxSizing: "border-box", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.2)", backgroundColor: "rgba(255, 255, 255, 0.95)", color: "#0f172a", marginBottom: "14px", fontSize: "20px", textAlign: "center", fontWeight: "700", letterSpacing: "6px"
};

const loginConfirmButtonStyle = {
  width: "100%", padding: "14px", backgroundColor: "#10b981", color: "#ffffff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "700", fontSize: "1rem", boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)", transition: "background-color 0.2s"
};

const backLinkStyle = {
  marginTop: "16px", background: "none", border: "none", color: "#38bdf8", cursor: "pointer", fontSize: "14px", fontWeight: "600"
};

const errorStyle = {
  color: "#f87171", fontSize: "14px", marginTop: "12px", fontWeight: "600"
};

export default App;