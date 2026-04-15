import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { getBestThirds } from "../Utils/calcTable";

// Import der ausgelagerten Logik
import { calculateTable } from "../logic/tournamentLogic";
import { getTopPosition, resolveSlot, getTeamFromPrevious } from "../logic/koLogic";

// Import der UI-Komponenten
import GroupTable from './GroupTable';
import KOBracket from './KOBracket';
import BestThirdsTable from './BestThirdsTable';

/**
 * KONSTANTEN
 */
const KO_STRUCTURE = {
  round16: [
    ["E1", "1E"], ["I1", "1I"], ["F1", "C2"], ["B2", "A2"],
    ["K2", "L2"], ["H1", "J2"], ["D1", "1D"], ["G1", "1G"],
    ["C1", "F2"], ["E2", "I2"], ["A1", "1A"], ["L1", "1L"],
    ["J1", "H2"], ["D2", "G2"], ["B1", "1B"], ["K1", "1K"]
  ],
};

const ROUND_NAMES = { 
  1: "Sechzehntelfinale", 2: "Achtelfinale", 3: "Viertelfinale", 4: "Halbfinale", 5: "Finale" 
};

function TippsPage({ player, phaseId }) {
  // --- STATE ---
  const [matches, setMatches] = useState([]);
  const [tips, setTips] = useState({});
  const [phase, setPhase] = useState(null);
  const [treeHeight, setTreeHeight] = useState(800);
  const groupRef = useRef(null);

  // --- DATEN LADEN ---
  useEffect(() => {
    fetchMatches();
    fetchTips();
    fetchPhase();
  }, [phaseId]);

  useEffect(() => {
    if (groupRef.current) {
      setTreeHeight(groupRef.current.offsetHeight);
    }
  }, [matches, tips]);

  async function fetchMatches() {
    const { data } = await supabase.from("match").select("*");
    setMatches(data || []);
  }

  async function fetchTips() {
    const { data } = await supabase
      .from("tip")
      .select("*")
      .eq("player_id", player.id)
      .eq("phase_id", phaseId);
    const map = {};
    data?.forEach((t) => (map[t.match_id] = t));
    setTips(map);
  }

  async function fetchPhase() {
    const { data } = await supabase
      .from("tip_phase")
      .select("*")
      .eq("id", phaseId)
      .single();
    setPhase(data);
  }

  // --- SCHREIB-AKTIONEN ---
  async function saveTip(matchId, goalsA, goalsB, winner) {
    if (phase?.is_submitted) return;
    const gA = goalsA !== null ? Number(goalsA) : null;
    const gB = goalsB !== null ? Number(goalsB) : null;
    const match = matches.find((m) => m.id === matchId);
    const finalWinner = (match?.stage === "ko" && gA === gB) ? winner : null;

    await supabase.from("tip").upsert([
      {
        player_id: player.id,
        match_id: matchId,
        phase_id: phaseId,
        goals_a: gA,
        goals_b: gB,
        winner: finalWinner,
      },
    ]);
    fetchTips();
  }

  async function deleteGroupTips(groupName) {
    const ids = matches.filter((m) => m.group_name === groupName).map((m) => m.id);
    await supabase.from("tip").delete().in("match_id", ids).eq("player_id", player.id).eq("phase_id", phaseId);
    fetchTips();
  }

  async function deleteKORound(stageOrder) {
    const ids = matches.filter((m) => m.stage === "ko" && m.stage_order === stageOrder).map((m) => m.id);
    await supabase.from("tip").delete().in("match_id", ids).eq("player_id", player.id).eq("phase_id", phaseId);
    fetchTips();
  }

  // --- TURNIER-LOGIK VORBEREITUNG ---
  const grouped = {};
  matches.filter(m => m.stage === "group").forEach(m => {
    if (!grouped[m.group_name]) grouped[m.group_name] = [];
    grouped[m.group_name].push(m);
  });

  const allGroupsArray = Object.keys(grouped).map(groupName => ({
    id: groupName,
    teams: calculateTable(grouped[groupName], tips)
  }));

  const bestThirds = getBestThirds(allGroupsArray);
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

  // Layout Berechnung
  const firstRoundKey = Object.keys(koByRound).sort((a, b) => a - b)[0];
  const totalMatchesCount = koByRound[firstRoundKey]?.length || 1;
  const currentBaseSpacing = treeHeight / totalMatchesCount;
  const tournamentContext = { groups: groupResults, thirdPlaces: bestThirds, tips };

  // --- RENDER ---
  return (
    <div style={{ display: "flex", gap: "50px", padding: "20px" }}>
      {/* Linke Seite: Gruppen */}
      <div ref={groupRef} style={{ flex: "0 0 auto" }}>
        <h3>Gruppenphase</h3>
        {Object.keys(grouped).sort().map(name => (
          <GroupTable 
            key={name} 
            groupName={name} 
            matches={grouped[name]} 
            tips={tips} 
            tableData={calculateTable(grouped[name], tips)} 
            onSaveTip={saveTip} 
            onDeleteTips={deleteGroupTips}
            isSubmitted={phase?.is_submitted}
          />
        ))}
        <BestThirdsTable teams={bestThirds} />
      </div>

      {/* Rechte Seite: KO-Baum */}
      <div style={{ flex: "1" }}>
        <h3>KO-Phase</h3>
        <KOBracket 
          koByRound={koByRound} 
          tips={tips} 
          treeHeight={treeHeight}
          roundNames={ROUND_NAMES}
          phase={phase}
          getTopPosition={(roundIdx, matchIdx) => getTopPosition(roundIdx, matchIdx, treeHeight, currentBaseSpacing)}
          getTeamFromPrevious={(roundIdx, matchIdx, side) => getTeamFromPrevious(roundIdx, matchIdx, side, koByRound, tips)}
          resolveSlot={(slot) => resolveSlot(slot, tournamentContext)}
          baseSpacing={currentBaseSpacing}
          saveTip={saveTip}
          deleteKORound={deleteKORound}
          KO_STRUCTURE={KO_STRUCTURE}
        />
      </div>
    </div>
  );
}

export default TippsPage;