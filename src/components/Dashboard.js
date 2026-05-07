import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

// --- IMPORT CONSTANTS & STYLES ---
import { DASHBOARD_STYLES, getTabButtonStyle, getPhaseButtonStyle } from "../Utils/uiConstants";

// --- COMPONENTS ---
import TippsPage from "./TippsPage";
import AdminResultsPage from "./AdminResultsPage"; 
import AdminControlCenter from "./AdminControlCenter";

const Dashboard = ({ player, onLogout }) => {
  const [activePhase, setActivePhase] = useState("ranking");
  const [systemConfig, setSystemConfig] = useState(null);
  const [nextMatches, setNextMatches] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [allPhases, setAllPhases] = useState([]); 
  const [loading, setLoading] = useState(true);

  // Initialer Datencheck beim Laden der Komponente
  useEffect(() => {
    fetchDashboardData();
  }, []);

  /**
   * Lädt alle notwendigen Daten aus der Supabase-Datenbank.
   * Verwendet Promise.all für maximale Ladegeschwindigkeit.
   */
  async function fetchDashboardData() {
    if (allPhases.length === 0) setLoading(true);
    try {
      const [configRes, phasesRes, matchesRes, pointsRes, playersRes] = await Promise.all([
        supabase.from("system_config").select("*").single(),
        supabase.from("tip_phase").select("*").order("id", { ascending: true }),
        supabase.from("match").select("*").order("match_order", { ascending: true }).limit(3),
        supabase.from("user_points_detail").select("player_id, points_total"),
        supabase.from("player").select("id, name, display_name")
      ]);

      setAllPhases(phasesRes.data || []);
      setSystemConfig(configRes.data);
      setNextMatches(matchesRes.data || []);

      // RANKING-LOGIK: Berechnet die Gesamtpunktzahl pro Spieler
      const players = playersRes.data || [];
      const allPoints = pointsRes.data || [];
      const calculatedRanking = players.map(p => {
        const userTotal = allPoints
          .filter(entry => Number(entry.player_id) === Number(p.id))
          .reduce((sum, entry) => sum + Number(entry.points_total), 0) || 0;
        return { ...p, points: userTotal };
      });

      // Sortierung: Spieler mit den meisten Punkten zuerst
      calculatedRanking.sort((a, b) => b.points - a.points);
      setRanking(calculatedRanking);
    } catch (error) {
      console.error("Fehler beim Laden:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{ padding: "20px" }}>Dashboard wird geladen...</div>;

  // Fallback-Logik für den Anzeigenamen
  const displayName = player.display_name && player.display_name !== "EMPTY" ? player.display_name : player.name;

  return (
    <div style={DASHBOARD_STYLES.layout}>
      
      {/* 🟣 SIDEBAR: Navigation und Nutzerprofil */}
      <aside style={DASHBOARD_STYLES.sidebar}>
        <div style={DASHBOARD_STYLES.profileBox}>
          <h2 style={{ fontSize: "1.2rem", margin: "0 0 5px 0" }}>{displayName}</h2>
          <span style={DASHBOARD_STYLES.badge}>{player.is_admin ? "Administrator" : "Spieler"}</span>
        </div>

        <nav style={DASHBOARD_STYLES.nav}>
          <button onClick={() => setActivePhase("ranking")} style={getTabButtonStyle(activePhase === "ranking")}>
            🏠 Startseite
          </button>
          
          <hr style={DASHBOARD_STYLES.divider} />
          <p style={DASHBOARD_STYLES.sectionHeader}>Tipp-Runden</p>
          
          {/* Listet alle aktiven Phasen auf (z.B. Gruppe A, Gruppe B, KO-Phase) */}
          {allPhases.filter(p => p.is_active).map((p) => (
            <button 
              key={p.id} 
              onClick={() => setActivePhase(p.id)} 
              style={getPhaseButtonStyle(activePhase === p.id, systemConfig?.current_phase_id === p.id)}
            >
              Phase {p.id} {p.is_submitted && " 🔒"} 
            </button>
          ))}

          {/* Spezial-Menü für Administratoren */}
          {player.is_admin && (
            <>
              <hr style={DASHBOARD_STYLES.divider} />
              <p style={DASHBOARD_STYLES.sectionHeader}>Admin-Bereich</p>
              <button onClick={() => setActivePhase("admin_control")} style={getPhaseButtonStyle(activePhase === "admin_control", false)}>
                🛡️ Schaltzentrale
              </button>
              <button onClick={() => setActivePhase("admin_results")} style={getPhaseButtonStyle(activePhase === "admin_results", false)}>
                ⚽ Ergebnisse eintragen
              </button>
            </>
          )}

          <hr style={DASHBOARD_STYLES.divider} />
          <button style={getTabButtonStyle(false)} onClick={() => alert("Statistiken kommen bald!")}>
            📊 Statistiken
          </button>
        </nav>

        <button onClick={onLogout} style={DASHBOARD_STYLES.logoutButton}>Abmelden</button>
      </aside>

      {/* 🟢 HAUPTBEREICH: Content-Umschaltung basierend auf activePhase */}
      <main style={DASHBOARD_STYLES.mainContent}>
        {activePhase === "ranking" ? (
          <>
            {/* Vorschau der nächsten Spiele */}
            <section style={{ marginBottom: "30px" }}>
              <h3 style={DASHBOARD_STYLES.contentTitle}>Anstehende Partien</h3>
              <div style={DASHBOARD_STYLES.matchGrid}>
                {nextMatches.map(m => (
                  <div key={m.id} style={DASHBOARD_STYLES.matchCard}>
                    <div style={DASHBOARD_STYLES.groupBadge}>Gruppe {m.group_name}</div>
                    <div style={DASHBOARD_STYLES.matchTeams}>{m.team_a} vs. {m.team_b}</div>
                    <button onClick={() => setActivePhase(m.phase_id)} style={DASHBOARD_STYLES.quickTippButton}>
                      Tippen
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Die globale Rangliste */}
            <section style={DASHBOARD_STYLES.whiteCard}>
              <h3 style={DASHBOARD_STYLES.contentTitle}>Aktuelle Rangliste</h3>
              <table style={DASHBOARD_STYLES.table}>
                <thead>
                  <tr style={DASHBOARD_STYLES.tableHeader}>
                    <th style={DASHBOARD_STYLES.th}>Platz</th>
                    <th style={DASHBOARD_STYLES.th}>Name</th>
                    <th style={DASHBOARD_STYLES.th}>Punkte</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((entry, index) => (
                    <tr key={entry.id} style={entry.id === player.id ? DASHBOARD_STYLES.myRow : {}}>
                      <td style={DASHBOARD_STYLES.td}>{index + 1}.</td>
                      <td style={DASHBOARD_STYLES.td}>
                        {entry.display_name && entry.display_name !== "EMPTY" ? entry.display_name : entry.name}
                      </td>
                      <td style={DASHBOARD_STYLES.td}><strong>{entry.points}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        ) : (
          /* Anzeige der Unterseiten (Tipps, Admin Control, Admin Results) */
          <div style={DASHBOARD_STYLES.flexibleCard}>
            {activePhase === "admin_control" ? (
              <AdminControlCenter onUpdate={fetchDashboardData} />
            ) : activePhase === "admin_results" ? (
              <AdminResultsPage phaseId={systemConfig?.current_phase_id} />
            ) : (
              <TippsPage player={player} phaseId={activePhase} isAdmin={player.is_admin} />
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;