import React, { useState } from 'react';
import { ALL_TEAMS, FlagIcon } from '../Utils/teamUtils';
import { RetroJersey } from '../Utils/RetroJersey';
import TeamDropdown from '../Utils/TeamDropdown';

const PRESET_COLORS = [
  { name: 'Stealth Schwarz', hex: '#000000' },
  { name: 'Carbon Grau', hex: '#4B5563' },
  { name: 'Matrix Grün', hex: '#10B981' },
  { name: 'Cyan Blast', hex: '#06B6D4' },
  { name: 'Sky Blau', hex: '#0EA5E9' },
  { name: 'Deep Indigo', hex: '#6366F1' },
  { name: 'Vivid Violett', hex: '#8B5CF6' },
  { name: 'Hot Pink', hex: '#EC4899' },
  { name: 'Amber Gold', hex: '#F59E0B' },
  { name: 'Sunset Orange', hex: '#F97316' },
  { name: 'Crimson Rot', hex: '#EF4444' },
];

// Sub-Komponente für die Tour-Tooltips zur Vermeidung von Code-Duplikaten
const TourTooltip = ({ step, totalSteps, text, onNext, onPrev, onClose, placement = "top" }) => {
  const isTop = placement === "top";
  return (
    <div style={{
      position: "absolute",
      left: "50%",
      transform: "translateX(-50%)",
      ...(isTop ? { bottom: "calc(100% + 16px)" } : { top: "calc(100% + 16px)" }),
      backgroundColor: "#1e293b",
      color: "white",
      padding: "16px",
      borderRadius: "12px",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
      zIndex: 1000,
      width: "280px",
      textAlign: "left",
      fontSize: "13px",
      fontWeight: "normal",
      textTransform: "none",
      letterSpacing: "normal"
    }}>
      <div style={{ fontWeight: "700", marginBottom: "6px", color: "#38bdf8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Schritt {step + 1} von {totalSteps}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "14px", padding: 0 }}>✕</button>
      </div>
      <p style={{ margin: "0 0 12px 0", lineHeight: "1.5", color: "#f1f5f9" }}>{text}</p>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
        <button 
          onClick={onPrev} 
          disabled={step === 0} 
          style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #475569", backgroundColor: "transparent", color: step === 0 ? "#475569" : "#f1f5f9", cursor: step === 0 ? "not-allowed" : "pointer", fontSize: "12px" }}
        >
          Zurück
        </button>
        <button 
          onClick={onNext} 
          style={{ padding: "6px 12px", borderRadius: "6px", border: "none", backgroundColor: "#2563eb", color: "white", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
        >
          {step === totalSteps - 1 ? "Fertig" : "Weiter"}
        </button>
      </div>
      {/* Kleiner Pfeil des Tooltips */}
      <div style={{ 
        position: "absolute", 
        left: "50%", 
        transform: "translateX(-50%) rotate(45deg)", 
        width: "12px", 
        height: "12px", 
        backgroundColor: "#1e293b",
        ...(isTop ? { bottom: "-6px" } : { top: "-6px" })
      }} />
    </div>
  );
};

export default function ProfilePage({ player, onSave, onBack }) {
  const [displayName, setDisplayName] = useState(player?.display_name || '');
  const [pin, setPin] = useState(player?.pin || '');
  
  // Falls die alte Farbe Weiß war oder keine existiert, wird Schwarz als Startfarbe gesetzt
  const initialColor = player?.name_color === '#FFFFFF' ? '#000000' : (player?.name_color || '#000000');
  const [selectedColor, setSelectedColor] = useState(initialColor);
  
  const [jerseyNumber, setJerseyNumber] = useState(player?.jersey_number || 10);
  const [supportedCountry, setSupportedCountry] = useState(player?.supported_country || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // State für die interaktive Profil-Tour (null = inaktiv, 0 bis 5 = aktive Schritte)
  const [tourStep, setTourStep] = useState(null);
  const TOTAL_TOUR_STEPS = 6;

  const handleSave = async () => {
    // Validierung 1: Prüft auf leeren Anzeigenamen oder reine Leerzeichen
    if (!displayName.trim()) {
      setError('Bitte gib einen Anzeigenamen ein.');
      setSuccess(false);
      return;
    }
    
    // Validierung 2: Die Sicherheits-PIN muss zwingend exakt 6 numerische Ziffern enthalten
    const pinRegex = /^\d{6}$/;
    if (!pinRegex.test(pin)) {
      setError('Die Sicherheits-PIN muss aus exakt 6 Zahlen bestehen.');
      setSuccess(false);
      return;
    }

    setError('');
    
    // Übergabe der Daten an die Dashboard-Speicherfunktion
    await onSave({
      id: player.id,
      display_name: displayName,
      pin: pin,
      name_color: selectedColor,
      jersey_number: parseInt(jerseyNumber, 10) || 10, // Gewährleistet sauberen Integer-Typus
      supported_country: supportedCountry || null,   // Setzt leere Auswahlen auf null zurück
    });

    // Kurzes visuelles Feedback für den User
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  // Hilfsfunktion zur Generierung von dynamischen Highlight-Styles während der Tour
  const getTourHighlightStyle = (associatedStep) => {
    if (tourStep === associatedStep) {
      return {
        borderColor: "#2563eb",
        boxShadow: "0 0 0 4px rgba(37, 99, 235, 0.15), 0 4px 6px -1px rgba(0, 0, 0, 0.05)",
        transform: "scale(1.01)",
        transition: "all 0.2s ease-in-out"
      };
    }
    return { transition: "all 0.2s ease-in-out" };
  };

  const handleTourNext = () => {
    if (tourStep === TOTAL_TOUR_STEPS - 1) {
      setTourStep(null);
    } else {
      setTourStep(prev => prev + 1);
    }
  };

  const handleTourPrev = () => {
    if (tourStep > 0) setTourStep(prev => prev - 1);
  };

  // Modernes Button-Styling (analog zum Reset-Button)
  const buttonStyle = {
    padding: "10px 20px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    backgroundColor: "white",
    color: "#2563eb", // Konsistentes Blau
    cursor: "pointer",
    fontWeight: "600",
    fontSize: "14px",
    transition: "background 0.1s",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    userSelect: "none"
  };

  // Karten-Styling für Container
  const cardStyle = {
    backgroundColor: "white",
    padding: "24px",
    borderRadius: "12px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.02)",
    marginBottom: "24px",
    border: "1px solid #e2e8f0",
    position: "relative" // Zwingend erforderlich für die absolute Positionierung der Tour-Tooltips
  };

  const inputStyle = {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    width: "100%",
    maxWidth: "400px",
    boxSizing: "border-box"
  };

  const labelStyle = {
    display: "block",
    fontSize: "12px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#64748b",
    marginBottom: "8px"
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#0f172a", width: "100%", maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
      
      {/* Topbar: Nav & Aktionen */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px", gap: "20px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <button 
            onClick={onBack}
            style={buttonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")}
          >
            ← Zurück zur Übersicht
          </button>

          {/* Button zum manuellen Starten der interaktiven Tour */}
          <button 
            onClick={() => setTourStep(0)}
            style={{ ...buttonStyle, color: "#475569", borderColor: "#cbd5e1" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")}
          >
            Tour starten 🚀
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", position: "relative" }}>
          {success && (
            <span style={{ fontSize: "14px", fontWeight: "600", color: "#166534" }}>
              ✓ Erfolgreich gespeichert
            </span>
          )}
          <div style={{ position: "relative", ...getTourHighlightStyle(5) }}>
            <button
              onClick={handleSave}
              style={{ ...buttonStyle, backgroundColor: "#2563eb", color: "white", border: "1px solid #2563eb" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
            >
              Änderungen speichern
            </button>
            {tourStep === 5 && (
              <TourTooltip 
                step={tourStep}
                totalSteps={TOTAL_TOUR_STEPS}
                placement="bottom"
                text="Wenn du mit allem zufrieden bist, klicke hier, um dein geändertes Profil dauerhaft zu sichern."
                onNext={handleTourNext}
                onPrev={handleTourPrev}
                onClose={() => setTourStep(null)}
              />
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: "#fff5f5", border: "1px solid #fecaca", color: "#991b1b", padding: "16px", borderRadius: "10px", marginBottom: "24px", fontWeight: "600", fontSize: "14px" }}>
          ⚠️ {error}
        </div>
      )}

      {/* Haupttitel */}
      <div style={{ marginBottom: "40px" }}>
        <h1 style={{ margin: 0, fontSize: "32px", fontWeight: "800", letterSpacing: "-0.5px" }}>Profil-Zentrale</h1>
        <p style={{ margin: "6px 0 0 0", color: "#64748b", fontSize: "16px" }}>Personalisiere deine Identität innerhalb der Tipprunde.</p>
      </div>

      {/* Grid Layout: Vorschau vs. Config */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "32px", alignItems: "start" }}>
        
        {/* LINKS: Premium-Vorschaukarte */}
        <div style={{ ...cardStyle, sticky: "top", textAlign: "center", ...getTourHighlightStyle(0) }}>
          <label style={{ ...labelStyle, textAlign: "left" }}>Live-Vorschau</label>
          
          <div style={{ padding: "20px 0", display: "flex", justifyContent: "center" }}>
            <RetroJersey color={selectedColor} number={jerseyNumber} size={160} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", marginTop: "10px" }}>
            {/* Name mit dynamischer Farbe (Kontur für Schwarz) */}
            <span 
              style={{ 
                fontSize: "20px", 
                fontWeight: "800", 
                color: selectedColor, 
                overflow: "hidden", 
                textOverflow: "ellipsis", 
                whiteSpace: "nowrap",
                maxWidth: "100%",
                textShadow: selectedColor === '#000000' ? '0 0 8px rgba(255,255,255,0.1)' : 'none' // Subtiler Kontrast
              }}
            >
              {displayName || 'SpielerName'}
            </span>
            {supportedCountry && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", color: "#64748b" }}>
                <FlagIcon teamName={supportedCountry} />
                <span>{supportedCountry}</span>
              </div>
            )}
          </div>

          {tourStep === 0 && (
            <TourTooltip 
              step={tourStep}
              totalSteps={TOTAL_TOUR_STEPS}
              placement="bottom"
              text="Hier siehst du in Echtzeit, wie deine Anpassungen wirken. Dein Retro-Trikot aktualisiert sich sofort dynamisch!"
              onNext={handleTourNext}
              onPrev={handleTourPrev}
              onClose={() => setTourStep(null)}
            />
          )}
        </div>

        {/* RECHTS: Konfigurations-Cards */}
        <div>
          
          {/* Sektion 1: Identität */}
          <div style={{ ...cardStyle, ...getTourHighlightStyle(1) }}>
            <h2 style={{ margin: "0 0 20px 0", fontSize: "16px", fontWeight: "700" }}>Identität</h2>
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>Anzeigename</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={inputStyle}
                placeholder="z.B. Sturmtank"
                maxLength={16}
              />
            </div>
            {tourStep === 1 && (
              <TourTooltip 
                step={tourStep}
                totalSteps={TOTAL_TOUR_STEPS}
                placement="top"
                text="Gib hier deinen gewünschten Anzeigenamen (max. 16 Zeichen) für die Tipprunden-Ranglisten ein."
                onNext={handleTourNext}
                onPrev={handleTourPrev}
                onClose={() => setTourStep(null)}
              />
            )}
          </div>

          {/* Sektion 2: Trikot-Konfigurator (mit Farb-Quadraten) */}
          <div style={{ ...cardStyle, ...getTourHighlightStyle(2) }}>
            <h2 style={{ margin: "0 0 20px 0", fontSize: "16px", fontWeight: "700" }}>Trikot-Konfigurator</h2>
            
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>Wunschnummer (1-99)</label>
              <input
                type="number"
                value={jerseyNumber}
                min="1"
                max="99"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setJerseyNumber('');
                    return;
                  }
                  const num = parseInt(val, 10);
                  if (num > 0 && num < 100) setJerseyNumber(num);
                }}
                style={{ ...inputStyle, width: "120px" }}
              />
            </div>

            <div>
              <label style={labelStyle}>Farbeffekt wählen</label>
              {/* Farb-Quadrat-Auswahl */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => setSelectedColor(color.hex)}
                    style={{
                      width: "40px",
                      height: "40px",
                      backgroundColor: color.hex,
                      border: selectedColor === color.hex ? "3px solid #0f172a" : "2px solid #e2e8f0", // Kontrast-Umrandung für selektierte Farbe
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.1s ease",
                      boxShadow: selectedColor === color.hex ? "0 0 10px rgba(0,0,0,0.1)" : "none",
                      position: "relative"
                    }}
                    title={color.name}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = selectedColor === color.hex ? "#0f172a" : "#cbd5e1";
                      e.currentTarget.style.transform = "scale(1.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = selectedColor === color.hex ? "#0f172a" : "#e2e8f0";
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  />
                ))}
              </div>
            </div>
            {tourStep === 2 && (
              <TourTooltip 
                step={tourStep}
                totalSteps={TOTAL_TOUR_STEPS}
                placement="top"
                text="Passe die Rückennummer deines Trikots an und wähle aus unseren Premium-Farbeffekten, um deinen Namen hervorzuheben."
                onNext={handleTourNext}
                onPrev={handleTourPrev}
                onClose={() => setTourStep(null)}
              />
            )}
          </div>

          {/* Sektion 3: Fankurve (mit modernem Dropdown) */}
          <div style={{ ...cardStyle, ...getTourHighlightStyle(3) }}>
            <h2 style={{ margin: "0 0 20px 0", fontSize: "16px", fontWeight: "700" }}>Fankurve</h2>
            <div style={{ marginBottom: "20px" }}>
              <label style={labelStyle}>Unterstütztes Land</label>
              {/* Benutzt die custom TeamDropdown Komponente */}
              <TeamDropdown
                options={ALL_TEAMS}
                value={supportedCountry}
                onChange={setSupportedCountry}
                placeholder="Wähle dein Herzens-Team..."
              />
              <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>Gibt an, welche Landesflagge neben deinem Namen in Ranglisten erscheint.</p>
            </div>
            {tourStep === 3 && (
              <TourTooltip 
                step={tourStep}
                totalSteps={TOTAL_TOUR_STEPS}
                placement="top"
                text="Zeige Flagge! Wähle deine Wunsch-Nation, deren Flagge stolz neben deinem Usernamen in den Bestenlisten gerendert wird."
                onNext={handleTourNext}
                onPrev={handleTourPrev}
                onClose={() => setTourStep(null)}
              />
            )}
          </div>

          {/* Sektion 4: Sicherheit */}
          <div style={{ ...cardStyle, ...getTourHighlightStyle(4) }}>
            <h2 style={{ margin: "0 0 20px 0", fontSize: "16px", fontWeight: "700" }}>Sicherheit</h2>
            <div>
              <label style={labelStyle}>6-stellige Tipp-PIN</label>
              <input
                type="text"
                value={pin}
                // Filtert direkt via RegEx alle Nicht-Zahlenzeichen heraus
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} 
                style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "2px" }}
                placeholder="123456"
                maxLength={6}
              />
              <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#64748b" }}>Notwendig zum Ändern deines Profils.</p>
            </div>
            {tourStep === 4 && (
              <TourTooltip 
                step={tourStep}
                totalSteps={TOTAL_TOUR_STEPS}
                placement="bottom"
                text="Sichere dein Profil mit einer individuellen, 6-stelligen Zahlen-PIN ab, damit niemand unbefugt deine Daten ändert."
                onNext={handleTourNext}
                onPrev={handleTourPrev}
                onClose={() => setTourStep(null)}
              />
            )}
          </div>

        </div>
      </div>
    </div>
  );
}