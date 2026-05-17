import { supabase } from "../supabaseClient";
import { calculateFIFADataTable } from "./tournamentLogic";
import { getBestThirds } from "../Utils/calcTable";
import { resolveSlot } from "./koLogic"; 
import { processPrognosisPoints } from "./pointsEngine";

/**
 * Kernfunktion: Synchronisiert den realen Turnierverlauf in die DB
 */
export async function syncRealTournamentState(matches, groupName = null) {
  // 1. REAL RESULTS MAP ERSTELLEN
  const realTips = {};
  matches.forEach(m => {
    realTips[m.id] = { 
      goals_a: m.goals_a_real, 
      goals_b: m.goals_b_real, 
      winner: m.winner_real 
    };
  });

  // 2. BASIS-DATEN FÜR ALLE GRUPPEN BERECHNEN
  const allGroups = [...new Set(matches.filter(m => m.stage === "group").map(m => m.group_name))];
  const allTables = allGroups.map(name => ({
    id: name,
    teams: calculateFIFADataTable(matches.filter(m => m.group_name === name), realTips)
  }));

  // FILTER FÜR FERTIGE GRUPPEN
  const finishedGroups = allGroups.filter(gName => {
    const groupMatches = matches.filter(m => m.group_name === gName);
    return groupMatches.length > 0 && groupMatches.every(m => m.goals_a_real !== null);
  });

  // 3. BEST THIRDS & 32 QUALIFIER POOL BERECHNUNG
  const allThirdsSorted = getBestThirds(allTables);
  
  const best8ThirdsReal = allThirdsSorted.slice(0, 8).map(t => ({
    team: t.team,
    group: t.group 
  }));

  const worst4ThirdsReal = allThirdsSorted.slice(8, 12).map(t => t.team);

  // KORREKTUR FÜR finalReached16
  const top24Real = allTables
    .filter(t => finishedGroups.includes(t.id)) 
    .flatMap(t => t.teams.slice(0, 2).map(teamObj => teamObj.team));

  // Gruppendritte erst hinzufügen, wenn ALLE Gruppenspiele des Turniers fertig sind
  const allGroupGamesFinished = matches
    .filter(m => m.stage === "group")
    .every(m => m.goals_a_real !== null);

  const finalReached16 = [
    ...top24Real, 
    ...(allGroupGamesFinished ? best8ThirdsReal.map(t => t.team) : [])
  ].filter(name => name && !isPlaceholder(name));

  // 4. GRUPPEN-STATES AKTUALISIEREN
  for (const groupData of allTables) {
    const gName = groupData.id;
    const table = groupData.teams;
    const isFinished = finishedGroups.includes(gName);

    if (isFinished) {
      const groupFourth = table[3]?.team;
      const groupThird = table[2]?.team;
      const finalDroppedOut = [];
      
      if (groupFourth) finalDroppedOut.push(groupFourth);
      
      const isBestThird = best8ThirdsReal.some(bt => bt.team === groupThird);
      const groupBestThirdsForDB = isBestThird ? [groupThird] : [];

      // Wenn das gesamte Gruppen-Turnier vorbei ist, wissen wir sicher, welche 3. ausscheiden
      if (allGroupGamesFinished && groupThird && worst4ThirdsReal.includes(groupThird)) {
        finalDroppedOut.push(groupThird);
      }

      const record = {
        group_name: gName,
        rank_1: table[0]?.team || null,
        rank_2: table[1]?.team || null,
        rank_3: table[2]?.team || null,
        rank_4: table[3]?.team || null,
        reached_ko: table.slice(0, 2).map(t => t.team),
        reached_ko_best_thirds: groupBestThirdsForDB, 
        dropped_out: finalDroppedOut,
        is_finished: true
      };
      await supabase.from("real_group_state").upsert(record);
    } else {
      await supabase.from("real_group_state").upsert({
        group_name: gName,
        rank_1: null,
        rank_2: null,
        rank_3: null,
        rank_4: null,
        reached_ko: [],
        reached_ko_best_thirds: [],
        dropped_out: [],
        is_finished: false
      });
    }
  }

  // 5. KO-PHASEN UPDATE
  const koMatches = matches.filter(m => m.stage === "ko");
  
  const getTeamsWhoReachedStage = (targetStageOrder) => {
    if (targetStageOrder === 1) return finalReached16; 

    const previousStageOrder = targetStageOrder - 1;
    return koMatches
      .filter(m => m.stage_order === previousStageOrder && m.winner_real !== 0 && m.winner_real !== null)
      .map(m => (m.winner_real === 1 ? m.team_a : m.team_b))
      .filter(name => name && !isPlaceholder(name));
  };

  const getLoserByStage = (stageOrder) => {
    return koMatches
      .filter(m => m.stage_order === stageOrder)
      .map(m => {
        const win = getWinnerForSync(m); 
        if (!win) return null;
        return win === 1 ? m.team_b : m.team_a;
      })
      .filter(name => name && !isPlaceholder(name));
  };

  function getWinnerForSync(m) {
    if (m.goals_a_real > m.goals_b_real) return 1;
    if (m.goals_a_real < m.goals_b_real) return 2;
    if (m.goals_a_real === m.goals_b_real && m.goals_a_real !== null) {
      return m.winner_real; 
    }
    return null;
  }

  const finalMatch = koMatches.find(m => m.stage_order === 5);
  let winnerFinal = null;
  if (finalMatch && finalMatch.winner_real) {
    winnerFinal = finalMatch.winner_real === 1 ? finalMatch.team_a : finalMatch.team_b;
  }

  const realKOUpdate = {
    id: 1,
    reached_16: finalReached16, 
    reached_8:  getTeamsWhoReachedStage(2),
    reached_4:  getTeamsWhoReachedStage(3),
    reached_2:  getTeamsWhoReachedStage(4),
    winner_final: winnerFinal,
    drop_out_16: getLoserByStage(1),
    drop_out_8:  getLoserByStage(2),
    drop_out_4:  getLoserByStage(3),
    drop_out_2:  getLoserByStage(4)
  };

  await supabase.from("real_ko_state").upsert(realKOUpdate);

  // KO-MATCH TEAMS IN DER 'MATCH' TABELLE AKTUALISIEREN
  await updateKOMatchLabels(matches, allTables, best8ThirdsReal, realTips);

  // --- FINALER LOOP FÜR PUNKTE (SPIEL 72 ANKER) ---
  if (allGroupGamesFinished) {
    const anchorMatch = matches.find(m => m.match_order === 72);
    
    if (anchorMatch) {
      // Lösche vor dem Gruppendritten-Loop gezielt nur die Einträge, die direkt an Spiel 72 hängen
      await supabase.from("user_points_detail")
        .delete()
        .eq("match_id", anchorMatch.id)
        .eq("is_prognosis", true);

      // Loop über alle Gruppen, um ausschließlich die Gruppendritten auszuwerten
      for (const groupName of allGroups) {
        // Parameter 'isFinalThirdsLoop' wird auf true gesetzt
        await processPrognosisPoints(matches, anchorMatch, groupName, true);
      }
    }
  }
}

/**
 * Hilfsfunktion zum Updaten der Teamnamen in der match-Tabelle
 */
async function updateKOMatchLabels(matches, allTables, best8ThirdsReal, realTips) {
  const groupResults = {};
  
  allTables.forEach(t => {
    const groupMatches = matches.filter(m => m.group_name === t.id);
    const isFinished = groupMatches.length > 0 && groupMatches.every(m => m.goals_a_real !== null);
    groupResults[t.id] = isFinished ? t.teams.map(teamObj => teamObj.team) : null;
  });

  const tournamentContext = {
    groups: groupResults,
    thirdPlaces: best8ThirdsReal,
    tips: realTips,
    phaseId: 1
  };

  const koMatches = matches
    .filter(m => m.stage === "ko")
    .sort((a, b) => a.stage_order - b.stage_order);

  let localMatches = [...matches];

  for (const m of koMatches) {
    const slotA = m.placeholder_a; 
    const slotB = m.placeholder_b;

    let newTeamA = resolveSlot(slotA, { ...tournamentContext, matches: localMatches }) || slotA;
    let newTeamB = resolveSlot(slotB, { ...tournamentContext, matches: localMatches }) || slotB;

    if (newTeamA !== m.team_a || newTeamB !== m.team_b) {
      await supabase
        .from("match")
        .update({ 
          team_a: newTeamA, 
          team_b: newTeamB,
          goals_a_real: isPlaceholder(newTeamA) ? null : m.goals_a_real,
          goals_b_real: isPlaceholder(newTeamB) ? null : m.goals_b_real,
          winner_real: (isPlaceholder(newTeamA) || isPlaceholder(newTeamB)) ? null : m.winner_real
        })
        .eq("id", m.id);

      localMatches = localMatches.map(lm => 
        lm.id === m.id ? { ...lm, team_a: newTeamA, team_b: newTeamB } : lm
      );
    }
  }
}

export function isPlaceholder(str) {
  if (!str) return false;
  if (str.includes("Placeholder")) return true;
  const placeholderRegex = /^([A-L][1-4]|[1-4][A-L]|Winner|Loser|1[A-L]|2[A-L]|3[A-L]|SSZF\d+)/i;
  return placeholderRegex.test(str);
}