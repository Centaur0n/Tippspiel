/**
 * tournamentLogic.js / calcTable.js
 * Diese Datei berechnet aus den einzelnen Spielergebnissen (Tipps) 
 * eine vollständige Gruppentabelle nach FIFA-Standard und steuert die Turnierstruktur.
 */

/**
 * ERMITTELT DIE PHASE_ID EINES SPIELS
 * Hilft dem Admin und der Punkteberechnung, Spiele ohne manuelle Dropdowns
 * der exakten Tipp-Phase zuzuordnen.
 */
export function getPhaseIdFromMatch(match) {
  if (!match) return 1;

  // 1. Gruppenphase ist immer Phase 1
  if (match.stage === "group") {
    return 1;
  }

  // 2. KO-Phase Zuordnung basierend auf stage_order
  if (match.stage === "ko") {
    const stageOrder = Number(match.stage_order);
    
    switch (stageOrder) {
      case 1: return 2; // Achtelfinale
      case 2: return 3; // Viertelfinale
      case 3: return 4; // Halbfinale
      case 4: return 5; // Finale & Spiel um Platz 3
      case 5: return 5; // Absicherung für Spezial-Matrix-Einträge
      default: return 2;
    }
  }

  return 1;
}

/**
 * BASIS-BERECHNUNG: Erstellt eine Liste mit Punkten und Toren.
 */
export function calculateTable(groupMatches, currentTips) {
  const table = {};

  // Vorab-Initialisierung aller Teams einer Gruppe
  groupMatches.forEach((m) => {
    if (!table[m.team_a]) table[m.team_a] = { points: 0, goals: 0, conceded: 0 };
    if (!table[m.team_b]) table[m.team_b] = { points: 0, goals: 0, conceded: 0 };
  });

  groupMatches.forEach((m) => {
    const t = currentTips[m.id];
    if (!t) return;

    // FEHLER-BREMSE HIER: Wenn die Tore null, undefined oder leer sind, 
    // ist das Spiel ungespielt -> Überspringen, damit es kein falsches 0:0 gibt!
    if (
      t.goals_a === null || t.goals_b === null || 
      t.goals_a === undefined || t.goals_b === undefined ||
      t.goals_a === "" || t.goals_b === ""
    ) {
      return;
    }

    const A = m.team_a; 
    const B = m.team_b;

    const gA = Number(t.goals_a); 
    const gB = Number(t.goals_b);

    // Tore und Gegentore addieren
    table[A].goals += gA; table[A].conceded += gB;
    table[B].goals += gB; table[B].conceded += gA;

    // Punkteverteilung: Sieg 3 Pkt, Unentschieden 1 Pkt
    if (gA > gB) table[A].points += 3;
    else if (gB > gA) table[B].points += 3;
    else { 
      table[A].points += 1; 
      table[B].points += 1; 
    }
  });

  // Umwandlung des Objekts in ein Array und einfache Sortierung (Punkte -> Differenz)
  return Object.entries(table)
    .map(([team, d]) => ({ team, ...d, diff: d.goals - d.conceded }))
    .sort((a, b) => b.points - a.points || b.diff - a.diff);
}

/**
 * FIFA-LOGIK: Sortiert die Tabelle nach den offiziellen Tie-Break-Regeln.
 */
export function calculateFIFADataTable(groupMatches, tips, manualRanks = {}) {
  // 1. Grundwerte (Punkte, Tore etc.) berechnen
  let table = calculateTable(groupMatches, tips);

  // 2. Präzise Sortierung nach sportlichen Kriterien
  table.sort((a, b) => {
    // A. Wer hat mehr Punkte? (PKT) - Absteigend
    if (b.points !== a.points) return b.points - a.points;

    // B. Wer hat die bessere Tordifferenz? (DIFF) - Absteigend
    if (b.diff !== a.diff) return b.diff - a.diff;

    // C. Wer hat insgesamt mehr Tore geschossen? (TORE) - Absteigend
    if (b.goals !== a.goals) return b.goals - a.goals;

    // D. STICHWAHL (Losentscheid/Manueller Rang)
    const rankA = manualRanks[a.team] !== undefined && manualRanks[a.team] !== null ? manualRanks[a.team] : 99;
    const rankB = manualRanks[b.team] !== undefined && manualRanks[b.team] !== null ? manualRanks[b.team] : 99;
    
    if (rankA !== rankB) return rankA - rankB;

    // E. NOTNAGEL: Alphabetische Sortierung gegen "hüpfende" UI
    return a.team.localeCompare(b.team);
  });

  return table;
}