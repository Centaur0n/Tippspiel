import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { calculateFIFADataTable } from "../logic/tournamentLogic"; // Nutze FIFA Logik wie in TippsPage
import { getTopPosition, resolveSlot, getTeamFromPrevious } from "../logic/koLogic";
import { getBestThirds } from "../Utils/calcTable";
import { calculateDetailedMatchPoints, getDynamicWinnerPoints } from "../logic/pointsEngine";
import { syncRealTournamentState } from "../logic/realStateSync";
import { processPrognosisPoints } from "../logic/pointsEngine";

// Komponenten
import GroupTable from './GroupTable';
import KOBracket from './KOBracket';
import BestThirdsTable from './BestThirdsTable';

const KO_STRUCTURE = {
  round16: [
    ["E1", "1E"], ["I1", "1I"], ["F1", "C2"], ["B2", "A2"],
    ["K2", "L2"], ["H1", "J2"], ["D1", "1D"], ["G1", "1G"],
    ["C1", "F2"], ["E2", "I2"], ["A1", "1A"], ["L1", "1L"],
    ["J1", "H2"], ["D2", "G2"], ["B1", "1B"], ["K1", "1K"]
  ],
};

const ROUND_NAMES = { 1: "Sechzehntelfinale", 2: "Achtelfinale", 3: "Viertelfinale", 4: "Halbfinale", 5: "Finale" };
const TREE_HEIGHT = 2000;

function AdminResultsPage({ phaseId, onUpdate }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [manualRanks, setManualRanks] = useState({}); 
  const groupRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [phaseId]);

  async function fetchData() {
    setLoading(true);
    await Promise.all([fetchMatches(), fetchManualRanks()]);
    setLoading(false);
  }

  async function fetchMatches() {
    const { data } = await supabase.from("match").select("*").order("match_order", { ascending: true });
    setMatches(data || []);
  }

  async function fetchManualRanks() {
    const { data } = await supabase.from("real_manual_rank").select("*");
    const rankMap = {};
    data?.forEach((r) => (rankMap[r.team_name] = r.manual_rank));
    setManualRanks(rankMap);
  }

  // --- MANUELLER RANG SPEICHERN ---
  async function saveAdminManualRank(teamName, rank) {
    const val = rank === "" ? null : Number(rank);
    const { error } = await supabase
      .from("real_manual_rank")
      .upsert([{ team_name: teamName, manual_rank: val }], { onConflict: 'team_name' });

    if (error) return console.error("Admin Rank Error:", error.message);
    
    setManualRanks(prev => ({ ...prev, [teamName]: val }));
    // Wir triggern sync & prognosis neu, falls ein Rang den Aufstieg ändert
    const { data: allMatches } = await supabase.from("match").select("*").order("match_order");
    const lastGroupMatch = allMatches.filter(m => m.stage === "group").pop();
    await syncRealTournamentState(allMatches, lastGroupMatch.group_name);
    await processPrognosisPoints(allMatches, lastGroupMatch);
    
    if (onUpdate) onUpdate();
    fetchMatches(); 
  }

  // --- RESET DER RÄNGE BEI SPIELÄNDERUNG ---
  async function resetManualRanksForGroup(groupName) {
    const groupMatches = matches.filter(m => m.group_name === groupName);
    const teamsInGroup = [...new Set(groupMatches.flatMap(m => [m.team_a, m.team_b]))];
    
    const { error } = await supabase
      .from("real_manual_rank")
      .delete()
      .in("team_name", teamsInGroup);

    if (!error) {
      setManualRanks(prev => {
        const newRanks = { ...prev };
        teamsInGroup.forEach(t => delete newRanks[t]);
        return newRanks;
      });
    }
  }

  async function fetchWinnerPoints(teamA, teamB) {
    const { data: teams } = await supabase
      .from('teams')
      .select('name, fifa_rank')
      .in('name', [teamA, teamB]);

    if (!teams || teams.length < 2) return 4;
    const rankA = teams.find(t => t.name === teamA)?.fifa_rank || 50;
    const rankB = teams.find(t => t.name === teamB)?.fifa_rank || 50;
    return getDynamicWinnerPoints(rankA, rankB);
  }

  // --- REALES ERGEBNIS SPEICHERN ---
  async function saveRealResult(matchId, goalsA, goalsB, winner) {
    if (goalsA === "" || goalsB === "") return;

    const gA = Number(goalsA);
    const gB = Number(goalsB);
    
    let finalWinner = 0;
    if (gA > gB) finalWinner = 1;
    else if (gB > gA) finalWinner = 2;
    if (gA === gB && winner) finalWinner = Number(winner);

    const currentMatchBefore = matches.find(m => m.id === matchId);

    // Sicherheits-Reset: Wenn Gruppenspiel, lösche manuelle Ränge dieser Gruppe
    if (currentMatchBefore?.stage === "group") {
      await resetManualRanksForGroup(currentMatchBefore.group_name);
    }

    const { error: matchError } = await supabase
      .from("match")
      .update({ goals_a_real: gA, goals_b_real: gB, winner_real: finalWinner })
      .eq("id", matchId);
      
    if (matchError) return console.error("Match Update Error:", matchError.message);

    const { data: allMatches } = await supabase.from("match").select("*").order("match_order");
    const currentMatch = allMatches.find(m => m.id === matchId);

    await syncRealTournamentState(allMatches, currentMatch.group_name);

    const winnerPoints = await fetchWinnerPoints(currentMatch.team_a, currentMatch.team_b);
    const { data: allTips } = await supabase.from("tip").select("*").eq("match_id", matchId);

    await supabase.from("user_points_detail").delete().eq("match_id", matchId).eq("is_prognosis", false);

    if (allTips && allTips.length > 0) {
      const pointsToInsert = allTips.map(t => {
        const result = calculateDetailedMatchPoints(
          { goals_a: t.goals_a, goals_b: t.goals_b, winner: t.winner },
          { goals_a: gA, goals_b: gB, winner: finalWinner },
          winnerPoints
        );

        return {
          player_id: t.player_id,
          match_id: matchId,
          match_order: currentMatch.match_order,
          phase_id: t.phase_id, 
          group_name: currentMatch.group_name || "KO",
          points_total: result.total,
          breakdown: result.breakdown,
          category: 'MATCH',
          is_prognosis: false
        };
      });
      await supabase.from("user_points_detail").insert(pointsToInsert);
    }

    await processPrognosisPoints(allMatches, currentMatch);

    if (onUpdate) onUpdate();
    await fetchMatches(); 
  }

  if (loading) return <div style={{ padding: "20px" }}>Lade Admin-Daten...</div>;

  const realResultsAsTips = {};
  matches.forEach(m => {
    realResultsAsTips[m.id] = {
      match_id: m.id, goals_a: m.goals_a_real, goals_b: m.goals_b_real, winner: m.winner_real
    };
  });

  const grouped = {};
  matches.filter(m => m.stage === "group").forEach(m => {
    if (!grouped[m.group_name]) grouped[m.group_name] = [];
    grouped[m.group_name].push(m);
  });

  const allGroupsArray = Object.keys(grouped).map(groupName => {
    const groupMatches = grouped[groupName];
    return {
      id: groupName,
      teams: calculateFIFADataTable(groupMatches, realResultsAsTips, manualRanks)
    };
  });

  const allGroupGamesFinished = matches
    .filter(m => m.stage === "group")
    .every(m => m.goals_a_real !== null && m.goals_b_real !== null);

  const bestThirds = getBestThirds(allGroupsArray, manualRanks);
  const groupResults = {};
  allGroupsArray.forEach(g => { groupResults[g.id] = g.teams.map(t => t.team); });

  const koMatches = matches
    .filter(m => m.stage === "ko")
    .sort((a,b) => a.stage_order - b.stage_order || a.ko_order - b.ko_order);

  const koByRound = {};
  koMatches.forEach(m => {
    if (!koByRound[m.stage_order]) koByRound[m.stage_order] = [];
    koByRound[m.stage_order].push(m);
  });

  const tournamentContext = { 
    groups: groupResults, 
    thirdPlaces: bestThirds.slice(0, 8), 
    tips: realResultsAsTips,
    phaseId: 1 
  };

  return (
    <div style={{ display: "flex", gap: "50px", padding: "20px", width: "max-content" }}>
      <div ref={groupRef} style={{ flex: "0 0 auto" }}>
        <h2 style={{ color: "#dc2626" }}>Admin: Gruppen</h2>
        {Object.keys(grouped).sort().map(name => {
          const groupMatches = grouped[name];
          
          // Prüfen, ob alle 6 Spiele der Gruppe ein Ergebnis haben
          const groupFinished = groupMatches.every(m => 
            m.goals_a_real !== null && m.goals_b_real !== null
          );

          return (
            <GroupTable 
              key={name} 
              groupName={name} 
              matches={groupMatches} 
              tips={realResultsAsTips} 
              tableData={allGroupsArray.find(g => g.id === name)?.teams || []} 
              onSaveTip={saveRealResult} 
              isSubmitted={false}
              isAdmin={true} // Hier setzen wir isAdmin hart auf true, da wir auf der Admin-Page sind
              manualRanks={manualRanks}
              
              // KORREKTUR DER FEHLERZEILEN:
              onSaveManualRank={(teamName, rank) => {
                // Wir prüfen groupFinished (die Variable von oben)
                // Und wir nutzen saveAdminManualRank (deine Funktion aus der Page)
                if (groupFinished) {
                  saveAdminManualRank(teamName, rank);
                } else {
                  console.warn("Manuelle Reihung erst nach allen Gruppenspielen möglich.");
                }
              }}
            />
          );
        })}
        <BestThirdsTable 
          teams={bestThirds} 
          manualRanks={manualRanks}
          isSubmitted={false}
          isAdmin={true}
          onSaveManualRank={saveAdminManualRank}
          canEditRanks={allGroupGamesFinished}
        />
      </div>

      <div style={{ flex: "1", minWidth: "fit-content" }}>
        <h2 style={{ color: "#dc2626", marginLeft: "20px" }}>Admin: KO-Baum</h2>
        <KOBracket 
          koByRound={koByRound} 
          tips={realResultsAsTips} 
          treeHeight={TREE_HEIGHT}
          roundNames={ROUND_NAMES}
          phase={{ id: 1 }} 
          getTopPosition={(r, m) => getTopPosition(r, m, TREE_HEIGHT, 300)}
          getTeamFromPrevious={(r, m, s) => 
            getTeamFromPrevious(r, m, s, koByRound, realResultsAsTips, tournamentContext)
          }
          resolveSlot={(slot) => resolveSlot(slot, tournamentContext)}
          baseSpacing={300}
          saveTip={saveRealResult}
          deleteKORound={() => {}} 
          isAdmin={true}
          KO_STRUCTURE={KO_STRUCTURE}
        />
      </div>
    </div>
  );
}

export default AdminResultsPage;