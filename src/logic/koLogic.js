import { getThirdPlaceForSlot } from './thirdPlaceMapping';

/**
 * BERECHNUNG: VERTIKALE POSITION (BAUM-GEOMETRIE)
 */
export const getTopPosition = (roundIndex, matchIndex, treeHeight, currentBaseSpacing) => {
  const step = currentBaseSpacing * Math.pow(2, roundIndex);
  
  if (roundIndex === 4) { // Finale & Spiel um Platz 3
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
 * Optimiert auf kurze Kürzel:
 * Gruppensieger/Zweite: A1, B2...
 * Gruppendritte: 1A, 1E...
 */
export function resolveSlot(slot, context) {
  if (!slot || !context) return slot;

  const { groups, thirdPlaces } = context;

  // 1. Gruppensieger/Zweite (Muster: A1, B2 etc.)
  const groupMatch = slot.match(/^([A-L])([1-2])$/i);
  if (groupMatch) {
    const groupLetter = groupMatch[1].toUpperCase(); 
    const position = parseInt(groupMatch[2], 10) - 1; 
    const groupTeams = groups?.[groupLetter] || [];
    return groupTeams[position] || slot; 
  }

  // 2. Gruppendritte (Muster: 1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L)
  // Erkennt Platzhalter, die mit '1' beginnen (deine neue Logik)
  const thirdPlaceMatch = slot.match(/^1([A-L])$/i);
  if (thirdPlaceMatch) {
    if (thirdPlaces && thirdPlaces.length >= 8) {
        return getThirdPlaceForSlot(slot.toUpperCase(), thirdPlaces);
    }
    return slot;
  }

  // 3. KO-Resultat Platzhalter (Winner/Loser Match X)
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

  const gA = (tip.goals_a !== null && tip.goals_a !== "") ? Number(tip.goals_a) : null;
  const gB = (tip.goals_b !== null && tip.goals_b !== "") ? Number(tip.goals_b) : null;

  if (gA !== null && gB !== null) {
    if (gA > gB) return 1;
    if (gB > gA) return 2;
  }
  
  if (tip.winner) return Number(tip.winner);
  
  return null;
}

/**
 * REKURSION: TEAM-HERKUNFT
 * Zieht die Daten für das 16tel-Finale direkt aus den Platzhalter-Spalten der DB.
 */
export function getTeamFromPrevious(roundIndex, matchIndex, side, koByRound, tips, context) {
  const currentPhaseId = context?.phaseId || 1;

  // BASIS-FALL: Erste KO-Runde (Sechzehntelfinale)
  if (roundIndex === 0) {
    const rounds = Object.keys(koByRound).map(Number).sort((a, b) => a - b);
    const currentRoundKey = rounds[0];
    const currentMatch = koByRound[currentRoundKey]?.[matchIndex];
    
    

    if (currentMatch) {
      // UMGEKEHRTE PRIORITÄT: Erst das echte Team prüfen, falls leer -> Platzhalter
      const slot = side === "A" 
        ? (currentMatch.team_a || currentMatch.placeholder_a) 
        : (currentMatch.team_b || currentMatch.placeholder_b);
        
      
      // Falls es doch ein Platzhalter war, jagen wir ihn vorsichtshalber durch den Resolver
      return resolveSlot(slot, context);
    }
    return "?";
  }

  // BASIS-FALL: REALDATEN für höhere Phasen (Phase 2+)
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
  const prevRoundIndexInMap = rounds.indexOf(rounds.find(r => r >= 0)) + roundIndex - 1;
  const prevRoundKey = rounds[prevRoundIndexInMap];
  const prevRound = koByRound[prevRoundKey];

  if (!prevRound) {
    return "?";
  }

  let sourceMatchIndex;
  if (roundIndex === 4) {
    sourceMatchIndex = side === "A" ? 0 : 1; 
  } else {
    sourceMatchIndex = side === "A" ? matchIndex * 2 : matchIndex * 2 + 1;
  }

  const sourceMatch = prevRound[sourceMatchIndex];
  if (!sourceMatch) {
    return "?";
  }

  const winner = getWinner(sourceMatch.id, tips);

  if (!winner) {
    return "?";
  }

  const isThirdPlaceMatch = (roundIndex === 4 && matchIndex === 1);
  let effectiveWinnerSide = (isThirdPlaceMatch) 
    ? (winner === 1 ? "B" : "A") 
    : (winner === 1 ? "A" : "B");


  return getTeamFromPrevious(
    roundIndex - 1, sourceMatchIndex, effectiveWinnerSide, koByRound, tips, context
  );
}