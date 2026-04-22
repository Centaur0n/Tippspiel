export const POINTS_CONFIG = {
  // Reale Spiele
  MATCH_BASE_DYNAMIC: [3, 4, 5], 
  MATCH_DIFF: 2,
  MATCH_GOALS_SINGLE: 1,
  MATCH_GOALS_SUM: 1,
  BONUS_EXACT_LOW: 3,  // Summe 0-3
  BONUS_EXACT_MID: 4,  // Summe 4-6
  BONUS_EXACT_HIGH: 5, // Summe 7+

  // Prognosen / Finalrunde
  PROG_REACH_16: 5,
  PROG_OUT_16: 5,
  PROG_REACH_8: 5,
  PROG_OUT_8: 5,
  PROG_REACH_4: 10,
  PROG_OUT_4: 5,
  PROG_REACH_2: 15,
  PROG_OUT_2: 10,
  PROG_REACH_FINAL: 20,
  PROG_PLACE_4: 5,
  PROG_PLACE_3: 10,
  PROG_VIZE: 15,
  PROG_CHAMPION: 35,

  // Vorrunde
  PROG_OUT_VORRUNDE: 2,
  PROG_TABLE_POS: 2,

  // Korrekturdivisoren
  DIVISORS: {
    1: 1, 2: 1, 3: 2, 4: 4, 5: 8
  }
};

/**
 * BERECHNET DETAILLIERTE PUNKTE FÜR EIN SPIEL
 * Gibt ein Objekt mit Summe und Aufschlüsselung zurück.
 */
export const calculateDetailedMatchPoints = (tip, actual, winnerPoints) => {
  // Initialer Breakdown für die Statistik
  const breakdown = {
    winner: 0,
    diff: 0,
    goals_a: 0,
    goals_b: 0,
    sum: 0,
    exact_bonus: 0
  };

  if (!tip || actual.goals_a === null || actual.goals_a === undefined) {
    return { total: 0, breakdown };
  }

  const tA = Number(tip.goals_a);
  const tB = Number(tip.goals_b);
  const aA = Number(actual.goals_a);
  const aB = Number(actual.goals_b);

  // 1. Richtiger Sieger (Tendenz)
  const tipWinner = tA > tB ? "1" : tA < tB ? "2" : String(tip.winner);
  const actualWinner = aA > aB ? "1" : aA < aB ? "2" : String(actual.winner);
  
  if (tipWinner === actualWinner && tipWinner !== "0") {
    breakdown.winner = winnerPoints;
  }

  // 2. Tordifferenz
  if ((tA - tB) === (aA - aB)) {
    breakdown.diff = POINTS_CONFIG.MATCH_DIFF;
  }

  // 3. Einzelne Tore
  if (tA === aA) breakdown.goals_a = POINTS_CONFIG.MATCH_GOALS_SINGLE;
  if (tB === aB) breakdown.goals_b = POINTS_CONFIG.MATCH_GOALS_SINGLE;

  // 4. Gesamtsumme Tore
  if ((tA + tB) === (aA + aB)) {
    breakdown.sum = POINTS_CONFIG.MATCH_GOALS_SUM;
  }

  // 5. Bonus für komplett richtiges Ergebnis
  if (tA === aA && tB === aB) {
    const totalGoals = aA + aB;
    if (totalGoals <= 3) breakdown.exact_bonus = POINTS_CONFIG.BONUS_EXACT_LOW;
    else if (totalGoals <= 6) breakdown.exact_bonus = POINTS_CONFIG.BONUS_EXACT_MID;
    else breakdown.exact_bonus = POINTS_CONFIG.BONUS_EXACT_HIGH;
  }

  // Gesamtsumme berechnen
  const total = Object.values(breakdown).reduce((acc, val) => acc + val, 0);

  return { total, breakdown };
};

/**
 * HILFSFUNKTION FÜR FIFA-LOGIK
 */
export const getDynamicWinnerPoints = (rankA, rankB) => {
  const diff = rankA - rankB; 
  if (diff < -20) return 3; 
  if (diff > 20) return 5;  
  return 4; 
};