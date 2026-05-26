import React, { useEffect } from "react";

export const TOUR_STEPS = {
  1: {
    title: "🎨 Profil & Einstellungen",
    phase: "profile",
    subSteps: [
      { id: "sidebar_profile", text: "Hier findest du deine Profil-Zentrale. Lass uns dorthin wechseln, um deine Identität anzupassen!" }, 
      { id: "profile_name", text: "Hier kannst du deinen Anzeigenamen ändern, der für alle sichtbar in der Rangliste erscheint." },
      { id: "profile_jersey", text: "Wähle deine persönlichen Vereinsfarben und deine legendäre Rückennummer aus." },
      { id: "profile_country", text: "Zeige Flagge! Welches Land supportest du bei diesem Turnier?" },
      { id: "profile_pin", text: "Ganz wichtig: Sichere dein Profil mit einer PIN ab, damit niemand heimlich deine Tipps ändern kann!" },
      { id: "profile_save", text: "Wenn du mit allem zufrieden bist, klicke hier, um dein geändertes Profil dauerhaft zu sichern." }
    ]
  },
  2: {
    title: "🔮 Die Tipp-Seite",
    phase: "FIRST_ACTIVE_PHASE", 
    subSteps: [
      { id: "sidebar_phases", text: "Das ist die Tipp-Zentrale! Über das Menü links schalten sich im Laufe des Turniers weitere Tipp-Phasen für dich frei." }, 
      { id: "tipps_overview", text: "Willkommen in der Tipp-Zentrale! Hier schlägt das Herz des Spiels und hier holst du dir den Turniersieg." },
      { id: "tipps_group_reset", text: "Trage hier deine Ergebnisse für die Gruppenphase ein. Mit dem Reset-Button pro Gruppe kannst du Fehleingaben für diese Gruppe blitzschnell zurücksetzen." },
      { id: "tipps_manual_decisions", text: "Sollte absoluter Gleichstand herrschen, erscheint unter der Gruppentabelle automatisch die Tabelle der manuellen Entscheide. Hier bestimmst du, wer weiterkommt!" },
      { id: "tipps_third_place", text: "Hier werden die besten Gruppendritten berechnet. Die Tour scrollt dich automatisch zu wichtigen Tabellen, falls diese weiter unten liegen!" },
      { id: "tipps_ko_prediction", text: "In der KO-Phase tippst du als Prognose nur, welches Team eine Runde weiterkommt (kein exaktes Spielergebnis nötig)." },
      { id: "tipps_phase_reset", text: "Der große Reset-Button setzt alle Tipps dieser gesamten Phase auf einmal zurück, falls du komplett neu planen willst." }
    ]
  },
  3: {
    title: "🏆 Bonusfragen",
    phase: "bonus_questions",
    subSteps: [
      { id: "sidebar_bonus", text: "Über diesen Menüpunkt erreichst du die Bonusfragen. Lass uns einen Blick darauf werfen." }, 
      { id: "bonus_submit", text: "Sichere dir Extrapunkte! Beantworte unbedingt alle Bonusfragen vollständig und gib sie vor dem offiziellen Turnierstart ab." }
    ]
  },
  4: {
    title: "📊 Punkte-Analyse",
    phase: "points_analysis",
    subSteps: [
      { id: "sidebar_points", text: "Hier geht es zur Punkte-Analyse, mit der du deine Erfolge haargenau auswerten kannst." }, 
      { id: "points_table", text: "Hier siehst du im Detail, wie sich deine Punkte pro Spiel zusammensetzen – inklusive des Zusammenspiels aus Prognose-Tipps verschiedener Phasen und realen Treffern." },
      { id: "points_filters", text: "Nutze die Filterleiste oben, um gezielt nach bestimmten Spielern oder Turnierrunden zu suchen." }
    ]
  },
  5: {
    title: "📈 Statistik-Center",
    phase: "global_statistics",
    subSteps: [
      { id: "sidebar_stats", text: "Hier findest du das Statistik-Center für tiefere Einblicke in das gesamte Teilnehmerfeld." }, 
      { id: "stats_tabs", text: "Das ist die Detail-Ecke. Klicke dich durch die Reiter, um zu sehen, wer die meisten Volltreffer hat oder wie der 'Was wäre wenn...'-Vergleich aussieht." }
    ]
  },
  6: {
    title: "🏠 Die Startseite",
    phase: "ranking",
    subSteps: [
      { id: "sidebar_home", text: "Zuletzt werfen wir einen Blick zurück auf unsere Schaltzentrale." }, 
      { id: "dashboard_overview", text: "Zurück auf Anfang! Hier hast du die anstehenden Partien im Blick und siehst die Live-Rangliste. Viel Erfolg bei der Tipprunde!" }
    ]
  }
};

const InteractiveTour = ({ tourStep, tourSubStep, onNext, onPrev, onSkip, onChangePhase }) => {
  const currentStepData = TOUR_STEPS[tourStep];
  const currentSubStepData = currentStepData?.subSteps?.[tourSubStep]; 

  useEffect(() => {
    if (onChangePhase && currentStepData?.phase) {
      onChangePhase(currentStepData.phase);
    }
  }, [tourStep, currentStepData?.phase, onChangePhase]);

  useEffect(() => {
    if (currentSubStepData?.id) {
      const targetId = currentSubStepData.id;
      
      // Timeout auf 300ms erhöht, um Seitenwechseln genug Zeit zum Rendern zu geben
      const timer = setTimeout(() => {
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("tour-element-highlight");
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        const element = document.getElementById(targetId);
        if (element) {
          element.classList.remove("tour-element-highlight");
        }
      };
    }
  }, [tourStep, tourSubStep, currentSubStepData?.id]);

  if (!currentStepData || !currentSubStepData) return null;

  const totalSteps = Object.keys(TOUR_STEPS).length;
  const totalSubSteps = currentStepData.subSteps.length;

  return (
    <div style={tourStyles.overlay}>
      <style>{`
        @keyframes tourPopIn {
          from { transform: translateY(20px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes tourPulse {
          0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); transform: scale(1); }
          50% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); transform: scale(1.01); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); transform: scale(1); }
        }
        .tour-element-highlight {
          position: relative;
          animation: tourPulse 2s infinite ease-in-out !important;
          border: 2px solid #2563eb !important;
          border-radius: 8px;
          z-index: 9999 !important;
          transition: all 0.3s ease;
        }
      `}</style>

      <div style={tourStyles.card}>
        <div style={tourStyles.progress}>
          HAUPTSCHRITT {tourStep} VON {totalSteps} 
          <span style={{ color: "#2563eb", marginLeft: "8px", fontWeight: "800" }}>
            (Teilschritt {tourSubStep + 1}/{totalSubSteps})
          </span>
        </div>
        
        <h4 style={tourStyles.title}>
          {currentStepData.title}
        </h4>
        
        <p style={tourStyles.text}>
          {currentSubStepData.text}
        </p>

        <div style={tourStyles.actions}>
          <button onClick={onSkip} style={tourStyles.skipButton}>
            Tour beenden
          </button>
          
          <div style={{ display: "flex", gap: "8px" }}>
            {(tourStep > 1 || tourSubStep > 0) && (
              <button onClick={onPrev} style={tourStyles.prevButton}>
                Zurück
              </button>
            )}
            
            <button onClick={onNext} style={tourStyles.nextButton}>
              {tourStep === totalSteps && tourSubStep === totalSubSteps - 1 ? "Fertig 🎉" : "Weiter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const tourStyles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    backgroundColor: "rgba(15, 23, 42, 0.4)", 
    zIndex: 9998, 
    display: "flex",
    alignItems: "flex-end", 
    justifyContent: "center",
    padding: "40px",
    boxSizing: "border-box",
    pointerEvents: "none" 
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    maxWidth: "480px",
    width: "100%",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
    border: "2px solid #2563eb", 
    animation: "tourPopIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)", 
    fontFamily: "inherit",
    pointerEvents: "auto" 
  },
  progress: { fontSize: "0.72rem", color: "#64748b", fontWeight: "700", marginBottom: "6px", letterSpacing: "0.06em", textTransform: "uppercase" },
  title: { margin: "0 0 12px 0", color: "#0f172a", fontSize: "1.3rem", fontWeight: "800", letterSpacing: "-0.01em" },
  text: { margin: "0 0 24px 0", color: "#334155", fontSize: "0.98rem", lineHeight: "1.55" },
  actions: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  nextButton: { padding: "10px 22px", backgroundColor: "#2563eb", color: "#ffffff", border: "none", borderRadius: "8px", fontWeight: "700", fontSize: "0.9rem", cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.2)", transition: "background-color 0.2s" },
  prevButton: { padding: "10px 16px", backgroundColor: "#f1f5f9", color: "#475569", border: "none", borderRadius: "8px", fontWeight: "600", fontSize: "0.9rem", cursor: "pointer", transition: "background-color 0.2s" },
  skipButton: { padding: "10px 0", backgroundColor: "transparent", color: "#94a3b8", border: "none", fontWeight: "600", fontSize: "0.9rem", cursor: "pointer", transition: "color 0.2s" }
};

export default InteractiveTour;