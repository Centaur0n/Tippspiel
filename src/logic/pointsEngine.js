import { supabase } from "../supabaseClient";

export const POINTS_CONFIG = {
  MATCH_BASE_DYNAMIC: [3, 4, 5], 
  MATCH_DIFF: 2,
  MATCH_GOALS_SINGLE: 1,
  MATCH_GOALS_SUM: 1,
  BONUS_EXACT_LOW: 3,
  BONUS_EXACT_MID: 4,
  BONUS_EXACT_HIGH: 5,

  PROG_REACH_16: 16.1,
  PROG_OUT_16: 16.2,
  PROG_REACH_8: 8.1,
  PROG_OUT_8: 8.2,
  PROG_REACH_4: 4.1,
  PROG_OUT_4: 4.2,
  PROG_REACH_2: 2.1,
  PROG_OUT_2: 2.2,
  PROG_REACH_FINAL: 20.1, 
  PROG_PLACE_4: 4.3,      
  PROG_PLACE_3: 3.3,      
  PROG_VIZE: 2.3,         
  PROG_CHAMPION: 1.3,     

  PROG_OUT_VORRUNDE: 2.2,
  PROG_TABLE_POS: 2.5,

  DIVISORS: {
    1: 1, 2: 1, 3: 1, 4: 1, 5: 1
  }
};

// --- HELPER: BERECHNET DIE PUNKTE FÜR EINEN EINZELNEN TIPP ---
export const calculateDetailedMatchPoints = (tip, actual, winnerPoints) => {
  const points = { winner: 0, diff: 0, goals_a: 0, goals_b: 0, sum: 0, exact_bonus: 0 };
  if (!tip || actual.goals_a === null || actual.goals_a === undefined) return { total: 0, breakdown: {} };

  const tA = Number(tip.goals_a);
  const tB = Number(tip.goals_b);
  const aA = Number(actual.goals_a);
  const aB = Number(actual.goals_b);

  const tipWinner = tA > tB ? "1" : tA < tB ? "2" : "0";
  const actualWinner = aA > aB ? "1" : aA < aB ? "2" : "0";

  if (tipWinner === actualWinner) points.winner = winnerPoints;
  if ((tA - tB) === (aA - aB)) points.diff = POINTS_CONFIG.MATCH_DIFF;
  if (tA === aA) points.goals_a = POINTS_CONFIG.MATCH_GOALS_SINGLE;
  if (tB === aB) points.goals_b = POINTS_CONFIG.MATCH_GOALS_SINGLE;
  if ((tA + tB) === (aA + aB)) points.sum = POINTS_CONFIG.MATCH_GOALS_SUM;

  if (tA === aA && tB === aB) {
    const totalGoals = aA + aB;
    if (totalGoals <= 3) points.exact_bonus = POINTS_CONFIG.BONUS_EXACT_LOW;
    else if (totalGoals <= 6) points.exact_bonus = POINTS_CONFIG.BONUS_EXACT_MID;
    else points.exact_bonus = POINTS_CONFIG.BONUS_EXACT_HIGH;
  }

  const total = Object.values(points).reduce((acc, val) => acc + val, 0);
  
  return { 
    total, 
    breakdown: {
      descr: `Tendenz: ${points.winner}, Diff: ${points.diff}, Tore: ${points.goals_a + points.goals_b}, Summe: ${points.sum}, Bonus: ${points.exact_bonus}`,
      tip: `${tA}:${tB}`, real: `${aA}:${aB}`, tip_a: tA, tip_b: tB, real_a: aA, real_b: aB,
      points_winner: points.winner, points_exact: points.exact_bonus, sum_points: total
    } 
  };
};

// --- HELPER: DYNAMISCHE TENDENZ-PUNKTE ---
export const getDynamicWinnerPoints = (rankA, rankB) => {
  const diff = rankA - rankB; 
  if (diff < -20) return 3; 
  if (diff > 20) return 5;   
  return 4; 
};

// ==========================================
// NEU: HIER IST DIE FUNKTION FÜR DIE MATCH-TIPPS
// ==========================================
export async function processStandardMatchTips(currentMatch, phaseId) {
  if (currentMatch.goals_a_real === null || currentMatch.goals_b_real === null) return;

  const mId = currentMatch.id;

  // 1. Alle Tipps für dieses Match UND die aktive Phase laden
  const { data: tips, error: tipsErr } = await supabase
    .from("tip")
    .select("*")
    .eq("match_id", mId)
    .eq("phase_id", phaseId);

  if (tipsErr || !tips || tips.length === 0) return;

  // 2. Basis-Punkte ermitteln (Unterstützt deine dynamische FIFA-Rang-Logik)
  let winnerPoints = 4; // Standardwert für KO
  if (currentMatch.stage === "group") {
    const { data: teams } = await supabase
      .from('teams')
      .select('name, fifa_rank')
      .in('name', [currentMatch.team_a, currentMatch.team_b]);

    const rankA = teams?.find(t => t.name === currentMatch.team_a)?.fifa_rank || 50;
    const rankB = teams?.find(t => t.name === currentMatch.team_b)?.fifa_rank || 50;
    winnerPoints = getDynamicWinnerPoints(rankA, rankB);
  }

  const pointsEntries = [];

  // 3. Jeden Tipp berechnen
  tips.forEach(tip => {
    const actualResults = {
      goals_a: currentMatch.goals_a_real,
      goals_b: currentMatch.goals_b_real
    };

    const { total, breakdown } = calculateDetailedMatchPoints(
      { goals_a: tip.goals_a, goals_b: tip.goals_b, winner: tip.winner },
      actualResults,
      winnerPoints
    );

    pointsEntries.push({
      player_id: tip.player_id,
      match_id: mId,
      match_order: currentMatch.match_order,
      category: "MATCH", // Exakt synchronisiert mit deiner alten DB-Struktur
      points_total: total,
      phase_id: phaseId,
      group_name: currentMatch.group_name || "KO",
      is_prognosis: false, 
      reference_team: "",  
      breakdown: {
        ...breakdown,
        info: `Spiel-Tipp: ${currentMatch.team_a} vs. ${currentMatch.team_b}`
      }
    });
  });

  // 4. Cleanup alter Einträge
  await supabase
    .from("user_points_detail")
    .delete()
    .eq("match_id", mId)
    .eq("phase_id", phaseId)
    .eq("is_prognosis", false);

  // 5. Per Upsert (oder Insert) speichern
  if (pointsEntries.length > 0) {
    await supabase.from("user_points_detail").insert(pointsEntries);
    console.log(`[ENGINE] ===== ${pointsEntries.length} Match-Tipps erfolgreich aktualisiert! =====`);
  }
}

// --- BERECHNUNG DER TURNIER-PFADE / PROGNOSEN ---
export async function processPrognosisPoints(allMatches, currentMatch, forcedGroupName = null) {
  if (currentMatch.goals_a_real === null || currentMatch.goals_b_real === null) {
    return;
  }

  const { id: mId, match_order: mOrder, stage, stage_order } = currentMatch;
  const activeGroupName = forcedGroupName || currentMatch.group_name;

  let realGroup = null;
  let realKO = null;

  if (stage === "group" || activeGroupName) {
    const { data: groupData, error: groupErr } = await supabase
      .from("real_group_state")
      .select("*")
      .eq("group_name", activeGroupName || "")
      .maybeSingle();

    if (groupErr) {
      console.error("[POINTS] Fehler bei real_group_state:", groupErr.message);
    } else {
      realGroup = groupData;
    }
  }

  if (stage === "ko") {
    const { data: koData, error: koErr } = await supabase
      .from("real_ko_state")
      .select("*")
      .eq("id", 1)
      .single();

    if (koErr) {
      console.error("[POINTS] Fehler bei real_ko_state:", koErr.message);
    } else {
      realKO = koData;
    }
  }

  if (stage === "group" && !realGroup) return;
  if (stage === "ko" && !realKO) return;

  const pointsEntries = [];

  // --- A. GRUPPEN-PUNKTE ---
  if (stage === "group" && realGroup) {
    const groupMatches = allMatches.filter(m => m.group_name === activeGroupName);
    const allMatchesPlayed = groupMatches.every(m => m.goals_a_real !== null && m.goals_b_real !== null);
    const isGroupReallyFinished = realGroup.is_finished || allMatchesPlayed;
         
    if (isGroupReallyFinished) {
      const lastMatchOfThisGroup = groupMatches.reduce((max, m) => m.match_order > max.match_order ? m : max, groupMatches[0]);

      if (mId === lastMatchOfThisGroup?.id) {
        const { data: userGroupProgs, error: uProgErr } = await supabase
          .from("user_prognosis_group")
          .select("*")
          .eq("group_name", activeGroupName);
        
        if (uProgErr) console.error("[PROG-DIAG] Fehler beim Laden von user_prognosis_group:", uProgErr.message);

        if (userGroupProgs) {
          const validProgs = userGroupProgs.filter(p => p.rank_1 && p.rank_2 && p.rank_3 && p.rank_4);

          validProgs.forEach(prog => {
            ['rank_1', 'rank_2', 'rank_3', 'rank_4'].forEach((rankKey) => {
              if (prog[rankKey] === realGroup[rankKey] && realGroup[rankKey] !== null) {
                pointsEntries.push(createPointEntry(prog.player_id, 'GROUP_RANK', POINTS_CONFIG.PROG_TABLE_POS, prog[rankKey], 1, activeGroupName, mId, mOrder));
              }
            });

            const userQualifiers = [...(prog.reached_ko || [])];
            const realQualifiers = [...(realGroup.reached_ko || [])];

            userQualifiers.forEach(team => {
              if (team && realQualifiers.includes(team)) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_REACH_16, team, 1, activeGroupName, mId, mOrder, { original: POINTS_CONFIG.PROG_REACH_16 }));
              }
            });

            const userDroppedOut = [...(prog.dropped_out || [])];
            if (realGroup.rank_4 && userDroppedOut.includes(realGroup.rank_4)) {
              pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_OUT_VORRUNDE, realGroup.rank_4, 1, activeGroupName, mId, mOrder, { original: POINTS_CONFIG.PROG_OUT_VORRUNDE }));
            }
          });
        }
      }
    }

    if (mOrder === 72) {
      const { data: allRealGroups, error: allGroupsErr } = await supabase.from("real_group_state").select("*");
      const { data: allUserProgs, error: allUserProgsErr } = await supabase.from("user_prognosis_group").select("*");

      if (!allGroupsErr && !allUserProgsErr && allRealGroups && allUserProgs) {
        allRealGroups.forEach(rg => {
          const groupThirdTeam = rg.rank_3;
          if (!groupThirdTeam) return;

          const realThirdsReachedKO = rg.reached_ko_best_thirds || [];
          const realDroppedOut = rg.dropped_out || [];
          const relevantProgs = allUserProgs.filter(p => p.group_name === rg.group_name);

          relevantProgs.forEach(prog => {
            if (realThirdsReachedKO.includes(groupThirdTeam)) {
              const userExpectedQualifiers = [...(prog.reached_ko || []), ...(prog.reached_ko_best_thirds || [])];
              if (userExpectedQualifiers.includes(groupThirdTeam)) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_REACH_16, groupThirdTeam, 1, rg.group_name, mId, mOrder, { original: POINTS_CONFIG.PROG_REACH_16 }));
              }
            }
            if (realDroppedOut.includes(groupThirdTeam) && groupThirdTeam !== rg.rank_4) {
              if (prog.dropped_out?.includes(groupThirdTeam)) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_OUT_VORRUNDE, groupThirdTeam, 1, rg.group_name, mId, mOrder, { original: POINTS_CONFIG.PROG_OUT_VORRUNDE }));
              }
            }
          });
        });
      }
    }
  }

  // --- B. KO-PHASEN PUNKTE ---
  if (stage === "ko" && currentMatch.winner_real !== 0 && realKO) {
    const { data: userKOProgs, error: koProgErr } = await supabase.from("user_prognosis_ko").select("*");
    
    if (koProgErr) {
      console.error("[PROG-DIAG] Fehler beim Laden von user_prognosis_ko:", koProgErr.message);
      return;
    }

    if (userKOProgs) {
      const validKOProgs = userKOProgs.filter(p => p.reached_16 || p.reached_8 || p.reached_4 || p.reached_2 || p.winner_final);
      
      const roundMapping = {
        1: { name: "Sechzehntelfinale", progKey: 'reached_8', pts: POINTS_CONFIG.PROG_REACH_8, dropKey: 'drop_out_16', dropPts: POINTS_CONFIG.PROG_OUT_16 },
        2: { name: "Achtelfinale", progKey: 'reached_4', pts: POINTS_CONFIG.PROG_REACH_4, dropKey: 'drop_out_8', dropPts: POINTS_CONFIG.PROG_OUT_8 },
        3: { name: "Viertelfinale", progKey: 'reached_2', pts: POINTS_CONFIG.PROG_REACH_2, dropKey: 'drop_out_4', dropPts: POINTS_CONFIG.PROG_OUT_4 },
        4: { name: "Halbfinale", isSemifinal: true, pts: POINTS_CONFIG.PROG_REACH_FINAL, dropKey: 'drop_out_2', dropPts: POINTS_CONFIG.PROG_OUT_2 }, 
        5: { name: "Finale / Platz 3", isFinalsRound: true }
      };

      const activeRound = roundMapping[stage_order];
      if (activeRound) {
        const realWinnerOfThisMatch = currentMatch.winner_real === 1 ? currentMatch.team_a : currentMatch.team_b;
        const realLoserOfThisMatch = currentMatch.winner_real === 1 ? currentMatch.team_b : currentMatch.team_a;

        validKOProgs.forEach(prog => {
          const divisor = POINTS_CONFIG.DIVISORS[prog.phase_id] || 1;
          
          if (!activeRound.isFinalsRound) {
            let isWinnerPredicted = false;
            if (activeRound.isSemifinal) {
              isWinnerPredicted = (prog.winner_final === realWinnerOfThisMatch || prog.loser_final === realWinnerOfThisMatch);
            } else {
              const progTeams = Array.isArray(prog[activeRound.progKey]) ? prog[activeRound.progKey] : [prog[activeRound.progKey]];
              isWinnerPredicted = progTeams.includes(realWinnerOfThisMatch);
            }

            if (isWinnerPredicted) {
              pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.pts / divisor, realWinnerOfThisMatch, prog.phase_id, "KO", mId, mOrder, { original: activeRound.pts, divisor, roundName: activeRound.name, isWinner: true }));
            }
            
            if (activeRound.dropKey) {
              const progDropped = Array.isArray(prog[activeRound.dropKey]) ? prog[activeRound.dropKey] : [prog[activeRound.dropKey]];
              if (progDropped.includes(realLoserOfThisMatch)) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.dropPts / divisor, realLoserOfThisMatch, prog.phase_id, "KO", mId, mOrder, { original: activeRound.dropPts, divisor, roundName: activeRound.name, isWinner: false }));
              }
            }
          } else {
            const isChampMatch = (mOrder === 79 || currentMatch.ko_order === 0);
            if (isChampMatch) {
              if (prog.winner_final && realKO.winner_final === prog.winner_final && prog.winner_final === realWinnerOfThisMatch) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_CHAMPION / divisor, prog.winner_final, prog.phase_id, "KO", mId, mOrder, { original: POINTS_CONFIG.PROG_CHAMPION, divisor }));
              }
              if (prog.loser_final && realKO.loser_final === prog.loser_final && prog.loser_final === realLoserOfThisMatch) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_VIZE / divisor, prog.loser_final, prog.phase_id, "KO", mId, mOrder, { original: POINTS_CONFIG.PROG_VIZE, divisor }));
              }
            } else {
              if (prog.winner_small_final && realKO.winner_small_final === prog.winner_small_final && prog.winner_small_final === realWinnerOfThisMatch) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_PLACE_3 / divisor, prog.winner_small_final, prog.phase_id, "KO", mId, mOrder, { original: POINTS_CONFIG.PROG_PLACE_3, divisor }));
              }
              if (prog.loser_small_final && realKO.loser_small_final === prog.loser_small_final && prog.loser_small_final === realLoserOfThisMatch) {
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_PLACE_4 / divisor, prog.loser_small_final, prog.phase_id, "KO", mId, mOrder, { original: POINTS_CONFIG.PROG_PLACE_4, divisor }));
              }
            }
          }
        });
      }
    }
  }

  // --- C. SPEICHERN & CLEANUP ---
  const uniquePointsMap = {};
  pointsEntries.forEach(entry => {
    const uniqueKey = `${entry.player_id}_${entry.category}_${entry.reference_team}_${entry.phase_id}`;
    uniquePointsMap[uniqueKey] = entry;
  });

  const finalPointsEntries = Object.values(uniquePointsMap);
  
  await supabase
    .from("user_points_detail")
    .delete()
    .eq("match_id", mId)
    .eq("is_prognosis", true);
  
  if (finalPointsEntries.length > 0) {
    const { error } = await supabase
      .from("user_points_detail")
      .upsert(finalPointsEntries, { 
        onConflict: "player_id,match_id,category,reference_team,phase_id" 
      });

    if (error) console.error("[PROG-DIAG] Upsert-Fehler:", error.message);
    else console.log(`[PROG-DIAG] ===== ${finalPointsEntries.length} Prognosen erfolgreich aktualisiert! =====`);
  }
}

// --- ENGINE INNER HELPER: BAUEN DER DB-RECORDS ---
function createPointEntry(playerId, category, points, team, phase, groupName, matchId, matchOrder, extra = {}) {
  let typeLabel = category === "GROUP_RANK" ? "Tabellenplatz" : "Turnier-Pfad";
  let detailDesc = `Erfolgreiche Prognose in Phase ${phase}`;

  if (category === "GROUP_RANK") {
    detailDesc = `Richtige Gruppenplatzierung von ${team} in Phase ${phase}`;
  } else if (category === "PROGNOSIS_PATH") {
    const originalPoints = extra.original || points;
    const decimal = Math.round((originalPoints * 10) % 10); 

    if (decimal === 1) {
      if (originalPoints >= 20) detailDesc = `${team} erreicht das Finale`;
      else if (originalPoints >= 16) detailDesc = `${team} erreicht das Sechzehntelfinale`; 
      else if (originalPoints >= 8) detailDesc = `${team} erreicht das Achtelfinale`;
      else if (originalPoints >= 4) detailDesc = `${team} erreicht das Viertelfinale`;
      else if (originalPoints >= 2) detailDesc = `${team} erreicht das Halbfinale`;
    } else if (decimal === 2) {
      detailDesc = `${team} scheidet korrekterweise aus`;
    } else if (decimal === 3) {
      if (originalPoints === POINTS_CONFIG.PROG_CHAMPION) detailDesc = `${team} ist Turniersieger 🎉`;
      else if (originalPoints === POINTS_CONFIG.PROG_VIZE) detailDesc = `${team} ist Vize-Meister`;
      else if (originalPoints === POINTS_CONFIG.PROG_PLACE_3) detailDesc = `${team} holt Platz 3`;
      else if (originalPoints === POINTS_CONFIG.PROG_PLACE_4) detailDesc = `${team} beendet das Turnier auf Platz 4`;
    }
  }

  return {
    player_id: playerId, 
    category, 
    points_total: points, 
    reference_team: team, 
    phase_id: phase, 
    group_name: groupName || "KO", 
    is_prognosis: true,
    match_id: matchId, 
    match_order: matchOrder, 
    breakdown: { 
      info: `${typeLabel}: ${team}`, 
      descr: detailDesc, 
      team, 
      originalPoints: extra.original || points, 
      divisor: extra.divisor || 1 
    }
  };
}