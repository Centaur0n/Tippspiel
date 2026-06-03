import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

// --- IMPORT CONSTANTS & STYLES ---
import { DASHBOARD_STYLES, getTabButtonStyle, getPhaseButtonStyle } from "../Utils/uiConstants";
import { FlagIcon } from "../Utils/teamUtils";
import { RetroJersey } from "../Utils/RetroJersey";

// --- COMPONENTS ---
import TippsPage from "./TippsPage";
import AdminResultsPage from "./AdminResultsPage"; 
import AdminControlCenter from "./AdminControlCenter";
import PointsAnalysisPage from "./PointsAnalysisPage";
import BonusQuestions from "./BonusQuestions";
import SupportFeedbackPage from "./SupportFeedbackPage"; 
import ProfilePage from "./Profile"; 
import StatisticsPage from "./StatisticsPage";

const Dashboard = ({ player, onLogout }) => {
  const [localPlayer, setLocalPlayer] = useState(player);
  const [activePhase, setActivePhase] = useState("ranking");
  const [systemConfig, setSystemConfig] = useState(null);
  
  // Speichert alle Matches und Tipps für die Berechnungen rechts
  const [allMatches, setAllMatches] = useState([]);
  const [allCommunityTips, setAllCommunityTips] = useState([]);
  
  const [ranking, setRanking] = useState([]);
  const [allPhases, setAllPhases] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [isPhase1Locked, setIsPhase1Locked] = useState(false);
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (activePhase === "ranking") {
      fetchDashboardData();
    }
  }, [activePhase]);

  async function fetchDashboardData() {
    if (allPhases.length === 0) setLoading(true);
    try {
      // --- 1. BASIS-DATEN LADEN (ohne die riesigen Tabellen) ---
      const [configRes, phasesRes, matchesRes, playersRes] = await Promise.all([
        supabase.from("system_config").select("*").single(),
        supabase.from("tip_phase").select("*").order("id", { ascending: true }),
        supabase.from("match").select("*").order("match_order", { ascending: true }),
        supabase.from("player").select("id, name, display_name, name_color, jersey_number, supported_country, is_admin")
      ]);

      const phasesData = phasesRes.data || [];
      const matchesData = matchesRes.data || [];
      const players = playersRes.data || [];

      setAllPhases(phasesData);
      setSystemConfig(configRes.data);
      setAllMatches(matchesData);

      const phase1 = phasesData.find(p => Number(p.id) === 1);
      setIsPhase1Locked(phase1 ? (phase1.is_submitted || configRes.data?.tips_locked_global) : false);

      // --- 2. ERMITTLUNG DER AKTUELLEN SPIELTAGE ---
      const finishedMatches = matchesData.filter(m => 
        m.goals_a_real !== null && m.goals_b_real !== null && 
        m.goals_a_real !== undefined && m.goals_b_real !== undefined &&
        m.goals_a_real !== '' && m.goals_b_real !== ''
      );
      const lastEvaluatedMatchday = finishedMatches.length > 0 
        ? Math.max(...finishedMatches.map(m => m.matchday || 1)) 
        : 0;

      const currentLastSpieltag = finishedMatches.length > 0 ? lastEvaluatedMatchday : 1;
      const currentNextSpieltag = finishedMatches.length > 0 ? currentLastSpieltag + 1 : 1;

      // Filtere die Matches heraus, die rechts auf dem Dashboard angezeigt werden
      const visibleMatches = matchesData.filter(m => 
        (m.matchday || m.spieltag || 1) === currentLastSpieltag || 
        (m.matchday || m.spieltag || 1) === currentNextSpieltag
      );
      const visibleMatchIds = visibleMatches.map(m => m.id);

      // --- 3. GEZIELTES LADEN DER COMMUNITY-TIPPS (Performance & Limit-Safe) ---
      let tipsData = [];
      if (visibleMatchIds.length > 0) {
        const tipsRes = await supabase
          .from("tip")
          .select("*")
          .in("match_id", visibleMatchIds); // Holt nur Tipps für die angezeigten Spiele
        tipsData = tipsRes.data || [];
      }
      setAllCommunityTips(tipsData);

      // --- 4. PUNKTE-DETAILS PAGINIERT LADEN (Bricht das 1000er-Limit für die Rangliste) ---
      let allPoints = [];
      let from = 0;
      let to = 999;
      let hasMorePoints = true;

      while (hasMorePoints) {
        const pointsRes = await supabase
          .from("user_points_detail")
          .select("*")
          .range(from, to);
        
        const pData = pointsRes.data || [];
        allPoints = [...allPoints, ...pData];
        
        if (pData.length < 1000) {
          hasMorePoints = false;
        } else {
          from += 1000;
          to += 1000;
        }
      }

      // --- 5. BERECHNUNG AKTUELLER VS. VORHERIGER RANGLISTE FÜR TREND-PFEILE ---
      const lastMatchdayMatchIds = finishedMatches
        .filter(m => (m.matchday || m.spieltag || 1) === lastEvaluatedMatchday)
        .map(m => m.id);

      // Aktuellen Punktestand berechnen
      const calculatedRanking = players.map(p => {
        const userTotal = allPoints
          .filter(entry => Number(entry.player_id) === Number(p.id))
          .reduce((sum, entry) => sum + Number(entry.points_total), 0) || 0;
        return { ...p, points: parseFloat(userTotal.toFixed(1)) };
      });
      calculatedRanking.sort((a, b) => b.points - a.points);

      // Punktestand VOR dem letzten Spieltag berechnen
      const previousRanking = players.map(p => {
        const prevTotal = allPoints
          .filter(entry => Number(entry.player_id) === Number(p.id) && !lastMatchdayMatchIds.includes(entry.match_id))
          .reduce((sum, entry) => sum + Number(entry.points_total), 0) || 0;
        return { id: p.id, points: parseFloat(prevTotal.toFixed(1)) };
      });
      previousRanking.sort((a, b) => b.points - a.points);

      // Trends einspeisen
      const rankingWithTrends = calculatedRanking.map((player, currentIndex) => {
        const currentRank = currentIndex + 1;
        const prevIndex = previousRanking.findIndex(r => r.id === player.id);
        const prevRank = prevIndex !== -1 ? prevIndex + 1 : currentRank;

        let trend = "equal";
        if (currentRank < prevRank) trend = "up";
        if (currentRank > prevRank) trend = "down";

        return { ...player, trend };
      });

      setRanking(rankingWithTrends);

      const currentMe = players.find(p => Number(p.id) === Number(localPlayer.id));
      if (currentMe) {
        setLocalPlayer(prev => ({ ...prev, ...currentMe }));
      }
    } catch (error) {
      console.error("Fehler beim Laden der Dashboard-Daten:", error);
    } finally {
      loading && setLoading(false);
    }
  }

  const getFirstActivePhaseId = () => {
    const firstActive = allPhases.find(p => p.is_active);
    return firstActive ? firstActive.id : "ranking";
  };

  const handleProfileSave = async (updatedData) => {
    try {
      const { error } = await supabase.from("player").update({
        display_name: updatedData.display_name,
        pin: updatedData.pin,
        name_color: updatedData.name_color,
        jersey_number: updatedData.jersey_number,
        supported_country: updatedData.supported_country
      }).eq("id", updatedData.id);
      if (error) throw error;
      setLocalPlayer(prev => ({ ...prev, ...updatedData }));
      fetchDashboardData();
    } catch (err) {
      console.error("Fehler beim Updaten des Profils:", err);
      alert("Profil konnte nicht gespeichert werden.");
    }
  };

  if (loading) return <div style={{ padding: "20px", color: "#0f172a" }}>Dashboard wird geladen...</div>;

  const displayName = localPlayer.display_name && localPlayer.display_name !== "EMPTY" ? localPlayer.display_name : localPlayer.name;

  // --- HILFSFUNKTION FÜR DAS RENDERING DER SPIEL-TENDENZEN RECHTS ---
  const renderMatchTendencyCard = (m) => {
    const matchTips = allCommunityTips.filter(t => Number(t.match_id) === Number(m.id));
    const totalTips = matchTips.length;
    
    const winA = matchTips.filter(t => Number(t.goals_a) > Number(t.goals_b)).length;
    const draw = matchTips.filter(t => Number(t.goals_a) === Number(t.goals_b)).length;
    const winB = matchTips.filter(t => Number(t.goals_a) < Number(t.goals_b)).length;

    const pctA = totalTips > 0 ? (winA / totalTips) * 100 : 0;
    const pctDraw = totalTips > 0 ? (draw / totalTips) * 100 : 0;
    const pctB = totalTips > 0 ? (winB / totalTips) * 100 : 0;

    const myTip = matchTips.find(t => Number(t.player_id) === Number(localPlayer.id));
    const hasRealResult = m.goals_a_real !== null && m.goals_a_real !== undefined && m.goals_a_real !== '';

    return (
      <div key={m.id} style={{
        backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px",
        padding: "16px", marginBottom: "14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: "600" }}>Gruppe {m.group_name}</span>
          {hasRealResult && (
            <span style={{ backgroundColor: "#10b981", color: "white", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "700", marginLeft: "auto" }}>
              Endergebnis: {m.goals_a_real} : {m.goals_b_real}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "1.05rem", fontWeight: "700", color: "#0f172a", marginBottom: "12px" }}>
          <FlagIcon teamName={m.team_a} />
          <span>{m.team_a}</span>
          <span style={{ color: "#94a3b8", fontWeight: "500", fontSize: "0.95rem", margin: "0 4px" }}>vs.</span>
          <FlagIcon teamName={m.team_b} />
          <span>{m.team_b}</span>
        </div>

        <div style={{ display: "flex", height: "18px", width: "100%", borderRadius: "6px", overflow: "hidden", backgroundColor: "#f1f5f9", marginBottom: "12px" }}>
          {totalTips === 0 ? (
            <div style={{ width: "100%", backgroundColor: "#cbd5e1", color: "#475569", fontSize: "0.75rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
              Keine Tipps abgegeben
            </div>
          ) : (
            <>
              {winA > 0 && <div style={{ width: `${pctA}%`, backgroundColor: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "0.75rem", fontWeight: "700" }} title={`${m.team_a} gewinnt: ${winA} Tipps`}>{winA}</div>}
              {draw > 0 && <div style={{ width: `${pctDraw}%`, backgroundColor: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "0.75rem", fontWeight: "700" }} title={`Unentschieden: ${draw} Tipps`}>{draw}</div>}
              {winB > 0 && <div style={{ width: `${pctB}%`, backgroundColor: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "0.75rem", fontWeight: "700" }} title={`${m.team_b} gewinnt: ${winB} Tipps`}>{winB}</div>}
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontWeight: "600", color: "#334155" }}>
            Dein Tipp: <span style={{ color: "#2563eb", fontWeight: "800" }}>{myTip ? `${myTip.goals_a} : ${myTip.goals_b}` : "—"}</span>
          </div>
          <div style={{ display: "flex", gap: "12px", fontSize: "0.75rem", color: "#64748b", fontWeight: "600" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: "#22c55e", borderRadius: "50%" }}></span>{m.team_a} gewinnt</span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: "#94a3b8", borderRadius: "50%" }}></span>Unentschieden</span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: "#3b82f6", borderRadius: "50%" }}></span>{m.team_b} gewinnt</span>
          </div>
        </div>
      </div>
    );
  };

  const finishedMatchesList = allMatches.filter(m => 
    m.goals_a_real !== null && m.goals_b_real !== null &&
    m.goals_a_real !== undefined && m.goals_b_real !== undefined
  );

  const currentLastSpieltag = finishedMatchesList.length > 0 
    ? Math.max(...finishedMatchesList.map(m => m.matchday || 1)) 
    : 1;

  const currentNextSpieltag = finishedMatchesList.length > 0 ? currentLastSpieltag + 1 : 1;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", margin: 0, padding: 0, backgroundColor: "#f8fafc" }}>
      
      <aside style={{ 
        ...DASHBOARD_STYLES.sidebar, 
        width: isSidebarCollapsed ? "80px" : "280px", 
        minWidth: isSidebarCollapsed ? "80px" : "280px",
        height: "100%", position: "relative", zIndex: 10,
        display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden",
        padding: isSidebarCollapsed ? "16px 8px" : "20px 16px", margin: 0, boxSizing: "border-box",
        transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s ease",
        borderRight: "1px solid #e2e8f0"
      }}>
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          style={{
            alignSelf: isSidebarCollapsed ? "center" : "flex-end", backgroundColor: "#e2e8f0", color: "#0f172a",
            border: "none", borderRadius: "6px", padding: "6px 10px", cursor: "pointer", fontSize: "14px",
            fontWeight: "bold", marginBottom: "12px", display: "flex", alignItems: "center", justifyContent: "center"
          }}
          title={isSidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
        >
          {isSidebarCollapsed ? "➡️" : "⬅️ Minimieren"}
        </button>
        
        <div style={{ 
          ...DASHBOARD_STYLES.profileBox, display: "flex", flexDirection: "column", gap: "14px", 
          padding: isSidebarCollapsed ? "8px" : "16px", boxSizing: "border-box",
          border: "1px solid #e2e8f0",
          backgroundColor: "#ffffff",
          alignItems: isSidebarCollapsed ? "center" : "stretch"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", width: "100%", justifyContent: isSidebarCollapsed ? "center" : "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <RetroJersey color={localPlayer.name_color} number={localPlayer.jersey_number} size={isSidebarCollapsed ? 40 : 48} />
            </div>
            {!isSidebarCollapsed && (
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flexGrow: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <h2 style={{ 
                    fontSize: "1.15rem", margin: 0, fontWeight: "800",
                    color: (localPlayer.name_color && localPlayer.name_color.toLowerCase() !== "#ffffff") ? localPlayer.name_color : "#0f172a",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    {displayName}
                  </h2>
                  {localPlayer.supported_country && <FlagIcon teamName={localPlayer.supported_country} />}
                </div>
                <div style={{ marginTop: "4px" }}>
                  <span style={{ ...DASHBOARD_STYLES.badge, margin: 0, backgroundColor: "#f1f5f9", color: "#334155", fontWeight: "600", display: "inline-block" }}>
                    {localPlayer.is_admin ? "Admin" : "Spieler"}
                  </span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "#475569", fontWeight: "600", marginTop: "4px" }}>
                  Trikotnummer: #{localPlayer.jersey_number || "—"}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", marginTop: "2px", width: "100%" }}>
            <button
              onClick={() => setActivePhase("profile")}
              style={{
                padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1",
                backgroundColor: "white", color: "#2563eb", cursor: "pointer",
                fontWeight: "600", fontSize: "13px", display: "flex",
                alignItems: "center", justifyContent: "center", gap: "6px", width: "100%"
              }}
              title="Profil & Einstellungen"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              {!isSidebarCollapsed && <span>Profil & Einstellungen</span>}
            </button>
          </div>
        </div>

        <nav style={{ ...DASHBOARD_STYLES.nav, width: "100%", display: "flex", flexDirection: "column", gap: "4px" }}>
          <button 
            onClick={() => setActivePhase("ranking")} 
            style={{ ...getTabButtonStyle(activePhase === "ranking"), justifyContent: isSidebarCollapsed ? "center" : "flex-start" }}
            title="Startseite"
          >
            {isSidebarCollapsed ? "🏠" : "🏠 Startseite"}
          </button>
          
          <hr style={DASHBOARD_STYLES.divider} />
          {!isSidebarCollapsed && <p style={{ ...DASHBOARD_STYLES.sectionHeader, color: "#475569", fontWeight: "700" }}>Tipp-Runden</p>}
          
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {allPhases.filter(p => p.is_active).map((p) => (
              <button 
                key={p.id} 
                onClick={() => setActivePhase(p.id)} 
                style={{ ...getPhaseButtonStyle(activePhase === p.id, systemConfig?.current_phase_id === p.id), justifyContent: isSidebarCollapsed ? "center" : "flex-start" }}
                title={`Phase ${p.id}`}
              >
                {isSidebarCollapsed ? `P${p.id}` : `Phase ${p.id} ${p.is_submitted ? " 🔒" : ""}`}
              </button>
            ))}
          </div>

          <button 
            onClick={() => setActivePhase("bonus_questions")} 
            style={{ ...getPhaseButtonStyle(activePhase === "bonus_questions", systemConfig?.current_phase_id === 1), justifyContent: isSidebarCollapsed ? "center" : "flex-start" }}
            title="Bonusfragen"
          >
            {isSidebarCollapsed ? "🏆" : `🏆 Bonusfragen ${isPhase1Locked ? " 🔒" : ""}`}
          </button>

          {localPlayer.is_admin && (
            <>
              <hr style={DASHBOARD_STYLES.divider} />
              {!isSidebarCollapsed && <p style={{ ...DASHBOARD_STYLES.sectionHeader, color: "#475569", fontWeight: "700" }}>Admin-Bereich</p>}
              <button onClick={() => setActivePhase("admin_control")} style={{ ...getPhaseButtonStyle(activePhase === "admin_control", false), justifyContent: isSidebarCollapsed ? "center" : "flex-start" }} title="Schaltzentrale">
                {isSidebarCollapsed ? "🛡️" : "🛡️ Schaltzentrale"}
              </button>
              <button onClick={() => setActivePhase("admin_results")} style={{ ...getPhaseButtonStyle(activePhase === "admin_results", false), justifyContent: isSidebarCollapsed ? "center" : "flex-start" }} title="Ergebnisse eintragen">
                {isSidebarCollapsed ? "⚽" : "⚽ Ergebnisse eintragen"}
              </button>
            </>
          )}

          <hr style={DASHBOARD_STYLES.divider} />
          {!isSidebarCollapsed && <p style={{ ...DASHBOARD_STYLES.sectionHeader, color: "#475569", fontWeight: "700" }}>Statistiken</p>}
          
          <button 
            onClick={() => setActivePhase("points_analysis")} 
            style={{ ...getTabButtonStyle(activePhase === "points_analysis"), justifyContent: isSidebarCollapsed ? "center" : "flex-start" }}
            title="Punkte-Analyse"
          >
            {isSidebarCollapsed ? "📊" : "📊 Punkte-Analyse"}
          </button>

          <button 
            onClick={() => setActivePhase("global_statistics")} 
            style={{ ...getTabButtonStyle(activePhase === "global_statistics"), justifyContent: isSidebarCollapsed ? "center" : "flex-start" }}
            title="Statistik-Center"
          >
            {isSidebarCollapsed ? "📈" : "📈 Statistik-Center"}
          </button>
          
          <hr style={DASHBOARD_STYLES.divider} />
          <button onClick={() => setActivePhase("support_feedback")} style={{ ...getTabButtonStyle(activePhase === "support_feedback"), justifyContent: isSidebarCollapsed ? "center" : "flex-start" }} title="Support & Feedback">
            {isSidebarCollapsed ? "💬" : "💬 Support & Feedback"}
          </button>
        </nav>

        <button onClick={onLogout} style={{ ...DASHBOARD_STYLES.logoutButton, marginTop: "auto" }}>
          {isSidebarCollapsed ? "❌" : "Abmelden"}
        </button>
      </aside>

      <main style={{ 
        flex: 1, height: "100%", overflow: "auto", padding: "24px 30px", boxSizing: "border-box",
        position: "relative", zIndex: 1, transition: "filter 0.4s ease-in-out, transform 0.4s ease-in-out"
      }}>
        {activePhase === "ranking" ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(350px, 4.5fr) minmax(450px, 5.5fr)", gap: "30px", alignItems: "flex-start" }}>
            
            <section style={DASHBOARD_STYLES.whiteCard}>
              <h3 style={{ ...DASHBOARD_STYLES.contentTitle, color: "#0f172a" }}>Aktuelle Rangliste</h3>
              <table style={{ ...DASHBOARD_STYLES.table, width: "100%" }}>
                <thead>
                  <tr style={DASHBOARD_STYLES.tableHeader}>
                    <th style={{ ...DASHBOARD_STYLES.th, color: "#334155", width: "75px" }}>Platz</th>
                    <th style={{ ...DASHBOARD_STYLES.th, color: "#334155" }}>Name</th>
                    <th style={{ ...DASHBOARD_STYLES.th, color: "#334155", textAlign: "right", width: "90px" }}>Punkte</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((entry, index) => {
                    const isMe = entry.id === localPlayer.id;
                    const entryName = entry.display_name && entry.display_name !== "EMPTY" ? entry.display_name : entry.name;
                    
                    return (
                      <tr key={entry.id} style={{ ...(isMe ? DASHBOARD_STYLES.myRow : {}), height: "58px", borderBottom: "1px solid #e2e8f0" }}>
                        <td style={{ ...DASHBOARD_STYLES.td, color: "#0f172a", fontSize: "16px", fontWeight: "700" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>{index + 1}.</span>
                            {entry.trend === "up" && <span style={{ color: "#22c55e", fontSize: "0.9rem" }} title="Verbessert">⬆️</span>}
                            {entry.trend === "down" && <span style={{ color: "#ef4444", fontSize: "0.9rem" }} title="Verschlechtert">⬇️</span>}
                            {entry.trend === "equal" && <span style={{ color: "#94a3b8", fontSize: "0.9rem" }} title="Gleich geblieben">➖</span>}
                          </div>
                        </td>
                        <td style={{ ...DASHBOARD_STYLES.td, padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <RetroJersey color={entry.name_color} number={entry.jersey_number} size={32} />
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ 
                                color: (entry.name_color && entry.name_color.toLowerCase() !== "#ffffff") ? entry.name_color : "#0f172a", 
                                fontWeight: "800", fontSize: "1rem" 
                              }}>
                                {entryName}
                              </span>
                              {entry.supported_country && <FlagIcon teamName={entry.supported_country} />}
                            </div>
                          </div>
                        </td>
                        <td style={{ ...DASHBOARD_STYLES.td, color: "#0f172a", textAlign: "right", fontSize: "1.05rem" }}>
                          <strong>{entry.points}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <div style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
              
              <section>
                <h3 style={{ ...DASHBOARD_STYLES.contentTitle, color: "#0f172a", marginBottom: "12px" }}>
                  ⚽ Letzter Spieltag (Spieltag {currentLastSpieltag})
                </h3>
                {allMatches.filter(m => (m.matchday || m.spieltag || 1) === currentLastSpieltag).length === 0 ? (
                  <div style={{ color: "#64748b", fontStyle: "italic" }}>Noch keine Spiele ausgewertet.</div>
                ) : (
                  allMatches.filter(m => (m.matchday || m.spieltag || 1) === currentLastSpieltag).map(renderMatchTendencyCard)
                )}
              </section>

              <section>
                <h3 style={{ ...DASHBOARD_STYLES.contentTitle, color: "#0f172a", marginBottom: "12px" }}>
                  🔮 Nächster Spieltag (Spieltag {currentNextSpieltag})
                </h3>
                {allMatches.filter(m => (m.matchday || m.spieltag || 1) === currentNextSpieltag).length === 0 ? (
                  <div style={{ color: "#64748b", fontStyle: "italic" }}>Keine weiteren anstehenden Spieltage gefunden.</div>
                ) : (
                  allMatches.filter(m => (m.matchday || m.spieltag || 1) === currentNextSpieltag).map(renderMatchTendencyCard)
                )}
              </section>

            </div>

          </div>
        ) : (
          <div style={DASHBOARD_STYLES.flexibleCard}>
            {activePhase === "admin_control" ? (
              <AdminControlCenter onUpdate={fetchDashboardData} />
            ) : activePhase === "admin_results" ? (
              <AdminResultsPage phaseId={systemConfig?.current_phase_id} onUpdate={fetchDashboardData} />
            ) : activePhase === "profile" ? (
              <ProfilePage 
                player={localPlayer} onSave={handleProfileSave} onBack={() => setActivePhase("ranking")}
              />
            ) : activePhase === "points_analysis" ? (
              <PointsAnalysisPage userId={localPlayer.id} />
            ) : activePhase === "global_statistics" ? (
              <StatisticsPage currentUserId={localPlayer.id} />    
            ) : activePhase === "bonus_questions" ? (
              <BonusQuestions userId={localPlayer.id} isReadOnly={isPhase1Locked} isAdmin={localPlayer.is_admin} />
            ) : activePhase === "support_feedback" ? (
              <SupportFeedbackPage playerId={localPlayer.id} playerName={displayName} isAdmin={localPlayer.is_admin} />
            ) : (
              <TippsPage 
                player={localPlayer} phaseId={activePhase} isAdmin={localPlayer.is_admin} 
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;