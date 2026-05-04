import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import { getBestThirds } from "../Utils/calcTable";

// --- LOGIK & UTILS ---
import { calculateTable } from "../logic/tournamentLogic";
import { getTopPosition, resolveSlot, getTeamFromPrevious } from "../logic/koLogic";

// --- UI-KOMPONENTEN ---
import GroupTable from './GroupTable';
import KOBracket from './KOBracket';
import BestThirdsTable from './BestThirdsTable';
import TipInput from './TipInput';

// ... (Styles und Konstanten bleiben identisch)
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

const PHASE_SPACING = { 1: 300, 2: 200, 3: 100, 4: 50, 5: 25 };
const PHASE_HEIGHTS = { 1: 2400, 2: 1200, 3: 800, 4: 600, 5: 400 };

const matrixBoxOuterStyle = { width: "240px", minHeight: "115px", background: "#fff", borderRadius: "10px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" };
const teamRowSimulatedStyle = { padding: "10px 12px", display: "flex", alignItems: "center", height: "40px", fontSize: "0.85rem", gap: "10px", position: "relative" };
const flagWrapperStyle = { width: "22px", height: "16px", overflow: "hidden", borderRadius: "2px", border: "1px solid #eee", display: "flex", alignItems: "center" };
const flagImgStyle = { width: "100%", height: "auto" };
const matrixLabelStyle = { fontSize: "0.65rem", fontWeight: "bold", color: "#878b8e", textTransform: "uppercase", marginBottom: "4px" };
const headerColumnStyle = { width: "240px", textAlign: "center", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "32px", marginTop: "20px" };
const roundTitleStyle = { fontWeight: "bold", fontSize: "1rem", color: "#2d3748" };
const resetButtonStyle = { padding: "4px 8px", fontSize: "0.75rem", backgroundColor: "#fff", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer", color: "#666" };
const tipContainerStyle = { padding: "6px 10px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" };
const savedTipDisplayStyle = { fontSize: "0.9rem", textAlign: "center", fontWeight: "bold", color: "#1a73e8", display: "flex", flexDirection: "column", gap: "2px" };
const winnerSubTextStyle = { fontSize: "0.65rem", color: "#666", fontWeight: "normal" };

function TippsPage({ player, phaseId, context, isAdmin }) {
  const [matches, setMatches] = useState([]);
  const [tips, setTips] = useState({});
  const [phase, setPhase] = useState(null);
  const [treeHeight, setTreeHeight] = useState(800);
  const groupRef = useRef(null);

  useEffect(() => {
    // Sicherstellen, dass player existiert, bevor fetch aufgerufen wird
    if (player?.id && phaseId) {
      fetchMatches();
      fetchTips();
      fetchPhase();
    }
  }, [phaseId, player?.id]);

  useEffect(() => {
    const currentId = Number(phaseId);
    if (PHASE_HEIGHTS[currentId]) {
      setTreeHeight(PHASE_HEIGHTS[currentId]);
    } else if (currentId === 1 && groupRef.current) {
      setTreeHeight(groupRef.current.offsetHeight);
    }
  }, [matches, tips, phaseId]);

  // --- EARLY RETURN ---
  // Wenn noch kein Player oder Phase-Informationen da sind, rendern wir "Laden"
  // Das verhindert den "Cannot read properties of null (reading 'id')" Fehler
  if (!player || !phaseId) {
    return <div style={{ padding: "20px" }}>Lade Benutzerdaten...</div>;
  }

  async function fetchMatches() {
    const { data } = await supabase.from("match").select("*");
    setMatches(data || []);
  }

  async function fetchTips() {
    if (!player?.id || !phaseId) return;
    const { data: normalData } = await supabase.from("tip").select("*").eq("player_id", player.id).eq("phase_id", phaseId);
    let matrixData = [];
    if (Number(phaseId) === 5) {
      const { data } = await supabase.from("tip_final_matrix").select("*").eq("player_id", player.id);
      if (data) matrixData = data;
    }
    const map = {};
    normalData?.forEach((t) => (map[t.match_id] = t));
    matrixData?.forEach((t) => (map[t.matrix_key] = t));
    setTips(map);
  }

  async function fetchPhase() {
    if (!phaseId) return;
    const { data } = await supabase.from("tip_phase").select("*").eq("id", phaseId).single();
    setPhase(data);
  }

  // --- HELPER LOGIK ---
  const getWinningSide = (tip) => {
    if (!tip) return null;
    const gA = (tip.goals_a !== null && tip.goals_a !== "") ? Number(tip.goals_a) : null;
    const gB = (tip.goals_b !== null && tip.goals_b !== "") ? Number(tip.goals_b) : null;
    if (gA !== null && gB !== null) {
      if (gA > gB) return "1";
      if (gB > gA) return "2";
      return tip.winner ? String(tip.winner) : null;
    }
    return tip.winner ? String(tip.winner) : null;
  };

  const getSHVH = (match, type) => {
    if (!match) return "?";
    const tip = tips[match.id];
    if (!tip || !tip.winner) return "?";
    if (type === "SH") return tip.winner === "1" ? match.team_a : match.team_b;
    return tip.winner === "1" ? match.team_b : match.team_a;
  };

  const getCountryCode = (teamName) => {
    const mapping = {
      "Mexiko": "mx", "Südafrika": "za", "Südkorea": "kr", "Tschechien": "cz",
      "Kanada": "ca", "Bosnien": "ba", "USA": "us", "Paraguay": "py",
      "Katar": "qa", "Schweiz": "ch", "Brasilien": "br", "Marokko": "ma",
      "Haiti": "ht", "Schottland": "gb-sct", "Australien": "au", "Türkei": "tr",
      "Deutschland": "de", "Curaçao": "cw", "Niederlande": "nl", "Japan": "jp",
      "Elfenbeinküste": "ci", "Ecuador": "ec", "Schweden": "se", "Tunesien": "tn",
      "Spanien": "es", "Kap Verde": "cv", "Belgien": "be", "Ägypten": "eg",
      "Saudi-Arabien": "sa", "Uruguay": "uy", "Iran": "ir", "Neuseeland": "nz",
      "Frankreich": "fr", "Senegal": "sn", "Irak": "iq", "Norwegen": "no",
      "Argentinien": "ar", "Algerien": "dz", "Österreich": "at", "Jordanien": "jo",
      "Portugal": "pt", "Kongo": "cd", "England": "gb-eng", "Kroatien": "hr",
      "Ghana": "gh", "Panama": "pa", "Usbekistan": "uz", "Kolumbien": "co"
    };
    return mapping[teamName] || null;
  };

  async function saveTip(matchId, goalsA, goalsB, winner) {
    if (phase?.is_submitted) return;
    const gA = (goalsA !== null && goalsA !== "") ? Number(goalsA) : null;
    const gB = (goalsB !== null && goalsB !== "") ? Number(goalsB) : null;
    let calculatedWinner = winner; 
    if (gA !== null && gB !== null) {
      if (gA > gB) calculatedWinner = "1";
      else if (gB > gA) calculatedWinner = "2";
    }
    const isSpecial = typeof matchId === 'string' && matchId.startsWith('OPT');
    if (isSpecial) {
      await supabase.from("tip_final_matrix").upsert([{
        player_id: player.id, matrix_key: matchId, goals_a: gA, goals_b: gB,
        winner: calculatedWinner, phase_id: phaseId,
      }], { onConflict: 'player_id, matrix_key' });
    } else {
      await supabase.from("tip").upsert([{
        player_id: player.id, match_id: matchId, phase_id: phaseId,
        goals_a: gA, goals_b: gB, winner: calculatedWinner,
      }], { onConflict: 'player_id, match_id, phase_id' });
    }
    setTips(prev => ({ ...prev, [matchId]: { goals_a: gA, goals_b: gB, winner: calculatedWinner } }));
  }

  async function deleteKORound(stageOrder, pId) {
    const idsToDelete = matches.filter(m => m.stage === "ko" && Number(m.stage_order) >= Number(stageOrder)).map(m => m.id);
    if (idsToDelete.length > 0) {
      await supabase.from("tip").delete().eq("player_id", player.id).eq("phase_id", pId).in("match_id", idsToDelete);
    }
    if (Number(pId) === 5 && Number(stageOrder) >= 4) {
      await supabase.from("tip_final_matrix").delete().eq("player_id", player.id);
    }
    fetchTips();
  }

  async function resetOption(optId) {
    if (phase?.is_submitted) return;
    const keysToDelete = [`OPT${optId}_F`, `OPT${optId}_S3` ];
    await supabase.from("tip_final_matrix").delete().eq("player_id", player.id).in("matrix_key", keysToDelete);
    fetchTips();
  }

  const renderMatrixTeamRow = (teamName, side, isFirst, winningSide) => {
    const isWinner = winningSide === side;
    return (
      <div style={{ 
        ...teamRowSimulatedStyle, 
        background: isWinner ? "#f0fff4" : "transparent", 
        borderBottom: isFirst ? "1px solid #f1f5f9" : "none",
        justifyContent: "space-between",
        paddingRight: "15px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {teamName !== "?" ? (
            <div style={flagWrapperStyle}>
              <img src={`https://flagcdn.com/w40/${getCountryCode(teamName)}.png`} alt="" style={flagImgStyle} />
            </div>
          ) : (
            <div style={{ width: "22px", height: "16px", backgroundColor: "#f1f5f9", borderRadius: "2px" }} />
          )}
          <span style={{ 
            fontWeight: isWinner ? "700" : "400", 
            color: teamName === "?" ? "#cbd5e0" : "#1e293b" 
          }}>
            {teamName}
          </span>
        </div>
        {isWinner && <span style={{ color: "#48bb78", fontWeight: "bold" }}>✓</span>}
      </div>
    );
  };

  const renderPhase5Matrix = () => {
    const h1 = koByRound[4]?.[0];
    const h2 = koByRound[4]?.[1];
    if (!h1 || !h2) return null;

    const SH1 = getSHVH(h1, "SH");
    const VH1 = getSHVH(h1, "VH");
    const SH2 = getSHVH(h2, "SH");
    const VH2 = getSHVH(h2, "VH");

    const options = [
      { id: 2, fA: SH1, fB: VH2, sA: VH1, sB: SH2 },
      { id: 3, fA: VH1, fB: SH2, sA: SH1, sB: VH2 },
      { id: 4, fA: VH1, fB: VH2, sA: SH1, sB: SH2 }
    ];

    return (
      <div style={{ display: "flex", gap: "30px", marginLeft: "40px" }}>
        {options.map(opt => {
          const tipF = tips[`OPT${opt.id}_F`];
          const tipS3 = tips[`OPT${opt.id}_S3`];
          const winF = getWinningSide(tipF);
          const winS3 = getWinningSide(tipS3);

          return (
            <div key={opt.id} style={{ display: "flex", flexDirection: "column" }}>
              <div style={headerColumnStyle}>
                <span style={roundTitleStyle}>Variante {opt.id} F/Sp3</span>
                {!phase?.is_submitted && !isAdmin && (
                  <button onClick={() => resetOption(opt.id)} style={resetButtonStyle}>Reset</button>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "35px", marginTop: "120px" }}>
                <div>
                  <div style={matrixLabelStyle}>Finale (Variante {opt.id})</div>
                  <div style={matrixBoxOuterStyle}>
                    {renderMatrixTeamRow(opt.fA, "1", true, winF)}
                    {renderMatrixTeamRow(opt.fB, "2", false, winF)}
                    <div style={tipContainerStyle}>
                      {tipF ? (
                        <div style={savedTipDisplayStyle}>
                          {tipF.goals_a} : {tipF.goals_b}
                          {Number(tipF.goals_a) === Number(tipF.goals_b) && (
                            <span style={winnerSubTextStyle}>Sieger: {winF === "1" ? opt.fA : opt.fB}</span>
                          )}
                        </div>
                      ) : (
                        <TipInput 
                          teamA={opt.fA} teamB={opt.fB} isKO={true} 
                          onSave={(a,b,w) => saveTip(`OPT${opt.id}_F`, a,b,w)} 
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={matrixLabelStyle}>Platz 3 (Variante {opt.id})</div>
                  <div style={matrixBoxOuterStyle}>
                    {renderMatrixTeamRow(opt.sA, "1", true, winS3)}
                    {renderMatrixTeamRow(opt.sB, "2", false, winS3)}
                    <div style={tipContainerStyle}>
                      {tipS3 ? (
                        <div style={savedTipDisplayStyle}>
                          {tipS3.goals_a} : {tipS3.goals_b}
                          {Number(tipS3.goals_a) === Number(tipS3.goals_b) && (
                            <span style={winnerSubTextStyle}>Sieger: {winS3 === "1" ? opt.sA : opt.sB}</span>
                          )}
                        </div>
                      ) : (
                        <TipInput 
                          teamA={opt.sA} teamB={opt.sB} isKO={true} 
                          onSave={(a,b,w) => saveTip(`OPT${opt.id}_S3`, a,b,w)} 
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // --- HAUPT LOGIK FÜR TURNIERBAUM ---
  const grouped = {};
  matches.filter(m => m.stage === "group").forEach(m => {
    if (!grouped[m.group_name]) grouped[m.group_name] = [];
    grouped[m.group_name].push(m);
  });

  const allGroupsArray = Object.keys(grouped).map(name => ({ id: name, teams: calculateTable(grouped[name], tips) }));
  const bestThirds = getBestThirds(allGroupsArray);
  const groupResults = {};
  allGroupsArray.forEach(g => { groupResults[g.id] = g.teams.map(t => t.team); });

  const koMatches = matches.filter(m => m.stage === "ko").sort((a,b) => a.stage_order - b.stage_order || a.ko_order - b.ko_order);
  const koByRound = {};
  koMatches.forEach(m => {
    if (!koByRound[m.stage_order]) koByRound[m.stage_order] = [];
    koByRound[m.stage_order].push(m);
  });

  // WICHTIG: Nutze phaseId (Props) statt phase.id (State), 
  // da phase.id kurzzeitig null sein kann.
  const tournamentContext = { groups: groupResults, thirdPlaces: bestThirds.slice(0, 8), tips, phaseId: phaseId };
  
  // Auch hier: Sicherstellen, dass phase nicht null ist
  const currentSpacing = phase ? (PHASE_SPACING[phase.id] || 70) : 70;
  const startIdxOfPhase = phase ? (phase.id <= 2 ? 0 : phase.id - 2) : 0;
  const topOffset = getTopPosition(startIdxOfPhase, 0, treeHeight, currentSpacing);

  return (
    <div style={{ padding: "20px", width: "100%", overflowX: "auto" }}>
      <div style={{ display: "flex", flexDirection: "row", gap: "40px", alignItems: "flex-start" }}>
        {Number(phaseId) === 1 && (
          <div style={{ flexShrink: 0, width: "fit-content" }}>
            <div ref={groupRef}>
              <h3>Gruppenphase</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "30px", marginBottom: "40px", maxWidth: "1100px" }}>
                {Object.keys(grouped).sort().map(name => (
                  <GroupTable 
                    key={name} groupName={name} matches={grouped[name]} tips={tips} 
                    tableData={calculateTable(grouped[name], tips)} onSaveTip={saveTip} isSubmitted={phase?.is_submitted} 
                  />
                ))}
              </div>
              <BestThirdsTable teams={bestThirds} />
            </div>
          </div>
        )}
        <div style={{ flexGrow: 1 }}>
          <h3 style={{ marginLeft: "20px" }}>KO-Phase</h3>
          <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
            <div style={{ flexShrink: 0 }}>
              <KOBracket 
                koByRound={koByRound} tips={tips} treeHeight={treeHeight} 
                roundNames={ROUND_NAMES} phase={phase} isAdmin={isAdmin}
                getTopPosition={(rIdx, mIdx) => getTopPosition(rIdx, mIdx, treeHeight, currentSpacing) - topOffset}
                getTeamFromPrevious={(rIdx, mIdx, side) => getTeamFromPrevious(rIdx, mIdx, side, koByRound, tips, tournamentContext)}
                resolveSlot={(slot) => resolveSlot(slot, tournamentContext)}
                saveTip={saveTip} deleteKORound={deleteKORound} KO_STRUCTURE={KO_STRUCTURE}
              />
            </div>
            {Number(phaseId) === 5 && renderPhase5Matrix()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TippsPage;