import { supabase } from "../supabaseClient";
import { calculateFIFADataTable } from "./tournamentLogic";
import { getBestThirds } from "../Utils/calcTable";
import { resolveSlot } from "./koLogic"; 

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

  // 3. BEST THIRDS & 32 QUALIFIER POOL BERECHNUNG
  const allThirdsSorted = getBestThirds(allTables);
  
  // WICHTIG: Wir speichern hier Objekte mit team UND group für den Mapper
  const best8ThirdsReal = allThirdsSorted.slice(0, 8).map(t => ({
    team: t.team,
    group: t.group 
  }));

  const worst4ThirdsReal = allThirdsSorted.slice(8, 12).map(t => t.team);
  const top24Real = allTables.flatMap(t => t.teams.slice(0, 2).map(teamObj => teamObj.team));
  
  // Für die statistische Übersicht (nur Namen)
  const finalReached16 = [...top24Real, ...best8ThirdsReal.map(t => t.team)].filter(name => name && !name.includes("Placeholder"));

  // 4. GRUPPEN-STATES AKTUALISIEREN
  for (const groupData of allTables) {
    const gName = groupData.id;
    const table = groupData.teams;
    const groupMatches = matches.filter(m => m.group_name === gName);
    
    const finishedMatchesCount = groupMatches.filter(m => m.goals_a_real !== null).length;
    const isFinished = finishedMatchesCount > 0 && finishedMatchesCount === groupMatches.length;

    if (isFinished) {
      const groupFourth = table[3]?.team;
      const groupThird = table[2]?.team;
      const finalDroppedOut = [];
      if (groupFourth) finalDroppedOut.push(groupFourth);
      if (groupThird && worst4ThirdsReal.includes(groupThird)) {
        finalDroppedOut.push(groupThird);
      }

      const record = {
        group_name: gName,
        rank_1: table[0]?.team || null,
        rank_2: table[1]?.team || null,
        rank_3: table[2]?.team || null,
        rank_4: table[3]?.team || null,
        reached_ko: table.slice(0, 2).map(t => t.team), 
        dropped_out: finalDroppedOut,
        is_finished: true
      };
      await supabase.from("real_group_state").upsert(record);
    }
  }

  // 5. KO-PHASEN UPDATE
  const koMatches = matches.filter(m => m.stage === "ko");
  
  const getTeamsByStage = (stageOrder) => {
    const stageMatches = koMatches.filter(m => m.stage_order === stageOrder);
    const teams = [];
    stageMatches.forEach(m => {
      if (m.team_a && !isPlaceholder(m.team_a)) teams.push(m.team_a);
      if (m.team_b && !isPlaceholder(m.team_b)) teams.push(m.team_b);
    });
    return [...new Set(teams)];
  };

  const getLoserByStage = (stageOrder) => {
    return koMatches
      .filter(m => m.stage_order === stageOrder && m.winner_real !== 0 && m.winner_real !== null)
      .map(m => m.winner_real === 1 ? m.team_b : m.team_a);
  };

  const finalMatch = koMatches.find(m => m.stage_order === 5);
  let winnerFinal = null;
  if (finalMatch && finalMatch.winner_real) {
    winnerFinal = finalMatch.winner_real === 1 ? finalMatch.team_a : finalMatch.team_b;
  }

  const realKOUpdate = {
    id: 1,
    reached_16: finalReached16, 
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

  // --- KO-MATCH TEAMS IN DER 'MATCH' TABELLE AKTUALISIEREN ---
  await updateKOMatchLabels(matches, allTables, best8ThirdsReal, realTips);
}

/**
 * Hilfsfunktion zum Updaten der Teamnamen in der match-Tabelle
 */
async function updateKOMatchLabels(matches, allTables, best8ThirdsReal, realTips) {
  const groupResults = {};
  allTables.forEach(t => {
    groupResults[t.id] = t.teams.map(teamObj => teamObj.team);
  });

  const tournamentContext = {
    groups: groupResults,
    thirdPlaces: best8ThirdsReal, // Hier sind jetzt {team, group} Objekte drin
    tips: realTips,
    phaseId: 1
  };

  const koMatches = matches.filter(m => m.stage === "ko");

  for (const m of koMatches) {
    // Falls kein expliziter Placeholder gespeichert ist, nutzen wir den aktuellen Wert
    const currentA = m.placeholder_a || m.team_a;
    const currentB = m.placeholder_b || m.team_b;

    const newTeamA = resolveSlot(currentA, tournamentContext);
    const newTeamB = resolveSlot(currentB, tournamentContext);

    // Update nur wenn sich wirklich etwas geändert hat (verhindert unnötige DB-Calls)
    if (newTeamA !== m.team_a || newTeamB !== m.team_b) {
      await supabase
        .from("match")
        .update({ team_a: newTeamA, team_b: newTeamB })
        .eq("id", m.id);
    }
  }
}

/**
 * Hilfsfunktion um zu prüfen, ob ein String ein Platzhalter ist
 */
function isPlaceholder(str) {
  if (!str) return false;
  if (str.includes("Placeholder")) return true;
  // Erkennt A1, 1A, Winner, Loser UND die langen FIFA-Codes (z.B. ABCDF3)
  const placeholderRegex = /^([A-L][1-4]|[1-4][A-L]|Winner|Loser|1[A-L]|2[A-L]|3[A-L]|[A-L]{3,}\d?)/i;
  return placeholderRegex.test(str);
}