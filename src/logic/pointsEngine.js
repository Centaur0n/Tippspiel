import { supabase } from "../supabaseClient";

export const POINTS_CONFIG = {
  // Reale Spiele
  MATCH_BASE_DYNAMIC: [3, 4, 5], 
  MATCH_DIFF: 2,
  MATCH_GOALS_SINGLE: 1,
  MATCH_GOALS_SUM: 1,
  BONUS_EXACT_LOW: 3,   // Summe 0-3
  BONUS_EXACT_MID: 4,   // Summe 4-6
  BONUS_EXACT_HIGH: 5,  // Summe 7+

  // Prognosen / Finalrunde
  PROG_REACH_16: 5,
  PROG_OUT_16: 6,
  PROG_REACH_8: 6,
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
 */
export const calculateDetailedMatchPoints = (tip, actual, winnerPoints) => {
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

  const tipWinner = tA > tB ? "1" : tA < tB ? "2" : "0";
  const actualWinner = aA > aB ? "1" : aA < aB ? "2" : "0";

  if (tipWinner === actualWinner) {
    breakdown.winner = winnerPoints;
  }

  if ((tA - tB) === (aA - aB)) {
    breakdown.diff = POINTS_CONFIG.MATCH_DIFF;
  }

  if (tA === aA) breakdown.goals_a = POINTS_CONFIG.MATCH_GOALS_SINGLE;
  if (tB === aB) breakdown.goals_b = POINTS_CONFIG.MATCH_GOALS_SINGLE;

  if ((tA + tB) === (aA + aB)) {
    breakdown.sum = POINTS_CONFIG.MATCH_GOALS_SUM;
  }

  if (tA === aA && tB === aB) {
    const totalGoals = aA + aB;
    if (totalGoals <= 3) breakdown.exact_bonus = POINTS_CONFIG.BONUS_EXACT_LOW;
    else if (totalGoals <= 6) breakdown.exact_bonus = POINTS_CONFIG.BONUS_EXACT_MID;
    else breakdown.exact_bonus = POINTS_CONFIG.BONUS_EXACT_HIGH;
  }

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
 */
export async function processPrognosisPoints(allMatches, currentMatch) {
  if (currentMatch.goals_a_real === null || currentMatch.goals_b_real === null) {
    return;
  }

  const { group_name, stage, stage_order } = currentMatch;

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
  const real32 = realKO.reached_16 || []; // Der globale Pool der 32 realen Qualifikanten

  // A. GRUPPEN-PUNKTE
  if (stage === "group" && realGroup && realGroup.is_finished) {
    const { data: userGroupProgs } = await supabase
      .from("user_prognosis_group")
      .select("*")
      .eq("group_name", group_name);

    if (userGroupProgs) {
      userGroupProgs.forEach(prog => {
        // 1. Exakte Tabellenpositionen (Platz 1-4) - Bleibt gleich
        ['rank_1', 'rank_2', 'rank_3', 'rank_4'].forEach((rankKey) => {
          if (prog[rankKey] === realGroup[rankKey] && realGroup[rankKey] !== null) {
            pointsEntries.push(createPointEntry(prog.player_id, 'GROUP_RANK', POINTS_CONFIG.PROG_TABLE_POS, prog[rankKey], 1, group_name));
          }
        });

        // 2. Erreichen des 16tel-Finales (NUR FÜR TEAMS DIESER GRUPPE)
        // Wir holen die Teams, die REAL in dieser Gruppe unter den Top 3 gelandet sind
        const realTeamsInThisGroup = [realGroup.rank_1, realGroup.rank_2, realGroup.rank_3].filter(Boolean);

        const userQualifiersFromGroup = [
          ...(prog.reached_ko || []),
          ...(prog.reached_ko_best_thirds || [])
        ];

        userQualifiersFromGroup.forEach(team => {
          // KORREKTUR: Das Team bekommt NUR Punkte, wenn es 
          // a) im globalen 32er Pool ist UND 
          // b) real aus genau dieser Gruppe stammt
          if (real32.includes(team) && realTeamsInThisGroup.includes(team)) {
            pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_REACH_16, team, 1, group_name));
          }
        });

        // 3. Ausscheiden (Dropped Out) - Bleibt gleich
        prog.dropped_out?.forEach(team => {
          if (realGroup.dropped_out?.includes(team)) {
            pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_OUT_VORRUNDE, team, 1, group_name));
          }
        });
      });
    }
  }

  // B. KO-PHASEN PUNKTE
  if (stage === "ko" && currentMatch.winner_real !== 0) {
    const { data: userKOProgs } = await supabase.from("user_prognosis_ko").select("*");

    if (userKOProgs) {
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
          if (Array.isArray(realKO[activeRound.realKey])) {
            prog[activeRound.progKey]?.forEach(team => {
              if (realKO[activeRound.realKey].includes(team)) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.pts, team, stage_order, "KO"));
              }
            });
          } else if (realKO[activeRound.realKey] === prog[activeRound.progKey] && realKO[activeRound.realKey] !== null) {
            pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.pts, realKO[activeRound.realKey], stage_order, "KO"));
          }

          if (activeRound.dropKey && prog[activeRound.progKey]) {
             prog[activeRound.dropKey]?.forEach(team => {
                if (realKO[activeRound.dropKey]?.includes(team)) {
                   pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.dropPts, team, stage_order, "KO"));
                }
             });
          }
        });
      }
    }
  }

  // C. SPEICHERN & CLEANUP
  if (stage === "group" && realGroup?.is_finished) {
    await supabase.from("user_points_detail")
      .delete()
      .eq("group_name", group_name)
      .eq("is_prognosis", true)
      .in("category", ["GROUP_RANK", "PROGNOSIS_PATH"]);
  }

  if (stage === "ko") {
    await supabase.from("user_points_detail")
      .delete()
      .eq("category", "PROGNOSIS_PATH")
      .eq("phase_id", stage_order)
      .eq("is_prognosis", true);
  }

  // Nur wenn wir tatsächlich neue Punkte zum Eintragen haben
  if (pointsEntries.length > 0) {
    const { error } = await supabase.from("user_points_detail").insert(pointsEntries);
    if (error) console.error("Fehler beim Speichern der Prognose-Punkte:", error.message);
  }
}

function createPointEntry(playerId, category, points, team, phase, groupName) {
  return {
    player_id: playerId,
    category: category,
    points_total: points,
    reference_team: team,
    phase_id: phase,
    group_name: groupName, 
    is_prognosis: true,
    breakdown: { info: `Automatische Vergabe: ${category} für ${team} (Gruppe ${groupName})` }
  };
}