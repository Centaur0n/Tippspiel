import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { RetroJersey } from "../Utils/RetroJersey";
import { FlagIcon } from "../Utils/teamUtils";

const StatisticsPage = ({ currentUserId }) => {
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

    // 1. Grundstruktur pro Spieler aufbauen
    const playerStatsMap = {};
    players.forEach(p => {
      playerStatsMap[p.id] = {
        ...p,
        displayName: p.display_name && p.display_name !== "EMPTY" ? p.display_name : p.name,
        totalPoints: 0,
        matchPointsOnly: 0,       // Nur echte Spielergebnisse (ohne Prognosen)
        prognosisPointsOnly: 0,   // Nur Prognosepunkte
        perfectHits: 0,           // Volltreffer (Exaktes Ergebnis)
        pointsPerPhase: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        pointsPerMatchday: {},    // Alle Punkte (Matches + Prognosen), die diesem Tag zugeordnet sind
        prognosisPointsPerPhase: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, // Prognosepunkte ohne expliziten Spieltag
        rankHistory: {},          // Der Rang des Spielers am Ende dieses Spieltags
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

      if (row.category === "MATCH") {
        playerStatsMap[pId].matchPointsOnly += pts;

        if (row.breakdown && 
            row.breakdown.tip_a !== undefined && 
            row.breakdown.real_a !== undefined &&
            Number(row.breakdown.tip_a) === Number(row.breakdown.real_a) && 
            Number(row.breakdown.tip_b) === Number(row.breakdown.real_b)) {
          playerStatsMap[pId].perfectHits += 1;
        }
      } else {
        playerStatsMap[pId].prognosisPointsOnly += pts;
        
        if ((row.matchday === undefined || row.matchday === null || row.matchday === "") && row.phase_id) {
          if (playerStatsMap[pId].prognosisPointsPerPhase[row.phase_id] !== undefined) {
            playerStatsMap[pId].prognosisPointsPerPhase[row.phase_id] += pts;
          }
        }
      }

      if (row.phase_id && playerStatsMap[pId].pointsPerPhase[row.phase_id] !== undefined) {
        playerStatsMap[pId].pointsPerPhase[row.phase_id] += pts;
      }
    });

    const allStatsList = Object.values(playerStatsMap);
    const phaseEndMatchday = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 };

    // 3. Zeitverlauf & Spieltagssieger berechnen
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

        return {
          id: p.id,
          pointsOnThisDay: p.pointsPerMatchday[day] || 0,
          totalAtMilestone: accumulatedPointsAtMilestone
        };
      });

      // Historische Ränge berechnen
      dayStandings.sort((a, b) => b.totalAtMilestone - a.totalAtMilestone);
      let currentHistRank = 1;
      dayStandings.forEach((entry, index) => {
        if (index > 0 && entry.totalAtMilestone < dayStandings[index - 1].totalAtMilestone) {
          currentHistRank = index + 1;
        }
        playerStatsMap[entry.id].rankHistory[day] = currentHistRank;
      });

      // Alle Tagessieger mit exakt gleicher (maximaler) Punktzahl ermitteln
      const daySortedForWinners = [...dayStandings].sort((a, b) => b.pointsOnThisDay - a.pointsOnThisDay);
      const maxPointsOnThisDay = daySortedForWinners[0]?.pointsOnThisDay || 0;
      
      const winnersOnThisDay = maxPointsOnThisDay > 0
        ? daySortedForWinners
            .filter(entry => entry.pointsOnThisDay === maxPointsOnThisDay)
            .map(entry => playerStatsMap[entry.id])
        : [];

      matchdayWinners[day] = {
        winners: winnersOnThisDay,
        points: maxPointsOnThisDay
      };
    });

    // 4. Spezial-Rankings sortieren & Ränge mit Gleichstand berechnen
    const rankingReal = [...allStatsList].sort((a, b) => b.totalPoints - a.totalPoints);
    let currentRankReal = 1;
    rankingReal.forEach((player, idx) => {
      if (idx > 0 && player.totalPoints < rankingReal[idx - 1].totalPoints) {
        currentRankReal = idx + 1;
      }
      player.currentRankReal = currentRankReal;
    });

    const rankingMatchOnly = [...allStatsList].sort((a, b) => b.matchPointsOnly - a.matchPointsOnly);
    let currentRankMatch = 1;
    rankingMatchOnly.forEach((player, idx) => {
      if (idx > 0 && player.matchPointsOnly < rankingMatchOnly[idx - 1].matchPointsOnly) {
        currentRankMatch = idx + 1;
      }
      player.currentRankMatchOnly = currentRankMatch;
    });

    // Spieler mit 0 Volltreffern komplett herausfiltern
    const rankingPerfectHits = [...allStatsList]
      .filter(player => player.perfectHits > 0)
      .sort((a, b) => b.perfectHits - a.perfectHits);

    let currentRankPerfect = 1;
    rankingPerfectHits.forEach((player, idx) => {
      if (idx > 0 && player.perfectHits < rankingPerfectHits[idx - 1].perfectHits) {
        currentRankPerfect = idx + 1;
      }
      player.currentRankPerfectHits = currentRankPerfect;
    });

    // Trend zum vorherigen Spieltag ermitteln
    const latestDay = matchdays[matchdays.length - 1];
    const prevDay = matchdays[matchdays.length - 2];

    allStatsList.forEach(p => {
      if (latestDay && prevDay && p.rankHistory[latestDay] !== undefined && p.rankHistory[prevDay] !== undefined) {
        p.matchdayTrend = p.rankHistory[prevDay] - p.rankHistory[latestDay];
      } else {
        p.matchdayTrend = 0;
      }
    });

    // KORREKTUR: Phasen-Gewinner unterstützt jetzt ebenfalls geteilte Plätze bei Gleichstand
    const phaseWinners = {};
    [1, 2, 3, 4, 5].forEach(phase => {
      const sorted = [...allStatsList].sort((a, b) => b.pointsPerPhase[phase] - a.pointsPerPhase[phase]);
      const maxPhasePoints = sorted[0]?.pointsPerPhase[phase] || 0;
      
      const winnersOnThisPhase = maxPhasePoints > 0
        ? sorted.filter(p => p.pointsPerPhase[phase] === maxPhasePoints)
        : [];
      
      phaseWinners[phase] = {
        winners: winnersOnThisPhase,
        points: maxPhasePoints
      };
    });

    // Daten für den angemeldeten Spieler isolieren
    const myStats = playerStatsMap[currentUserId] || null;
    const myRankActual = myStats ? myStats.currentRankReal : 1;
    const myRankMatchOnly = myStats ? myStats.currentRankMatchOnly : 1;

    const avgPerfectHits = allStatsList.reduce((sum, p) => sum + p.perfectHits, 0) / allStatsList.length;
    const avgMatchPoints = allStatsList.reduce((sum, p) => sum + p.matchPointsOnly, 0) / allStatsList.length;

    return {
      rankingReal,
      rankingMatchOnly,
      rankingPerfectHits,
      phaseWinners,
      matchdays,
      matchdayWinners,
      myStats,
      myRankActual,
      myRankMatchOnly,
      avgPerfectHits,
      avgMatchPoints,
      allStatsList
    };
  }, [pointsData, players, currentUserId]);

  // --- VISUELLER HELPER FÜR TREND-PFEILE ---
  const renderTrendArrow = (trend) => {
    if (trend > 0) {
      return (
        <span style={{ color: "#16a34a", fontWeight: "700", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "2px" }} title={`${trend} Plätze gutgemacht`}>
          ▲ +{trend}
        </span>
      );
    }
    if (trend < 0) {
      return (
        <span style={{ color: "#dc2626", fontWeight: "700", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "2px" }} title={`${Math.abs(trend)} Plätze verloren`}>
          ▼ {trend}
        </span>
      );
    }
    return (
      <span style={{ color: "#94a3b8", fontWeight: "500", fontSize: "0.85rem" }} title="Platzierung unverändert">
        ▬ 0
      </span>
    );
  };

  // --- VISUELLER HELPER FÜR SPIELER-PROFILEDETAILS ---
  const renderPlayerWithAssets = (player, isMe = false, badge = null) => {
    if (!player) return null;
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
          {player.displayName}
          {isMe && <span style={{ color: "#64748b", fontWeight: "normal", fontSize: "0.85rem" }}> (Du)</span>}
          {badge && <span style={{ marginLeft: "6px" }}>{badge}</span>}
        </span>
      </div>
    );
  };

  if (loading) {
    return <div style={{ padding: "20px", color: "#4b5563", textAlign: "center" }}>Statistik-Zentrale wird berechnet...</div>;
  }

  if (!stats || !stats.myStats) {
    return <div style={{ padding: "20px", color: "#dc2626" }}>Keine Daten zur Berechnung verfügbar.</div>;
  }

  const getRowStyle = (pId) => {
    const isMe = Number(pId) === Number(currentUserId);
    return {
      backgroundColor: isMe ? "#eff6ff" : "#ffffff",
      borderBottom: "1px solid #e2e8f0",
      borderLeft: isMe ? "4px solid #2563eb" : "4px solid transparent",
      height: "54px",
      transition: "background-color 0.2s"
    };
  };

  return (
    <div style={{ padding: "24px", backgroundColor: "#ffffff", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <h2 style={{ color: "#1f2937", fontSize: "24px", fontWeight: "600", marginBottom: "20px" }}>
        📊 Live-Statistikzentrum
      </h2>

      {/* --- REITER-NAVIGATION --- */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "24px", overflowX: "auto", paddingBottom: "4px" }}>
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
                padding: "10px 18px",
                border: "none",
                background: isActive ? tab.color : "transparent",
                color: isActive ? "#ffffff" : "#64748b",
                fontWeight: "600",
                fontSize: "0.92rem",
                borderRadius: "8px 8px 0 0",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
                borderBottom: isActive ? `3px solid ${tab.color}` : "3px solid transparent"
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "30px" }}>
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

          <div style={{ ...cardStyle, maxWidth: "600px" }}>
            <h4 style={{ margin: "0 0 16px 0", color: "#1f2937", fontSize: "1.1rem" }}>Deine Punkteausbeute nach Phasen</h4>
            {[1, 2, 3, 4, 5].map(phase => {
              const userPts = stats.myStats.pointsPerPhase[phase];
              const maxPhasePoints = Math.max(...stats.allStatsList.map(p => p.pointsPerPhase[phase]), 1);
              const barPercentage = Math.min((userPts / maxPhasePoints) * 100, 100);

              return (
                <div key={phase} style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
                    <span>Phase {phase}</span>
                    <span style={{ marginLeft: "auto" }}>{userPts} Pkt (Bestwert: {maxPhasePoints})</span>
                  </div>
                  <div style={{ width: "100%", height: "10px", backgroundColor: "#f1f5f9", borderRadius: "10px", overflow: "hidden" }}>
                    <div style={{ width: `${barPercentage}%`, height: "100%", backgroundColor: "#3b82f6", borderRadius: "10px", transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= REITER 2: DIE THONSÄLE ================= */}
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
                      <td colSpan="3" style={{ padding: "16px", color: "#94a3b8", fontSize: "0.9rem", textAlign: "center" }}>
                        Noch keine Volltreffer erzielt.
                      </td>
                    </tr>
                  ) : (
                    stats.rankingPerfectHits.map((player) => (
                      <tr key={player.id} style={getRowStyle(player.id)}>
                        <td style={{ padding: "8px", fontWeight: "700", verticalAlign: "middle", color: "#1f2937" }}>
                          {player.currentRankPerfectHits}.
                        </td>
                        <td style={{ padding: "8px", verticalAlign: "middle" }}>
                          {renderPlayerWithAssets(player, Number(player.id) === Number(currentUserId))}
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: "700", color: "#16a34a", verticalAlign: "middle" }}>
                          {player.perfectHits}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Phasen Könige (Unterstützt nun mehrere geteilte Phasensieger sauber untereinander) */}
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
                              return (
                                <div key={winner.id}>
                                  {renderPlayerWithAssets(winner, isThisMe, isThisMe ? "⭐" : null)}
                                </div>
                              );
                            })
                          ) : (
                            <span style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.85rem", paddingTop: "2px" }}>
                              Noch kein Phasenbeginn (0 Pkt)
                            </span>
                          )}
                        </div>
                        <span style={{ fontWeight: "700", color: item.points > 0 ? "#2563eb" : "#94a3b8", textAlign: "right", paddingTop: "2px" }}>
                          {item.points} Pkt
                        </span>
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
                            return (
                              <div key={winner.id} style={{ display: "flex", alignItems: "center" }}>
                                {renderPlayerWithAssets(winner, isThisMe, isThisMe ? "👑" : null)}
                              </div>
                            );
                          })
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "0.85rem", fontStyle: "italic" }}>Keine Punkte erzielt</span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "#16a34a", marginTop: "8px", borderTop: "1px dashed #e2e8f0", paddingTop: "4px" }}>
                        {data.points} Punkte
                      </div>
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
                      <td style={tdStyle}>
                        {renderPlayerWithAssets(player, isMe)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: "700", color: "#2563eb" }}>
                        {player.matchPointsOnly} Pkt
                      </td>
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
                    {stats.matchdays.map(day => (
                      <th key={day} style={{ ...thStyle, textAlign: "center" }}>ST {day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.rankingReal.map((player) => {
                    const isMe = Number(player.id) === Number(currentUserId);
                    return (
                      <tr key={player.id} style={getRowStyle(player.id)}>
                        <td style={{ ...tdStyle, fontWeight: "700", color: "#1f2937" }}>
                          {player.currentRankReal}.
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "12px" }}>
                            {renderPlayerWithAssets(player, isMe)}
                            <div style={{ minWidth: "45px", textAlign: "right" }}>
                              {renderTrendArrow(player.matchdayTrend)}
                            </div>
                          </div>
                        </td>
                        {stats.matchdays.map(day => {
                          const historyRank = player.rankHistory[day] || "-";
                          return (
                            <td key={day} style={{ ...tdStyle, textAlign: "center", fontWeight: "700", color: historyRank === 1 ? "#16a34a" : "#475569" }}>
                              <span style={{ padding: "4px 8px", backgroundColor: historyRank === 1 ? "#dcfce7" : "transparent", borderRadius: "4px" }}>
                                {historyRank}
                              </span>
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

// Modulare UI-Styles
const cardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #e2e8f0",
  padding: "20px",
  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)"
};

const cardLabelStyle = { margin: 0, fontSize: "0.85rem", fontWeight: "600", color: "#64748b", textTransform: "uppercase" };
const cardValueStyle = { margin: "8px 0", fontSize: "1.8rem", fontWeight: "700" };
const cardSubStyle = { margin: 0, fontSize: "0.8rem", color: "#94a3b8" };

const thStyle = { padding: "12px 16px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: "600", fontSize: "0.88rem" };
const tdStyle = { padding: "12px 16px", fontSize: "0.9rem", verticalAlign: "middle" };

export default StatisticsPage;