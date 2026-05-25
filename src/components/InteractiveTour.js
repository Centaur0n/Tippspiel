import React from "react";

// --- DETAILLIERTE SCHRITT- UND UNTERSCHRITT-STRUKTUR ---
export const TOUR_STEPS = {
  1: {
    title: "🎨 Profil & Einstellungen",
    phase: "profile",
    subSteps: [
      { id: "profile_name", text: "Hier kannst du deinen Anzeigenamen ändern, der für alle sichtbar in der Rangliste erscheint." },
      { id: "profile_jersey", text: "Wähle deine persönlichen Vereinsfarben und deine legendäre Rückennummer aus." },
      { id: "profile_country", text: "Zeige Flagge! Welches Land supportest du bei diesem Turnier?" },
      { id: "profile_pin", text: "Ganz wichtig: Sichere dein Profil mit einer PIN ab, damit niemand heimlich deine Tipps ändern kann!" },
      { id: "profile_reset_tour", text: "Falls du später etwas vergisst, kannst du dieses Tutorial hier jederzeit wieder neu starten." }
    ]
  },
  2: {
    title: "🔮 Die Tipp-Seite",
    phase: "FIRST_ACTIVE_PHASE", // Wird dynamisch im Dashboard aufgelöst
    subSteps: [
      { id: "tipps_overview", text: "Willkommen in der Tipp-Zentrale! Hier schlägt das Herz des Spiels und hier holst du dir den Turniersieg." },
      { id: "tipps_group_reset", text: "Trage hier deine Ergebnisse für die Gruppenphase ein. Mit dem Reset-Button pro Gruppe kannst du Fehleingaben für diese Gruppe blitzschnell zurücksetzen." },
      { id: "tipps_manual_decisions", text: "Sollte absoluter Gleichstand herrschen, erscheint unter der Gruppentabelle automatisch die Tabelle der manuellen Entscheide. Hier bestimmst du, wer weiterkommt!" },
      { id: "tipps_third_place", text: "Scrolle nach unten: Das gleiche gilt für die besten Gruppendritten. Überprüfe auch hier die Tabelle auf Gleichheit." },
      { id: "tipps_ko_prediction", text: "In der KO-Phase tippst du als Prognose nur, welches Team eine Runde weiterkommt (kein exaktes Spielergebnis nötig)." },
      { id: "tipps_phase_reset", text: "Der große Reset-Button setzt alle Tipps dieser gesamten Phase auf einmal zurück, falls du komplett neu planen willst." },
      { id: "sidebar_phases", text: "Im Laufe des Turniers schalten sich links im Menü weitere Tipp-Phasen frei, sobald diese zum Tippen freigegeben sind." }
    ]
  },
  3: {
    title: "🏆 Bonusfragen",
    phase: "bonus_questions",
    subSteps: [
      { id: "bonus_submit", text: "Sichere dir Extrapunkte! Beantworte unbedingt alle Bonusfragen vollständig und gib sie vor dem offiziellen Turnierstart ab." }
    ]
  },
  4: {
    title: "📊 Punkte-Analyse",
    phase: "points_analysis",
    subSteps: [
      { id: "points_table", text: "Hier siehst du im Detail, wie sich deine Punkte pro Spiel zusammensetzen – inklusive des Zusammenspiels aus Prognose-Tipps verschiedener Phasen und realen Treffern." },
      { id: "points_filters", text: "Nutze die Filterleiste oben, um gezielt nach bestimmten Spielern oder Turnierrunden zu suchen." }
    ]
  },
  5: {
    title: "📈 Statistik-Center",
    phase: "global_statistics",
    subSteps: [
      { id: "stats_tabs", text: "Das ist die Detail-Ecke. Klicke dich durch die Reiter, um zu sehen, wer die meisten Volltreffer hat oder wie der 'Was wäre wenn...'-Vergleich aussieht." }
    ]
  },
  6: {
    title: "🏠 Die Startseite",
    phase: "ranking",
    subSteps: [
      { id: "dashboard_overview", text: "Zurück auf Anfang! Hier hast du die anstehenden Partien im Blick und siehst die aktuelle Live-Rangliste (wird bald noch cooler umgebaut!). Viel Erfolg!" }
    ]
  }
};

const InteractiveTour = ({ tourStep, tourSubStep, onNext, onSkip }) => {
  const currentStepData = TOUR_STEPS[tourStep];
  if (!currentStepData) return null;

  const currentSubStepData = currentStepData.subSteps[tourSubStep - 1];
  if (!currentSubStepData) return null;

  const totalSteps = Object.keys(TOUR_STEPS).length;
  const totalSubSteps = currentStepData.subSteps.length;

  return (
    <div style={tourStyles.overlay}>
      <style>{`
        @keyframes tourPopIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <div style={tourStyles.card}>
        <div style={tourStyles.progress}>
          HAUPTSCHRITT {tourStep} VON {totalSteps} 
          <span style={{ color: "#2563eb", marginLeft: "8px" }}>
            (Teilschritt {tourSubStep}/{totalSubSteps})
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
          <button onClick={onNext} style={tourStyles.nextButton}>
            {tourStep === totalSteps && tourSubStep === totalSubSteps ? "Fertig 🎉" : "Weiter"}
          </button>
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
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    backdropFilter: "blur(4px)",
    zIndex: 9998, // Liegt unter den fokussierten Elementen (9999)
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
    padding: "40px",
    boxSizing: "border-box",
    pointerEvents: "none" // Erlaubt Interaktion im Hintergrund, falls nötig
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    maxWidth: "460px",
    width: "100%",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    border: "2px solid #f59e0b",
    animation: "tourPopIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
    fontFamily: "inherit",
    pointerEvents: "auto" // Macht die Card wieder klickbar
  },
  progress: {
    fontSize: "0.75rem",
    color: "#64748b",
    fontWeight: "700",
    marginBottom: "8px",
    letterSpacing: "0.05em"
  },
  title: {
    margin: "0 0 10px 0",
    color: "#0f172a",
    fontSize: "1.25rem",
    fontWeight: "800"
  },
  text: {
    margin: "0 0 20px 0",
    color: "#334155",
    fontSize: "0.98rem",
    lineHeight: "1.5"
  },
  actions: {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end",
    alignItems: "center"
  },
  nextButton: {
    padding: "10px 20px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "700",
    fontSize: "0.9rem",
    cursor: "pointer",
    boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.2)",
    transition: "background-color 0.15s ease"
  },
  skipButton: {
    padding: "10px 14px",
    backgroundColor: "transparent",
    color: "#64748b",
    border: "none",
    borderRadius: "8px",
    fontWeight: "600",
    fontSize: "0.9rem",
    cursor: "pointer"
  }
};

export default InteractiveTour;