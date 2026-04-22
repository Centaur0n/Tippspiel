import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import TippsPage from "./TippsPage";
import AdminResultsPage from "./AdminResultsPage"; 

const Dashboard = ({ player, onLogout }) => {
  const [activePhase, setActivePhase] = useState("ranking");
  const [systemConfig, setSystemConfig] = useState(null);
  const [nextMatches, setNextMatches] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [activePhase]);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      // 1. System-Konfiguration laden (Phase etc.)
      const { data: config } = await supabase.from("system_config").select("*").single();
      setSystemConfig(config);

      // 2. Die nächsten 3 anstehenden Partien laden
      const { data: matches } = await supabase
        .from("match")
        .select("*")
        .order("match_order", { ascending: true })
        .limit(3);
      setNextMatches(matches || []);

      // 3. Alle Punkte-Details aus der neuen Tabelle laden
      const { data: allPoints, error: pointsError } = await supabase
        .from("user_points_detail")
        .select("user_id, points_total");
      
      if (pointsError) throw pointsError;

      // 4. Alle Spieler laden
      const { data: players, error: playerError } = await supabase
        .from("player")
        .select("id, name, display_name");
      
      if (playerError) throw playerError;

      // 5. Punkte pro Spieler berechnen (Summierung)
      const calculatedRanking = players?.map(p => {
        // Wir filtern alle Einträge aus user_points_detail, die zu diesem Spieler gehören
        // WICHTIG: Mit Number() stellen wir sicher, dass "2" === 2 ist.
        const userTotal = allPoints
          ?.filter(entry => Number(entry.user_id) === Number(p.id)) 
          .reduce((sum, entry) => sum + Number(entry.points_total), 0) || 0;

        return {
          ...p,
          points: userTotal
        };
      }) || [];

      // 6. Ranking sortieren (Höchste Punktzahl zuerst)
      calculatedRanking.sort((a, b) => b.points - a.points);
      
      setRanking(calculatedRanking);

    } catch (error) {
      console.error("Fehler beim Laden der Dashboard-Daten:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{ padding: "20px" }}>Dashboard wird geladen...</div>;

  return (
    <div style={layoutStyle}>
      
      {/* 🟣 SIDEBAR (LINKS) */}
      <aside style={sidebarStyle}>
        <div style={profileBoxStyle}>
          <h2 style={{ fontSize: "1.2rem", margin: "0 0 5px 0" }}>
            {player.display_name && player.display_name !== "EMPTY" ? player.display_name : player.name}
          </h2>
          <span style={badgeStyle}>{player.is_admin ? "Administrator" : "Spieler"}</span>
        </div>

        <nav style={navStyle}>
          <button 
            onClick={() => setActivePhase("ranking")} 
            style={tabButtonStyle(activePhase === "ranking")}
          >
            Startseite
          </button>
          
          <hr style={dividerStyle} />
          <p style={sectionHeaderStyle}>Tipp-Runden</p>
          
          {[1, 2, 3, 4, 5].map((pId) => (
            <button 
              key={pId} 
              onClick={() => setActivePhase(pId)} 
              style={phaseButtonStyle(activePhase === pId, systemConfig?.current_phase_id === pId)}
            >
              Phase {pId} {systemConfig?.current_phase_id === pId ? " (Aktiv)" : ""}
            </button>
          ))}

          {player.is_admin && (
            <>
              <hr style={dividerStyle} />
              <p style={sectionHeaderStyle}>Admin-Bereich</p>
              <button 
                onClick={() => setActivePhase("admin_results")} 
                style={phaseButtonStyle(activePhase === "admin_results", false)}
              >
                Echte Ergebnisse eintragen
              </button>
            </>
          )}

          <hr style={dividerStyle} />
          <button style={tabButtonStyle(false)} onClick={() => alert("Statistiken kommen bald!")}>
            📊 Statistiken
          </button>
        </nav>

        <button onClick={onLogout} style={logoutButtonStyle}>Abmelden</button>
      </aside>

      {/* 🟢 HAUPTBEREICH (RECHTS) */}
      <main style={mainContentStyle}>
        
        {activePhase === "ranking" ? (
          <>
            <section style={{ marginBottom: "30px" }}>
              <h3 style={contentTitleStyle}>Anstehende Partien</h3>
              <div style={matchGridStyle}>
                {nextMatches.map(m => (
                  <div key={m.id} style={matchCardStyle}>
                    <div style={groupBadgeStyle}>Gruppe {m.group_name}</div>
                    <div style={matchTeamsStyle}>{m.team_a} vs. {m.team_b}</div>
                    <button onClick={() => setActivePhase(m.phase_id)} style={quickTippButtonStyle}>
                      Tippen
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section style={whiteCardStyle}>
              <h3 style={contentTitleStyle}>Aktuelle Rangliste</h3>
              <table style={tableStyle}>
                <thead>
                  <tr style={tableHeaderStyle}>
                    <th style={thStyle}>Platz</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Punkte</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((entry, index) => (
                    <tr key={entry.id} style={entry.id === player.id ? myRowStyle : tableRowStyle}>
                      <td style={tdStyle}>{index + 1}.</td>
                      <td style={tdStyle}>
                        {entry.display_name && entry.display_name !== "EMPTY" 
                          ? entry.display_name 
                          : entry.name}
                      </td>
                      <td style={tdStyle}><strong>{entry.points}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : activePhase === "admin_results" ? (
          <div style={flexibleCardStyle}>
            <AdminResultsPage phaseId={systemConfig?.current_phase_id} />
          </div>
        ) : (
          <div style={flexibleCardStyle}>
            <TippsPage 
              player={player} 
              phaseId={activePhase} 
            />
          </div>
        )}
      </main>
    </div>
  );
};

// --- STYLES ---
const layoutStyle = { display: "flex", minHeight: "100vh", backgroundColor: "#f8fafc" };
const sidebarStyle = { width: "240px", backgroundColor: "#fff", borderRight: "1px solid #e2e8f0", padding: "25px", display: "flex", flexDirection: "column", position: "fixed", height: "100vh", zIndex: 100 };
const mainContentStyle = { flex: 1, marginLeft: "240px", padding: "40px", overflowX: "auto", minWidth: 0 };
const whiteCardStyle = { backgroundColor: "#fff", padding: "25px", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" };
const flexibleCardStyle = { ...whiteCardStyle, width: "fit-content", minWidth: "100%" };
const profileBoxStyle = { marginBottom: "30px", paddingBottom: "20px", borderBottom: "1px solid #f1f5f9" };
const badgeStyle = { fontSize: "11px", backgroundColor: "#e2e8f0", padding: "2px 8px", borderRadius: "10px", color: "#475569", fontWeight: "bold" };
const navStyle = { display: "flex", flexDirection: "column", gap: "6px", flex: 1 };
const sectionHeaderStyle = { fontSize: "11px", fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "15px 0 10px 5px" };
const dividerStyle = { margin: "15px 0", border: "0", borderTop: "1px solid #f1f5f9" };
const tabButtonStyle = (active) => ({ padding: "12px 15px", textAlign: "left", borderRadius: "10px", border: "none", cursor: "pointer", backgroundColor: active ? "#eff6ff" : "transparent", color: active ? "#2563eb" : "#64748b", fontWeight: "600" });
const phaseButtonStyle = (active, isCurrent) => ({ padding: "10px 15px", textAlign: "left", borderRadius: "10px", border: "none", cursor: "pointer", backgroundColor: active ? "#2563eb" : "transparent", color: active ? "#fff" : (isCurrent ? "#0f172a" : "#94a3b8"), fontWeight: isCurrent || active ? "700" : "400" });
const contentTitleStyle = { fontSize: "1.25rem", fontWeight: "700", marginBottom: "15px", color: "#0f172a" };
const matchGridStyle = { display: "flex", gap: "15px" };
const matchCardStyle = { flex: 1, backgroundColor: "#fff", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0", textAlign: "center" };
const groupBadgeStyle = { fontSize: "10px", color: "#64748b", fontWeight: "700", marginBottom: "8px" };
const matchTeamsStyle = { fontSize: "15px", fontWeight: "700", color: "#1e293b", marginBottom: "12px" };
const quickTippButtonStyle = { padding: "6px 12px", backgroundColor: "#f1f5f9", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600", color: "#2563eb" };
const tableStyle = { width: "100%", borderCollapse: "collapse" };
const tableHeaderStyle = { borderBottom: "2px solid #f1f5f9" };
const thStyle = { textAlign: "left", padding: "15px", color: "#64748b", fontSize: "13px", fontWeight: "600" };
const tdStyle = { padding: "15px", borderBottom: "1px solid #f1f5f9" };
const tableRowStyle = { transition: "background 0.2s" };
const myRowStyle = { backgroundColor: "#f0f9ff", fontWeight: "700", color: "#0369a1" };
const logoutButtonStyle = { padding: "12px", marginTop: "20px", cursor: "pointer", backgroundColor: "#fff", border: "1px solid #fee2e2", borderRadius: "10px", color: "#dc2626", fontWeight: "600" };

export default Dashboard;