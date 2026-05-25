import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const PointsAnalysisPage = ({ userId }) => {
  const [details, setDetails] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter-States
  const [matchFilter, setMatchFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");

  useEffect(() => {
    fetchData();
  }, [userId]);

  async function fetchData() {
    setLoading(true);
    
    // 1. Alle Punkt-Details holen
    const { data: pointsData } = await supabase
      .from("user_points_detail")
      .select("*")
      .eq("player_id", userId);

    // 2. Alle Matches holen für Teamnamen
    const { data: matchData } = await supabase
      .from("match")
      .select("*");

    // Clientseitige Sortierung für perfekte Strukturierung:
    // Zuerst nach match_order aufsteigend sortieren.
    // Innerhalb derselben match_order kommt das "MATCH" (das eigentliche Spiel) immer zuerst,
    // danach folgen die Turnier-Pfad-Prognosen (chronologisch nach phase_id).
    const sortedPoints = (pointsData || []).sort((a, b) => {
      if (a.match_order !== b.match_order) {
        if (a.match_order === null) return 1;
        if (b.match_order === null) return -1;
        return a.match_order - b.match_order;
      }
      
      // Wenn match_order gleich ist: MATCH-Kategorie hat Vorrang vor PROGNOSEN
      if (a.category === "MATCH" && b.category !== "MATCH") return -1;
      if (a.category !== "MATCH" && b.category === "MATCH") return 1;
      
      // Falls beides Prognosen sind, nach Phase sortieren
      return (a.phase_id || 0) - (b.phase_id || 0);
    });

    setDetails(sortedPoints);
    setMatches(matchData || []);
    setLoading(false);
  }

  // Filter-Logik anwenden
  const filteredDetails = details.filter((row) => {
    // 1. Filter nach Spielnummern / Phasen-Blöcken
    if (matchFilter !== "all") {
      const order = row.match_order;
      if (!order) return false; // Allgemeine Bonusfragen ohne Match-Bezug ausblenden bei Spiel-Filtern
      if (matchFilter === "1-72" && (order < 1 || order > 72)) return false;
      if (matchFilter === "73-88" && (order < 73 || order > 88)) return false;
      if (matchFilter === "89-96" && (order < 89 || order > 96)) return false;
      if (matchFilter === "97-100" && (order < 97 || order > 100)) return false;
      if (matchFilter === "101-104" && (order < 101 || order > 104)) return false;
    }

    // 2. Filter nach Prognose-Phasen (Phase 1-5)
    if (phaseFilter !== "all") {
      if (row.phase_id?.toString() !== phaseFilter) return false;
    }

    return true;
  });

  if (loading) {
    return (
      <div style={{ color: "#4b5563", padding: "20px", fontFamily: "sans-serif", textAlign: "center" }}>
        Analyse wird geladen...
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", backgroundColor: "#ffffff", minHeight: "100vh", fontFamily: "sans-serif" }}>
      {/* Überschrift im neuen Design */}
      <h2 style={{ color: "#1f2937", fontSize: "24px", fontWeight: "600", marginBottom: "24px", display: "flex", alignItems: "center", gap: "10px" }}>
        📊 Detaillierte Punkte-Analyse
      </h2>

      {/* Filter-Bar im modernen, hellen Card-Stil */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", padding: "16px", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "600", color: "#64748b" }}>Spiel-Abschnitte</label>
          <select 
            value={matchFilter} 
            onChange={(e) => setMatchFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">Alle Spiele (1-104)</option>
            <option value="1-72">Gruppenphase (Spiele 1-72)</option>
            <option value="73-88">Sechzehntelfinale (Spiele 73-88)</option>
            <option value="89-96">Achtelfinale (Spiele 89-96)</option>
            <option value="97-100">Viertelfinale (Spiele 97-100)</option>
            <option value="101-104">Halbfinale & Finale (Spiele 101-104)</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "600", color: "#64748b" }}>Prognose-Phasen</label>
          <select 
            value={phaseFilter} 
            onChange={(e) => setPhaseFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">Alle Phasen (1-5)</option>
            <option value="1">Phase 1</option>
            <option value="2">Phase 2</option>
            <option value="3">Phase 3</option>
            <option value="4">Phase 4</option>
            <option value="5">Phase 5</option>
          </select>
        </div>

        {/* Filter zurücksetzen Button */}
        {(matchFilter !== "all" || phaseFilter !== "all") && (
          <button 
            onClick={() => { setMatchFilter("all"); setPhaseFilter("all"); }}
            style={{ alignSelf: "flex-end", padding: "8px 14px", border: "1px solid #cbd5e1", borderRadius: "6px", backgroundColor: "#ffffff", color: "#475569", fontSize: "0.9rem", fontWeight: "500", cursor: "pointer", transition: "all 0.2s" }}
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Ergebnistabelle im hellen UI */}
      <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "#ffffff" }}>
          <thead>
            <tr style={{ backgroundColor: "#f1f5f9", textAlign: "left" }}>
              <th style={{ ...thStyle, width: "60px" }}>#</th> 
              <th style={thStyle}>Spiel / Ereignis</th>
              <th style={thStyle}>Tipp vs. Real</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Match-Pkt</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Prognose-Pkt</th>
              <th style={thStyle}>Phase</th>
              <th style={thStyle}>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredDetails.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                  Keine Einträge für die ausgewählten Filter gefunden.
                </td>
              </tr>
            ) : (
              filteredDetails.map((row, index) => {
                const match = matches.find((m) => m.id === row.match_id);
                const isMatch = row.category === "MATCH";
                
                // Dynamische Ermittlung, ob ein neues Spiel beginnt, um die Trennung stärker zu machen
                const previousRow = index > 0 ? filteredDetails[index - 1] : null;
                const isNewGameBlock = previousRow && row.match_order !== previousRow.match_order;

                // Zusätzlicher Style für die Trennlinie zwischen den Spielblöcken
                const dynamicTrStyle = {
                  ...trStyle,
                  borderTop: isNewGameBlock ? "3px solid #94a3b8" : "1px solid #e2e8f0",
                  backgroundColor: isMatch ? "#ffffff" : "#f8fafc" // Subtile Einfärbung für Prognose-Zeilen zur besseren Lesbarkeit
                };

                return (
                  <tr key={row.id} style={dynamicTrStyle}>
                    {/* 1. Spalte: Match Order Nummer */}
                    <td style={{ ...tdStyle, color: "#64748b", fontWeight: "bold" }}>
                      {row.match_order || "-"}
                    </td>

                    {/* 2. Spalte: Das wirkliche Spiel */}
                    <td style={tdStyle}>
                      {isMatch && match ? (
                        <span style={{ fontWeight: "600", color: "#1e293b" }}>{match.team_a} vs. {match.team_b}</span>
                      ) : (
                        <span style={{ color: "#b45309", fontSize: "0.93em", fontWeight: "500", display: "flex", alignItems: "center", gap: "4px" }}>
                          🏆 {row.breakdown?.info || "Turnier-Prognose"}
                        </span>
                      )}
                    </td>

                    {/* 3. Spalte: Tipp vs Real */}
                    <td style={tdStyle}>
                      {isMatch && row.breakdown ? (
                        <div style={{ fontSize: "0.95em", color: "#334155" }}>
                          <span style={{ color: "#94a3b8" }}>Tipp:</span> <strong>{row.breakdown.tip_a}:{row.breakdown.tip_b}</strong> | 
                          <span style={{ color: "#94a3b8" }}> Real:</span> <strong>{row.breakdown.real_a}:{row.breakdown.real_b}</strong>
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.95em", color: "#475569" }}>
                          <span style={{ color: "#94a3b8" }}>Team:</span> <strong>{row.breakdown?.team || "Berechnet"}</strong>
                        </div>
                      )}
                    </td>

                    {/* 4. Spalte: Match Punkte */}
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: "bold", color: row.points_total > 0 ? "#16a34a" : "#94a3b8" }}>
                      {isMatch ? `+${row.points_total}` : "-"}
                    </td>

                    {/* 5. Spalte: Prognose Punkte */}
                    <td style={{ ...tdStyle, textAlign: "center", fontWeight: "bold", color: row.points_total > 0 ? "#2563eb" : "#94a3b8" }}>
                      {!isMatch ? `+${row.points_total}` : "-"}
                    </td>

                    {/* 6. Spalte: Phase Badge */}
                    <td style={tdStyle}>
                      <span style={phaseBadge(row.phase_id)}>
                        Phase {row.phase_id}
                      </span>
                    </td>

                    {/* 7. Spalte: Info */}
                    <td style={{ ...tdStyle, fontSize: "0.85em", color: "#64748b" }}>
                      {row.breakdown?.descr || "Automatische Gutschrift"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Helle Style-Objekte
const thStyle = { 
  padding: "14px 16px", 
  borderBottom: "2px solid #e2e8f0", 
  color: "#475569", 
  fontWeight: "600", 
  fontSize: "0.9rem" 
};

const tdStyle = { 
  padding: "14px 16px", 
  fontSize: "0.92rem", 
  verticalAlign: "middle" 
};

const trStyle = { 
  transition: "background-color 0.15s ease" 
};

const selectStyle = {
  padding: "8px 12px",
  borderRadius: "6px",
  border: "1px solid #cbd5e1",
  backgroundColor: "#ffffff",
  color: "#1e293b",
  fontSize: "0.9rem",
  outline: "none",
  minWidth: "220px",
  cursor: "pointer"
};

// Farb-Badges angepasst an ein klares, kontrastreiches helles UI
const phaseBadge = (phase) => {
  let bg = "#f1f5f9";
  let text = "#475569";

  switch(phase) {
    case 1:
      bg = "#e6f4ea"; text = "#137333"; // Grün
      break;
    case 2:
      bg = "#e8f0fe"; text = "#1a73e8"; // Blau
      break;
    case 3:
      bg = "#f3e8ff"; text = "#7e22ce"; // Lila
      break;
    case 4:
      bg = "#fee2e2"; text = "#dc2626"; // Rot
      break;
    case 5:
      bg = "#fef3c7"; text = "#d97706"; // Gold/Gelb
      break;
    default:
      break;
  }

  return {
    backgroundColor: bg,
    color: text,
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "0.78em",
    fontWeight: "600",
    display: "inline-block",
    border: `1px solid ${text}20`
  };
};

export default PointsAnalysisPage;