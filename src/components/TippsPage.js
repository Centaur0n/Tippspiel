import React, { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { getBestThirds } from "../Utils/calcTable";

// --- KONSTANTEN & STYLES ---
import { 
  UI_STYLES, KO_STRUCTURE, ROUND_NAMES, 
  PHASE_SPACING, PHASE_HEIGHTS, 
} from '../Utils/uiConstants';

// --- LOGIK-FUNKTIONEN ---
import { calculateFIFADataTable } from "../logic/tournamentLogic";
import { getTopPosition, resolveSlot, getTeamFromPrevious } from "../logic/koLogic";
import { updateGroupPrognosisDB, updateKOPrognosisDB } from "../logic/prognosisHandler";

// --- UI-KOMPONENTEN ---
import GroupTable from './GroupTable';
import KOBracket from './KOBracket';
import BestThirdsTable from './BestThirdsTable';
import Phase5Matrix from './Phase5Matrix';

function TippsPage({ player, phaseId }) {
  const numericPhaseId = useMemo(() => Number(phaseId), [phaseId]);

  // --- STATES ---
  const [matches, setMatches] = useState([]);         
  const [tips, setTips] = useState({});              
  const [manualRanks, setManualRanks] = useState({}); 
  const [phase, setPhase] = useState(null);          
  const [systemConfig, setSystemConfig] = useState(null); 
  const [isPlayerSubmitted, setIsPlayerSubmitted] = useState(false); 
  const [showConfirmModal, setShowConfirmModal] = useState(false);   
  const [treeHeight, setTreeHeight] = useState(800);  
  const groupRef = useRef(null);                      

  // --- INITIALES LADEN ---
  useEffect(() => {
    if (player?.id && phaseId) {
      fetchMatches();      
      fetchTips();         
      fetchPhase();        
      fetchSystemConfig(); 
      fetchPlayerSubmission(); 
    }
  }, [phaseId, player?.id]);

  useEffect(() => {
    if (PHASE_HEIGHTS[numericPhaseId]) {
      setTreeHeight(PHASE_HEIGHTS[numericPhaseId]);
    } else if (numericPhaseId === 1 && groupRef.current) {
      setTreeHeight(groupRef.current.offsetHeight);
    }
  }, [matches, tips, numericPhaseId]);

  // --- MEMOISIERTE DATA-DERIVATIONS ---
  const grouped = useMemo(() => {
    const map = {};
    matches.filter(m => m.stage === "group").forEach(m => {
      if (!map[m.group_name]) map[m.group_name] = [];
      map[m.group_name].push(m);
    });
    return map;
  }, [matches]);

  const allGroupsArray = useMemo(() => {
    return Object.keys(grouped).map(name => ({ 
      id: name, 
      teams: calculateFIFADataTable(grouped[name], tips, manualRanks) 
    }));
  }, [grouped, tips, manualRanks]);

  const bestThirds = useMemo(() => {
    return getBestThirds(allGroupsArray, manualRanks);
  }, [allGroupsArray, manualRanks]);

  const groupResults = useMemo(() => {
    const res = {};
    allGroupsArray.forEach(g => { res[g.id] = g.teams.map(t => t.team); });
    return res;
  }, [allGroupsArray]);

  const koByRound = useMemo(() => {
    const map = {};
    matches.filter(m => m.stage === "ko")
      .sort((a, b) => a.stage_order - b.stage_order || a.ko_order - b.ko_order)
      .forEach(m => {
        if (!map[m.stage_order]) map[m.stage_order] = [];
        map[m.stage_order].push(m);
      });
    return map;
  }, [matches]);

  const tournamentContext = useMemo(() => ({ 
    groups: groupResults, 
    thirdPlaces: bestThirds.slice(0, 8), 
    tips, 
    phaseId 
  }), [groupResults, bestThirds, tips, phaseId]);

  // Exakte Kontrolle aller Gruppenspiele (A- und B-Tore müssen existieren)
  const allGroupMatchesFinished = useMemo(() => {
    const groupMatches = matches.filter(m => m.stage === "group");
    if (groupMatches.length === 0) return false;
    return groupMatches.every(m => {
      const t = tips[m.id];
      return t && 
        t.goals_a !== null && t.goals_a !== undefined && t.goals_a !== "" &&
        t.goals_b !== null && t.goals_b !== undefined && t.goals_b !== "";
    });
  }, [matches, tips]);

  // VALIDIERUNG INKLUSIVE STICHWAHLEN
  const completionStatus = useMemo(() => {
    const targets = { 1: { m: 72, p: 32 }, 2: { m: 16, p: 16 }, 3: { m: 8, p: 8 }, 4: { m: 4, p: 4 }, 5: { m: 10, p: 0 } };
    const currentTarget = targets[numericPhaseId] || { m: 0, p: 0 };

    let matchesCount = Object.keys(tips).filter(key => {
      if (typeof key === 'string' && key.startsWith('OPT')) return false;
      return tips[key]?.goals_a !== null && tips[key]?.goals_b !== null;
    }).length;

    if (numericPhaseId === 5) {
      const matrixCount = Object.keys(tips).filter(key => typeof key === 'string' && key.startsWith('OPT') && tips[key]?.goals_a !== null && tips[key]?.goals_b !== null).length;
      matchesCount += matrixCount;
    }

    const prognosisCount = Object.keys(tips).filter(key => {
      if (typeof key === 'string' && key.startsWith('OPT')) return false;
      return tips[key]?.winner !== null && tips[key]?.goals_a === null && tips[key]?.goals_b === null;
    }).length;

    // Kontrollprüfungen für Stichwahlen
    let groupRanksMissing = false;
    if (numericPhaseId === 1) {
      Object.keys(grouped).forEach(name => {
        const groupMatches = grouped[name];
        const teamsInGroup = allGroupsArray.find(g => g.id === name)?.teams || [];
        const isFinished = groupMatches.length > 0 && groupMatches.every(m => {
          const t = tips[m.id];
          return t && t.goals_a !== null && t.goals_a !== undefined && t.goals_a !== "" &&
                     t.goals_b !== null && t.goals_b !== undefined && t.goals_b !== "";
        });
        if (isFinished) {
          const tied = teamsInGroup.filter((teamA, i) => 
            teamsInGroup.some((teamB, j) => 
              i !== j && teamA.points === teamB.points && teamA.diff === teamB.diff && teamA.goals === teamB.goals
            )
          );
          if (tied.length > 0) {
            const ranks = tied.map(t => manualRanks[t.team]);
            if (ranks.some(r => r === null || r === undefined || r === "")) groupRanksMissing = true;
            const clean = ranks.filter(r => r !== null && r !== undefined && r !== "");
            if (new Set(clean).size !== clean.length) groupRanksMissing = true; 
          }
        }
      });
    }

    // Grenzbereich-Stichwahl bei Gruppendritten (Platz 8 vs Platz 9)
    let thirdsRanksMissing = false;
    if (numericPhaseId === 1 && allGroupMatchesFinished && bestThirds.length >= 9) {
      const targetA = bestThirds[7];
      const targetB = bestThirds[8];
      if (targetA.points === targetB.points && targetA.diff === targetB.diff && targetA.goals === targetB.goals) {
        const criticalTeams = bestThirds.filter(t => t.points === targetA.points && t.diff === targetA.diff && t.goals === targetA.goals);
        const ranks = criticalTeams.map(t => manualRanks[t.team]);
        if (ranks.some(r => r === null || r === undefined || r === "")) thirdsRanksMissing = true;
        const clean = ranks.filter(r => r !== null && r !== undefined && r !== "");
        if (new Set(clean).size !== clean.length) thirdsRanksMissing = true;
      }
    }

    const isReady = matchesCount >= currentTarget.m && 
                    prognosisCount >= currentTarget.p && 
                    !groupRanksMissing && 
                    !thirdsRanksMissing;

    return {
      isReady,
      currentM: matchesCount, targetM: currentTarget.m,
      currentP: prognosisCount, targetP: currentTarget.p,
      groupRanksMissing,
      thirdsRanksMissing
    };
  }, [tips, numericPhaseId, grouped, allGroupsArray, manualRanks, bestThirds, allGroupMatchesFinished]);

  const isReadOnly = phase?.is_submitted || systemConfig?.tips_locked_global || isPlayerSubmitted;
  const showContent = !systemConfig?.tips_locked_global;

  // --- API CALLS ---
  async function fetchMatches() {
    const { data } = await supabase.from("match").select("*");
    setMatches(data || []);
  }

  async function fetchTips() {
    if (!player?.id || !phaseId) return;
    const { data: normalData } = await supabase.from("tip").select("*").eq("player_id", player.id).eq("phase_id", phaseId);
    
    let matrixData = [];
    if (numericPhaseId === 5) {
      const { data } = await supabase.from("tip_final_matrix").select("*").eq("player_id", player.id);
      if (data) matrixData = data;
    }
    const { data: rankData = [] } = await supabase.from("tip_manual_rank").select("*").eq("player_id", player.id).eq("phase_id", phaseId);

    const map = {};
    normalData?.forEach((t) => (map[t.match_id] = t));
    matrixData?.forEach((t) => (map[t.matrix_key] = t));
    setTips(map);

    const rankMap = {};
    rankData?.forEach((r) => (rankMap[r.team_name] = r.manual_rank));
    setManualRanks(rankMap);
  }

  async function fetchPhase() {
    if (!phaseId) return;
    const { data } = await supabase.from("tip_phase").select("*").eq("id", phaseId).single();
    setPhase(data);
  }

  async function fetchSystemConfig() {
    const { data } = await supabase.from("system_config").select("*").single();
    setSystemConfig(data);
  }

  async function fetchPlayerSubmission() {
    if (!player?.id || !phaseId) return;
    const { data } = await supabase.from("player_phase_submission").select("is_submitted").eq("player_id", player.id).eq("phase_id", phaseId).maybeSingle();
    if (data) setIsPlayerSubmitted(data.is_submitted);
  }

  async function submitTipsFinal() {
    if (!completionStatus.isReady || isReadOnly) return;
    const { error } = await supabase.from("player_phase_submission").upsert([{
      player_id: player.id, phase_id: phaseId, is_submitted: true, submitted_at: new Date().toISOString()
    }], { onConflict: 'player_id, phase_id' });

    if (!error) {
      setIsPlayerSubmitted(true);
      setShowConfirmModal(false);
    }
  }

  // --- SPEICHER-AKTIONEN ---
  async function saveTip(matchId, goalsA, goalsB, winner) {
    if (isReadOnly) return; 
    const gA = (goalsA !== null && goalsA !== "") ? Number(goalsA) : null;
    const gB = (goalsB !== null && goalsB !== "") ? Number(goalsB) : null;
    
    let calculatedWinner = winner; 
    if (gA !== null && gB !== null) {
      if (gA > gB) calculatedWinner = "1";
      else if (gB > gA) calculatedWinner = "2";
    }

    const isSpecial = typeof matchId === 'string' && matchId.startsWith('OPT');
    const isInputEmpty = (goalsA === "" || goalsA === null) && (goalsB === "" || goalsB === null) && (!winner);

    if (isInputEmpty) {
      if (isSpecial) {
        await supabase.from("tip_final_matrix").delete().eq("player_id", player.id).eq("matrix_key", matchId);
      } else {
        await supabase.from("tip").delete().eq("player_id", player.id).eq("match_id", matchId).eq("phase_id", phaseId);
      }
        
      setTips(prev => {
        const next = { ...prev };
        delete next[matchId];
        return next;
      });
      return; 
    }

    if (isSpecial) {
      await supabase.from("tip_final_matrix").upsert([{
        player_id: player.id, matrix_key: matchId, goals_a: gA, goals_b: gB, winner: calculatedWinner, phase_id: phaseId,
      }], { onConflict: 'player_id, matrix_key' });
    } else {
      await supabase.from("tip").upsert([{
        player_id: player.id, match_id: matchId, phase_id: phaseId, goals_a: gA, goals_b: gB, winner: calculatedWinner,
      }], { onConflict: 'player_id, match_id, phase_id' });
    }

    setTips(prev => ({ ...prev, [matchId]: { goals_a: gA, goals_b: gB, winner: calculatedWinner } }));
  }

  async function saveManualRank(teamName, rank) {
    if (isReadOnly) return; 
    const val = rank === "" ? null : Number(rank);
    await supabase.from("tip_manual_rank").upsert([{ player_id: player.id, phase_id: phaseId, team_name: teamName, manual_rank: val }], { onConflict: 'player_id, phase_id, team_name' });
    setManualRanks(prev => ({ ...prev, [teamName]: val }));
  }

  async function resetGroup(groupName) {
    if (isReadOnly) return;
    const groupMatches = matches.filter(m => m.group_name === groupName);
    const matchIds = groupMatches.map(m => m.id);
    const teamsInGroup = [...new Set(groupMatches.flatMap(m => [m.team_a, m.team_b]))];
    
    await supabase.from("tip").delete().eq("player_id", player.id).in("match_id", matchIds);
    await supabase.from("tip_manual_rank").delete().eq("player_id", player.id).eq("phase_id", phaseId).in("team_name", teamsInGroup);
    await supabase.from("user_points_detail").delete().eq("player_id", player.id).in("match_id", matchIds);
    
    await deleteKORound(1, phaseId);
    fetchTips(); 
  }

  async function deleteKORound(stageOrder, pId) {
    if (isReadOnly) return; 
    const matchesToDelete = matches.filter(m => m.stage === "ko" && Number(m.stage_order) >= Number(stageOrder));
    const idsToDelete = matchesToDelete.map(m => m.id);
    if (idsToDelete.length > 0) {
      await supabase.from("tip").delete().eq("player_id", player.id).eq("phase_id", pId).in("match_id", idsToDelete);
      await supabase.from("user_points_detail").delete().eq("player_id", player.id).in("match_id", idsToDelete);
    } 

    if (numericPhaseId === 5) {
      await supabase.from("tip_final_matrix").delete().eq("player_id", player.id);
    }

    fetchTips();
  }

  async function resetOption(optId) {
  if (isReadOnly) return; 

  // 1. Lokalen State sofort säubern, um Race Conditions mit dem useEffect zu verhindern
  setTips(prev => {
    const next = { ...prev };
    delete next[`OPT${optId}_F`];
    delete next[`OPT${optId}_S3`];
    return next;
  });

  // 2. In der Datenbank löschen
  await supabase.from("tip_final_matrix").delete().eq("player_id", player.id).in("matrix_key", [`OPT${optId}_F`, `OPT${optId}_S3`]);
  
  // 3. Erst danach neu laden zur finalen Synchronisation
  fetchTips();
}

  const currentSpacing = phase ? (PHASE_SPACING[phase.id] || 70) : 70;
  const startIdxOfPhase = phase ? (phase.id <= 2 ? 0 : phase.id - 2) : 0;
  const topOffset = getTopPosition(startIdxOfPhase, 0, treeHeight, currentSpacing);

  // --- DB UPDATER FOR PROGNOSIS ---
  useEffect(() => {
    if (!player?.id || matches.length === 0 || isReadOnly) return;

    const handler = setTimeout(async () => {
      if (numericPhaseId === 1 && allGroupsArray.length > 0) {
        const top8Thirds = bestThirds.slice(0, 8).map(t => t.team);
        await updateGroupPrognosisDB(player.id, allGroupsArray, top8Thirds);
      }
      if (Object.keys(koByRound).length > 0) {
        await updateKOPrognosisDB(player.id, phaseId, koByRound, tips, tournamentContext);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [tips, phaseId, player?.id, allGroupsArray, bestThirds, koByRound, numericPhaseId, tournamentContext, isReadOnly]);

  if (!player || !phaseId) return <div style={{ padding: "20px" }}>Lade Benutzerdaten...</div>;

  return (
    /* HIER GEÄNDERT: overflowX: "auto" entfernt, damit die Dashboard-Scrollbar greift. 
       width auf "max-content" gestellt, um die feste Box-Begrenzung aufzuheben. */
    <div style={{ padding: "20px", width: "max-content", minWidth: "100%", position: "relative" }}>
      
      {showContent && (
        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", marginBottom: "20px", padding: "10px", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div>
            <h2 style={{ margin: 0, color: "#0f172a", marginRight: "30px" }}>Tippabgabe – Phase {phaseId}</h2>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
            {isPlayerSubmitted ? (
              <div style={{ padding: "8px 16px", borderRadius: "8px", backgroundColor: "#dcfce7", color: "#15803d", fontWeight: "700", fontSize: "14px", border: "1px solid #bbf7d0" }}>
                ✓ Tipps erfolgreich abgegeben
              </div>
            ) : phase?.is_submitted || systemConfig?.tips_locked_global ? (
              <div style={{ padding: "8px 16px", borderRadius: "8px", backgroundColor: "#fee2e2", color: "#b91c1c", fontWeight: "700", fontSize: "14px", border: "1px solid #fca5a5" }}>
                🔒 Phase gesperrt
              </div>
            ) : (phase?.id === 5 ? completionStatus.currentM !== completionStatus.targetM : !completionStatus.isReady) ? (
              <div style={{ color: "#dc2626", fontWeight: "600", fontSize: "13px", padding: "8px 12px", border: "1px dashed #fca5a5", borderRadius: "8px", backgroundColor: "#fff5f5" }}>
                ❌ Abgabe gesperrt: {
                  completionStatus.groupRanksMissing ? "Es fehlen noch Stichwahlen in den Tabellen!" :
                  completionStatus.thirdsRanksMissing ? "Kritischer Gleichstand bei Gruppendritten (Platz 8 vs 9) benötigt Stichwahl!" :
                  numericPhaseId === 5 
                    ? `${completionStatus.currentM}/${completionStatus.targetM} Spiele getippt`
                    : `${completionStatus.currentM}/${completionStatus.targetM} Spiele & ${completionStatus.currentP}/${completionStatus.targetP} Prognosen`
                }
              </div>
            ) : (
              <button 
                onClick={() => setShowConfirmModal(true)}
                style={{ padding: "10px 20px", borderRadius: "8px", border: "none", backgroundColor: "#22c55e", color: "white", cursor: "pointer", fontWeight: "700", fontSize: "14px" }}
              >
                🚀 Tipps final abgeben
              </button>
            )}
          </div>
        </div>
      )}

      {showContent ? (
        /* HIER GEÄNDERT: width: "max-content" und paddingRight ergänzt, um das Abschneiden 
           und Rausbrechen der Komponenten am rechten Bildschirmrand komplett zu verhindern. */
        <div style={{ display: "flex", flexDirection: "row", gap: "40px", alignItems: "flex-start", width: "max-content", minWidth: "100%", paddingRight: "40px" }}>
          {numericPhaseId === 1 && (
            <div style={{ flexShrink: 0, width: "fit-content" }}>
              <div ref={groupRef}>
                <div style={{ padding: "10px", marginBottom: "20px" }}>
                  <h3 style={{ color: "#0f172a", fontSize: "1.3rem", fontWeight: "700", margin: "0 0 16px 0" }}>Gruppenphase</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "30px", marginBottom: "40px", maxWidth: "1100px" }}>
                    {Object.keys(grouped).sort().map(name => (
                      <div key={name} style={{ position: 'relative' }}>
                        <GroupTable 
                          groupName={name} matches={grouped[name]} tips={tips} 
                          tableData={allGroupsArray.find(g => g.id === name)?.teams || []} 
                          onSaveTip={saveTip} isSubmitted={isReadOnly} manualRanks={manualRanks} 
                          onSaveManualRank={saveManualRank} onDeleteTips={isReadOnly ? null : resetGroup} 
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {allGroupMatchesFinished && (
                  <div style={{ padding: "10px" }}>
                    <BestThirdsTable 
                      teams={bestThirds} 
                      manualRanks={manualRanks} 
                      onSaveManualRank={saveManualRank} 
                      isSubmitted={isReadOnly} 
                      isGroupPhaseComplete={allGroupMatchesFinished} 
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HIER GEÄNDERT: flexShrink: 0 und width: "fit-content" gesetzt, damit der KO-Baum 
              seine echte Breite behält und nicht künstlich zusammengestaucht wird. */}
          <div style={{ flexShrink: 0, width: "fit-content" }}>
            <div style={{ padding: "10px" }}>
              <h3 style={{ marginLeft: "20px", color: "#0f172a", fontSize: "1.3rem", fontWeight: "700" }}>KO-Phase</h3>
              
              {numericPhaseId === 1 && !allGroupMatchesFinished && (
                <div style={{ marginLeft: "20px", marginBottom: "15px", color: "#eab308", fontWeight: "600", fontSize: "14px", backgroundColor: "#fef08a", padding: "8px 12px", borderRadius: "8px", border: "1px solid #fde047", maxWidth: "500px" }}>
                  ⚠️ Der KO-Baum wird erst freigeschaltet, wenn alle 72 Gruppenspiele vollständig getippt wurden.
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
                <KOBracket 
                  koByRound={koByRound} tips={tips} treeHeight={treeHeight} roundNames={ROUND_NAMES} 
                  phase={{ ...phase, is_submitted: isReadOnly }} 
                  getTopPosition={(rIdx, mIdx) => getTopPosition(rIdx, mIdx, treeHeight, currentSpacing) - topOffset} 
                  
                  getTeamFromPrevious={(rIdx, mIdx, side) => {
                    if (numericPhaseId === 1 && !allGroupMatchesFinished) return null;
                    if (numericPhaseId === 1 && rIdx === 0) {
                      const matchPair = KO_STRUCTURE.round16[mIdx];
                      const slot = side === "A" ? matchPair[0] : matchPair[1];
                      return resolveSlot(slot, tournamentContext) || null;
                    }
                    return getTeamFromPrevious(rIdx, mIdx, side, koByRound, tips, tournamentContext);
                  }}
                  resolveSlot={(slot) => {
                    if (numericPhaseId === 1 && !allGroupMatchesFinished) return null;
                    return resolveSlot(slot, tournamentContext);
                  }} 
                  
                  saveTip={isReadOnly || (numericPhaseId === 1 && !allGroupMatchesFinished) ? null : saveTip} 
                  deleteKORound={isReadOnly ? null : deleteKORound} 
                  KO_STRUCTURE={KO_STRUCTURE} isAdmin={false} 
                />
                {numericPhaseId === 5 && (
                  <Phase5Matrix 
                    koByRound={koByRound} tips={tips} isReadOnly={isReadOnly} resetOption={resetOption}
                    saveTip={saveTip}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : <div style={{ padding: "100px", textAlign: "center", color: "#94a3b8" }}>Die Tippabgabe ist aktuell gesperrt.</div>}

      {showConfirmModal && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 10000, backdropFilter: "blur(4px)" }}>
          <div style={{ backgroundColor: "white", padding: "30px", borderRadius: "16px", width: "420px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚀</div>
            <h3 style={{ margin: "0 0 10px 0", color: "#0f172a", fontSize: "18px", fontWeight: "700" }}>Tipps final abgeben?</h3>
            <p style={{ margin: "0 0 24px 0", color: "#475569", fontSize: "14px", lineHeight: "1.5" }}>
              Bist du dir absolut sicher? Nach der Abgabe kannst du deine Tipps für diese Phase **nicht mehr ändern**.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button onClick={() => setShowConfirmModal(false)} style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "white", color: "#475569", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}>Abbrechen</button>
              <button onClick={submitTipsFinal} style={{ padding: "10px 18px", borderRadius: "8px", border: "none", backgroundColor: "#22c55e", color: "white", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}>Ja, jetzt abgeben</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default TippsPage;