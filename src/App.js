import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabaseClient";
import { getBestThirds } from "./Utils/calcTable";


//////////////////////////////////////////
// 1️⃣ TIPPS PAGE (HAUPTLOGIK)
//////////////////////////////////////////
function TippsPage({ player, phaseId }) {
  const [matches, setMatches] = useState([]);
  const [tips, setTips] = useState({});
  const [phase, setPhase] = useState(null);

  const groupRef = useRef(null);
  const [treeHeight, setTreeHeight] = useState(800);

  const PHASE_ID = phaseId;

  //////////////////////////////////////////
  // 2️⃣ DATEN LADEN
  //////////////////////////////////////////
  useEffect(() => {
    fetchMatches();
    fetchTips();
    fetchPhase();

  }, [PHASE_ID]);

  useEffect(() => {
    if (groupRef.current) {
      setTreeHeight(groupRef.current.offsetHeight);
    }
  }, [matches]);

  async function fetchMatches() {
  const { data } = await supabase
    .from("match")
    .select("*"); // ❌ KEIN phase filter

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

  //////////////////////////////////////////
  // 3️⃣ TIP SPEICHERN
  //////////////////////////////////////////
  async function saveTip(matchId, goalsA, goalsB, winner) {
    if (phase?.is_submitted) return;

    const gA = goalsA !== null ? Number(goalsA) : null;
    const gB = goalsB !== null ? Number(goalsB) : null;

    const match = matches.find((m) => m.id === matchId);
    const isKO = match?.stage === "ko";

    const finalWinner = isKO && gA === gB ? winner : null;

    await supabase.from("tip").insert([
      {
        player_id: player.id,
        match_id: matchId,
        phase_id: PHASE_ID,
        goals_a: gA,
        goals_b: gB,
        winner: finalWinner,
      },
    ]);

    fetchTips();
  }

  //////////////////////////////////////////
  // 4️⃣ RESET FUNKTIONEN
  //////////////////////////////////////////

  // 🔁 Gruppe reset
  async function deleteGroupTips(groupName) {
    const ids = matches
      .filter((m) => m.group_name === groupName)
      .map((m) => m.id);

    await supabase
      .from("tip")
      .delete()
      .in("match_id", ids)
      .eq("player_id", player.id)
      .eq("phase_id", PHASE_ID);

    fetchTips();
  }

  // 🔁 KO Runde reset (NEU 🔥)
  async function deleteKORound(stageOrder) {
    const ids = matches
      .filter((m) => m.stage === "ko" && m.stage_order === stageOrder)
      .map((m) => m.id);

    await supabase
      .from("tip")
      .delete()
      .in("match_id", ids)
      .eq("player_id", player.id)
      .eq("phase_id", PHASE_ID);

    fetchTips();
  }

  //////////////////////////////////////////
  // 5️⃣ GRUPPEN (NUR GROUP STAGE!)
  //////////////////////////////////////////
  const grouped = {};
    matches.forEach((m) => {
      if (m.stage !== "group") return;

      if (!grouped[m.group_name]) grouped[m.group_name] = [];
      grouped[m.group_name].push(m);
    });

    const groupResults = {};

  Object.keys(grouped).forEach((group) => {
    const table = calculateTable(grouped[group], tips);

    groupResults[group] = table.map(t => t.team);
  });

  // Alle Gruppentabellen berechnen
  const allGroupTables = Object.keys(grouped).map((groupName) => {
    const table = calculateTable(grouped[groupName], tips);
    groupResults[groupName] = table.map(t => t.team);
    
    // Wir geben ein Objekt zurück, das getBestThirds versteht
    return {
      id: groupName,
      teams: table // Das sind die sortierten Teams dieser Gruppe
    };
  });

  // 🔥 SCHRITT 3: Nutze die neue Logik für die Top 8 Drittplatzierten
  const topEightThirds = getBestThirds(allGroupTables);

  const context = {
    groups: groupResults,
    thirdPlaces: topEightThirds, // Hier sind jetzt nur noch die besten 8 drin!
  };

  //////////////////////////////////////////
  // 6️⃣ TABELLEN BERECHNUNG
  //////////////////////////////////////////
  function calculateTable(matches, tips) {
    const table = {};

    matches.forEach((m) => {
      const t = tips[m.id];
      if (!t) return;

      const A = m.team_a;
      const B = m.team_b;

      if (!table[A]) table[A] = { points: 0, goals: 0, conceded: 0 };
      if (!table[B]) table[B] = { points: 0, goals: 0, conceded: 0 };

      const gA = Number(t.goals_a);
      const gB = Number(t.goals_b);

      table[A].goals += gA;
      table[A].conceded += gB;

      table[B].goals += gB;
      table[B].conceded += gA;

      if (gA > gB) table[A].points += 3;
      else if (gB > gA) table[B].points += 3;
      else {
        table[A].points += 1;
        table[B].points += 1;
      }
    });

    return Object.entries(table)
      .map(([team, d]) => ({
        team,
        ...d,
        diff: d.goals - d.conceded,
      }))
      .sort((a, b) => b.points - a.points || b.diff - a.diff);
  }

  //////////////////////////////////////////
  // 7️⃣ KO SPIELE
  //////////////////////////////////////////
  const koMatches = matches
    .filter((m) => m.stage === "ko")
    .sort((a, b) => {
      if (a.stage_order !== b.stage_order) {
        return a.stage_order - b.stage_order;
      }
      return a.ko_order - b.ko_order; // 🔥 DAS IST ENTSCHEIDEND
    });

  const isRealMatch = (match) => {
    return match.stage_order === PHASE_ID;
  };

  const koByRound = {};
    koMatches.forEach((m) => {
      if (!koByRound[m.stage_order]) koByRound[m.stage_order] = [];
      koByRound[m.stage_order].push(m);
    });

    
// 🔥 HIER EINFÜGEN
Object.keys(koByRound).forEach((round) => {
  koByRound[round].sort((a, b) => a.ko_order - b.ko_order);
});

    // 🔥 NEU: Finale immer nach oben
    Object.keys(koByRound).forEach((round) => {
      if (Number(round) === 5) {
        koByRound[round] = [
          koByRound[round][1], // Finale
          koByRound[round][0], // Platz 3
        ];
      }
    });

  //////////////////////////////////////////
  // 8️⃣ UI
  //////////////////////////////////////////

  const roundNames = {
    1: "Sechzehntelfinale",
    2: "Achtelfinale",
    3: "Viertelfinale",
    4: "Halbfinale",
    5: "Finale"
    };

    const KO_STRUCTURE = {
      round16: [
        ["B2", "A2"],
        ["E1", "3ABCDF"],
        ["F1", "C2"],
        ["C1", "F2"],
        ["I1", "3CDFGH"],
        ["E2", "I2"],
        ["A1", "3CEFHI"],
        ["L1", "3EHIJK"],
        ["D1", "3BEFIJ"],
        ["G1", "3AEHIJ"],
        ["K2", "L2"],
        ["H1", "J2"],
        ["B1", "3EFGIJ"],
        ["J1", "H2"],
        ["K1", "3DEIJL"],
        ["D2", "G2"],
      ],
    };

    function resolveSlot(slot, context) {
      const { groups, thirdPlaces } = context;

      if (/^[A-Z][12]$/.test(slot)) {
        const group = slot[0];
        const pos = Number(slot[1]) - 1;
        return groups[group]?.[pos] || "?";
      }

      if (slot.startsWith("3")) {
        const allowedGroups = slot.slice(1).split("");
        const candidates = thirdPlaces.filter(t =>
          allowedGroups.includes(t.group)
        );
        return candidates[0]?.team || "?";
      }

      return slot;
    }

    function getWinner(matchId) {
      const tip = tips[matchId];
      if (!tip) return null;

      // Wenn nur Gewinner gesetzt wurde (Fake Spiel)
      if (tip.winner) return Number(tip.winner);

      // Normales Spiel
      const gA = Number(tip.goals_a);
      const gB = Number(tip.goals_b);

      if (gA > gB) return 1;
      if (gB > gA) return 2;

      return null;
    }

    const KO_NEXT = {
      // Achtelfinale
      2: [
        [1, 4],
        [0, 2],
        [3, 5],
        [6, 7],
        [10, 11],
        [8, 9],
        [13, 15],
        [12, 14],
      ],

      // Viertelfinale
      3: [
        [0, 1],
        [4, 5],
        [2, 3],
        [6, 7],
      ],

      // Halbfinale
      4: [
        [0, 1],
        [2, 3],
      ],

      // Finale
      5: [
        [0, 1],
      ],
    };

    function getTeamFromPrevious(roundIndex, matchIndex, side) {
      const mapping = KO_NEXT[roundIndex + 1];

      const rounds = Object.keys(koByRound).sort((a, b) => Number(a) - Number(b));
      const currentRound = Number(rounds[roundIndex]);
      const prevRound = koByRound[currentRound - 1];

      if (!mapping || !prevRound) return "?";

      const mapEntry = mapping[matchIndex];
      if (!mapEntry) return "?";

      const [aIdx, bIdx] = mapEntry;
      const sourceIndex = side === "A" ? aIdx : bIdx;

      const sourceMatch = prevRound[sourceIndex];
      if (!sourceMatch) return "?";

      const winner = getWinner(sourceMatch.id);
      if (!winner) return "?";


      return winner === 1
        ? sourceMatch.team_a
        : sourceMatch.team_b;
    }

    const totalMatches = koByRound[1]?.length || 1;

    // Höhe dynamisch abhängig vom Platz links (wichtig!)

    const baseSpacing = treeHeight / totalMatches;

    const getTopPosition = (roundIndex, matchIndex) => {
      // 🔥 SPEZIALFALL: Finale Runde
      if (roundIndex === 4) {
        if (matchIndex === 0) {
          // Finale → exakt Mitte
          return treeHeight / 2 - 30;
        } else {
          // Platz 3 → darunter mit Abstand
          return treeHeight / 2 + 300;
        }
      }

      if (roundIndex === 0) {
        return matchIndex * baseSpacing;
      }

      const prevSpacing = baseSpacing * Math.pow(2, roundIndex);
      return matchIndex * prevSpacing + prevSpacing / 2 - baseSpacing / 2;
    };

  return (
    <div>
      <h2>Tipps</h2>

      {/* 🔲 HAUPT-LAYOUT */}
      <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>

        {/* 🟢 LINKS: GRUPPEN */}
        <div ref={groupRef}>
          {Object.keys(grouped)
            .sort()
            .map((group) => {
            const tableData = calculateTable(grouped[group], tips);

            return (
              <div
                key={group}
                style={{
                  display: "flex",
                  gap: "40px",
                  alignItems: "flex-start",
                  marginBottom: "40px"
                }}
              >
                {/* 🔵 LINKS → Spiele */}
                <div style= {{ width: "250px" }}>
                  <h3>{group}</h3>

                  {!phase?.is_submitted && (
                    <button onClick={() => deleteGroupTips(group)}>
                      Zurücksetzen
                    </button>
                  )}

                  {grouped[group].map((m) => {
                    const tip = tips[m.id];

                    return (
                      <div key={m.id} style={{ marginBottom: "10px" }}>
                        {m.team_a} vs {m.team_b}

                        {tip ? (
                          <div>{tip.goals_a} : {tip.goals_b}</div>
                        ) : (
                          !phase?.is_submitted && (
                            <TipInput
                              isKO={false}
                              onSave={(a, b, w) => saveTip(m.id, a, b, w)}
                            />
                          )
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 🟢 RECHTS → Tabelle */}
                <div style={{ marginTop: "60px"}}>
                  <table border="1">
                    <thead>
                      <tr>
                        <th>Platz</th>
                        <th>Team</th>
                        <th>Pkt</th>
                        <th>Tore</th>
                        <th>GT</th>
                        <th>Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.map((row, index) => (
                        <tr key={row.team}>
                          <td>{index + 1}</td>
                          <td>{row.team}</td>
                          <td>{row.points}</td>
                          <td>{row.goals}</td>
                          <td>{row.conceded}</td>
                          <td>{row.diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>


        {/* 🔴 RECHTS: KO */}
        <div>
          <h2>KO-Phase</h2>
          
          <div style={{ minWidth: "1200px" }}>

            {/* 🔥 HEADER FIX OBEN */}
            <div style={{
              display: "flex",
              marginBottom: "20px"
            }}>
              {Object.keys(koByRound).map((round, i) => (
                <div
                  key={round}
                  style={{
                    width: "220px",
                    textAlign: "center",
                    fontWeight: "bold"
                  }}
                >
                  {roundNames[round]}

                  {!phase?.is_submitted && (
                    <div>
                      <button onClick={() => deleteKORound(Number(round))}>
                        Zurücksetzen
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 🔽 BAUM */}
            <div
              style={{
                position: "relative",
                height: `${treeHeight}px`
              }}
            >

            {Object.keys(koByRound)
              .sort((a, b) => Number(a) - Number(b))
              .map((round, roundIndex) => (
                <div key={round} style={{ position: "relative" }}>                            

                {koByRound[round].map((m, matchIndex) => {
                  const tip = tips[m.id];


                  const spacing = 100 * Math.pow(2, roundIndex); // 🔥 Abstand wächst je Runde

                  const currentTop = getTopPosition(roundIndex, matchIndex);
                  const nextTop = getTopPosition(roundIndex + 1, Math.floor(matchIndex / 2));

                  const matchDef =
                    roundIndex === 0 && KO_STRUCTURE.round16[matchIndex]
                      ? KO_STRUCTURE.round16[matchIndex]
                      : null;

                  let teamA;
                  let teamB;

                  if (roundIndex === 0) {
                    const matchDef = KO_STRUCTURE.round16[matchIndex];

                    teamA = resolveSlot(matchDef[0], context);
                    teamB = resolveSlot(matchDef[1], context);
                  } else {
                    teamA = getTeamFromPrevious(roundIndex, matchIndex, "A");
                    teamB = getTeamFromPrevious(roundIndex, matchIndex, "B");
                  }

                  return (
                    <div
                      key={m.id}
                      style={{
                        position: "absolute",
                        top: `${getTopPosition(roundIndex, matchIndex)}px`,
                        left: `${roundIndex * 220}px`
                      }}
                    >
                      {/* 🔲 MATCH BOX */}
                      <div
                        style={{
                          border: "1px solid black",
                          padding: "10px",
                          width: "170px",
                          height: "100px",
                          background: "#fff",
                          position: "relative",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          boxSizing: "border-box"
                        }}
                      >

                        <div>{teamA}</div>
                        <div>{teamB}</div>

                        {tip ? (
                          <div>
                            {tip.goals_a !== null && tip.goals_b !== null
                              ? `${tip.goals_a} : ${tip.goals_b}`
                              : ""}
                            {tip.winner && ` (${Number(tip.winner) === 1 ? teamA : teamB})`}
                          </div>
                        ) : !phase?.is_submitted ? (
                          roundIndex === 0 ? (
                            <select
                              onChange={(e) =>
                                saveTip(m.id, null, null, e.target.value)
                              }
                            >
                              <option value="">-</option>
                              <option value="1">{teamA}</option>
                              <option value="2">{teamB}</option>
                            </select>
                          ) : teamA !== "?" && teamB !== "?" ? (
                            <TipInput
                              isKO={true}
                              teamA={teamA}
                              teamB={teamB}
                              onSave={(a, b, w) => saveTip(m.id, a, b, w)}
                            />
                          ) : null
                        ) : null}
                      </div>    

                      {roundIndex < Object.keys(koByRound).length - 1 && (
                        <>
                          {/* Linie von JEDEM Spiel nach rechts */}
                          <div
                            style={{
                              position: "absolute",
                              top: "50%",
                              right: "-25px",
                              width: "25px",
                              height: "2px",
                              background: "black"
                            }}
                          />

                          {/* NUR für jedes obere Spiel (0,2,4...) */}
                          {matchIndex % 2 === 0 && (
                            <>
                              {/* Abstand zwischen den zwei Spielen */}
                              <div
                                style={{
                                  position: "absolute",
                                  top: "50%",
                                  right: "-25px",
                                  width: "2px",
                                  height: `${baseSpacing * Math.pow(2, roundIndex)}px`,
                                  background: "black"
                                }}
                              />

                              {/* Verbindung zur nächsten Runde (mittig!) */}
                              <div
                                style={{
                                  position: "absolute",
                                  top: `calc(${nextTop - currentTop}px + 50%)`,
                                  right: "-50px",
                                  width: "25px",
                                  height: "2px",
                                  background: "black"
                                }}
                              />
                            </>
                          )}
                        </>
                      )}
                                            
                    </div>
                  );
                })}
              </div>
            ))}
            </div>
          </div>
                 
        </div>

      </div>
    </div>
  );
}

//////////////////////////////////////////
// 9️⃣ TIP INPUT
//////////////////////////////////////////
function TipInput({ onSave, isKO, teamA, teamB }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [w, setW] = useState("");

  return (
    <div>
      <input
        type="number"
        min="0"
        value={a}
        onChange={(e) => setA(e.target.value)}
        style={{ width: "50px" }}
      />

      :

      <input
        type="number"
        min="0"
        value={b}
        onChange={(e) => setB(e.target.value)}
        style={{ width: "50px" }}
      />
      
      {isKO && a === b && (
        <select value={w} onChange={(e) => setW(e.target.value)}>
          <option value="">-</option>
          <option value="1">{teamA}</option>
          <option value="2">{teamB}</option>
        </select>
      )}

      <button onClick={() => onSave(a, b, w)}>Speichern</button>
    </div>
  );
}

//////////////////////////////////////////
// 🔟 APP (LOGIN + NAVI)
//////////////////////////////////////////
function App() {
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [phase, setPhase] = useState(1);

  useEffect(() => {
    supabase.from("player").select("*").then(({ data }) => setPlayers(data));
  }, []);

  function checkPin() {
    if (pin === selectedPlayer.pin) {
      setLoggedIn(true);
      setError("");
    } else {
      setError("Falscher PIN");
    }
  }

  function logout() {
    setSelectedPlayer(null);
    setPin("");
    setLoggedIn(false);
  }

  return (
    <div style={{ padding: "20px" }}>
      <h1>Tippspiel</h1>

      {/* 🔐 LOGIN */}
      {!loggedIn && (
        <div>
          <h2>Spieler auswählen</h2>

          {!selectedPlayer &&
            players.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(p)}
                style={{ display: "block", margin: "10px 0" }}
              >
                {p.name}
              </button>
            ))}

          {selectedPlayer && (
            <div>
              <h3>{selectedPlayer.name}</h3>

              <input
                type="password"
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
              />

              <button onClick={checkPin}>Einloggen</button>

              {error && <p style={{ color: "red" }}>{error}</p>}
            </div>
          )}
        </div>
      )}

      {/* 🎯 APP */}
      {loggedIn && (
        <div style={{ display: "flex" }}>

          {/* 🟣 SIDEBAR */}
          <div style={{ width: "150px", marginRight: "20px" }}>
            <h3>Tipps</h3>

            {[1, 2, 3, 4, 5].map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                style={{
                  display: "block",
                  marginBottom: "10px",
                  background: phase === p ? "#ccc" : "#fff"
                }}
              >
                Tipp {p}
              </button>
            ))}

            <hr />

            <button onClick={logout}>Logout</button>
          </div>

          {/* 🟢 CONTENT */}
            <div style={{ flex: 1 }}>

              {/* 🔼 SCROLLBAR OBEN */}
              <div
                style={{
                  overflowX: "auto",
                  overflowY: "hidden"
                }}
              >
                <div style={{ width: "1800px", height: "1px" }} />
              </div>

              {/* 🔽 HAUPTINHALT */}
              <div
                style={{
                  overflow: "auto",
                  maxHeight: "90vh"
                }}
              >
                <div style={{ minWidth: "1800px", padding: "20px" }}>
                  <TippsPage player={selectedPlayer} phaseId={phase} />
                </div>
              </div>

            </div>

        </div>
      )}
    </div>
  );
}

export default App;