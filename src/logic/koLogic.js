import { getThirdPlaceForSlot } from './thirdPlaceMapping';

/**
 * BERECHNUNG: VERTIKALE POSITION (BAUM-GEOMETRIE)
 */
export const getTopPosition = (roundIndex, matchIndex, treeHeight, currentBaseSpacing) => {
  const step = currentBaseSpacing * Math.pow(2, roundIndex);
  
  if (roundIndex === 4) {
    const finaleTop = (0 * step) + (step / 2) - (currentBaseSpacing / 2);
    if (matchIndex === 1) {
      return finaleTop + 200; 
    }
    return finaleTop;
  }

  return matchIndex * step + (step / 2) - (currentBaseSpacing / 2);
};

/**
 * RESOLVER: SLOTS ZU TEAMNAMEN
 * Diese Version erkennt sowohl interne Platzhalter (A1, 1A) als auch 
 * die FIFA-Kombinations-Codes (ABCDF3 etc.) aus der Datenbank.
 */
export function resolveSlot(slot, context) {
  if (!slot || !context) return slot;

  const { groups, thirdPlaces } = context;

  // 1. ÜBERSETZUNG: FIFA-Codes zu internen Slot-Codes (1A, 1B etc.)
  // Mappt die kryptischen Datenbank-Strings auf deine Mapping-Logik
  const fifaToInternal = {
    "CEFHI3": "1A", 
    "EFGIJ3": "1B", 
    "BEFIJ3": "1D", 
    "ABCDF3": "1E",
    "AEHIJ3": "1G", 
    "CDFGH3": "1I", 
    "DEIJL3": "1K", 
    "EHIJK3": "1L",
  };

  const effectiveSlot = fifaToInternal[slot] || slot;

  // 2. Gruppensieger/Zweite (Muster: A1, B2, K1, L2 etc.)
  const groupMatch = effectiveSlot.match(/^([A-L])([1-4])$/i);
  if (groupMatch) {
    const groupLetter = groupMatch[1].toUpperCase(); 
    const position = parseInt(groupMatch[2], 10) - 1; 
    const groupTeams = groups?.[groupLetter] || [];
    return groupTeams[position] || slot; 
  }

  // 3. Gruppendritte (z.B. 1A, 1B... oder übersetzte FIFA-Codes)
  const thirdPlaceSlots = ["1A", "1B", "1D", "1E", "1G", "1I", "1K", "1L"];
  if (thirdPlaceSlots.includes(effectiveSlot)) {
    // WICHTIG: thirdPlaces muss [{team: "...", group: "..."}] Format haben
    if (thirdPlaces && thirdPlaces.length >= 8) {
        return getThirdPlaceForSlot(effectiveSlot, thirdPlaces);
    }
    return slot;
  }

  // 4. KO-Resultat Platzhalter (Winner/Loser Match X)
  if (slot.toLowerCase().startsWith("winner") || slot.toLowerCase().startsWith("loser")) {
      return slot; 
  }

  return slot;
}

/**
 * HELFER: GEWINNER-ERMITTLUNG
 */
export function getWinner(matchId, tips) {
  const tip = tips[matchId];
  if (!tip) return null;
  if (tip.winner) return Number(tip.winner);
  
  const gA = (tip.goals_a !== null && tip.goals_a !== "") ? Number(tip.goals_a) : null;
  const gB = (tip.goals_b !== null && tip.goals_b !== "") ? Number(tip.goals_b) : null;
  
  if (gA !== null && gB !== null) {
    if (gA > gB) return 1; 
    if (gB > gA) return 2;
  }
  return null;
}

/**
 * REKURSION: TEAM-HERKUNFT
 */
export function getTeamFromPrevious(roundIndex, matchIndex, side, koByRound, tips, context) {
  const currentPhaseId = context?.phaseId || 1;

  // BASIS-FALL: PHASE 1 (Prognose-Modus)
  if (currentPhaseId === 1 && roundIndex === 0) {
    const KO_STRUCTURE = {
      round16: [
        ["E1", "1E"], ["I1", "1I"], ["F1", "C2"], ["B2", "A2"],
        ["K2", "L2"], ["H1", "J2"], ["D1", "1D"], ["G1", "1G"],
        ["C1", "F2"], ["E2", "I2"], ["A1", "1A"], ["L1", "1L"],
        ["J1", "H2"], ["D2", "G2"], ["B1", "1B"], ["K1", "1K"]
      ]
    };
    const pairing = KO_STRUCTURE.round16[matchIndex];
    if (!pairing) return "?";
    
    const slotCode = side === "A" ? pairing[0] : pairing[1];
    return resolveSlot(slotCode, context);
  }

  // BASIS-FALL: REALDATEN (Phase 2+)
  const startRoundOfPhase = currentPhaseId === 1 ? 0 : currentPhaseId - 2;
  if (currentPhaseId > 1 && roundIndex === startRoundOfPhase) {
    const rounds = Object.keys(koByRound).map(Number).sort((a, b) => a - b);
    const currentRoundKey = rounds[roundIndex];
    const currentMatch = koByRound[currentRoundKey]?.[matchIndex];
    
    if (currentMatch) {
      const team = side === "A" ? currentMatch.team_a : currentMatch.team_b;
      return team || "?";
    }
  }

  // REKURSIONS-SCHRITT
  const rounds = Object.keys(koByRound).map(Number).sort((a, b) => a - b);
  const prevRoundKey = rounds[roundIndex - 1];
  const prevRound = koByRound[prevRoundKey];

  if (!prevRound) return "?";

  let sourceMatchIndex;
  if (roundIndex === 4) {
    sourceMatchIndex = side === "A" ? 0 : 1; 
  } else {
    sourceMatchIndex = side === "A" ? matchIndex * 2 : matchIndex * 2 + 1;
  }

  const sourceMatch = prevRound[sourceMatchIndex];
  if (!sourceMatch) return "?";

  const winner = getWinner(sourceMatch.id, tips);
  
  if (!winner) return "?";

  const isThirdPlaceMatch = (roundIndex === 4 && matchIndex === 1);
  let effectiveWinnerSide = (isThirdPlaceMatch) 
    ? (winner === 1 ? "B" : "A") 
    : (winner === 1 ? "A" : "B");

  return getTeamFromPrevious(
    roundIndex - 1, sourceMatchIndex, effectiveWinnerSide, koByRound, tips, context
  );
}