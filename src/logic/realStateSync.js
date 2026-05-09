import { supabase } from "../supabaseClient";
import { calculateFIFADataTable } from "./tournamentLogic";
import { getBestThirds } from "../Utils/calcTable";

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

  // 2. GRUPPEN-UPDATE (Falls ein Gruppenspiel gespeichert wurde)
  if (groupName) {
    const groupMatches = matches.filter(m => m.group_name === groupName);
    const table = calculateFIFADataTable(groupMatches, realTips);
    
    // Prüfen, ob Gruppe fertig (z.B. 6 Spiele bei 4 Teams)
    const finishedMatchesCount = groupMatches.filter(m => m.goals_a_real !== null).length;
    // Dynamische Prüfung: Eine Gruppe ist fertig, wenn alle ihre Spiele Ergebnisse haben
    const isFinished = finishedMatchesCount > 0 && finishedMatchesCount === groupMatches.length;

    const record = {
      group_name: groupName,
      rank_1: isFinished ? (table[0]?.team || null) : null,
      rank_2: isFinished ? (table[1]?.team || null) : null,
      rank_3: isFinished ? (table[2]?.team || null) : null,
      rank_4: isFinished ? (table[3]?.team || null) : null,
      reached_ko: isFinished ? table.slice(0, 2).map(t => t.team) : [], 
      dropped_out: isFinished && table[3] ? [table[3].team] : [],
      is_finished: isFinished
    };

    await supabase.from("real_group_state").upsert(record);
  }

  // 3. BEST THIRDS & KO-TEAMS
  const allGroups = [...new Set(matches.filter(m => m.stage === "group").map(m => m.group_name))];
  const allTables = allGroups.map(name => ({
    id: name,
    teams: calculateFIFADataTable(matches.filter(m => m.group_name === name), realTips)
  }));

  // Beste Gruppendritte nur berechnen, wenn die Gruppenphasen auch beendet sind
  const bestThirdsReal = getBestThirds(allTables).slice(0, 8).map(t => t.team);

  // 4. KO-PHASEN UPDATE
  const koMatches = matches.filter(m => m.stage === "ko");
  
  // HILFSFUNKTION: Nur Teams aufnehmen, die durch ein beendetes Spiel feststehen
  const getTeamsByStage = (stageOrder) => {
    const stageMatches = koMatches.filter(m => m.stage_order === stageOrder);
    const teams = [];
    stageMatches.forEach(m => {
      // Ein Team ist für diese Runde qualifiziert, wenn das VORGÄNGERSPIEL beendet wurde
      // ODER (für die erste KO-Runde) wenn die Gruppenphase beendet ist.
      // Wir prüfen hier: Hat das aktuelle Match der Runde bereits gesetzte Teams?
      if (m.team_a && !m.team_a.includes("Placeholder")) teams.push(m.team_a);
      if (m.team_b && !m.team_b.includes("Placeholder")) teams.push(m.team_b);
    });
    return [...new Set(teams)];
  };

  const getLoserByStage = (stageOrder) => {
    return koMatches
      .filter(m => m.stage_order === stageOrder && m.winner_real !== 0 && m.winner_real !== null)
      .map(m => m.winner_real === 1 ? m.team_b : m.team_a);
  };

  // Finaler Sieger Check
  const finalMatch = koMatches.find(m => m.stage_order === 5);
  let winnerFinal = null;
  if (finalMatch && finalMatch.winner_real) {
    winnerFinal = finalMatch.winner_real === 1 ? finalMatch.team_a : finalMatch.team_b;
  }

  const realKOUpdate = {
    id: 1,
    reached_16: getTeamsByStage(1),
    reached_8:  getTeamsByStage(2),
    reached_4:  getTeamsByStage(3),
    reached_2:  getTeamsByStage(4),
    winner_final: winnerFinal,
    drop_out_16: getLoserByStage(1),
    drop_out_8:  getLoserByStage(2),
    drop_out_4:  getLoserByStage(3),
    drop_out_2:  getLoserByStage(4)
  };

  await supabase.from("real_ko_state").upsert(realKOUpdate);
}