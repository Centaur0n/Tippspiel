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
export function getTeamFromPrevious(roundIndex, matchIndex, side, koByRound, tips) {
    const rounds = Object.keys(koByRound).map(Number).sort((a, b) => a - b);
    const prevRoundKey = rounds[roundIndex - 1];
    const prevRound = koByRound[prevRoundKey];
    if (!prevRound) return "?";
    const sourceMatchIndex = side === "A" ? matchIndex * 2 : matchIndex * 2 + 1;
    const sourceMatch = prevRound[sourceMatchIndex];
    if (!sourceMatch) return "?";
    const winner = getWinner(sourceMatch.id, tips);
    if (!winner) return "?";
    return winner === 1 ? sourceMatch.team_a : sourceMatch.team_b;
}