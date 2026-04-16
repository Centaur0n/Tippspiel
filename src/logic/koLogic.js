import { getThirdPlaceForSlot } from './thirdPlaceMapping'; // Pfad anpassen!


/**
 * Berechnet die vertikale Position eines Spiels im Baum
 */
export const getTopPosition = (roundIndex, matchIndex, treeHeight, currentBaseSpacing) => {
  if (roundIndex === 4) return matchIndex === 0 ? (treeHeight / 2 - 30) : (treeHeight / 2 + 300);
  if (roundIndex === 0) return matchIndex * currentBaseSpacing;
  const prevSpacing = currentBaseSpacing * Math.pow(2, roundIndex);
  return matchIndex * prevSpacing + prevSpacing / 2 - currentBaseSpacing / 2;
};

/**
 * Ermittelt, welches Team in einem Slot (z.B. "A1") steht
 */

export function resolveSlot(slot, context) {
  
  if (!context || !context.groups) {
    return slot; // Wenn kein Context da ist, gib einfach "1A" zurück statt abzustürzen
  }

  const { groups, thirdPlaces } = context;

  // 1. Logik für Gruppensieger und Zweite (z.B. "A1", "B2")
  if (/^[A-Z][12]$/.test(slot)) {
    const groupLetter = slot[0]; 
    const position = Number(slot[1]) - 1; // 0 für 1. Platz, 1 für 2. Platz
    
    // Holt das Team aus dem groups-Objekt (z.B. groups["A"][0])
    return groups[groupLetter]?.[position] || "?";
  }

  // 2. DIE NEUE LOGIK FÜR DIE DRITTPLATZIERTEN (Slots wie "1A", "1B" etc.)
  // Wir prüfen, ob der Slot einer der definierten Slots für Dritte ist
  const thirdPlaceSlots = ["1A", "1B", "1D", "1E", "1G", "1I", "1K", "1L"];
  
  if (thirdPlaceSlots.includes(slot)) {
    // Hier rufen wir deine 495er-Mapping-Funktion auf
    // thirdPlaces muss das Array mit den 8 besten Dritten sein
    return getThirdPlaceForSlot(slot, thirdPlaces);
  }

  // Fallback für alte Slots oder Platzhalter
  return slot;
}

/**
 * Ermittelt den Gewinner eines Spiels aus den Tipps
 */
export function getWinner(matchId, tips) {
  const tip = tips[matchId];
  if (!tip) return null;
  if (tip.winner) return Number(tip.winner);
  const gA = Number(tip.goals_a); const gB = Number(tip.goals_b);
  if (gA > gB) return 1; if (gB > gA) return 2;
  return null;
}

/**
 * Findet das Team aus der vorherigen Runde
 */
export function getTeamFromPrevious(roundIndex, matchIndex, side, koByRound, tips, context) {
  const rounds = Object.keys(koByRound).map(Number).sort((a, b) => a - b);
  const prevRoundKey = rounds[roundIndex - 1];
  const prevRound = koByRound[prevRoundKey];

  if (!prevRound) return "?";

  // --- FIX 1: SOURCE MATCH INDEX ---
  // Da beide Finalspiele (Finale & Platz 3) dieselben Quellen (Halbfinals) nutzen,
  // müssen wir den Index für die Finalrunde "normalisieren".
  let sourceMatchIndex;
  if (roundIndex === 4) {
    // Sowohl Match 0 (Finale) als auch Match 1 (Platz 3) greifen auf 
    // die Halbfinals 0 und 1 zu.
    sourceMatchIndex = side === "A" ? 0 : 1;
  } else {
    // Normaler Baumverlauf für alle anderen Runden
    sourceMatchIndex = side === "A" ? matchIndex * 2 : matchIndex * 2 + 1;
  }

  const sourceMatch = prevRound[sourceMatchIndex];
  if (!sourceMatch) return "?";

  const tip = tips[sourceMatch.id];
  const winner = tip ? Number(tip.winner) : null;

  if (!winner) return "?";

  // --- FIX 2: GEWINNER/VERLIERER TAUSCH ---
  // Jetzt, wo Finale = 0 und Platz 3 = 1 ist:
  const isThirdPlaceMatch = (roundIndex === 4 && matchIndex === 1);
  
  let effectiveWinnerSide;
  if (isThirdPlaceMatch) {
    // Spiel um Platz 3 (Index 1): Nimm den VERLIERER
    effectiveWinnerSide = winner === 1 ? "B" : "A";
  } else {
    // Finale (Index 0) und Rest: Nimm den GEWINNER
    effectiveWinnerSide = winner === 1 ? "A" : "B";
  }

  // --- WEITERGABE ---
  if (roundIndex === 1) {
    const KO_STRUCTURE = {
      round16: [
        ["E1", "1E"], ["I1", "1I"], ["F1", "C2"], ["B2", "A2"],
        ["K2", "L2"], ["H1", "J2"], ["D1", "1D"], ["G1", "1G"],
        ["C1", "F2"], ["E2", "I2"], ["A1", "1A"], ["L1", "1L"],
        ["J1", "H2"], ["D2", "G2"], ["B1", "1B"], ["K1", "1K"]
      ]
    };
    const pairing = KO_STRUCTURE.round16[sourceMatchIndex];
    const slotCode = effectiveWinnerSide === "A" ? pairing[0] : pairing[1];
    return resolveSlot(slotCode, context);
  } else {
    return getTeamFromPrevious(
        roundIndex - 1, 
        sourceMatchIndex, 
        effectiveWinnerSide, 
        koByRound, 
        tips, 
        context
    );
  }
}