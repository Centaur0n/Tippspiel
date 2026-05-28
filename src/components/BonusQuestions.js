import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import TeamDropdown from "../Utils/TeamDropdown";
import { ALL_TEAMS, POT_4_TEAMS } from "../Utils/teamUtils";
// WICHTIG: Ersetze diesen Pfad mit dem echten Pfad zu deiner Punkte-Engine!
import { processBonusQuestionsPoints } from "../logic/pointsEngine"; 

// Konfiguration inklusive der Basis-Punkte für jede Frage
const BONUS_QUESTIONS_CONFIG = [
  { id: "total_goals", text: "Meisten Gesamttore in einem einzelnen Spiel", type: "number", points: 20 },
  { id: "most_cards", text: "Meisten roten und gelben Karten vom Team pro Spiel (Fifa Fairplay Wertung)", type: "text", points: 20 },
  { id: "most_team_goals", text: "Team mit den meisten Toren pro Spiel", type: "text", points: 20 },
  { id: "extra_times", text: "Wie viele Verlängerungen (mit oder ohne Elfmeterschießen) gibt es in der gesamten KO-Phase?", type: "number", points: 20 },
  { id: "most_conceded_goals", text: "Welches Team kassiert in der Gruppenphase die meisten Tore?", type: "text", points: 20 },
  { id: "pot4_furthest", text: "Welches Team aus dem Lostopf 4 von FIFA kommt am weitesten?", type: "text", points: 20 },
  { id: "own_goals", text: "Wie viele Eigentore gibt es im gesamten Turnier?", type: "number", points: 20 }
];

// Zentrale Funktion zur Berechnung der Bonuspunkte inklusive der +/- 1 Regel
const calculateBonusPoints = (qId, userAnswer, realAnswer, basePoints) => {
  if (!realAnswer || realAnswer === "EMPTY" || userAnswer === undefined || userAnswer === null || userAnswer === "") {
    return 0;
  }

  const userStr = String(userAnswer).trim().toLowerCase();
  const realStr = String(realAnswer).trim().toLowerCase();

  // 1. Exakter Treffer -> Volle Punkte
  if (userStr === realStr) {
    return basePoints;
  }

  // 2. Teilpunkte-Regel (+/- 1) für Gesamttore, Verlängerungen und Eigentore
  const partialPointsQuestions = ["total_goals", "extra_times", "own_goals"];
  if (partialPointsQuestions.includes(qId)) {
    const userNum = parseInt(userStr, 10);
    const realNum = parseInt(realStr, 10);

    if (!isNaN(userNum) && !isNaN(realNum)) {
      if (Math.abs(userNum - realNum) === 1) {
        return Math.ceil(basePoints / 2); // Hälfte der Punkte (aufgerundet)
      }
    }
  }

  return 0;
};

// Optionale isAdmin Prop hinzugefügt (Standard: true, damit du es direkt siehst)
const BonusQuestions = ({ userId, isReadOnly, isAdmin = false }) => {
  // Speichert pro Frage: { user_answer: "...", real_answer: "..." }
  const [answersData, setAnswersData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [adminSaveStatus, setAdminSaveStatus] = useState(""); // Eigener Status für Admin-Eingaben
  
  const debounceTimers = useRef({});

  useEffect(() => {
    if (userId) {
      fetchUserAnswers();
    }
    
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, [userId]);

  const fetchUserAnswers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_bonus_tips")
        .select("question, user_answer, real_answer")
        .eq("user_id", userId);

      if (error) throw error;

      const answersMap = {};
      data?.forEach(item => {
        answersMap[item.question] = {
          user_answer: item.user_answer || "",
          real_answer: item.real_answer || ""
        };
      });
      setAnswersData(answersMap);
    } catch (err) {
      console.error("Fehler beim Laden deiner Bonus-Tipps:", err);
    } finally {
      setLoading(false);
    }
  };

  // --- USER SPEICHER LOGIK ---
  const saveToDatabase = async (questionId, value) => {
    try {
      const { data: existingRow, error: fetchError } = await supabase
        .from("user_bonus_tips")
        .select("id")
        .eq("user_id", userId)
        .eq("question", questionId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingRow) {
        const { error: updateError } = await supabase
          .from("user_bonus_tips")
          .update({ user_answer: value })
          .eq("id", existingRow.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("user_bonus_tips")
          .insert({ 
            user_id: userId, 
            question: questionId, 
            user_answer: value 
          });

        if (insertError) throw insertError;
      }

      setSaveStatus("✅ Gespeichert");
      setTimeout(() => setSaveStatus(""), 1500);
    } catch (err) {
      console.error("Detaillierter Speicherfehler:", err);
      setSaveStatus(`❌ Fehler: ${err.message || "Datenbank-Fehler"}`);
    }
  };

  const handleSaveAnswer = (questionId, value, delay = 0) => {
    if (isReadOnly) return;

    setAnswersData(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        user_answer: value
      }
    }));
    setSaveStatus("Speichere...");

    const timerKey = `user_${questionId}`;
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey]);
    }

    if (delay > 0) {
      debounceTimers.current[timerKey] = setTimeout(() => {
        saveToDatabase(questionId, value);
      }, delay);
    } else {
      saveToDatabase(questionId, value);
    }
  };


  // --- ADMIN SPEICHER LOGIK (NEU) ---
  const saveRealAnswerToDatabase = async (questionId, value) => {
    try {
      setAdminSaveStatus("⚡ Aktualisiere globale Ergebnisse & Punkte...");

      // 1. Bulk Update: Überschreibt die 'real_answer' bei ALLEN Usern für diese Frage
      const { error: bulkError } = await supabase
        .from("user_bonus_tips")
        .update({ real_answer: value || null })
        .eq("question", questionId);

      if (bulkError) throw bulkError;

      // 2. Punktejagd / Bepunktung triggern
      if (typeof processBonusQuestionsPoints === "function") {
        await processBonusQuestionsPoints();
      }

      // 3. Lokalen State updaten, damit die UI (Punkte/Badges) links sofort mitzieht
      setAnswersData(prev => ({
        ...prev,
        [questionId]: {
          ...prev[questionId],
          real_answer: value
        }
      }));

      setAdminSaveStatus("✅ Ergebnisse & Punkte global aktualisiert!");
      setTimeout(() => setAdminSaveStatus(""), 2000);
    } catch (err) {
      console.error("Admin Bulk Update Fehler:", err);
      setAdminSaveStatus(`❌ Admin-Fehler: ${err.message}`);
    }
  };

  const handleSaveRealAnswer = (questionId, value, delay = 0) => {
    // State lokal updaten, damit Admin die Tipp-Eingabe flüssig sieht
    setAnswersData(prev => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        real_answer: value
      }
    }));

    const timerKey = `admin_${questionId}`;
    if (debounceTimers.current[timerKey]) {
      clearTimeout(debounceTimers.current[timerKey]);
    }

    if (delay > 0) {
      debounceTimers.current[timerKey] = setTimeout(() => {
        saveRealAnswerToDatabase(questionId, value);
      }, delay);
    } else {
      saveRealAnswerToDatabase(questionId, value);
    }
  };

  if (loading) return <div style={{ padding: "20px" }}>Deine Bonusfragen werden geladen...</div>;

  return (
    <div style={{ padding: "20px", width: "100%", boxSizing: "border-box", fontFamily: "sans-serif" }}>
      
      <header style={{ marginBottom: "25px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "15px" }}>
        <div>
          <h2 style={{ margin: 0, color: "#334155" }}>🏆 Deine Bonus-Tipps</h2>
          <span style={{ display: "block", fontSize: "13px", color: "#64748b", marginTop: "6px" }}>
            {isReadOnly 
              ? "Die Abgabefrist ist abgelaufen. Die Tipps sind gesperrt." 
              : "Beantworte die Fragen vor dem Start des Turniers."}
          </span>
        </div>

        {/* Status-Anzeigen für User und Admin */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {saveStatus && (
            <span style={{ 
              fontSize: "13px", fontWeight: "bold", color: saveStatus.includes("❌") ? "#ef4444" : "#22c55e",
              background: saveStatus.includes("❌") ? "#fef2f2" : "#f0fdf4", padding: "6px 12px", borderRadius: "6px",
              border: `1px solid ${saveStatus.includes("❌") ? "#fca5a5" : "#bbf7d0"}`
            }}>
              {saveStatus}
            </span>
          )}
          {isAdmin && adminSaveStatus && (
            <span style={{ 
              fontSize: "13px", fontWeight: "bold", color: adminSaveStatus.includes("❌") ? "#ef4444" : "#0288d1",
              background: adminSaveStatus.includes("❌") ? "#fef2f2" : "#e1f5fe", padding: "6px 12px", borderRadius: "6px",
              border: `1px solid ${adminSaveStatus.includes("❌") ? "#fca5a5" : "#b3e5fc"}`
            }}>
              🛡️ {adminSaveStatus}
            </span>
          )}
        </div>
      </header>

      {/* Haupt-Layout: Flex-Grid Splitting */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: isAdmin ? "1fr 1fr" : "1fr", 
        gap: "30px", 
        alignItems: "start",
        boxSizing: "border-box" 
      }}>
        
        {/* ================= LINKSEITE: USER COMPONENT ================= */}
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ marginTop: 0, marginBottom: "20px", color: "#1e293b", borderBottom: "2px solid #cbd5e1", paddingBottom: "8px" }}>👤 Deine Tipps & Auswertung</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {BONUS_QUESTIONS_CONFIG.map(q => {
              const qData = answersData[q.id];
              const currentTip = qData?.user_answer || "";
              const realAnswer = qData?.real_answer;
              
              const hasResult = realAnswer && realAnswer !== "EMPTY";
              const pointsEarned = hasResult ? calculateBonusPoints(q.id, currentTip, realAnswer, q.points) : 0;

              return (
                <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "20px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                    <label style={{ fontSize: "14px", fontWeight: "600", color: "#334155" }}>{q.text}</label>
                    {hasResult && (
                      <span style={{
                        fontSize: "12px", fontWeight: "bold", padding: "4px 10px", borderRadius: "20px",
                        background: pointsEarned > 0 ? "#dcfce7" : "#fee2e2", color: pointsEarned > 0 ? "#15803d" : "#b91c1c",
                        border: `1px solid ${pointsEarned > 0 ? "#bbf7d0" : "#fca5a5"}`
                      }}>
                        {pointsEarned > 0 ? `+${pointsEarned} Punkte` : "0 Punkte"}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
                    <div style={{ flex: "1", maxWidth: q.type === "number" ? "120px" : "300px" }}>
                      {q.type === "number" ? (
                        <input 
                          type="number"
                          disabled={isReadOnly}
                          placeholder={isReadOnly ? "Kein Tipp" : "Anzahl..."}
                          value={currentTip}
                          onChange={(e) => handleSaveAnswer(q.id, e.target.value, 600)}
                          style={{
                            padding: "10px", borderRadius: "8px", border: `1px solid ${isReadOnly ? "#e2e8f0" : "#cbd5e1"}`,
                            backgroundColor: isReadOnly ? "#f8fafc" : "white", color: isReadOnly ? "#64748b" : "#0f172a",
                            width: "100%", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)"
                          }}
                        />
                      ) : (
                        <TeamDropdown 
                          options={q.id === "pot4_furthest" ? POT_4_TEAMS : ALL_TEAMS}
                          value={currentTip}
                          disabled={isReadOnly}
                          placeholder={isReadOnly ? "Kein Tipp abgegeben" : "Wähle ein Land..."}
                          onChange={(selectedTeam) => handleSaveAnswer(q.id, selectedTeam, 0)}
                        />
                      )}
                    </div>

                    {hasResult && (
                      <div style={{ fontSize: "13px", color: "#475569", background: "#f8fafc", padding: "8px 14px", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                        🎯 Ergebnis: <strong>{realAnswer}</strong>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ================= RECHTE SEITE: ADMIN VIEW (NEU) ================= */}
        {isAdmin && (
          <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
            <h3 style={{ marginTop: 0, marginBottom: "20px", color: "#0f172a", borderBottom: "2px solid #0288d1", paddingBottom: "8px" }}>🛡️ Admin-Bereich: Offizielle Ergebnisse auflösen</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {BONUS_QUESTIONS_CONFIG.map(q => {
                const qData = answersData[q.id];
                const currentRealAnswer = qData?.real_answer || "";

                return (
                  <div key={`admin_${q.id}`} style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "20px", borderBottom: "1px solid #e2e8f0" }}>
                    <label style={{ fontSize: "14px", fontWeight: "bold", color: "#1e293b" }}>
                      🔧 {q.text} <span style={{ fontWeight: "normal", color: "#64748b" }}>({q.points} Pkt.)</span>
                    </label>

                    <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                      <div style={{ flex: "1", maxWidth: q.type === "number" ? "120px" : "300px" }}>
                        {q.type === "number" ? (
                          <input 
                            type="number"
                            placeholder="Ergebnis..."
                            value={currentRealAnswer}
                            onChange={(e) => handleSaveRealAnswer(q.id, e.target.value, 800)}
                            style={{
                              padding: "10px", borderRadius: "8px", border: "1px solid #94a3b8",
                              backgroundColor: "#fff", color: "#0f172a", width: "100%",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.1)", fontWeight: "600"
                            }}
                          />
                        ) : (
                          <TeamDropdown 
                            options={q.id === "pot4_furthest" ? POT_4_TEAMS : ALL_TEAMS}
                            value={currentRealAnswer}
                            placeholder="Offizielles Team wählen..."
                            onChange={(selectedTeam) => handleSaveRealAnswer(q.id, selectedTeam, 0)}
                          />
                        )}
                      </div>

                      {currentRealAnswer && (
                        <button 
                          onClick={() => handleSaveRealAnswer(q.id, "", 0)}
                          style={{
                            padding: "6px 10px", fontSize: "11px", background: "#ef4444", color: "white", 
                            border: "none", borderRadius: "4px", cursor: "pointer"
                          }}
                          title="Ergebnis zurücksetzen"
                        >
                          Löschen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default BonusQuestions;