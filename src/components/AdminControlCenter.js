import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// --- IMPORT FLAG ICON COMPONENT ---
import { FlagIcon } from "../Utils/teamUtils";

// Kontrast-Hilfsfunktion für die Rückennummer auf dem Trikot
const getContrastColor = (hexColor) => {
  if (!hexColor || hexColor.length < 6) return "#000000";
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#ffffff";
};

// Dynamische Trikot-Komponente mit Schutz-Kontur für schwarze Trikots
const JerseyIcon = ({ color = "#000000", number = "", size = 32 }) => {
  const isBlack = color === "#000000";
  return (
    <div style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ fill: color, stroke: isBlack ? "#4b5563" : "#000000", strokeWidth: 6, strokeLinejoin: "round" }}>
        <path d="M 30,15 L 40,23 L 60,23 L 70,15 L 90,25 L 80,45 L 73,42 L 73,90 L 27,90 L 27,42 L 20,45 L 10,25 Z" />
      </svg>
      <span style={{
        position: "absolute",
        top: "54%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        fontSize: `${size * 0.35}px`,
        fontWeight: "800",
        color: getContrastColor(color),
        lineHeight: 1
      }}>
        {number}
      </span>
    </div>
  );
};

const AdminControlCenter = ({ onUpdate }) => {
  const [progress, setProgress] = useState([]);
  const [phases, setPhases] = useState([]);
  const [config, setConfig] = useState(null);
  const [playerProfiles, setPlayerProfiles] = useState({});
  const [submissions, setSubmissions] = useState([]); // NEU: State für finale User-Abgaben
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // Erweiterte Abfrage: Wir holen nun auch die player_phase_submission Tabelle dazu
      const [progRes, phaseRes, configRes, playerRes, submissionRes] = await Promise.all([
        supabase.from("admin_tip_progress").select("*").order("player_id"),
        supabase.from("tip_phase").select("*").order("id"),
        supabase.from("system_config").select("*").single(),
        supabase.from("player").select("id, display_name, name_color, jersey_number, supported_country"), // id ergänzt für ID-Mapping
        supabase.from("player_phase_submission").select("*") // NEU: Abgabestatus abholen
      ]);

      setProgress(progRes.data || []);
      setPhases(phaseRes.data || []);
      setConfig(configRes.data);
      setSubmissions(submissionRes.data || []); // NEU: Zuweisung in den State

      const profileMap = {};
      if (playerRes.data) {
        playerRes.data.forEach(p => {
          profileMap[p.display_name] = {
            id: p.id, // NEU: ID mitspeichern, um Abgaben fehlerfrei zu matchen
            color: p.name_color || "#000000",
            jerseyNumber: p.jersey_number || "",
            supportedCountry: p.supported_country 
          };
        });
      }
      setPlayerProfiles(profileMap);

    } catch (err) {
      console.error("Fehler beim Laden der Admin-Daten:", err);
    } finally {
      setLoading(false);
    }
  };

  const updatePhase = async (id, field, value) => {
    setPhases(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    try {
      const { error } = await supabase
        .from("tip_phase")
        .update({ [field]: value })
        .eq("id", id);

      if (error) throw error;
      if (onUpdate) onUpdate(); 
    } catch (err) {
      console.error("Fehler beim Phasen-Update:", err);
      fetchAdminData();
      alert("Fehler beim Speichern: " + err.message);
    }
  };

  const updateGlobalLock = async (isLockedNow) => {
    setConfig(prev => ({ ...prev, tips_locked_global: isLockedNow }));
    if (isLockedNow) {
      setPhases(prev => prev.map(p => ({ ...p, is_active: false, is_submitted: true })));
    } else {
      setPhases(prev => prev.map(p => ({ ...p, is_active: false, is_submitted: false })));
    }

    try {
      const { error: configError } = await supabase
        .from("system_config")
        .update({ tips_locked_global: isLockedNow }) 
        .eq("id", config.id);

      if (configError) throw configError;

      const updateData = isLockedNow 
        ? { is_active: false, is_submitted: true }   
        : { is_active: false, is_submitted: false }; 

      const { error: phaseError } = await supabase
        .from("tip_phase")
        .update(updateData)
        .neq("id", 0);

      if (phaseError) throw phaseError;
      if (onUpdate) onUpdate(); 
    } catch (error) {
      console.error("Fehler bei globaler Sperre:", error);
      fetchAdminData(); 
      alert("Fehler beim Speichern.");
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "60px", textAlign: "center", fontFamily: "sans-serif", color: "#64748b" }}>
        <div style={spinnerStyle}></div>
        <p style={{ marginTop: "16px", fontWeight: "600", fontSize: "15px" }}>Lade Schaltzentrale...</p>
      </div>
    );
  }

  const players = [...new Set(progress.map(item => item.display_name))];
  const isGlobalLocked = config?.tips_locked_global || false;

  return (
    <div style={{ padding: "40px 32px", width: "100%", fontFamily: "system-ui, sans-serif", backgroundColor: "#f8fafc", minHeight: "100vh", boxSizing: "border-box" }}>
      
      {/* HEADER SECTION */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "48px", gap: "24px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "30px", fontWeight: "800", color: "#0f172a", letterSpacing: "-0.5px" }}>🕹️ Admin Schaltzentrale</h2>
          <p style={{ margin: "8px 0 0 0", fontSize: "15px", color: "#64748b" }}>Steuere die Sichtbarkeiten, Abgabefristen und überwache den Live-Tippstatus aller Spieler.</p>
        </div>
        
        {/* GLOBAL LOCK TOGGLE CARD */}
        <div style={{ 
          padding: "20px 28px", 
          borderRadius: "16px", 
          background: isGlobalLocked ? "#fff5f5" : "#f0fdf4",
          border: `1px solid ${isGlobalLocked ? "#fecaca" : "#bbf7d0"}`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        }}>
          <label style={{ fontWeight: "700", display: "flex", alignItems: "center", gap: "16px", cursor: "pointer" }}>
            <input 
              type="checkbox" 
              checked={isGlobalLocked} 
              onChange={(e) => updateGlobalLock(e.target.checked)} 
              style={checkboxGlobalStyle}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "14px", color: isGlobalLocked ? "#991b1b" : "#166534", letterSpacing: "0.5px", fontWeight: "800" }}>
                {isGlobalLocked ? "🚨 TURNIER KOMPLETT GESPERRT" : "✅ TIPPMODUS AKTIV"}
              </span>
              <span style={{ fontSize: "12px", fontWeight: "500", color: isGlobalLocked ? "#dc2626" : "#15803d", opacity: 0.8, marginTop: "4px" }}>
                {isGlobalLocked ? "Sämtliche Eingaben aller User sind eingefroren" : "User können tippen (sofern Phase geöffnet ist)"}
              </span>
            </div>
          </label>
        </div>
      </header>

      {/* MONITORING & CONTROL TABLE */}
      <div style={{ background: "white", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ backgroundColor: "#f1f5f9" }}>
                <th style={{ ...headerCellStyle, width: "280px" }}>
                  <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", color: "#475569", fontWeight: "700" }}>Spieler-Übersicht</span>
                </th>
                {phases.map(p => (
                  <th key={p.id} style={{ ...headerCellStyle, borderLeft: "1px solid #e2e8f0", minWidth: "180px" }}>
                    <div style={{ fontSize: "16px", color: "#0f172a", fontWeight: "800" }}>🏆 Phase {p.id}</div>
                    
                    <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ ...labelStyle, color: p.is_active ? "#2563eb" : "#64748b" }}>
                        <input 
                          type="checkbox" 
                          checked={p.is_active} 
                          onChange={(e) => updatePhase(p.id, 'is_active', e.target.checked)} 
                          style={checkboxRowStyle}
                        /> 
                        <span>Sichtbar</span>
                      </label>
                      <label style={{ 
                        ...labelStyle, 
                        color: p.is_submitted ? "#e11d48" : "#64748b",
                        backgroundColor: p.is_submitted ? "#fff1f2" : "transparent",
                        padding: p.is_submitted ? "4px 8px" : "4px 0",
                        borderRadius: "6px"
                      }}>
                        <input 
                          type="checkbox" 
                          checked={p.is_submitted} 
                          onChange={(e) => updatePhase(p.id, 'is_submitted', e.target.checked)} 
                          style={checkboxRowStyle}
                        /> 
                        <span>Gesperrt 🔒</span>
                      </label>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((playerName, index) => {
                const profile = playerProfiles[playerName] || { id: null, color: "#000000", jerseyNumber: "", supportedCountry: "" };

                return (
                  <tr key={playerName} style={{ 
                    backgroundColor: index % 2 === 0 ? "white" : "#f8fafc",
                    transition: "background-color 0.15s ease",
                  }}>
                    {/* Spieler-Zelle */}
                    <td style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        <JerseyIcon color={profile.color} number={profile.jerseyNumber} size={38} />
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ 
                            fontWeight: "800", 
                            color: profile.color === "#000000" ? "#0f172a" : profile.color, 
                            fontSize: "15px" 
                          }}>
                            {playerName}
                          </span>
                          {profile.supportedCountry && (
                            <FlagIcon teamName={profile.supportedCountry} />
                          )}
                        </div>
                      </div>
                    </td>
                    
                    {/* Status-Zellen */}
                    {phases.map(p => {
                      const stats = progress.find(item => item.display_name === playerName && item.phase_id === p.id);
                      
                      // 1. Berechnung: Hat der User alle Felder mathematisch ausgefüllt?
                      const isDone = stats?.tipped_count === stats?.total_matches && stats?.prognosis_count === stats?.total_prognosis;
                      
                      // 2. Berechnung: Liegt ein finaler Abgabe-Eintrag für diesen Spieler & diese Phase vor?
                      const currentPlayerId = stats?.player_id || profile.id;
                      const isSubmitted = submissions.some(sub => sub.player_id === currentPlayerId && sub.phase_id === p.id && sub.is_submitted === true);

                      // DYNAMISCHES STYLING JE NACH STATUS (Abgegeben > Fertig > Offen)
                      let badgeBg = "#fafafa";
                      let badgeBorder = "#e2e8f0";
                      let badgeTextColor = "#64748b";
                      let statusLabel = "⏳ OFFEN";
                      let badgeShadow = "none";

                      if (isSubmitted) {
                        badgeBg = "#f5f3ff";      // Edles Hell-Lila
                        badgeBorder = "#d8b4fe";  // Lila Rahmen
                        badgeTextColor = "#6b21a8"; // Dunkellila Text
                        statusLabel = "🚀 ABGEGEBEN";
                        badgeShadow = "0 2px 6px rgba(107,33,168,0.06)";
                      } else if (isDone) {
                        badgeBg = "#f0fdf4";      // Hellgrün
                        badgeBorder = "#bbf7d0";
                        badgeTextColor = "#166534";
                        statusLabel = "✅ FERTIG";
                        badgeShadow = "0 2px 6px rgba(34,197,94,0.04)";
                      }

                      return (
                        <td key={p.id} style={{ 
                          padding: "18px 20px", 
                          textAlign: "center", 
                          borderLeft: "1px solid #e2e8f0",
                          borderBottom: "1px solid #e2e8f0",
                          verticalAlign: "middle"
                        }}>
                          <div style={{ 
                            display: "inline-flex", 
                            flexDirection: "column", 
                            alignItems: "center", 
                            gap: "6px",
                            background: badgeBg,
                            padding: "10px 16px",
                            borderRadius: "12px",
                            border: `1px solid ${badgeBorder}`,
                            minWidth: "115px",
                            boxShadow: badgeShadow,
                            transition: "all 0.2s ease"
                          }}>
                            <span style={{ fontSize: "13px", fontWeight: "700", color: "#334155" }}>
                              ⚽ {stats?.tipped_count || 0}/{stats?.total_matches || 0}
                            </span>
                            
                            {stats?.total_prognosis > 0 && (
                              <span style={{ fontSize: "12px", fontWeight: "600", color: "#64748b" }}>
                                🌳 {stats?.prognosis_count || 0}/{stats?.total_prognosis || 0}
                              </span>
                            )}
                            
                            <span style={{ 
                              fontSize: "11px",
                              fontWeight: "800",
                              marginTop: "2px",
                              letterSpacing: "0.5px",
                              color: badgeTextColor
                            }}>
                              {statusLabel}
                            </span>
                          </div>
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
  );
};

const headerCellStyle = { 
  padding: "20px 24px", 
  textAlign: "left", 
  verticalAlign: "top",
  borderBottom: "2px solid #cbd5e1"
};

const labelStyle = { 
  display: "flex", 
  alignItems: "center", 
  gap: "8px", 
  cursor: "pointer", 
  fontWeight: "600",
  fontSize: "13px",
  transition: "all 0.2s ease"
};

const checkboxGlobalStyle = {
  width: "22px", 
  height: "22px", 
  cursor: "pointer",
  accentColor: "#dc2626"
};

const checkboxRowStyle = {
  width: "16px",
  height: "16px",
  cursor: "pointer",
  accentColor: "#2563eb"
};

const spinnerStyle = {
  width: "44px",
  height: "44px",
  border: "4px solid #f3f3f3",
  borderTop: "4px solid #3b82f6",
  borderRadius: "50%",
  margin: "0 auto",
  animation: "spin 1s linear infinite"
};

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.innerHTML = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

export default AdminControlCenter;