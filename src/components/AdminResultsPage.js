import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { calculateFIFADataTable } from "../logic/tournamentLogic"; 
import { getTopPosition, resolveSlot, getTeamFromPrevious } from "../logic/koLogic";
import { getBestThirds } from "../Utils/calcTable";
import { syncRealTournamentState } from "../logic/realStateSync";

// HIER: processStandardMatchTips hinzugefügt!
import { 
  processStandardMatchTips, 
  processPrognosisPoints, 
  getDynamicWinnerPoints 
} from "../logic/pointsEngine";

// Komponenten
import GroupTable from './GroupTable';
import KOBracket from './KOBracket';
import BestThirdsTable from './BestThirdsTable';

const KO_STRUCTURE = {
  round16: [
    ["E1", "1E"], ["I1", "1I"], ["B2", "A2"], ["F1", "C2"],
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

  async function forceHardResetKO() {
    if (!window.confirm("Wirklich ALLE KO-Ergebnisse löschen und den gesamten KO-Baum auf Platzhalter zurücksetzen?")) return;
    setLoading(true);
    
    const { data: koMatches } = await supabase.from("match").select("*").eq("stage", "ko");
    
    for (const m of koMatches) {
      await supabase.from("match").update({
        goals_a_real: null, 
        goals_b_real: null, 
        winner_real: null,
        team_a: m.placeholder_a, 
        team_b: m.placeholder_b
      }).eq("id", m.id);
    }
    
    await fetchData();
    setLoading(false);
  }

  async function saveAdminManualRank(teamName, rank) {
    const val = rank === "" ? null : Number(rank);
    await supabase.from("real_manual_rank").upsert([{ team_name: teamName, manual_rank: val }], { onConflict: 'team_name' });
    setManualRanks(prev => ({ ...prev, [teamName]: val }));
    const { data: allMatches } = await supabase.from("match").select("*").order("match_order");
    const lastGroupMatch = allMatches.filter(m => m.stage === "group").pop();
    await syncRealTournamentState(allMatches, lastGroupMatch?.group_name);
    if (onUpdate) onUpdate();
    fetchMatches(); 
  }

  async function resetManualRanksForGroup(groupName) {
    const groupMatches = matches.filter(m => m.group_name === groupName);
    const teamsInGroup = [...new Set(groupMatches.flatMap(m => [m.team_a, m.team_b]))];
    await supabase.from("real_manual_rank").delete().in("team_name", teamsInGroup);
    setManualRanks(prev => {
      const newRanks = { ...prev };
      teamsInGroup.forEach(t => delete newRanks[t]);
      return newRanks;
    });
  }

  // --- HIER IST JETZT ALLES STRUKTURIERT UND SCHLANK ---
  async function saveRealResult(matchId, goalsA, goalsB, winner) {
    const isReset = goalsA === "" || goalsB === "" || goalsA === null || goalsB === null;
    const gA = isReset ? null : Number(goalsA);
    const gB = isReset ? null : Number(goalsB);
    let finalWinner = !isReset ? ((gA > gB ? 1 : (gB > gA ? 2 : Number(winner || 0)))) : 0;

    const currentMatchBefore = matches.find(m => m.id === matchId);
    if (currentMatchBefore?.stage === "group") await resetManualRanksForGroup(currentMatchBefore.group_name);

    // 1. Ergebnis im Spiel speichern
    await supabase.from("match").update({ goals_a_real: gA, goals_b_real: gB, winner_real: finalWinner }).eq("id", matchId);
    
    const { data: allMatches } = await supabase.from("match").select("*").order("match_order");
    await syncRealTournamentState(allMatches, allMatches.find(m => m.id === matchId)?.group_name);

    const { data: refreshedMatches } = await supabase.from("match").select("*").order("match_order");
    const dynamicCurrentMatch = refreshedMatches.find(m => m.id === matchId);

    // 2. Bestimme die richtige Phase für die Punkte-Gutschrift
    const targetPhase = dynamicCurrentMatch?.stage === "ko" ? 2 : phaseId;

    if (!isReset && dynamicCurrentMatch) {
      // CHEF-AUFRUF: Berechnet alle Standard-Tipps über die pointsEngine
      await processStandardMatchTips(dynamicCurrentMatch, targetPhase);
      
      // CHEF-AUFRUF: Berechnet die Turnierpfad-Prognosen
      await processPrognosisPoints(refreshedMatches, dynamicCurrentMatch, dynamicCurrentMatch.stage === "ko" ? null : dynamicCurrentMatch.group_name, false);
    } else {
      // Falls das Ergebnis gelöscht wurde (Reset), putzen wir die alten Punkte weg
      await supabase.from("user_points_detail").delete().eq("match_id", matchId).eq("is_prognosis", false);
    }

    if (onUpdate) onUpdate();
    await fetchMatches(); 
  }

  if (loading) return <div style={{ padding: "20px" }}>Lade Admin-Daten...</div>;

  const realResultsAsTips = {};
  matches.forEach(m => { realResultsAsTips[m.id] = { match_id: m.id, goals_a: m.goals_a_real, goals_b: m.goals_b_real, winner: m.winner_real }; });

  const grouped = {};
  matches.filter(m => m.stage === "group").forEach(m => {
    if (!grouped[m.group_name]) grouped[m.group_name] = [];
    grouped[m.group_name].push(m);
  });

  const allGroupsArray = Object.keys(grouped).map(name => ({ id: name, teams: calculateFIFADataTable(grouped[name], realResultsAsTips, manualRanks) }));
  const allGroupGamesFinished = matches.filter(m => m.stage === "group").every(m => m.goals_a_real !== null);
  const bestThirds = getBestThirds(allGroupsArray, manualRanks);
  const groupResults = {}; allGroupsArray.forEach(g => { groupResults[g.id] = g.teams.map(t => t.team); });

  const koByRound = {};
  matches.filter(m => m.stage === "ko").sort((a,b) => a.stage_order - b.stage_order || a.ko_order - b.ko_order).forEach(m => {
    if (!koByRound[m.stage_order]) koByRound[m.stage_order] = [];
    koByRound[m.stage_order].push(m);
  });

  const tournamentContext = { groups: groupResults, thirdPlaces: bestThirds.slice(0, 8), tips: realResultsAsTips, phaseId: phaseId };

  return (
    <div style={{ display: "flex", gap: "50px", padding: "20px", width: "max-content" }}>
      <div ref={groupRef} style={{ flex: "0 0 auto" }}>
        <h2 style={{ color: "#dc2626" }}>Admin: Gruppen</h2>
        {Object.keys(grouped).sort().map(name => (
          <GroupTable key={name} groupName={name} matches={grouped[name]} tips={realResultsAsTips} tableData={allGroupsArray.find(g => g.id === name)?.teams || []} onSaveTip={saveRealResult} isAdmin={true} manualRanks={manualRanks} onSaveManualRank={saveAdminManualRank} />
        ))}
        <BestThirdsTable teams={bestThirds} manualRanks={manualRanks} isAdmin={true} onSaveManualRank={saveAdminManualRank} canEditRanks={allGroupGamesFinished} />
      </div>

      <div style={{ flex: "1", minWidth: "600px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ color: "#dc2626", margin: 0 }}>Admin: KO-Baum</h2>
            <button 
              onClick={forceHardResetKO} 
              style={{ backgroundColor: "#ef4444", color: "white", padding: "10px 20px", borderRadius: "5px", border: "none", cursor: "pointer", fontWeight: "bold" }}
            >
              KO-Baum Reset
            </button>
        </div>
        <KOBracket 
          koByRound={koByRound} tips={realResultsAsTips} treeHeight={TREE_HEIGHT} roundNames={ROUND_NAMES}
          phase={{ id: phaseId }} 
          getTopPosition={(r, m) => getTopPosition(r, m, TREE_HEIGHT, 300)}
          getTeamFromPrevious={(r, m, s) => getTeamFromPrevious(r, m, s, koByRound, realResultsAsTips, tournamentContext)}
          resolveSlot={(slot) => resolveSlot(slot, tournamentContext)}
          saveTip={saveRealResult} deleteKORound={() => {}} isAdmin={true} KO_STRUCTURE={KO_STRUCTURE}
        />
      </div>
    </div>
  );
}

export default AdminResultsPage;