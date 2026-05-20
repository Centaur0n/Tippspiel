import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import TeamDropdown from "../Utils/TeamDropdown";
import { ALL_TEAMS, POT_4_TEAMS } from "../Utils/teamUtils";

const BONUS_QUESTIONS_CONFIG = [
  { id: "total_goals", text: "Meisten Gesamttore in einem einzelnen Spiel", type: "number" },
  { id: "most_cards", text: "Meisten roten/gelben Karten vom Team/Spieler", type: "text" },
  { id: "most_team_goals", text: "Team mit den meisten Toren pro Spiel", type: "text" },
  { id: "extra_times", text: "Wie viele Verlängerungen/Elfmeterschießen gibt es in der KO-Phase?", type: "number" },
  { id: "most_conceded_goals", text: "Welches Team kassiert in der Gruppenphase die meisten Tore?", type: "text" },
  { id: "pot4_furthest", text: "Welches Team aus dem Topf 4 von FIFA kommt am weitesten?", type: "text" },
  { id: "own_goals", text: "Wie viele Eigentore gibt es im Turnier?", type: "number" }
];

const BonusQuestions = ({ userId, isReadOnly }) => {
  const [userAnswers, setUserAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  
  // ⏱️ Ein Speicher für die aktiven Timer (Debounce-Referenz)
  const debounceTimers = useRef({});

  useEffect(() => {
    if (userId) {
      fetchUserAnswers();
    }
    
    // Cleanup-Funktion: Löscht alle Timer, falls die Komponente schließt
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, [userId]);

  const fetchUserAnswers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_bonus_tips")
        .select("question, user_answer")
        .eq("user_id", userId);

      if (error) throw error;

      const answersMap = {};
      data?.forEach(item => {
        answersMap[item.question] = item.user_answer || "";
      });
      setUserAnswers(answersMap);
    } catch (err) {
      console.error("Fehler beim Laden deiner Bonus-Tipps:", err);
    } finally {
      setLoading(false);
    }
  };

  // 🛠️ Kern-Funktion, die die tatsächliche Datenbank-Arbeit erledigt
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

  // 🎛️ Der Event-Handler, der entscheidet: Sofort oder mit Puffer?
  const handleSaveAnswer = (questionId, value, delay = 0) => {
    if (isReadOnly) return;

    // 1. UI sofort updaten, damit der User sieht, was er eingibt
    setUserAnswers(prev => ({ ...prev, [questionId]: value }));
    setSaveStatus("Speichere...");

    // 2. Falls für diese Frage bereits ein Timer läuft: abbrechen!
    if (debounceTimers.current[questionId]) {
      clearTimeout(debounceTimers.current[questionId]);
    }

    if (delay > 0) {
      // ⏳ Wenn ein Delay gewünscht ist (beim Tippen im Zahlenfeld)
      debounceTimers.current[questionId] = setTimeout(() => {
        saveToDatabase(questionId, value);
      }, delay);
    } else {
      // 🚀 Wenn kein Delay gewünscht ist (beim Dropdown-Klick)
      saveToDatabase(questionId, value);
    }
  };

  if (loading) return <div style={{ padding: "20px" }}>Deine Bonusfragen werden geladen...</div>;

  return (
    <div style={{ padding: "20px", width: "100%", fontFamily: "sans-serif" }}>
      
      <header style={{ marginBottom: "25px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>🏆 Deine Bonus-Tipps</h2>
          
          {saveStatus && (
            <span style={{ 
              fontSize: "13px", 
              fontWeight: "bold", 
              color: saveStatus.includes("❌") ? "#ef4444" : "#22c55e",
              background: saveStatus.includes("❌") ? "#fef2f2" : "#f0fdf4",
              padding: "4px 10px",
              borderRadius: "6px",
              border: `1px solid ${saveStatus.includes("❌") ? "#fca5a5" : "#bbf7d0"}`,
              transition: "all 0.2s ease"
            }}>
              {saveStatus}
            </span>
          )}
        </div>
        
        <span style={{ display: "block", fontSize: "13px", color: "#64748b", marginTop: "6px" }}>
          {isReadOnly 
            ? "Die Abgabefrist ist abgelaufen. Die Tipps sind gesperrt." 
            : "Beantworte die Fragen vor dem Start des Turniers."}
        </span>
      </header>

      <div style={{ background: "white", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {BONUS_QUESTIONS_CONFIG.map(q => (
            <div 
              key={q.id} 
              style={{ 
                display: "flex", 
                flexDirection: "column",
                gap: "8px",
                paddingBottom: "16px", 
                borderBottom: "1px solid #f1f5f9" 
              }}
            >
              <label style={{ fontSize: "14px", fontWeight: "600", color: "#334155" }}>{q.text}</label>
              
              {q.type === "number" ? (
                <input 
                  type="number"
                  disabled={isReadOnly}
                  placeholder={isReadOnly ? "Kein Tipp" : "Anzahl..."}
                  value={userAnswers[q.id] || ""}
                  // 🟢 HIER: Übergibt 600ms Pufferzeit für flüssiges Eintippen mehrstelliger Zahlen
                  onChange={(e) => handleSaveAnswer(q.id, e.target.value, 600)}
                  style={{
                    padding: "10px",
                    borderRadius: "8px",
                    border: `1px solid ${isReadOnly ? "#e2e8f0" : "#cbd5e1"}`,
                    backgroundColor: isReadOnly ? "#f8fafc" : "white",
                    color: isReadOnly ? "#64748b" : "#0f172a",
                    width: "100%",
                    maxWidth: "120px",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                    transition: "all 0.2s"
                  }}
                />
              ) : (
                <TeamDropdown 
                  options={q.id === "pot4_furthest" ? POT_4_TEAMS : ALL_TEAMS}
                  value={userAnswers[q.id] || ""}
                  disabled={isReadOnly}
                  placeholder={isReadOnly ? "Kein Tipp abgegeben" : "Wähle ein Land..."}
                  // 🟢 HIER: 0ms Verzögerung, da Klicks im Dropdown sofort fixiert sind
                  onChange={(selectedTeam) => handleSaveAnswer(q.id, selectedTeam, 0)}
                />
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default BonusQuestions;