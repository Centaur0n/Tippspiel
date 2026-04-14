import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import { getBestThirds } from "./Utils/calcTable";

// Komponenten-Imports
import GroupTable from './components/GroupTable';
import KOBracket from './components/KOBracket';
import BestThirdsTable from './components/BestThirdsTable';

/**
 * 1️⃣ HAUPTKOMPONENTE TIPPSPAGE (Die Logik-Zentrale)
 */
function TippsPage({ player, phaseId }) {
  const [matches, setMatches] = useState([]);
  const [tips, setTips] = useState({});
  const [phase, setPhase] = useState(null);
  const [treeHeight, setTreeHeight] = useState(800);
  
  const groupRef = useRef(null);
  const PHASE_ID = phaseId;

  // --- 2️⃣ DATEN LADEN (Supabase) ---
  useEffect(() => {
    fetchMatches();
    fetchTips();
    fetchPhase();
  }, [PHASE_ID]);

  // Synchronisiert die Höhe des KO-Baums mit den Gruppen-Tabellen
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
      .eq("phase_id", PHASE_ID);

    const map = {};
    data?.forEach((t) => (map[t.match_id] = t));
    setTips(map);
  }

  async function fetchPhase() {
    const { data } = await supabase
      .from("tip_phase")
      .select("*")
      .eq("id", PHASE_ID)
      .single();
    setPhase(data);
  }

  // --- 3️⃣ AKTIONEN (Speichern & Löschen) ---
  async function saveTip(matchId, goalsA, goalsB, winner) {
    if (phase?.is_submitted) return;

    const gA = goalsA !== null ? Number(goalsA) : null;
    const gB = goalsB !== null ? Number(goalsB) : null;
    const match = matches.find((m) => m.id === matchId);
    const isKO = match?.stage === "ko";
    const finalWinner = isKO && gA === gB ? winner : null;

    await supabase.from("tip").upsert([ // upsert ist sauberer als insert
      {
        player_id: player.id,
        match_id: matchId,
        phase_id: PHASE_ID,
        goals_a: gA,
        goals_b: gB,
        winner: finalWinner,
      },
    ], { onConflict: 'player_id,match_id,phase_id' });
    
    fetchTips();
  }

  async function deleteGroupTips(groupName) {
    const ids = matches.filter((m) => m.group_name === groupName).map((m) => m.id);
    await supabase.from("tip").delete().in("match_id", ids).eq("player_id", player.id).eq("phase_id", PHASE_ID);
    fetchTips();
  }

  async function deleteKORound(stageOrder) {
    const ids = matches.filter((m) => m.stage === "ko" && m.stage_order === stageOrder).map((m) => m.id);
    await supabase.from("tip").delete().in("match_id", ids).eq("player_id", player.id).eq("phase_id", PHASE_ID);
    fetchTips();
  }

  // --- 4️⃣ TABELLEN-BERECHNUNG ---
  function calculateTable(groupMatches, currentTips) {
    const table = {};
    groupMatches.forEach((m) => {
      const t = currentTips[m.id];
      if (!t) return;
      const A = m.team_a; const B = m.team_b;
      if (!table[A]) table[A] = { points: 0, goals: 0, conceded: 0 };
      if (!table[B]) table[B] = { points: 0, goals: 0, conceded: 0 };

      const gA = Number(t.goals_a); const gB = Number(t.goals_b);
      table[A].goals += gA; table[A].conceded += gB;
      table[B].goals += gB; table[B].conceded += gA;

      if (gA > gB) table[A].points += 3;
      else if (gB > gA) table[B].points += 3;
      else { table[A].points += 1; table[B].points += 1; }
    });

    return Object.entries(table)
      .map(([team, d]) => ({ team, ...d, diff: d.goals - d.conceded }))
      .sort((a, b) => b.points - a.points || b.diff - a.diff);
  }

  // --- 5️⃣ TURNIER-LOGIK (Gruppen & Dritte) ---
  const grouped = {};
  matches.forEach((m) => {
    if (m.stage !== "group") return;
    if (!grouped[m.group_name]) grouped[m.group_name] = [];
    grouped[m.group_name].push(m);
  });

  const allGroupsArray = Object.keys(grouped).map((groupName) => ({
    id: groupName,
    teams: calculateTable(grouped[groupName], tips)
  }));

  const bestThirds = getBestThirds(allGroupsArray);

  const groupResults = {};
  allGroupsArray.forEach(g => {
    groupResults[g.id] = g.teams.map(t => t.team);
  });

  // --- 6️⃣ KO-SYSTEM LOGIK ---
  const koMatches = matches
    .filter((m) => m.stage === "ko")
    .sort((a, b) => a.stage_order - b.stage_order || a.ko_order - b.ko_order);

  const koByRound = {};
  koMatches.forEach((m) => {
    if (!koByRound[m.stage_order]) koByRound[m.stage_order] = [];
    koByRound[m.stage_order].push(m);
  });

  Object.keys(koByRound).forEach((round) => {
    koByRound[round].sort((a, b) => a.ko_order - b.ko_order);
    if (Number(round) === 5 && koByRound[round].length > 1) {
      koByRound[round] = [koByRound[round][1], koByRound[round][0]];
    }
  });

  const KO_STRUCTURE = {
    round16: [
      ["E1", "3ABCDF"], ["I1", "3CDFGH"], ["F1", "C2"], ["B2", "A2"],
      ["K2", "L2"], ["H1", "J2"], ["D1", "3BEFIJ"], ["G1", "3AEHIJ"],
      ["C1", "F2"], ["E2", "I2"], ["A1", "3CEFHI"], ["L1", "3EHIJK"],
      ["J1", "H2"], ["D2", "G2"], ["B1", "3EFGIJ"], ["K1", "3DEIJL"]
    ],
  };

  const roundNames = { 1: "Sechzehntelfinale", 2: "Achtelfinale", 3: "Viertelfinale", 4: "Halbfinale", 5: "Finale" };

  // Layout & Kontext
  const firstRoundKey = Object.keys(koByRound).sort((a, b) => a - b)[0];
  const totalMatchesCount = koByRound[firstRoundKey]?.length || 1;
  const currentBaseSpacing = treeHeight / totalMatchesCount;

  const tournamentContext = { groups: groupResults, thirdPlaces: bestThirds, tips: tips };

  // --- 7️⃣ HELFER-FUNKTIONEN ---
  const getTopPosition = (roundIndex, matchIndex) => {
    if (roundIndex === 4) return matchIndex === 0 ? (treeHeight / 2 - 30) : (treeHeight / 2 + 300);
    if (roundIndex === 0) return matchIndex * currentBaseSpacing;
    const prevSpacing = currentBaseSpacing * Math.pow(2, roundIndex);
    return matchIndex * prevSpacing + prevSpacing / 2 - currentBaseSpacing / 2;
  };

  function resolveSlotLocal(slot) {
    const { groups, thirdPlaces } = tournamentContext;
    if (/^[A-Z][12]$/.test(slot)) {
      const group = slot[0]; const pos = Number(slot[1]) - 1;
      return groups[group]?.[pos] || "?";
    }
    if (slot.startsWith("3")) {
      const allowedGroups = slot.slice(1).split("");
      const candidates = thirdPlaces.filter(t => allowedGroups.includes(t.group));
      return candidates[0]?.team || "?";
    }
    return slot;
  }

  function getWinnerLocal(matchId) {
    const tip = tips[matchId];
    if (!tip) return null;
    if (tip.winner) return Number(tip.winner);
    const gA = Number(tip.goals_a); const gB = Number(tip.goals_b);
    if (gA > gB) return 1; if (gB > gA) return 2;
    return null;
  }

  function getTeamFromPreviousLocal(roundIndex, matchIndex, side) {
    const rounds = Object.keys(koByRound).map(Number).sort((a, b) => a - b);
    const prevRoundKey = rounds[roundIndex - 1];
    const prevRound = koByRound[prevRoundKey];
    if (!prevRound) return "?";
    const sourceMatchIndex = side === "A" ? matchIndex * 2 : matchIndex * 2 + 1;
    const sourceMatch = prevRound[sourceMatchIndex];
    if (!sourceMatch) return "?";
    const winner = getWinnerLocal(sourceMatch.id);
    if (!winner) return "?";
    return winner === 1 ? sourceMatch.team_a : sourceMatch.team_b;
  }

  // --- 8️⃣ RENDER DER TIPPSPAGE ---
  return (
    <div style={{ display: "flex", gap: "50px", alignItems: "flex-start" }}>
      <div style={{ flex: "0 0 auto" }}>
        <h3>Tipps Gruppenphase</h3>
        <div ref={groupRef}>
          {Object.keys(grouped).sort().map((groupName) => (
            <GroupTable
              key={groupName}
              groupName={groupName}
              matches={grouped[groupName]}
              tips={tips}
              tableData={calculateTable(grouped[groupName], tips)}
              isSubmitted={phase?.is_submitted}
              onDeleteTips={deleteGroupTips}
              onSaveTip={saveTip}
            />
          ))}
        </div>
        <BestThirdsTable teams={bestThirds} />
      </div>

      <div style={{ flex: "1" }}>
        <h3>KO-Phase</h3>
        <KOBracket 
          koByRound={koByRound}
          tips={tips}
          phase={phase}
          roundNames={roundNames}
          treeHeight={treeHeight}
          getTopPosition={getTopPosition}
          getTeamFromPrevious={getTeamFromPreviousLocal}
          resolveSlot={resolveSlotLocal}
          context={tournamentContext}
          KO_STRUCTURE={KO_STRUCTURE}
          saveTip={saveTip}
          deleteKORound={deleteKORound}
          baseSpacing={currentBaseSpacing}
        />
      </div>
    </div>
  );
}

/**
 * 9️⃣ APP KOMPONENTE (Login & Navigation)
 */
function App() {
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [phase, setPhase] = useState(1);

  useEffect(() => {
    supabase.from("player").select("*").then(({ data }) => setPlayers(data || []));
  }, []);

  function checkPin() {
    if (selectedPlayer && pin === selectedPlayer.pin) {
      setLoggedIn(true); setError("");
    } else { setError("Falscher PIN"); }
  }

  function logout() { setSelectedPlayer(null); setPin(""); setLoggedIn(false); }

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>🏆 WM 2026 Tippspiel</h1>

      {!loggedIn ? (
        <div style={{ maxWidth: "300px" }}>
          <h2>Spieler Login</h2>
          {!selectedPlayer ? (
            players.map((p) => (
              <button key={p.id} onClick={() => setSelectedPlayer(p)} style={{ display: "block", width: "100%", margin: "10px 0", padding: "10px" }}>
                {p.name}
              </button>
            ))
          ) : (
            <div>
              <h3>Hallo, {selectedPlayer.name}</h3>
              <input type="password" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} style={{ padding: "10px", width: "100%" }} />
              <button onClick={checkPin} style={{ marginTop: "10px", padding: "10px", width: "100%" }}>Einloggen</button>
              <button onClick={() => setSelectedPlayer(null)} style={{ marginTop: "5px", fontSize: "0.8em" }}>Zurück</button>
              {error && <p style={{ color: "red" }}>{error}</p>}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex" }}>
          <div style={{ width: "150px", borderRight: "1px solid #eee", marginRight: "20px" }}>
            <h3>Runden</h3>
            {[1, 2, 3, 4, 5].map((p) => (
              <button key={p} onClick={() => setPhase(p)} style={{ display: "block", width: "100%", padding: "10px", marginBottom: "5px", background: phase === p ? "#007bff" : "#fff", color: phase === p ? "#fff" : "#000" }}>
                Phase {p}
              </button>
            ))}
            <hr />
            <button onClick={logout} style={{ width: "100%", padding: "10px" }}>Logout</button>
          </div>

          <div style={{ flex: 1, overflow: "auto", maxHeight: "90vh" }}>
             <TippsPage player={selectedPlayer} phaseId={phase} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;