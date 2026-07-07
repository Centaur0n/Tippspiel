import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { RetroJersey } from "../Utils/RetroJersey";
import { FlagIcon } from "../Utils/teamUtils";

const StatisticsPage = ({ 
  currentUserId, 
  allPlayers, 
  matches, 
  predictions, 
  showDisplayName,       // Vom Parent gesteuert
  onToggleDisplayName    // Vom Parent gesteuert
}) => {
  const [activeTab, setActiveTab] = useState("highlights");
  const [pointsData, setPointsData] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatsData() {
      setLoading(true);
      try {
        const [pointsRes, playersRes] = await Promise.all([
          supabase.from("user_points_detail").select("*"),
          supabase.from("player").select("id, name, display_name, name_color, jersey_number, supported_country")
        ]);

        setPointsData(pointsRes.data || []);
        setPlayers(playersRes.data || []);
      } catch (err) {
        console.error("Fehler beim Laden der Statistikdaten:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStatsData();
  }, []);

  // --- STATISTISCHE AUSWERTUNGEN (Zentral & Dynamisch berechnet) ---
  const stats = useMemo(() => {
    if (!players.length) return null;

    // Helper-Funktion gegen JS-Fließkomma-Fehler (Runden auf 1 Nachkommastelle)
    const round1D = (num) => Math.round(num * 10) / 10;

    // 0. Spiele-Map & alle verfügbaren Gruppen dynamisch aus der Matches-Prop ermitteln
    const matchMap = new Map();
    const uniqueGroupsSet = new Set();

    if (Array.isArray(matches)) {
      matches.forEach(m => {
        matchMap.set(m.id, m);
        matchMap.set(String(m.id), m);
        matchMap.set(Number(m.id), m);

        const order = Number(m.order || m.match_order || 0);
        if (order >= 1 && order <= 72) {
          const gName = m.group || m.group_name || "Gruppe";
          uniqueGroupsSet.add(gName);
        }
      });
    }
    const sortedGroups = Array.from(uniqueGroupsSet).sort();

    // 1. Grundstruktur pro Spieler aufbauen
    const playerStatsMap = {};
    players.forEach(p => {
      // Vorbefüllung für dynamische Gruppen-Punkte (Tipps, Prognosen & Total getrennt)
      const initialGroupsObj = {};
      sortedGroups.forEach(gName => { 
        initialGroupsObj[gName] = { tips: 0, prognosis: 0, total: 0 }; 
      });

      playerStatsMap[p.id] = {
        ...p,
        displayName: p.display_name && p.display_name !== "EMPTY" ? p.display_name : p.name,
        totalPoints: 0,
        matchPointsOnly: 0,       
        prognosisPointsOnly: 0,   
        perfectHits: 0,           
        pointsPerPhase: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        pointsPerMatchday: {},    
        prognosisPointsPerPhase: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, 
        visualPrognosisPointsPerPhase: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, 
        
        // INTEGRATION: Strukturierte Punktspeicher für Turnierebenen (aufgeteilt nach Tipps vs. Prognosen)
        stagePoints: {
          groups: initialGroupsObj,
          r32: { tips: 0, prognosis: 0, total: 0 }, // 16tel Finale (73-88)
          r16: { tips: 0, prognosis: 0, total: 0 }, // 8tel Finale (89-96)
          qf:  { tips: 0, prognosis: 0, total: 0 }, // Viertelfinale (97-100)
          sf:  { tips: 0, prognosis: 0, total: 0 }, // Halbfinale (101-102)
          f:   { tips: 0, prognosis: 0, total: 0 }  // Finale & Platz 3 (103-104)
        },

        rankHistory: {},          
        currentRankReal: 1,       
        currentRankMatchOnly: 1,  
        currentRankPerfectHits: 1,
        matchdayTrend: 0          
      };
    });

    // Alle vorkommenden Spieltage aus den Daten ermitteln
    const matchdays = [
      ...new Set(
        pointsData
          .map(row => row.matchday)
          .filter(day => day !== undefined && day !== null && day !== "")
      )
    ].sort((a, b) => Number(a) - Number(b));

    // 2. Punkte-Details aggregieren
    pointsData.forEach(row => {
      const pId = row.player_id;
      if (!playerStatsMap[pId]) return;

      const pts = Number(row.points_total) || 0;
      playerStatsMap[pId].totalPoints += pts;

      if (row.matchday !== undefined && row.matchday !== null && row.matchday !== "") {
        const mDay = row.matchday;
        if (!playerStatsMap[pId].pointsPerMatchday[mDay]) {
          playerStatsMap[pId].pointsPerMatchday[mDay] = 0;
        }
        playerStatsMap[pId].pointsPerMatchday[mDay] += pts;
      }

      // --- KATEGORIE A: ECHTE SPIEL-TIPPS ---
      if (row.category === "MATCH") {
        playerStatsMap[pId].matchPointsOnly += pts;

        // Volltreffer-Ermittlung
        if (row.breakdown && 
            row.breakdown.tip_a !== undefined && 
            row.breakdown.real_a !== undefined &&
            Number(row.breakdown.tip_a) === Number(row.breakdown.real_a) && 
            Number(row.breakdown.tip_b) === Number(row.breakdown.real_b)) {
          playerStatsMap[pId].perfectHits += 1;
        }

        // Zuordnung der Spiel-Tipps basierend auf der Match-Order
        if (row.match_id) {
          const match = matchMap.get(row.match_id);
          if (match) {
            const order = Number(match.order || match.match_order || 0);
            if (order >= 1 && order <= 72) {
              const gName = match.group || match.group_name || "Gruppe";
              if (playerStatsMap[pId].stagePoints.groups[gName] !== undefined) {
                playerStatsMap[pId].stagePoints.groups[gName].tips += pts;
                playerStatsMap[pId].stagePoints.groups[gName].total += pts;
              }
            } else if (order >= 73 && order <= 88) {
              playerStatsMap[pId].stagePoints.r32.tips += pts;
              playerStatsMap[pId].stagePoints.r32.total += pts;
            } else if (order >= 89 && order <= 96) {
              playerStatsMap[pId].stagePoints.r16.tips += pts;
              playerStatsMap[pId].stagePoints.r16.total += pts;
            } else if (order >= 97 && order <= 100) {
              playerStatsMap[pId].stagePoints.qf.tips += pts;
              playerStatsMap[pId].stagePoints.qf.total += pts;
            } else if (order >= 101 && order <= 102) {
              playerStatsMap[pId].stagePoints.sf.tips += pts;
              playerStatsMap[pId].stagePoints.sf.total += pts;
            } else if (order >= 103 && order <= 104) {
              playerStatsMap[pId].stagePoints.f.tips += pts;
              playerStatsMap[pId].stagePoints.f.total += pts;
            }
          }
        }
      } 
      // --- KATEGORIE B: PROGNOSEN & BONUS-TIPPS ---
      else {
        playerStatsMap[pId].prognosisPointsOnly += pts;
        
        if ((row.matchday === undefined || row.matchday === null || row.matchday === "") && row.phase_id) {
          if (playerStatsMap[pId].prognosisPointsPerPhase[row.phase_id] !== undefined) {
            playerStatsMap[pId].prognosisPointsPerPhase[row.phase_id] += pts;
          }
        }

        if (row.phase_id && playerStatsMap[pId].visualPrognosisPointsPerPhase[row.phase_id] !== undefined) {
          playerStatsMap[pId].visualPrognosisPointsPerPhase[row.phase_id] += pts;
        }

        // DYNAMISCHE INTEGRATION DER PROGNOSEN IN DIE REGIONEN
        const phaseId = Number(row.phase_id);
        
        if (phaseId === 1) {
          // Gruppenplatzierungs-Punkte (Phase 1) der passenden Gruppe zuordnen
          const gName = row.group || row.group_name;
          if (gName && playerStatsMap[pId].stagePoints.groups[gName] !== undefined) {
            playerStatsMap[pId].stagePoints.groups[gName].prognosis += pts;
            playerStatsMap[pId].stagePoints.groups[gName].total += pts;
          }
        } else if (phaseId === 2) {
          // 16tel-Finale Prognosen
          playerStatsMap[pId].stagePoints.r32.prognosis += pts;
          playerStatsMap[pId].stagePoints.r32.total += pts;
        } else if (phaseId === 3) {
          // 8tel-Finale Prognosen
          playerStatsMap[pId].stagePoints.r16.prognosis += pts;
          playerStatsMap[pId].stagePoints.r16.total += pts;
        } else if (phaseId === 4) {
          // Viertelfinale Prognosen
          playerStatsMap[pId].stagePoints.qf.prognosis += pts;
          playerStatsMap[pId].stagePoints.qf.total += pts;
        } else if (phaseId === 5) {
          // Halbfinale & Finale Prognosen anhand von Text-Indikatoren präzise trennen
          const desc = String(row.group || row.group_name || row.description || row.stage || "").toLowerCase();
          if (desc.includes("halb") || desc.includes("sf") || desc.includes("semi")) {
            playerStatsMap[pId].stagePoints.sf.prognosis += pts;
            playerStatsMap[pId].stagePoints.sf.total += pts;
          } else {
            playerStatsMap[pId].stagePoints.f.prognosis += pts;
            playerStatsMap[pId].stagePoints.f.total += pts;
          }
        }
      }

      if (row.phase_id && playerStatsMap[pId].pointsPerPhase[row.phase_id] !== undefined) {
        playerStatsMap[pId].pointsPerPhase[row.phase_id] += pts;
      }
    });

    // --- CRITICAL FIX: Hier werden alle akkumulierten Werte glatt auf 1 Nachkommastelle gerundet ---
    Object.values(playerStatsMap).forEach(p => {
      p.totalPoints = round1D(p.totalPoints);
      p.matchPointsOnly = round1D(p.matchPointsOnly);
      p.prognosisPointsOnly = round1D(p.prognosisPointsOnly);
      
      Object.keys(p.pointsPerPhase).forEach(k => { p.pointsPerPhase[k] = round1D(p.pointsPerPhase[k]); });
      Object.keys(p.prognosisPointsPerPhase).forEach(k => { p.prognosisPointsPerPhase[k] = round1D(p.prognosisPointsPerPhase[k]); });
      Object.keys(p.visualPrognosisPointsPerPhase).forEach(k => { p.visualPrognosisPointsPerPhase[k] = round1D(p.visualPrognosisPointsPerPhase[k]); });
      Object.keys(p.pointsPerMatchday).forEach(k => { p.pointsPerMatchday[k] = round1D(p.pointsPerMatchday[k]); });
      
      Object.keys(p.stagePoints.groups).forEach(g => {
        p.stagePoints.groups[g].tips = round1D(p.stagePoints.groups[g].tips);
        p.stagePoints.groups[g].prognosis = round1D(p.stagePoints.groups[g].prognosis);
        p.stagePoints.groups[g].total = round1D(p.stagePoints.groups[g].total);
      });
      
      ["r32", "r16", "qf", "sf", "f"].forEach(stage => {
        p.stagePoints[stage].tips = round1D(p.stagePoints[stage].tips);
        p.stagePoints[stage].prognosis = round1D(p.stagePoints[stage].prognosis);
        p.stagePoints[stage].total = round1D(p.stagePoints[stage].total);
      });
    });

    const allStatsList = Object.values(playerStatsMap);
    const phaseEndMatchday = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 };

    // 3. Maximale Kombi-Punkte (Tipps + Prognosen) pro Gruppe/Ebene ermitteln
    const globalMaxStagePoints = {
      groups: {},
      r32: 0, r16: 0, qf: 0, sf: 0, f: 0
    };
    sortedGroups.forEach(gName => { globalMaxStagePoints.groups[gName] = 0; });

    allStatsList.forEach(p => {
      sortedGroups.forEach(gName => {
        const totalGrp = p.stagePoints.groups[gName]?.total || 0;
        if (totalGrp > globalMaxStagePoints.groups[gName]) {
          globalMaxStagePoints.groups[gName] = totalGrp;
        }
      });
      if (p.stagePoints.r32.total > globalMaxStagePoints.r32) globalMaxStagePoints.r32 = p.stagePoints.r32.total;
      if (p.stagePoints.r16.total > globalMaxStagePoints.r16) globalMaxStagePoints.r16 = p.stagePoints.r16.total;
      if (p.stagePoints.qf.total > globalMaxStagePoints.qf) globalMaxStagePoints.qf = p.stagePoints.qf.total;
      if (p.stagePoints.sf.total > globalMaxStagePoints.sf) globalMaxStagePoints.sf = p.stagePoints.sf.total;
      if (p.stagePoints.f.total > globalMaxStagePoints.f) globalMaxStagePoints.f = p.stagePoints.f.total;
    });

    // Zeitverlauf & Spieltagssieger berechnen
    const matchdayWinners = {};
    matchdays.forEach(day => {
      const dayStandings = allStatsList.map(p => {
        let accumulatedPointsAtMilestone = 0;
        matchdays.forEach(d => {
          if (Number(d) <= Number(day)) {
            accumulatedPointsAtMilestone += (p.pointsPerMatchday[d] || 0);
          }
        });
        Object.keys(p.prognosisPointsPerPhase).forEach(phaseId => {
          const targetDay = phaseEndMatchday[phaseId] || 99;
          if (Number(day) >= targetDay) {
            accumulatedPointsAtMilestone += p.prognosisPointsPerPhase[phaseId];
          }
        });
        // Auch hier beim Zusammenbauen des Zeitverlaufs Fließkomma-Fehler direkt runden
        return { 
          id: p.id, 
          pointsOnThisDay: round1D(p.pointsPerMatchday[day] || 0), 
          totalAtMilestone: round1D(accumulatedPointsAtMilestone) 
        };
      });

      dayStandings.sort((a, b) => b.totalAtMilestone - a.totalAtMilestone);
      let currentHistRank = 1;
      dayStandings.forEach((entry, index) => {
        if (index > 0 && entry.totalAtMilestone < dayStandings[index - 1].totalAtMilestone) {
          currentHistRank = index + 1;
        }
        playerStatsMap[entry.id].rankHistory[day] = currentHistRank;
      });

      const daySortedForWinners = [...dayStandings].sort((a, b) => b.pointsOnThisDay - a.pointsOnThisDay);
      const maxPointsOnThisDay = daySortedForWinners[0]?.pointsOnThisDay || 0;
      const winnersOnThisDay = maxPointsOnThisDay > 0
        ? daySortedForWinners.filter(entry => entry.pointsOnThisDay === maxPointsOnThisDay).map(entry => playerStatsMap[entry.id])
        : [];

      matchdayWinners[day] = { winners: winnersOnThisDay, points: maxPointsOnThisDay };
    });

    // Spezial-Rankings sortieren
    const rankingReal = [...allStatsList].sort((a, b) => b.totalPoints - a.totalPoints);
    let currentRankReal = 1;
    rankingReal.forEach((player, idx) => {
      if (idx > 0 && player.totalPoints < rankingReal[idx - 1].totalPoints) currentRankReal = idx + 1;
      player.currentRankReal = currentRankReal;
    });

    const rankingMatchOnly = [...allStatsList].sort((a, b) => b.matchPointsOnly - a.matchPointsOnly);
    let currentRankMatch = 1;
    rankingMatchOnly.forEach((player, idx) => {
      if (idx > 0 && player.matchPointsOnly < rankingMatchOnly[idx - 1].matchPointsOnly) currentRankMatch = idx + 1;
      player.currentRankMatchOnly = currentRankMatch;
    });

    const rankingPerfectHits = [...allStatsList].filter(player => player.perfectHits > 0).sort((a, b) => b.perfectHits - a.perfectHits);
    let currentRankPerfect = 1;
    rankingPerfectHits.forEach((player, idx) => {
      if (idx > 0 && player.perfectHits < rankingPerfectHits[idx - 1].perfectHits) currentRankPerfect = idx + 1;
      player.currentRankPerfectHits = currentRankPerfect;
    });

    const latestDay = matchdays[matchdays.length - 1];
    const prevDay = matchdays[matchdays.length - 2];
    allStatsList.forEach(p => {
      if (latestDay && prevDay && p.rankHistory[latestDay] !== undefined && p.rankHistory[prevDay] !== undefined) {
        p.matchdayTrend = p.rankHistory[prevDay] - p.rankHistory[latestDay];
      }
    });

    const phaseWinners = {};
    [1, 2, 3, 4, 5].forEach(phase => {
      const sorted = [...allStatsList].sort((a, b) => b.pointsPerPhase[phase] - a.pointsPerPhase[phase]);
      const maxPhasePoints = sorted[0]?.pointsPerPhase[phase] || 0;
      phaseWinners[phase] = { winners: maxPhasePoints > 0 ? sorted.filter(p => p.pointsPerPhase[phase] === maxPhasePoints) : [], points: maxPhasePoints };
    });

    const myStats = playerStatsMap[currentUserId] || null;
    
    // Durchschnitte am Ende sauber runden
    const avgPerfectHits = round1D(allStatsList.reduce((sum, p) => sum + p.perfectHits, 0) / allStatsList.length);
    const avgMatchPoints = round1D(allStatsList.reduce((sum, p) => sum + p.matchPointsOnly, 0) / allStatsList.length);

    return {
      rankingReal,
      rankingMatchOnly,
      rankingPerfectHits,
      phaseWinners,
      matchdays,
      matchdayWinners,
      myStats,
      myRankActual: myStats ? myStats.currentRankReal : 1,
      myRankMatchOnly: myStats ? myStats.currentRankMatchOnly : 1,
      avgPerfectHits,
      avgMatchPoints,
      allStatsList,
      sortedGroups,
      globalMaxStagePoints
    };
  }, [pointsData, players, matches, currentUserId]);

  // --- VISUELLER HELPER FÜR TREND-PFEILE ---
  const renderTrendArrow = (trend) => {
    if (trend > 0) return <span style={{ color: "#16a34a", fontWeight: "700", fontSize: "0.85rem" }}>▲ +{trend}</span>;
    if (trend < 0) return <span style={{ color: "#dc2626", fontWeight: "700", fontSize: "0.85rem" }}>▼ {trend}</span>;
    return <span style={{ color: "#94a3b8", fontWeight: "500", fontSize: "0.85rem" }}>▬ 0</span>;
  };

  // --- VISUELLER HELPER FÜR SPIELER-PROFILEDETAILS ---
  const renderPlayerWithAssets = (player, isMe = false, badge = null) => {
    if (!player) return null;
    const nameToRender = showDisplayName ? player.displayName : player.name;
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", verticalAlign: "middle" }}>
        {player.supported_country && player.supported_country.trim() !== "" && (
          <FlagIcon teamName={player.supported_country} style={{ width: "20px", height: "auto", borderRadius: "2px", boxShadow: "0 1px 2px rgba(0,0,0,0.1)" }} />
        )}
        {player.jersey_number !== undefined && player.jersey_number !== null && (
          <div style={{ transform: "scale(0.85)", display: "inline-block", margin: "0 -4px" }}>
            <RetroJersey number={player.jersey_number} color={player.name_color || "#2563eb"} />
          </div>
        )}
        <span style={{ fontWeight: "600", color: player.name_color || "#1e293b" }}>
          {nameToRender}
          {isMe && <span style={{ color: "#64748b", fontWeight: "normal", fontSize: "0.85rem" }}> (Du)</span>}
          {badge && <span style={{ marginLeft: "6px" }}>{badge}</span>}
        </span>
      </div>
    );
  };

  if (loading) return <div style={{ padding: "20px", color: "#4b5563", textAlign: "center" }}>Statistik-Zentrale wird berechnet...</div>;
  if (!stats || !stats.myStats) return <div style={{ padding: "20px", color: "#dc2626" }}>Keine Daten zur Berechnung verfügbar.</div>;

  const getRowStyle = (pId) => {
    const isMe = Number(pId) === Number(currentUserId);
    return {
      backgroundColor: isMe ? "#eff6ff" : "#ffffff",
      borderBottom: "1px solid #e2e8f0",
      borderLeft: isMe ? "4px solid #2563eb" : "4px solid transparent",
      height: "54px"
    };
  };

  return (
    <div style={{ padding: "24px", backgroundColor: "#ffffff", minHeight: "100vh", fontFamily: "sans-serif" }}>
      
      {/* HEADER BEREICH */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <h2 style={{ color: "#1f2937", fontSize: "24px", fontWeight: "600", margin: 0 }}>Horst Live-Statistikzentrum</h2>
        <button
          onClick={onToggleDisplayName}
          style={{
            padding: "8px 14px", backgroundColor: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px",
            color: "#334155", fontWeight: "600", fontSize: "0.85rem", cursor: "pointer"
          }}
        >
          🔄 Switch: {showDisplayName ? "Anzeigename" : "Echter Name"}
        </button>
      </div>

      {/* REITER-NAVIGATION */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "24px", overflowX: "auto" }}>
        {[
          { id: "highlights", label: "🌟 Meine Highlights", color: "#2563eb" },
          { id: "thron", label: "🏆 Die Thronsäle", color: "#16a34a" },
          { id: "whatif", label: "🔮 Was wäre, wenn...?", color: "#7e22ce" },
          { id: "trends", label: "📉 Spieltage & Verlauf", color: "#ea580c" }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 18px", border: "none", background: isActive ? tab.color : "transparent",
                color: isActive ? "#ffffff" : "#64748b", fontWeight: "600", borderRadius: "8px 8px 0 0", cursor: "pointer"
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ================= REITER 1: MEINE HIGHLIGHTS ================= */}
      {activeTab === "highlights" && (
        <div>
          {/* Top-Statistiken Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "30px" }}>
            <div style={cardStyle}>
              <p style={cardLabelStyle}>Deine Volltreffer</p>
              <h3 style={{ ...cardValueStyle, color: "#16a34a" }}>{stats.myStats.perfectHits} 🎯</h3>
              <p style={cardSubStyle}>Schnitt im Tippspiel: {stats.avgPerfectHits.toFixed(1)}</p>
            </div>
            <div style={cardStyle}>
              <p style={cardLabelStyle}>Punkte durch Spiel-Tipps</p>
              <h3 style={{ ...cardValueStyle, color: "#2563eb" }}>{stats.myStats.matchPointsOnly} Pkt</h3>
              <p style={cardSubStyle}>Globaler Durchschnitt: {stats.avgMatchPoints.toFixed(1)}</p>
            </div>
            <div style={cardStyle}>
              <p style={cardLabelStyle}>Punkte durch Prognosen</p>
              <h3 style={{ ...cardValueStyle, color: "#7e22ce" }}>{stats.myStats.prognosisPointsOnly} Pkt</h3>
              <p style={cardSubStyle}>Anteil an Gesamtpunkten: {((stats.myStats.prognosisPointsOnly / (stats.myStats.totalPoints || 1)) * 100).toFixed(0)}%</p>
            </div>
          </div>

          {/* Mittlerer Bereich: Phasen & K.o.-Runden im direkten Spalten-Vergleich */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
            
            {/* Box A: Punkteausbeute nach Phasen */}
            <div style={cardStyle}>
              <h4 style={{ margin: "0 0 20px 0", color: "#1f2937", fontSize: "1.1rem", fontWeight: "600" }}>
                Deine Punkteausbeute nach Phasen
              </h4>
              {[1, 2, 3, 4, 5].map(phase => {
                const totalPts = stats.myStats.pointsPerPhase[phase] || 0;
                const prognosisPts = stats.myStats.visualPrognosisPointsPerPhase[phase] || 0;
                const tipPts = Math.max(0, totalPts - prognosisPts); 
                const maxPhasePoints = Math.max(stats.phaseWinners[phase]?.points || 0, 1);
                
                const tipPercentage = Math.round((tipPts / maxPhasePoints) * 100);
                const prognosisPercentage = Math.round((prognosisPts / maxPhasePoints) * 100);

                return (
                  <div key={phase} style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>
                      <span>Phase {phase}</span>
                      <span style={{ color: "#334155" }}>
                        <strong>{totalPts}</strong> <span style={{ color: "#94a3b8", fontWeight: "normal" }}>/ {maxPhasePoints} Pkt</span>
                      </span>
                    </div>
                    <div style={{ width: "100%", height: "12px", backgroundColor: "#f1f5f9", borderRadius: "6px", overflow: "hidden", display: "flex" }}>
                      <div style={{ width: `${tipPercentage}%`, height: "100%", backgroundColor: "#2563eb", transition: "width 0.5s ease" }} />
                      <div style={{ width: `${prognosisPercentage}%`, height: "100%", backgroundColor: "#7e22ce", transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ display: "flex", gap: "12px", fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                      <span>⚽ Tipps: <strong>{tipPts}</strong></span>
                      <span>🔮 Prognosen: <strong>{prognosisPts}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Box B: Punkteausbeute in den K.o.-Runden (JETZT INKL. GESTAPELTEN PROGNOSE-BALKEN) */}
            <div style={cardStyle}>
              <h4 style={{ margin: "0 0 20px 0", color: "#1f2937", fontSize: "1.1rem", fontWeight: "600" }}>
                Deine Punkteausbeute in den K.o.-Runden
              </h4>
              {[
                { key: "r32", label: "Sechzehntelfinale (Spiele 73-88)" },
                { key: "r16", label: "Achtelfinale (Spiele 89-96)" },
                { key: "qf", label: "Viertelfinale (Spiele 97-100)" },
                { key: "sf", label: "Halbfinale (Spiele 101-102)" },
                { key: "f", label: "Finale & Platz 3 (Spiele 103-104)" }
              ].map(stage => {
                const stageData = stats.myStats.stagePoints[stage.key] || { tips: 0, prognosis: 0, total: 0 };
                const myPts = stageData.total;
                const tipPts = stageData.tips;
                const prognosisPts = stageData.prognosis;
                
                const maxPts = Math.max(stats.globalMaxStagePoints[stage.key], 1);
                
                const tipPercentage = Math.round((tipPts / maxPts) * 100);
                const prognosisPercentage = Math.round((prognosisPts / maxPts) * 100);

                return (
                  <div key={stage.key} style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", fontWeight: "600", color: "#475569", marginBottom: "6px" }}>
                      <span>{stage.label}</span>
                      <span style={{ color: "#334155" }}>
                        <strong>{myPts}</strong> <span style={{ color: "#94a3b8", fontWeight: "normal" }}>/ {maxPts} Pkt</span>
                      </span>
                    </div>
                    <div style={{ width: "100%", height: "12px", backgroundColor: "#f1f5f9", borderRadius: "6px", overflow: "hidden", display: "flex" }}>
                      {/* Grüner Anteil für reine Spiel-Tipps, lila Anteil für K.o.-Runden-Prognose */}
                      <div style={{ width: `${tipPercentage}%`, height: "100%", backgroundColor: "#10b981", transition: "width 0.5s ease" }} />
                      <div style={{ width: `${prognosisPercentage}%`, height: "100%", backgroundColor: "#7e22ce", transition: "width 0.5s ease" }} />
                    </div>
                    <div style={{ display: "flex", gap: "12px", fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                      <span>⚽ Tipps: <strong>{tipPts}</strong></span>
                      <span>🔮 Prognosen: <strong>{prognosisPts}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Unterer Bereich: Punkte nach einzelnen Gruppen (INKL. AUFSCHLÜSSELUNG DER PLATZIERUNGSTIPPS) */}
          <div style={{ ...cardStyle, marginTop: "24px" }}>
            <h4 style={{ margin: "0 0 4px 0", color: "#1f2937", fontSize: "1.1rem", fontWeight: "600" }}>
              Deine Punkteausbeute nach einzelnen Gruppen
            </h4>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "#64748b" }}>
              Hier siehst du deine Punkte in den Gruppen (1-72) inklusive der Gruppenplatzierungspunkte im Vergleich zum Bestwert.
            </p>
            
            {stats.sortedGroups.length === 0 ? (
              <p style={{ fontSize: "0.9rem", color: "#94a3b8", fontStyle: "italic", margin: 0 }}>Noch keine Gruppenspiele geladen.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px" }}>
                {stats.sortedGroups.map(gName => {
                  const groupData = stats.myStats.stagePoints.groups[gName] || { tips: 0, prognosis: 0, total: 0 };
                  const myGroupPts = groupData.total;
                  const maxGroupPts = stats.globalMaxStagePoints.groups[gName] || 0;
                  const isUserBest = myGroupPts > 0 && myGroupPts === maxGroupPts;

                  return (
                    <div 
                      key={gName} 
                      style={{ 
                        padding: "12px", 
                        backgroundColor: isUserBest ? "#ecfdf5" : "#f8fafc", 
                        borderRadius: "8px", 
                        border: isUserBest ? "1px solid #10b981" : "1px solid #e2e8f0", 
                        textAlign: "center" 
                      }}
                    >
                      <div style={{ fontSize: "0.78rem", fontWeight: "700", color: "#64748b", marginBottom: "4px" }}>
                        GRUPPE {gName.toUpperCase()} {isUserBest && "👑"}
                      </div>
                      <div style={{ fontSize: "1.15rem", fontWeight: "700", color: isUserBest ? "#047857" : "#1e293b" }}>
                        {myGroupPts}
                        <span style={{ fontSize: "0.82rem", color: "#94a3b8", fontWeight: "normal" }}> / {maxGroupPts}</span>
                      </div>
                      {/* Kleine Aufschlüsselung unter der Punktzahl */}
                      <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "4px", borderTop: "1px dashed #e2e8f0", paddingTop: "4px" }}>
                        ⚽ {groupData.tips} Pkt | 🔮 {groupData.prognosis} Pkt
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ================= REITER 2: DIE THRONSÄLE ================= */}
      {activeTab === "thron" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
            
            {/* Volltreffer Ranking */}
            <div style={cardStyle}>
              <h4 style={{ margin: "0 0 14px 0", color: "#1f2937" }}>🎯 Die Volltreffer-Könige (Exakte Ergebnisse)</h4>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#64748b", fontSize: "0.85rem" }}>
                    <th style={{ padding: "8px" }}>Platz</th>
                    <th style={{ padding: "8px" }}>Name</th>
                    <th style={{ padding: "8px", textAlign: "right" }}>Volltreffer</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.rankingPerfectHits.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={{ padding: "16px", color: "#94a3b8", fontSize: "0.9rem", textAlign: "center" }}>Noch keine Volltreffer erzielt.</td>
                    </tr>
                  ) : (
                    stats.rankingPerfectHits.map((player) => (
                      <tr key={player.id} style={getRowStyle(player.id)}>
                        <td style={{ padding: "8px", fontWeight: "700", verticalAlign: "middle", color: "#1f2937" }}>{player.currentRankPerfectHits}.</td>
                        <td style={{ padding: "8px", verticalAlign: "middle" }}>{renderPlayerWithAssets(player, Number(player.id) === Number(currentUserId))}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "700", color: "#16a34a", verticalAlign: "middle" }}>{player.perfectHits}</td>
                      </tr>
                    )))}
                </tbody>
              </table>
            </div>

            {/* Phasen Könige */}
            <div style={cardStyle}>
              <h4 style={{ margin: "0 0 14px 0", color: "#1f2937" }}>👑 Die Herrscher der Phasen</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[1, 2, 3, 4, 5].map(phase => {
                  const item = stats.phaseWinners[phase];
                  const hasWinners = item.winners && item.winners.length > 0;
                  const isMeWinner = item.winners?.some(w => Number(w.id) === Number(currentUserId));
                  
                  return (
                    <div key={phase} style={{ display: "flex", flexDirection: "column", padding: "10px", backgroundColor: isMeWinner ? "#eff6ff" : "#f8fafc", borderRadius: "8px", border: isMeWinner ? "1px solid #3b82f6" : "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontWeight: "700", color: "#475569", width: "70px", paddingTop: "2px" }}>Phase {phase}:</span>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                          {hasWinners ? (
                            item.winners.map(winner => {
                              const isThisMe = Number(winner.id) === Number(currentUserId);
                              return <div key={winner.id}>{renderPlayerWithAssets(winner, isThisMe, isThisMe ? "⭐" : null)}</div>;
                            })
                          ) : (
                            <span style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.85rem", paddingTop: "2px" }}>Noch kein Phasenbeginn (0 Pkt)</span>
                          )}
                        </div>
                        <span style={{ fontWeight: "700", color: item.points > 0 ? "#2563eb" : "#94a3b8", textAlign: "right", paddingTop: "2px" }}>{item.points} Pkt</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Die Spieltags-Könige */}
          <div style={cardStyle}>
            <h4 style={{ margin: "0 0 14px 0", color: "#1f2937" }}>🏅 Die Spieltags-Könige (Meiste Punkte am Spieltag)</h4>
            {stats.matchdays.length === 0 ? (
              <p style={{ fontSize: "0.9rem", color: "#64748b", margin: 0 }}>Noch keine Spieltagsdaten vorhanden.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
                {stats.matchdays.map(day => {
                  const data = stats.matchdayWinners[day];
                  const isMeWinner = data.winners?.some(w => Number(w.id) === Number(currentUserId));
                  
                  return (
                    <div key={day} style={{ padding: "12px", backgroundColor: isMeWinner ? "#f0fdf4" : "#f8fafc", borderRadius: "8px", border: isMeWinner ? "1px solid #22c55e" : "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: "700", color: "#64748b", marginBottom: "6px" }}>SPIELTAG {day}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {data.winners && data.winners.length > 0 ? (
                          data.winners.map(winner => {
                            const isThisMe = Number(winner.id) === Number(currentUserId);
                            return <div key={winner.id} style={{ display: "flex", alignItems: "center" }}>{renderPlayerWithAssets(winner, isThisMe, isThisMe ? "👑" : null)}</div>;
                          })
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "0.85rem", fontStyle: "italic" }}>Keine Punkte erzielt</span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "#16a34a", marginTop: "8px", borderTop: "1px dashed #e2e8f0", paddingTop: "4px" }}>{data.points} Punkte</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= REITER 3: WAS WÄRE WENN... ================= */}
      {activeTab === "whatif" && (
        <div style={cardStyle}>
          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "0 0 4px 0", color: "#1f2937" }}>🔮 Das reine Tipp-Ranking</h4>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>Wie sähe die Tabelle aus, wenn man alle Turnier-Prognosen (Phase 1-5) abzieht und nur echte Spielergebnisse zählt?</p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f1f5f9", textAlign: "left" }}>
                  <th style={thStyle}>Neuer Platz</th>
                  <th style={thStyle}>Spieler</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Reine Tipp-Punkte</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Real-Platz</th>
                </tr>
              </thead>
              <tbody>
                {stats.rankingMatchOnly.map((player) => {
                  const realRank = player.currentRankReal;
                  const matchRank = player.currentRankMatchOnly;
                  const diff = realRank - matchRank;
                  const isMe = Number(player.id) === Number(currentUserId);

                  return (
                    <tr key={player.id} style={getRowStyle(player.id)}>
                      <td style={{ ...tdStyle, fontWeight: "700", color: "#1f2937" }}>{matchRank}.</td>
                      <td style={tdStyle}>{renderPlayerWithAssets(player, isMe)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: "700", color: "#2563eb" }}>{player.matchPointsOnly} Pkt</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: "500", color: "#334155" }}>
                        {realRank}. {diff > 0 ? (
                          <span style={{ color: "#16a34a", fontSize: "0.8rem", fontWeight: "600" }}>↑+{diff}</span>
                        ) : diff < 0 ? (
                          <span style={{ color: "#dc2626", fontSize: "0.8rem", fontWeight: "600" }}>↓{diff}</span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>=</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= REITER 4: SPIELTAGE & VERLAUF ================= */}
      {activeTab === "trends" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={cardStyle}>
            <h4 style={{ margin: "0 0 6px 0", color: "#1f2937" }}>📈 Platzierungs-Verlauf nach Spieltagen</h4>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.85rem", color: "#64748b" }}>Hier siehst du, wie sich die Ränge der Mitspieler nach jedem abgeschlossenen Spieltag verschoben haben.</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f1f5f9", textAlign: "left" }}>
                    <th style={thStyle}>Aktuell</th>
                    <th style={thStyle}>Spieler</th>
                    {stats.matchdays.map(day => <th key={day} style={{ ...thStyle, textAlign: "center" }}>ST {day}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {stats.rankingReal.map((player) => {
                    const isMe = Number(player.id) === Number(currentUserId);
                    return (
                      <tr key={player.id} style={getRowStyle(player.id)}>
                        <td style={{ ...tdStyle, fontWeight: "700", color: "#1f2937" }}>{player.currentRankReal}.</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "12px" }}>
                            {renderPlayerWithAssets(player, isMe)}
                            <div style={{ minWidth: "45px", textAlign: "right" }}>{renderTrendArrow(player.matchdayTrend)}</div>
                          </div>
                        </td>
                        {stats.matchdays.map(day => {
                          const historyRank = player.rankHistory[day] || "-";
                          return (
                            <td key={day} style={{ ...tdStyle, textAlign: "center", fontWeight: "700", color: historyRank === 1 ? "#16a34a" : "#475569" }}>
                              <span style={{ padding: "4px 8px", backgroundColor: historyRank === 1 ? "#dcfce7" : "transparent", borderRadius: "4px" }}>{historyRank}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}      
    </div>
  );
};

// --- STYLE-OBJEKTE ---
const cardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  padding: "20px",
  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)"
};

const cardLabelStyle = { margin: "0 0 4px 0", fontSize: "0.85rem", fontWeight: "600", color: "#64748b" };
const cardValueStyle = { margin: "0 0 4px 0", fontSize: "1.75rem", fontWeight: "700" };
const cardSubStyle = { margin: 0, fontSize: "0.8rem", color: "#94a3b8" };
const thStyle = { padding: "12px 16px", fontSize: "0.85rem", fontWeight: "600", color: "#475569", borderBottom: "1px solid #e2e8f0" };
const tdStyle = { padding: "12px 16px", fontSize: "0.9rem", verticalAlign: "middle" };

export default StatisticsPage;