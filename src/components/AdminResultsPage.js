import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { calculateTable } from "../logic/tournamentLogic";
import { getTopPosition, resolveSlot, getTeamFromPrevious } from "../logic/koLogic";
import { getBestThirds } from "../Utils/calcTable";
import { calculateDetailedMatchPoints, getDynamicWinnerPoints } from "../logic/pointsEngine";

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

function AdminResultsPage({ phaseId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const groupRef = useRef(null);

  useEffect(() => {
    fetchMatches();
  }, [phaseId]);

  async function fetchMatches() {
    setLoading(true);
    const { data } = await supabase.from("match").select("*").order("match_order", { ascending: true });
    setMatches(data || []);
    setLoading(false);
  }

  /**
   * Hilfsfunktion: Holt FIFA-Ränge und berechnet Basis-Punkte
   */
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

  /**
   * Kern-Funktion: Speichert Ergebnis und berechnet Punkte für ALLE User
   */
  async function saveRealResult(matchId, goalsA, goalsB, winner) {
    if (goalsA === "" || goalsB === "") return;

    const gA = Number(goalsA);
    const gB = Number(goalsB);
    
    let finalWinner = 0;
    if (gA > gB) finalWinner = 1;
    else if (gB > gA) finalWinner = 2;
    if (gA === gB && winner) finalWinner = Number(winner);

    // 1. Reales Ergebnis im Match speichern
    const { error: matchError } = await supabase
      .from("match")
      .update({
        goals_a_real: gA,
        goals_b_real: gB,
        winner_real: finalWinner
      })
      .eq("id", matchId);
      
    if (matchError) return console.error("Match Update Error:", matchError.message);

    // 2. Match-Daten für FIFA-Ranking holen
    const { data: currentMatch } = await supabase
      .from("match")
      .select("team_a, team_b")
      .eq("id", matchId)
      .single();

    const winnerPoints = await fetchWinnerPoints(currentMatch.team_a, currentMatch.team_b);

    // 3. Tipps aus Tabelle "tip" laden
    const { data: allTips, error: tipsError } = await supabase
      .from("tip")
      .select("*")
      .eq("match_id", matchId);

    if (tipsError) return console.error("Fehler beim Laden der Tipps:", tipsError.message);

    // 4. Alte Punkte-Details für dieses Spiel löschen
    await supabase
      .from("user_points_detail")
      .delete()
      .eq("match_id", matchId);

    // 5. Punkte für jeden User berechnen
    if (allTips && allTips.length > 0) {
      const pointsToInsert = allTips.map(t => {
        // Hier nutzen wir die Spaltennamen aus deinem Screenshot: t.goals_a, t.goals_b, t.winner
        const result = calculateDetailedMatchPoints(
          { 
            goals_a: t.goals_a, 
            goals_b: t.goals_b, 
            winner: t.winner 
          },
          { goals_a: gA, goals_b: gB, winner: finalWinner },
          winnerPoints
        );

        return {
          user_id: t.player_id, // GEÄNDERT: Dein Screenshot zeigt "player_id"
          match_id: matchId,
          points_total: result.total,
          breakdown: result.breakdown,
          is_prognosis: false
        };
      });

      // 6. In user_points_detail schreiben
      const { error: insertError } = await supabase
        .from("user_points_detail")
        .insert(pointsToInsert);

      if (insertError) {
        console.error("Fehler beim Speichern der Punkte:", insertError.message);
      } else {
        console.log(`Erfolgreich Punkte für ${allTips.length} Tipper berechnet.`);
      }
    } else {
      console.log("Keine Tipps für dieses Spiel gefunden.");
    }

    fetchMatches(); // UI aktualisieren
  }

  if (loading) return <div style={{ padding: "20px" }}>Lade Admin-Daten...</div>;

  const realResultsAsTips = {};
  matches.forEach(m => {
    realResultsAsTips[m.id] = {
      match_id: m.id,
      goals_a: m.goals_a_real,
      goals_b: m.goals_b_real,
      winner: m.winner_real
    };
  });

  const grouped = {};
  matches.filter(m => m.stage === "group").forEach(m => {
    if (!grouped[m.group_name]) grouped[m.group_name] = [];
    grouped[m.group_name].push(m);
  });

  const allGroupsArray = Object.keys(grouped).map(groupName => {
    const groupMatches = grouped[groupName];
    const tipsForCalc = {};
    groupMatches.forEach(m => {
        const r = realResultsAsTips[m.id];
        tipsForCalc[m.id] = {
            ...r,
            goals_a: r.goals_a ?? 0, 
            goals_b: r.goals_b ?? 0
        };
    });

    return {
      id: groupName,
      teams: calculateTable(groupMatches, tipsForCalc)
    };
  });

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
        {Object.keys(grouped).sort().map(name => (
          <GroupTable 
            key={name} 
            groupName={name} 
            matches={grouped[name]} 
            tips={realResultsAsTips} 
            tableData={allGroupsArray.find(g => g.id === name)?.teams || []} 
            onSaveTip={saveRealResult} 
            isSubmitted={false}
            isAdmin={true} 
          />
        ))}
        <BestThirdsTable teams={bestThirds} />
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