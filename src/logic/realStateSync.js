import { supabase } from "../supabaseClient";
import { calculateFIFADataTable } from "./tournamentLogic";
import { getBestThirds } from "../Utils/calcTable";
import { resolveSlot } from "./koLogic"; 
import { processPrognosisPoints } from "./pointsEngine";

/**
 * Kernfunktion: Synchronisiert den realen Turnierverlauf in die DB
 * Berücksichtigt jetzt vollautomatisch die manuellen Admin-Ranks!
 */
export async function syncRealTournamentState(matches, groupName = null) {
  // 0. MANUELLE RANKS AUS DB HOLEN (Damit die Sync-Engine nicht mehr blind ist!)
  const { data: rankData } = await supabase.from("real_manual_rank").select("*");
  const manualRanks = {};
  rankData?.forEach((r) => (manualRanks[r.team_name] = r.manual_rank));

  // 1. REAL RESULTS MAP ERSTELLEN
  const realTips = {};
  matches.forEach(m => {
    realTips[m.id] = { 
      goals_a: m.goals_a_real, 
      goals_b: m.goals_b_real, 
      winner: m.winner_real 
    };
  });

  // 2. BASIS-DATEN FÜR ALLE GRUPPEN BERECHNEN (Jetzt MIT manualRanks!)
  const allGroups = [...new Set(matches.filter(m => m.stage === "group").map(m => m.group_name))];
  const allTables = allGroups.map(name => ({
    id: name,
    teams: calculateFIFADataTable(matches.filter(m => m.group_name === name), realTips, manualRanks)
  }));

  // FILTER FÜR FERTIGE GRUPPEN
  const finishedGroups = allGroups.filter(gName => {
    const groupMatches = matches.filter(m => m.group_name === gName);
    return groupMatches.length > 0 && groupMatches.every(m => m.goals_a_real !== null);
  });

  // BEST THIRDS & POOL VORBEREITUNG (Jetzt MIT manualRanks!)
  const allThirdsSorted = getBestThirds(allTables, manualRanks);
  
  const best8ThirdsReal = allThirdsSorted.slice(0, 8).map(t => ({
    team: t.team,
    group: t.group 
  }));

  const worst4ThirdsReal = allThirdsSorted.slice(8, 12).map(t => t.team);

  // ==========================================================================
  // KO-MATCH LABELS ZUERST AUFLÖSEN & ALS BASIS NUTZEN (manualRanks mitgeben)
  // ==========================================================================
  const updatedLocalMatches = await updateKOMatchLabels(matches, allTables, best8ThirdsReal, realTips, manualRanks);

  // KORREKTUR FÜR finalReached16
  const top24Real = allTables
    .filter(t => finishedGroups.includes(t.id)) 
    .flatMap(t => t.teams.slice(0, 2).map(teamObj => teamObj.team));

  // Gruppendritte erst hinzufügen, wenn ALLE Gruppenspiele des Turniers fertig sind
  const allGroupGamesFinished = updatedLocalMatches
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

  // ==========================================
  // 5. KO-PHASEN UPDATE
  // ==========================================
  const koMatches = updatedLocalMatches.filter(m => m.stage === "ko");
  
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
      .filter(m => m.stage_order === stageOrder && m.match_order !== 103)
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

  const finalMatch = koMatches.find(m => m.match_order === 104);
  const thirdPlaceMatch = koMatches.find(m => m.match_order === 103);

  let winnerFinal = null;
  let loserFinal = null;
  if (finalMatch && finalMatch.winner_real) {
    winnerFinal = finalMatch.winner_real === 1 ? finalMatch.team_a : finalMatch.team_b;
    loserFinal = finalMatch.winner_real === 1 ? finalMatch.team_b : finalMatch.team_a;
  }

  let winnerSmallFinal = null;
  let loserSmallFinal = null;
  if (thirdPlaceMatch && thirdPlaceMatch.winner_real) {
    winnerSmallFinal = thirdPlaceMatch.winner_real === 1 ? thirdPlaceMatch.team_a : thirdPlaceMatch.team_b;
    loserSmallFinal = thirdPlaceMatch.winner_real === 1 ? thirdPlaceMatch.team_b : thirdPlaceMatch.team_a;
  }

  const realKOUpdate = {
    id: 1,
    reached_16: finalReached16, 
    reached_8:  getTeamsWhoReachedStage(2),
    reached_4:  getTeamsWhoReachedStage(3),
    reached_2:  getTeamsWhoReachedStage(4), 
    winner_final: winnerFinal,
    loser_final: loserFinal,
    winner_small_final: winnerSmallFinal,
    loser_small_final: loserSmallFinal,
    drop_out_16: getLoserByStage(1),
    drop_out_8:  getLoserByStage(2),
    drop_out_4:  getLoserByStage(3),
    drop_out_2:  getLoserByStage(4) 
  };

  await supabase.from("real_ko_state").upsert(realKOUpdate);

  if (allGroupGamesFinished) {
    const anchorMatch = matches.find(m => m.match_order === 72);
    if (anchorMatch) {
      for (const groupName of allGroups) {
        await processPrognosisPoints(matches, anchorMatch, groupName, true);
      }
    }
  }
}

async function updateKOMatchLabels(matches, allTables, best8ThirdsReal, realTips, manualRanks) {
  const allGroupMatches = matches.filter(m => m.stage === "group");
  const finishedGroupMatchesCount = allGroupMatches.filter(m => m.goals_a_real !== null).length;

  if (finishedGroupMatchesCount === 0) return matches;

  const groupResults = {};
  allTables.forEach(t => {
    const groupMatches = matches.filter(m => m.group_name === t.id);
    const isFinished = groupMatches.length > 0 && groupMatches.every(m => m.goals_a_real !== null);
    groupResults[t.id] = isFinished ? t.teams.map(teamObj => teamObj.team) : null;
  });

  // WICHTIG: manualRanks wird hier in den Context übergeben
  const tournamentContext = { groups: groupResults, thirdPlaces: best8ThirdsReal, tips: realTips, phaseId: 1, manualRanks };
  let localMatches = [...matches];
  const koMatches = localMatches
    .filter(m => m.stage === "ko")
    .sort((a, b) => a.stage_order - b.stage_order || a.match_order - b.match_order);

  // --- BERECHNUNG RECHNET JETZT IMMER DOWNSTREAM FRECH VON DEN UR-PLATZHALTER-SLOTS ---
  for (const m of koMatches) {
    let newTeamA = m.placeholder_a;
    let newTeamB = m.placeholder_b;

    if (m.stage_order === 1) {
      // 16tel-Finale: Nutzt direkt die Platzhalter-Regel (z.B. "E1", "1E") zur Live-Auflösung
      newTeamA = resolveSlot(m.placeholder_a, { ...tournamentContext, matches: localMatches }) || m.placeholder_a;
      newTeamB = resolveSlot(m.placeholder_b, { ...tournamentContext, matches: localMatches }) || m.placeholder_b;
    } else {
      // Höhere Runden: Ziehen sich die Teams aus den vorherigen Runden
      const getTeamFromPreviousStage = (placeholder) => {
        if (!placeholder) return null;
        const matchInfo = placeholder.match(/^([A-Z]+)(\d+)$/i);
        if (!matchInfo) return null;

        const offset = (matchInfo[1] === "SSZF" ? 72 : matchInfo[1] === "SAF" ? 88 : matchInfo[1] === "SVF" ? 96 : 100);
        const targetOrder = parseInt(matchInfo[2], 10) + offset;
        
        const sourceMatch = localMatches.find(x => parseInt(x.match_order) === targetOrder);
        
        if (sourceMatch && sourceMatch.winner_real) {
          const winner = (sourceMatch.winner_real === 1) ? sourceMatch.team_a : sourceMatch.team_b;
          const loser = (sourceMatch.winner_real === 1) ? sourceMatch.team_b : sourceMatch.team_a;
          
          return (matchInfo[1] === "SHF") ? winner : (matchInfo[1] === "VHF") ? loser : winner;
        }
        return null;
      };

      newTeamA = getTeamFromPreviousStage(m.placeholder_a) || m.placeholder_a;
      newTeamB = getTeamFromPreviousStage(m.placeholder_b) || m.placeholder_b;
    }

    const idx = localMatches.findIndex(lm => lm.id === m.id);
    localMatches[idx] = { ...localMatches[idx], team_a: newTeamA, team_b: newTeamB };
  }

  // --- PHASE 2: NUR BEI ÄNDERUNGEN IN DIE DB PUSHEN ---
  for (const m of localMatches.filter(m => m.stage === "ko")) {
    const originalMatch = matches.find(orig => orig.id === m.id);
    if (m.team_a !== originalMatch.team_a || m.team_b !== originalMatch.team_b) {
      await supabase.from("match").update({ team_a: m.team_a, team_b: m.team_b }).eq("id", m.id);
    }
  }

  return localMatches; 
}

export function isPlaceholder(str) {
  if (!str) return false;
  if (str.includes("Placeholder")) return true;
  const placeholderRegex = /^(SSZF|SAF|SVF|VHF|SHF|Winner|Loser|[A-L][1-4]|[1-4][A-L])\d*$/i;
  return placeholderRegex.test(str);
}