import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const PointsAnalysisPage = ({ userId }) => {
  const [details, setDetails] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [userId]);

  async function fetchData() {
    setLoading(true);
    
    // 1. Alle Punkt-Details holen - NEU: Sortiert nach match_order
    // Falls match_order NULL ist (z.B. bei allgemeinen Bonusfragen), 
    // landen diese am Ende.
    const { data: pointsData } = await supabase
      .from("user_points_detail")
      .select("*")
      .eq("player_id", userId)
      .order("match_order", { ascending: true, nullsFirst: false });

    // 2. Alle Matches holen für Teamnamen (und falls man match_order cross-checken will)
    const { data: matchData } = await supabase
      .from("match")
      .select("*");

    setDetails(pointsData || []);
    setMatches(matchData || []);
    setLoading(false);
  }

  if (loading) return <div style={{ color: "white", padding: "20px" }}>Analyse wird geladen...</div>;

  return (
    <div style={{ padding: "20px", color: "white" }}>
      <h2 style={{ borderBottom: "2px solid #dc2626", paddingBottom: "10px", marginBottom: "20px" }}>
        📊 Detaillierte Punkte-Analyse
      </h2>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "#111827" }}>
          <thead>
            <tr style={{ backgroundColor: "#1f2937", textAlign: "left" }}>
              {/* Neue Spalte für die Sortiernummer */}
              <th style={thStyle}>#</th> 
              <th style={thStyle}>Spiel / Ereignis</th>
              <th style={thStyle}>Tipp vs. Real</th>
              <th style={thStyle}>Match-Pkt</th>
              <th style={thStyle}>Prognose-Pkt</th>
              <th style={thStyle}>Phase</th>
              <th style={thStyle}>Details</th>
            </tr>
          </thead>
          <tbody>
            {details.map((row) => {
              const match = matches.find((m) => m.id === row.match_id);
              const isMatch = row.category === "MATCH";
              
              return (
                <tr key={row.id} style={trStyle}>
                  {/* 1. Spalte: Match Order Nummer */}
                  <td style={{ ...tdStyle, color: "#6b7280", fontWeight: "bold" }}>
                    {row.match_order || "-"}
                  </td>

                  {/* 2. Spalte: Das wirkliche Spiel */}
                  <td style={tdStyle}>
                    {isMatch && match ? (
                      <span style={{ fontWeight: "500" }}>{match.team_a} vs. {match.team_b}</span>
                    ) : (
                      <span style={{ color: "#fbbf24", fontSize: "0.9em" }}>🏆 {row.breakdown?.info || "Turnier-Prognose"}</span>
                    )}
                  </td>

                  {/* 3. Spalte: Tipp vs Real */}
                  <td style={tdStyle}>
                    {isMatch && row.breakdown ? (
                      <div style={{ fontSize: "0.9em" }}>
                        <span style={{ color: "#9ca3af" }}>Tipp:</span> {row.breakdown.tip_a}:{row.breakdown.tip_b} | 
                        <span style={{ color: "#9ca3af" }}> Real:</span> {row.breakdown.real_a}:{row.breakdown.real_b}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.9em" }}>
                        <span style={{ color: "#9ca3af" }}>Team:</span> {row.breakdown?.team || "Berechnet"}
                      </div>
                    )}
                  </td>

                  {/* 4. Spalte: Match Punkte */}
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: "bold", color: "#4ade80" }}>
                    {isMatch ? `+${row.points_total}` : "-"}
                  </td>

                  {/* 5. Spalte: Prognose Punkte */}
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: "bold", color: "#60a5fa" }}>
                    {!isMatch ? `+${row.points_total}` : "-"}
                  </td>

                  {/* 6. Spalte: Phase */}
                  <td style={tdStyle}>
                    <span style={phaseBadge(row.phase_id)}>
                      Phase {row.phase_id}
                    </span>
                  </td>

                  {/* 7. Spalte: Info */}
                  <td style={{ ...tdStyle, fontSize: "0.8em", color: "#9ca3af" }}>
                    {row.breakdown?.descr || "Automatische Gutschrift"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Styles
const thStyle = { padding: "12px", borderBottom: "1px solid #4b5563", color: "#f3f4f6" };
const tdStyle = { padding: "12px", borderBottom: "1px solid #1f2937" };
const trStyle = { borderBottom: "1px solid #374151", transition: "background-color 0.2s" };

const phaseBadge = (phase) => ({
  backgroundColor: phase === 1 ? "#065f46" : phase === 2 ? "#1e40af" : phase === 3 ? "#9125cf" : phase === 4 ? "#cc3a42" : "#dae720",
  padding: "4px 10px",
  borderRadius: "12px",
  fontSize: "0.75em",
  color: "white",
  display: "inline-block"
});

export default PointsAnalysisPage;