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
        pointsPerMatchday: {},    // Punkte, die REIN an diesem Spieltag gemacht wurden { 1: X, 2: Y... }
        rankHistory: {}           // Der Rang des Spielers am Ende dieses Spieltags { 1: Rang, 2: Rang... }
      };
    });

    // Alle vorkommenden Spieltage aus den Daten ermitteln (sortiert, z.B. [1, 2, 3...])
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

      if (row.category === "MATCH") {
        playerStatsMap[pId].matchPointsOnly += pts;
        
        // Spieltags-Punkte zuweisen
        if (row.matchday !== undefined && row.matchday !== null && row.matchday !== "") {
          const mDay = row.matchday;
          if (!playerStatsMap[pId].pointsPerMatchday[mDay]) {
            playerStatsMap[pId].pointsPerMatchday[mDay] = 0;
          }
          playerStatsMap[pId].pointsPerMatchday[mDay] += pts;
        }

        // Volltreffer ermitteln aus dem JSON-Breakdown
        if (row.breakdown && 
            row.breakdown.tip_a !== undefined && 
            row.breakdown.real_a !== undefined &&
            Number(row.breakdown.tip_a) === Number(row.breakdown.real_a) && 
            Number(row.breakdown.tip_b) === Number(row.breakdown.real_b)) {
          playerStatsMap[pId].perfectHits += 1;
        }
      } else {
        playerStatsMap[pId].prognosisPointsOnly += pts;
      }

      if (row.phase_id && playerStatsMap[pId].pointsPerPhase[row.phase_id] !== undefined) {
        playerStatsMap[pId].pointsPerPhase[row.phase_id] += pts;
      }
    });

    const allStatsList = Object.values(playerStatsMap);

    // 3. Zeitverlauf & Spieltagssieger berechnen (On-the-fly Snapshot)
    const matchdayWinners = {};
    
    matchdays.forEach(day => {
      // Snapshot-Tabelle für diesen spezifischen Spieltag bauen
      const dayStandings = allStatsList.map(p => {
        // Summiere alle Spieltagspunkte von Tag 1 bis zum aktuellen 'day'
        let accumulatedMatchPoints = 0;
        matchdays.forEach(d => {
          if (Number(d) <= Number(day)) {
            accumulatedMatchPoints += (p.pointsPerMatchday[d] || 0);
          }
        });

        // Gesamtrang inklusive der Prognosepunkte zu diesem Zeitpunkt
        const totalPointsAtThisMilestone = accumulatedMatchPoints + p.prognosisPointsOnly;

        return {
          id: p.id,
          pointsOnThisDay: p.pointsPerMatchday[day] || 0,
          totalAtMilestone: totalPointsAtThisMilestone
        };
      });

      // Ränge für diesen Spieltag ermitteln (Nach Gesamtpunkten bis zu diesem Tag sortieren)
      dayStandings.sort((a, b) => b.totalAtMilestone - a.totalAtMilestone);
      dayStandings.forEach((entry, index) => {
        playerStatsMap[entry.id].rankHistory[day] = index + 1;
      });

      // Spieltagssieger ermitteln (Wer hat REIN AM DIESEM TAG am meisten gepunktet?)
      dayStandings.sort((a, b) => b.pointsOnThisDay - a.pointsOnThisDay);
      const topScorer = dayStandings[0];
      matchdayWinners[day] = {
        winner: playerStatsMap[topScorer?.id] || null,
        points: topScorer?.pointsOnThisDay || 0
      };
    });

    // 4. Spezial-Rankings sortieren
    const rankingReal = [...allStatsList].sort((a, b) => b.totalPoints - a.totalPoints);
    const rankingMatchOnly = [...allStatsList].sort((a, b) => b.matchPointsOnly - a.matchPointsOnly);
    const rankingPerfectHits = [...allStatsList].sort((a, b) => b.perfectHits - a.perfectHits);

    // Phasen-Gewinner ermitteln
    const phaseWinners = {};
    [1, 2, 3, 4, 5].forEach(phase => {
      const sorted = [...allStatsList].sort((a, b) => b.pointsPerPhase[phase] - a.pointsPerPhase[phase]);
      phaseWinners[phase] = {
        winner: sorted[0],
        points: sorted[0]?.pointsPerPhase[phase] || 0
      };
    });

    // 5. Daten für den angemeldeten Spieler isolieren
    const myStats = playerStatsMap[currentUserId] || null;
    
    const myRankActual = rankingReal.findIndex(p => Number(p.id) === Number(currentUserId)) + 1;
    const myRankMatchOnly = rankingMatchOnly.findIndex(p => Number(p.id) === Number(currentUserId)) + 1;

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
      <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "24px", overflowX: "auto", pb: "4px" }}>
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
              <p style={cardSubStyle}>Globale Durchschnitt: {stats.avgMatchPoints.toFixed(1)}</p>
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
                  <div style={{ display: "flex", justifyContent: "between", fontSize: "0.88rem", fontWeight: "600", color: "#475569", marginBottom: "4px" }}>
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
                  {stats.rankingPerfectHits.slice(0, 5).map((player, idx) => (
                    <tr key={player.id} style={getRowStyle(player.id)}>
                      <td style={{ padding: "8px", fontWeight: "700" }}>{idx + 1}.</td>
                      <td style={{ padding: "8px", fontWeight: "600", color: player.name_color || "#0f172a" }}>{player.displayName}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontWeight: "700", color: "#16a34a" }}>{player.perfectHits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phasen Könige */}
            <div style={cardStyle}>
              <h4 style={{ margin: "0 0 14px 0", color: "#1f2937" }}>👑 Die Herrscher der Phasen</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {[1, 2, 3, 4, 5].map(phase => {
                  const item = stats.phaseWinners[phase];
                  const isMeWinner = Number(item.winner?.id) === Number(currentUserId);
                  return (
                    <div key={phase} style={{ display: "flex", alignItems: "center", padding: "10px", backgroundColor: isMeWinner ? "#eff6ff" : "#f8fafc", borderRadius: "8px", border: isMeWinner ? "1px solid #3b82f6" : "1px solid #e2e8f0" }}>
                      <span style={{ fontWeight: "700", color: "#475569", width: "70px" }}>Phase {phase}:</span>
                      <span style={{ fontWeight: "600", color: item.winner?.name_color || "#1e293b" }}>
                        {item.winner?.displayName} {isMeWinner && "⭐"}
                      </span>
                      <span style={{ marginLeft: "auto", fontWeight: "700", color: "#2563eb" }}>{item.points} Pkt</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* NEU: Die Spieltags-Könige */}
          <div style={cardStyle}>
            <h4 style={{ margin: "0 0 14px 0", color: "#1f2937" }}>🏅 Die Spieltags-Könige (Meiste Punkte am Spieltag)</h4>
            {stats.matchdays.length === 0 ? (
              <p style={{ fontSize: "0.9rem", color: "#64748b", margin: 0 }}>Noch keine Spieltagsdaten vorhanden.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {stats.matchdays.map(day => {
                  const data = stats.matchdayWinners[day];
                  const isMeWinner = Number(data.winner?.id) === Number(currentUserId);
                  return (
                    <div key={day} style={{ padding: "12px", backgroundColor: isMeWinner ? "#f0fdf4" : "#f8fafc", borderRadius: "8px", border: isMeWinner ? "1px solid #22c55e" : "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: "700", color: "#64748b", marginBottom: "4px" }}>SPIELTAG {day}</div>
                      <div style={{ fontWeight: "600", color: data.winner?.name_color || "#1e293b", fontSize: "0.95rem" }}>
                        {data.winner ? data.winner.displayName : "Niemand"} {isMeWinner && "👑"}
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "#16a34a", marginTop: "2px" }}>{data.points} Punkte</div>
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
                {stats.rankingMatchOnly.map((player, idx) => {
                  const realRank = stats.rankingReal.findIndex(p => p.id === player.id) + 1;
                  const diff = realRank - (idx + 1);
                  const isMe = Number(player.id) === Number(currentUserId);

                  return (
                    <tr key={player.id} style={getRowStyle(player.id)}>
                      <td style={{ ...tdStyle, fontWeight: "700" }}>{idx + 1}.</td>
                      <td style={{ ...tdStyle, fontWeight: "600", color: player.name_color || "#1e293b" }}>
                        {player.displayName} {isMe && " (Du)"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: "700", color: "#2563eb" }}>
                        {player.matchPointsOnly} Pkt
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: "500" }}>
                        {realRank}. {diff > 0 ? (
                          <span style={{ color: "#16a34a", fontSize: "0.8rem" }}>↑+{diff}</span>
                        ) : diff < 0 ? (
                          <span style={{ color: "#dc2626", fontSize: "0.8rem" }}>↓{diff}</span>
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
          
          {/* NEU: Der historische Rangverlauf als interaktive Matrix-Tabelle */}
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
                  {stats.rankingReal.map((player, idx) => {
                    const isMe = Number(player.id) === Number(currentUserId);
                    return (
                      <tr key={player.id} style={getRowStyle(player.id)}>
                        <td style={{ ...tdStyle, fontWeight: "700" }}>{idx + 1}.</td>
                        <td style={{ ...tdStyle, fontWeight: "600", color: player.name_color || "#1e293b" }}>{player.displayName}</td>
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

          {/* Punkte-Verteilung (Balkendiagramm) */}
          <div style={cardStyle}>
            <h4 style={{ margin: "0 0 16px 0", color: "#1f2937" }}>📊 Punkte-Vergleich aller Mitspieler</h4>
            <p style={{ margin: "0 0 20px 0", fontSize: "0.85rem", color: "#64748b" }}>Hier siehst du die Verteilung der Match-Punkte (Blau) vs. Prognose-Punkte (Lila) im direkten, visuellen Stapel-Vergleich.</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {stats.rankingReal.map(player => {
                const total = player.totalPoints || 1;
                const matchPct = (player.matchPointsOnly / total) * 100;
                const progPct = (player.prognosisPointsOnly / total) * 100;
                const isMe = Number(player.id) === Number(currentUserId);

                return (
                  <div key={player.id} style={{ padding: "8px", borderRadius: "8px", backgroundColor: isMe ? "#eff6ff" : "transparent", borderLeft: isMe ? "4px solid #2563eb" : "4px solid transparent" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: "4px", fontWeight: isMe ? "700" : "500" }}>
                      <span style={{ color: player.name_color || "#1e293b" }}>{player.displayName} {isMe && " (Du)"}</span>
                      <span style={{ marginLeft: "auto", color: "#475569" }}>{player.totalPoints} Gesamt-Pkt</span>
                    </div>
                    <div style={{ width: "100%", height: "16px", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
                      <div style={{ width: `${matchPct}%`, backgroundColor: "#2563eb", height: "100%", transition: "width 0.5s" }} title={`Tipps: ${player.matchPointsOnly} Pkt`} />
                      <div style={{ width: `${progPct}%`, backgroundColor: "#7e22ce", height: "100%", transition: "width 0.5s" }} title={`Prognosen: ${player.prognosisPointsOnly} Pkt`} />
                    </div>
                  </div>
                );
              })}
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

const cardLabelStyle = { margin: 0, fontSize: "0.85rem", fontWeight: "600", color: "#64748b", uppercase: "true" };
const cardValueStyle = { margin: "8px 0", fontSize: "1.8rem", fontWeight: "700" };
const cardSubStyle = { margin: 0, fontSize: "0.8rem", color: "#94a3b8" };

const thStyle = { padding: "12px 16px", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: "600", fontSize: "0.88rem" };
const tdStyle = { padding: "12px 16px", fontSize: "0.9rem", verticalAlign: "middle" };

export default StatisticsPage;