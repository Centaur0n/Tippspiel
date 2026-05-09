import { supabase } from "../supabaseClient";

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

/**
 * Vergleicht User-Prognosen mit dem realen Turnierstand und vergibt Punkte.
 * @param {Array} allMatches - Liste aller Matches aus der DB
 * @param {Object} currentMatch - Das gerade aktualisierte Match
 */
export async function processPrognosisPoints(allMatches, currentMatch) {
  // 1. SICHERHEITS-CHECK: Nur berechnen, wenn das Spiel wirklich beendet wurde
  if (currentMatch.goals_a_real === null || currentMatch.goals_b_real === null) {
    console.log("Match noch nicht beendet, keine Prognose-Punkte-Berechnung.");
    return;
  }

  const { group_name, stage, stage_order } = currentMatch;

  // 2. Holen der aktuellen "Wahrheit" aus den real_state Tabellen
  const { data: realGroup } = await supabase
    .from("real_group_state")
    .select("*")
    .eq("group_name", group_name || "")
    .single();

  const { data: realKO } = await supabase
    .from("real_ko_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (!realKO) return;

  const pointsEntries = [];

  // ---------------------------------------------------------
  // A. GRUPPEN-PUNKTE (Nur wenn die Gruppe gerade fertig wurde)
  // ---------------------------------------------------------
  if (stage === "group" && realGroup && realGroup.is_finished) {
    const { data: userGroupProgs } = await supabase
      .from("user_prognosis_group")
      .select("*")
      .eq("group_name", group_name);

    if (userGroupProgs) {
      userGroupProgs.forEach(prog => {
        // 1. Check Table Positions (Rank 1-4)
        ['rank_1', 'rank_2', 'rank_3', 'rank_4'].forEach((rankKey, idx) => {
          if (prog[rankKey] === realGroup[rankKey] && realGroup[rankKey] !== null) {
            pointsEntries.push(createPointEntry(prog.player_id, 'GROUP_RANK', POINTS_CONFIG.PROG_TABLE_POS, prog[rankKey], 1));
          }
        });

        // 2. Check Reached KO
        prog.reached_ko?.forEach(team => {
          if (realGroup.reached_ko?.includes(team)) {
            pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_REACH_16, team, 1));
          }
        });

        // 3. Check Out Vorrunde (Platz 4)
        prog.dropped_out?.forEach(team => {
          if (realGroup.dropped_out?.includes(team)) {
            pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_OUT_VORRUNDE, team, 1));
          }
        });
      });
    }
  }

  // ---------------------------------------------------------
  // B. KO-PHASEN PUNKTE (Check bei jedem KO-Spiel)
  // ---------------------------------------------------------
  if (stage === "ko" && currentMatch.winner_real !== 0) {
    const { data: userKOProgs } = await supabase.from("user_prognosis_ko").select("*");

    if (userKOProgs) {
      // Mapping: Welches Match-Level schaltet welche Punkte frei?
      const roundMapping = {
        1: { realKey: 'reached_16', progKey: 'reached_16', pts: POINTS_CONFIG.PROG_REACH_16, dropKey: 'drop_out_16', dropPts: POINTS_CONFIG.PROG_OUT_16 },
        2: { realKey: 'reached_8',  progKey: 'reached_8',  pts: POINTS_CONFIG.PROG_REACH_8,  dropKey: 'drop_out_8',  dropPts: POINTS_CONFIG.PROG_OUT_8 },
        3: { realKey: 'reached_4',  progKey: 'reached_4',  pts: POINTS_CONFIG.PROG_REACH_4,  dropKey: 'drop_out_4',  dropPts: POINTS_CONFIG.PROG_OUT_4 },
        4: { realKey: 'reached_2',  progKey: 'reached_2',  pts: POINTS_CONFIG.PROG_REACH_2,  dropKey: 'drop_out_2',  dropPts: POINTS_CONFIG.PROG_OUT_2 },
        5: { realKey: 'winner_final', progKey: 'winner_final', pts: POINTS_CONFIG.PROG_CHAMPION }
      };

      const activeRound = roundMapping[stage_order];

      if (activeRound) {
        userKOProgs.forEach(prog => {
          // Check: Wer ist weitergekommen?
          if (Array.isArray(realKO[activeRound.realKey])) {
            prog[activeRound.progKey]?.forEach(team => {
              if (realKO[activeRound.realKey].includes(team)) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.pts, team, stage_order));
              }
            });
          } else if (realKO[activeRound.realKey] === prog[activeRound.progKey] && realKO[activeRound.realKey] !== null) {
            // Spezialfall Weltmeister (kein Array)
            pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.pts, realKO[activeRound.realKey], stage_order));
          }

          // Check: Wer ist ausgeschieden?
          if (activeRound.dropKey && prog[activeRound.progKey]) {
             prog[activeRound.dropKey]?.forEach(team => {
                if (realKO[activeRound.dropKey]?.includes(team)) {
                   pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.dropPts, team, stage_order));
                }
             });
          }
        });
      }
    }
  }

  // ---------------------------------------------------------
  // C. SPEICHERN & CLEANUP
  // ---------------------------------------------------------
  if (pointsEntries.length > 0) {
    // 1. Lösche alte Prognose-Punkte für diesen spezifischen Kontext
    if (stage === "group" && realGroup?.is_finished) {
      await supabase.from("user_points_detail")
        .delete()
        .eq("category", "GROUP_RANK")
        .eq("phase_id", 1)
        .eq("is_prognosis", true);
        
      // Auch die PATH-Punkte der Gruppe (Weiterkommen/Ausscheiden)
      await supabase.from("user_points_detail")
        .delete()
        .eq("category", "PROGNOSIS_PATH")
        .eq("phase_id", 1)
        .eq("is_prognosis", true);
    }

    if (stage === "ko") {
      await supabase.from("user_points_detail")
        .delete()
        .eq("category", "PROGNOSIS_PATH")
        .eq("phase_id", stage_order)
        .eq("is_prognosis", true);
    }

    // 2. Neue Punkte einfügen
    const { error } = await supabase.from("user_points_detail").insert(pointsEntries);
    if (error) console.error("Fehler beim Speichern der Prognose-Punkte:", error.message);
  }
}

/**
 * Hilfsfunktion zum Erstellen eines konsistenten Punkte-Objekts
 */
function createPointEntry(playerId, category, points, team, phase) {
  return {
    player_id: playerId,
    category: category,
    points_total: points,
    reference_team: team,
    phase_id: phase,
    is_prognosis: true,
    breakdown: { info: `Automatische Vergabe: ${category} für ${team}` }
  };
}