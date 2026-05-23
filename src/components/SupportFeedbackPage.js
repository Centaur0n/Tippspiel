import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

// Vordefinierte FAQ-Daten, aufgeteilt in Kategorien
const FAQ_DATA = [
  {
    category: "⚽ Rund ums Tippen",
    items: [
      { q: "Bis wann kann ich meine Tipps abgeben?", a: "Tipps können bis einen Tag vor dem jeweiligen Phassenanfang eingetragen und geändert werden. Danach werden die Tipps gesperrt und können nur noch angeschaut werden." },
      { q: "Warum gibt es 5 verschiedene Phasen in denen ich Tipps abgenen muss?", a: "In der ersten Phase tippt ihr alle Gruppenspiele. Der KO-Baum der dann entsteht basiert dann auf den eigenen Tipps und deswegen wird hier nur Sieger/Verliere getippt. Wenn das später auch so eintritt gibt es dafür extra Punkte. Wenn dann die wahren Sechzehntelfinale bekannt sind wird dann in Phase 2 wieder erneut getippt und das Spiel geht von vorne los. Das ganze soll dann also eine Mischung aus Tipps sein und Vermutungen welches Team wie weit im Turnier kommt." }
    ]
  },
  {
    category: "🏆 Punkteverteilung",
    items: [
      { q: "Wie berechnen sich die Punkte?", a: "Exaktes Ergebnis = +3 Punkte. Richtige Tordifferenz = +2 Punkte. Richtige Tendenz (Sieg/Unentschieden) = +4 Punkte. Richtige Toranzahl Team A/Team B/Gesamtanzahl = jeweils +1 Punkt." },
      { q: "Wie werden die Prognosepunkte vergeben?", a: "Es gibt immer Punkte wenn ein Team weiterkommt/ausscheidet und man das selber auch getippt hat. Das zählt für jede Phase und jede Art von Finale." }
    ]
  },
  {
    category: "💻 Technische Fragen",
    items: [
      { q: "Meine Punkte wurden nach Abpfiff nicht direkt aktualisiert?", a: "Die Auswertung erfolgt manuell durch den Admin kurz nach Spielende. Hab einfach ein paar Minuten Geduld." },
      { q: "Ich habe einen Fehler gefunden oder mir kommt etwas nicht richtig vor, was kann ich machen?",a: "Gerne ein Bug-Report abschließen, oder dem Admin selber schreiben. " }
    ]
  }
];

function SupportFeedbackPage({ playerId, playerName, isAdmin }) {
  // Formular-States
  const [message, setMessage] = useState("");
  const [ticketType, setTicketType] = useState("BUG_REPORT");
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Daten- & Lade-States
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // FAQ-Akkordeon State (speichert die ID der geöffneten Frage)
  const [activeFaq, setActiveFaq] = useState(null);

  useEffect(() => {
    fetchTickets();
  }, [playerId, isAdmin]);

  // Tickets aus der DB laden
  async function fetchTickets() {
    setLoading(true);
    let query = supabase.from("support_tickets").select("*");
    
    if (isAdmin) {
      // Admin sieht alle noch nicht bearbeiteten Tickets zuerst
      query = query.order("is_finished", { ascending: true }).order("created_at", { ascending: false });
    } else {
      // Spieler sieht nur seine eigenen Einsendungen
      query = query.eq("player_id", playerId).order("created_at", { ascending: false });
    }

    const { data } = await query;
    setTickets(data || []);
    setLoading(false);
  }

  // Ticket abschicken inkl. optionalem Bild-Upload
  async function handleSubmit(e) {
    e.preventDefault();
    if (!message.trim()) return alert("Bitte beschreibe dein Anliegen.");

    setSubmitting(true);
    let uploadedImageUrl = null;

    // 1. Falls ein Bild hochgeladen wurde (nur bei BUG_REPORT erlaubt)
    if (ticketType === "BUG_REPORT" && selectedFile) {
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${playerId}_${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("bug-attachments")
        .upload(fileName, selectedFile);

      if (uploadError) {
        console.error("Bild-Upload Fehler:", uploadError);
        alert("Das Bild konnte nicht hochgeladen werden.");
      } else if (uploadData) {
        // Öffentliche URL generieren
        const { data: urlData } = supabase.storage
          .from("bug-attachments")
          .getPublicUrl(fileName);
        uploadedImageUrl = urlData.publicUrl;
      }
    }

    // 2. Ticket in der DB speichern
    const { error } = await supabase.from("support_tickets").insert([
      {
        player_id: playerId,
        player_name: playerName,
        message: message,
        ticket_type: ticketType,
        image_url: uploadedImageUrl,
        is_finished: false
      }
    ]);

    setSubmitting(false);

    if (error) {
      alert("Fehler beim Senden: " + error.message);
    } else {
      alert("Vielen Dank! Dein Eintrag wurde erfolgreich an den Admin übermittelt.");
      setMessage("");
      setSelectedFile(null);
      // Dateifeld im DOM zurücksetzen
      const fileInput = document.getElementById("ticket-file-input");
      if (fileInput) fileInput.value = "";
      fetchTickets();
    }
  }

  // Admin-Aktion: Ticket als erledigt markieren
  async function toggleTicketFinished(ticketId, currentStatus) {
    const { error } = await supabase
      .from("support_tickets")
      .update({ is_finished: !currentStatus })
      .eq("id", ticketId);

    if (error) {
      alert("Fehler beim Aktualisieren: " + error.message);
    } else {
      fetchTickets();
    }
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", fontFamily: "sans-serif" }}>
      <h1 style={{ color: "#dc2626", marginBottom: "30px" }}>Support & Feedback</h1>

      {/* OBERE HÄLFTE: Admin-Ansicht ODER User-Formular */}
      <div style={{ display: "flex", gap: "40px", marginBottom: "50px", flexWrap: "wrap" }}>
        
        {isAdmin ? (
          // --- ADMIN VIEW ---
          <div style={{ flex: "1", minWidth: "300px", backgroundColor: "#f8fafc", padding: "20px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <h2 style={{ marginTop: 0, color: "#1e293b" }}>Eingegangene Meldungen (Admin-Ansicht)</h2>
            {loading ? <p>Lade Tickets...</p> : tickets.length === 0 ? <p>Keine Tickets vorhanden.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "15px", maxHeight: "400px", overflowY: "auto" }}>
                {tickets.map(t => (
                  <div key={t.id} style={{ padding: "15px", backgroundColor: "white", borderRadius: "6px", border: `2px solid ${t.is_finished ? "#b91c1c" : "#e2e8f0"}`, opacity: t.is_finished ? 0.7 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <strong>{t.player_name} <span style={{ fontWeight: "normal", fontSize: "0.85em", color: "#64748b" }}>(ID: {t.player_id})</span></strong>
                      <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: "bold", backgroundColor: t.ticket_type === "BUG_REPORT" ? "#fee2e2" : "#dbeafe", color: t.ticket_type === "BUG_REPORT" ? "#991b1b" : "#1e40af" }}>
                        {t.ticket_type === "BUG_REPORT" ? "🐛 BUG" : "💡 IDEE"}
                      </span>
                    </div>
                    <p style={{ margin: "5px 0", whiteSpace: "pre-wrap", color: "#334155" }}>{t.message}</p>
                    
                    {t.image_url && (
                      <div style={{ marginTop: "10px" }}>
                        <a href={t.image_url} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", fontSize: "0.9em", fontWeight: "bold" }}>🖼️ Screenshot anzeigen</a>
                      </div>
                    )}

                    <div style={{ marginTop: "15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.85em", color: "#94a3b8" }}>{new Date(t.created_at).toLocaleString("de-DE")}</span>
                      <button 
                        onClick={() => toggleTicketFinished(t.id, t.is_finished)}
                        style={{ backgroundColor: t.is_finished ? "#64748b" : "#22c55e", color: "white", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}
                      >
                        {t.is_finished ? "↩️ Reaktivieren" : "✅ Als erledigt markieren"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          // --- USER VIEW: FORMULAR ---
          <form onSubmit={handleSubmit} style={{ flex: "1", minWidth: "300px", display: "flex", flexDirection: "column", gap: "15px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#475569" }}>Deine Nachricht an den Admin</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Beschreibe hier deinen Bug oder deine Idee so detailliert wie möglich..."
                style={{ width: "100%", height: "140px", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", resize: "vertical", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: "1", minWidth: "150px" }}>
                <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#475569" }}>Typ auswähle</label>
                <select
                  value={ticketType}
                  onChange={(e) => { setTicketType(e.target.value); setSelectedFile(null); }}
                  style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "white" }}
                >
                  <option value="BUG_REPORT">🐛 Bug Report (Fehler melden)</option>
                  <option value="IDEA">💡 Vorschlag / Idee</option>
                </select>
              </div>

              {ticketType === "BUG_REPORT" && (
                <div style={{ flex: "1", minWidth: "200px" }}>
                  <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#475569" }}>Screenshot hinzufügen (optional)</label>
                  <input
                    id="ticket-file-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #cbd5e1", backgroundColor: "white" }}
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: "#dc2626", color: "white", padding: "12px", borderRadius: "6px", border: "none", fontWeight: "bold", cursor: submitting ? "not-allowed" : "pointer", fontSize: "1em", marginTop: "10px" }}
            >
              {submitting ? "Wird gesendet..." : "Feedback abschicken"}
            </button>
          </form>
        )}

        {/* RECHTE FLANKE OBERE HÄLFTE: Statusanzeige für den User (Bzw. Infobox für den Admin) */}
        <div style={{ flex: "0 0 350px", backgroundColor: "#f1f5f9", padding: "20px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
          {isAdmin ? (
            <>
              <h3 style={{ marginTop: 0, color: "#1e293b" }}>Admin-Dashboard</h3>
              <p style={{ color: "#475569", lineHeight: "1.5" }}>Hier siehst du alle Einsendungen deiner Mitspieler.</p>
              <ul style={{ paddingLeft: "20px", color: "#475569", fontSize: "0.95em" }}>
                <li>Bugs sind rot umrandet, Ideen blau.</li>
                <li>Mit Klick auf den Haken verschwinden erledigte Dinge zwar nicht, werden aber markiert.</li>
              </ul>
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0, color: "#1e293b" }}>Meine Einsendungen</h3>
              {loading ? <p>Lade Status...</p> : tickets.length === 0 ? <p style={{ color: "#64748b", fontSize: "0.9em" }}>Du hast noch keine Tickets eingereicht.</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "250px", overflowY: "auto" }}>
                  {tickets.map(t => (
                    <div key={t.id} style={{ backgroundColor: "white", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.9em" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span style={{ fontWeight: "bold" }}>{t.ticket_type === "BUG_REPORT" ? "🐛 Bug" : "💡 Idee"}</span>
                        <span>{t.is_finished ? "🎉 Umgesetzt" : "⏳ In Arbeit"}</span>
                      </div>
                      <p style={{ margin: 0, color: "#475569", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{t.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <hr style={{ border: "0", height: "1px", backgroundColor: "#e2e8f0", margin: "40px 0" }} />

      {/* UNTERE HÄLFTE: Kategorisiertes FAQ Akkordeon */}
      <div>
        <h2 style={{ color: "#1e293b", marginBottom: "20px" }}>💡 Häufig gestellte Fragen (FAQ)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
          {FAQ_DATA.map((cat, catIdx) => (
            <div key={catIdx}>
              <h3 style={{ color: "#dc2626", margin: "0 0 10px 0", fontSize: "1.1em" }}>{cat.category}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {cat.items.map((item, itemIdx) => {
                  const uniqueId = `${catIdx}-${itemIdx}`;
                  const isOpen = activeFaq === uniqueId;
                  return (
                    <div key={itemIdx} style={{ border: "1px solid #e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
                      <button
                        onClick={() => setActiveFaq(isOpen ? null : uniqueId)}
                        style={{ width: "100%", textAlign: "left", padding: "15px", backgroundColor: "#f8fafc", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "bold", color: "#334155" }}
                      >
                        <span>{item.q}</span>
                        <span>{isOpen ? "▲" : "▼"}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: "15px", backgroundColor: "white", borderTop: "1px solid #e2e8f0", color: "#475569", lineHeight: "1.6" }}>
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SupportFeedbackPage;