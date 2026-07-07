import React, { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { getBestThirds } from "../Utils/calcTable";

// --- KONSTANTEN & STYLES ---
import { 
  UI_STYLES, KO_STRUCTURE, ROUND_NAMES, 
  PHASE_SPACING, PHASE_HEIGHTS, TIPPS_PAGE_STYLES
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
  const [dbTips, setDbTips] = useState({});           
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

  // NEU: Strikte Kontrolle, ob ALLE Gruppen vollständig in der DB gesichert wurden
  const allGroupsSaved = useMemo(() => {
    const groupMatches = matches.filter(m => m.stage === "group");
    if (groupMatches.length === 0) return false;
    return groupMatches.every(m => {
      const dbTip = dbTips[m.id];
      return dbTip && 
             dbTip.goals_a !== null && dbTip.goals_a !== undefined && dbTip.goals_a !== "" &&
             dbTip.goals_b !== null && dbTip.goals_b !== undefined && dbTip.goals_b !== "";
    });
  }, [matches, dbTips]);

  // STATUS-VALIDIERUNG PRO EINZELNER GRUPPE
  const groupStatus = useMemo(() => {
    const statusMap = {};
    Object.keys(grouped).forEach(name => {
      const groupMatches = grouped[name] || [];
      
      const allEntered = groupMatches.length === 6 && groupMatches.every(m => {
        const t = tips[m.id];
        return t && 
               t.goals_a !== null && t.goals_a !== undefined && t.goals_a !== "" &&
               t.goals_b !== null && t.goals_b !== undefined && t.goals_b !== "";
      });

      let ranksMissing = false;
      const teamsInGroup = allGroupsArray.find(g => g.id === name)?.teams || [];
      
      if (allEntered) {
        const tied = teamsInGroup.filter((teamA, i) => 
          teamsInGroup.some((teamB, j) => 
            i !== j && teamA.points === teamB.points && teamA.diff === teamB.diff && teamA.goals === teamB.goals
          )
        );
        if (tied.length > 0) {
          const ranks = tied.map(t => manualRanks[t.team]);
          if (ranks.some(r => r === null || r === undefined || r === "")) ranksMissing = true;
          const clean = ranks.filter(r => r !== null && r !== undefined && r !== "");
          if (new Set(clean).size !== clean.length) ranksMissing = true;
        }
      }

      statusMap[name] = {
        isReady: allEntered && !ranksMissing,
        allEntered,
        ranksMissing
      };
    });
    return statusMap;
  }, [grouped, tips, allGroupsArray, manualRanks]);

  // VALIDIERUNG FÜR FINALE ABGABE
  const completionStatus = useMemo(() => {
    const targets = { 1: { m: 72, p: 32 }, 2: { m: 16, p: 16 }, 3: { m: 8, p: 8 }, 4: { m: 4, p: 4 }, 5: { m: 10, p: 0 } };
    const currentTarget = targets[numericPhaseId] || { m: 0, p: 0 };

    let matchesCount = Object.keys(dbTips).filter(key => {
      if (typeof key === 'string' && key.startsWith('OPT')) return false;
      return dbTips[key]?.goals_a !== null && dbTips[key]?.goals_b !== null;
    }).length;

    if (numericPhaseId === 5) {
      const matrixCount = Object.keys(dbTips).filter(key => typeof key === 'string' && key.startsWith('OPT') && dbTips[key]?.goals_a !== null && dbTips[key]?.goals_b !== null).length;
      matchesCount += matrixCount;
    }

    const prognosisCount = Object.keys(dbTips).filter(key => {
      if (typeof key === 'string' && key.startsWith('OPT')) return false;
      return dbTips[key]?.winner !== null && dbTips[key]?.goals_a === null && dbTips[key]?.goals_b === null;
    }).length;

    let groupRanksMissing = false;
    if (numericPhaseId === 1) {
      Object.keys(grouped).forEach(name => {
        if (groupStatus[name]?.ranksMissing) groupRanksMissing = true;
      });
    }

    let thirdsRanksMissing = false;
    if (numericPhaseId === 1 && allGroupsSaved && bestThirds.length >= 9) {
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
  }, [dbTips, numericPhaseId, grouped, manualRanks, bestThirds, allGroupsSaved, groupStatus]);

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
    
    setTips({ ...map });
    setDbTips({ ...map });

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

    const currentMatch = matches.find(m => m.id === matchId);
    if (currentMatch?.stage === "group") {
      setTips(prev => ({ ...prev, [matchId]: { goals_a: gA, goals_b: gB, winner: calculatedWinner } }));
      return;
    }

    const isSpecial = typeof matchId === 'string' && matchId.startsWith('OPT');
    const isInputEmpty = (goalsA === "" || goalsA === null) && (goalsB === "" || goalsB === null) && (!winner);

    if (isInputEmpty) {
      if (isSpecial) {
        await supabase.from("tip_final_matrix").delete().eq("player_id", player.id).eq("matrix_key", matchId);
      } else {
        await supabase.from("tip").delete().eq("player_id", player.id).eq("match_id", matchId).eq("phase_id", phaseId);
      }
        
      setTips(prev => { const next = { ...prev }; delete next[matchId]; return next; });
      setDbTips(prev => { const next = { ...prev }; delete next[matchId]; return next; });
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
    setDbTips(prev => ({ ...prev, [matchId]: { goals_a: gA, goals_b: gB, winner: calculatedWinner } }));
  }

  async function saveGroup(groupName) {
    if (isReadOnly) return;

    const groupMatches = matches.filter(m => m.group_name === groupName);
    const tipsToUpsert = [];
    
    groupMatches.forEach(m => {
      const t = tips[m.id];
      if (t) {
        const gA = (t.goals_a !== null && t.goals_a !== "") ? Number(t.goals_a) : null;
        const gB = (t.goals_b !== null && t.goals_b !== "") ? Number(t.goals_b) : null;
        let calculatedWinner = t.winner;
        if (gA !== null && gB !== null) {
          if (gA > gB) calculatedWinner = "1";
          else if (gB > gA) calculatedWinner = "2";
        }
        tipsToUpsert.push({
          player_id: player.id,
          match_id: m.id,
          phase_id: phaseId,
          goals_a: gA,
          goals_b: gB,
          winner: calculatedWinner
        });
      }
    });

    const teamsInGroup = [...new Set(groupMatches.flatMap(m => [m.team_a, m.team_b]))];
    const ranksToUpsert = [];
    teamsInGroup.forEach(teamName => {
      const r = manualRanks[teamName];
      if (r !== undefined && r !== null && r !== "") {
        ranksToUpsert.push({
          player_id: player.id,
          phase_id: phaseId,
          team_name: teamName,
          manual_rank: Number(r)
        });
      }
    });

    if (tipsToUpsert.length > 0) {
      await supabase.from("tip").upsert(tipsToUpsert, { onConflict: 'player_id, match_id, phase_id' });
    }
    if (ranksToUpsert.length > 0) {
      await supabase.from("tip_manual_rank").upsert(ranksToUpsert, { onConflict: 'player_id, phase_id, team_name' });
    }

    await fetchTips();

    if (numericPhaseId === 1 && allGroupsArray.length > 0) {
      const top8Thirds = bestThirds.slice(0, 8).map(t => t.team);
      await updateGroupPrognosisDB(player.id, allGroupsArray, top8Thirds);
    }
    if (Object.keys(koByRound).length > 0) {
      await updateKOPrognosisDB(player.id, phaseId, koByRound, tips, tournamentContext);
    }
  }

  async function saveManualRank(teamName, rank) {
    if (isReadOnly) return; 
    const val = rank === "" ? null : Number(rank);

    setManualRanks(prev => ({ ...prev, [teamName]: val }));

    const teamGroup = matches.find(m => m.team_a === teamName || m.team_b === teamName)?.group_name;
    const groupMatches = matches.filter(m => m.group_name === teamGroup);
    const isGroupAlreadySaved = groupMatches.length > 0 && groupMatches.every(m => dbTips[m.id] !== undefined);

    if (teamGroup && !isGroupAlreadySaved) {
      return;
    }

    await supabase.from("tip_manual_rank").upsert([{ player_id: player.id, phase_id: phaseId, team_name: teamName, manual_rank: val }], { onConflict: 'player_id, phase_id, team_name' });
  }

  async function resetGroup(groupName) {
    if (isReadOnly) return;
    const groupMatches = matches.filter(m => m.group_name === groupName);
    const matchIds = groupMatches.map(m => m.id);
    const teamsInGroup = [...new Set(groupMatches.flatMap(m => [m.team_a, m.team_b]))];
    
    await supabase.from("tip").delete().eq("player_id", player.id).in("match_id", matchIds);
    await supabase.from("tip_manual_rank").delete().eq("player_id", player.id).eq("phase_id", phaseId).in("team_name", teamsInGroup);
    await supabase.from("user_points_detail").delete().eq("player_id", player.id).in("match_id", matchIds);
    
    setTips(prev => {
      const next = { ...prev };
      matchIds.forEach(id => delete next[id]);
      return next;
    });
    setManualRanks(prev => {
      const next = { ...prev };
      teamsInGroup.forEach(t => delete next[t]);
      return next;
    });

    await deleteKORound(1, phaseId);
    await fetchTips(); 
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

    await fetchTips();
  }

  async function resetOption(optId) {
    if (isReadOnly) return; 
    setTips(prev => { const next = { ...prev }; delete next[`OPT${optId}_F`]; delete next[`OPT${optId}_S3`]; return next; });
    await supabase.from("tip_final_matrix").delete().eq("player_id", player.id).in("matrix_key", [`OPT${optId}_F`, `OPT${optId}_S3`]);
    await fetchTips();
  }

  const currentSpacing = phase ? (PHASE_SPACING[phase.id] || 70) : 70;
  const startIdxOfPhase = phase ? (phase.id <= 2 ? 0 : phase.id - 2) : 0;
  const topOffset = getTopPosition(startIdxOfPhase, 0, treeHeight, currentSpacing);

  useEffect(() => {
    if (!player?.id || matches.length === 0 || isReadOnly) return;
    const handler = setTimeout(async () => {
      if (Object.keys(koByRound).length > 0) {
        await updateKOPrognosisDB(player.id, phaseId, koByRound, tips, tournamentContext);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [tips, phaseId, player?.id, koByRound, tournamentContext, isReadOnly]);

  if (!player || !phaseId) return <div style={{ padding: "20px" }}>Lade Benutzerdaten...</div>;

  return (
    <div style={TIPPS_PAGE_STYLES.container}>
      
      {showContent && (
        <div style={TIPPS_PAGE_STYLES.headerBar}>
          <div>
            <h2 style={TIPPS_PAGE_STYLES.headerTitle}>Tippabgabe – Phase {phaseId}</h2>
          </div>
          
          <div style={TIPPS_PAGE_STYLES.statusWrapper}>
            {isPlayerSubmitted ? (
              <div style={TIPPS_PAGE_STYLES.bannerSuccess}>✓ Tipps erfolgreich abgegeben</div>
            ) : phase?.is_submitted || systemConfig?.tips_locked_global ? (
              <div style={TIPPS_PAGE_STYLES.bannerLocked}>🔒 Phase gesperrt</div>
            ) : (phase?.id === 5 ? completionStatus.currentM !== completionStatus.targetM : !completionStatus.isReady) ? (
              <div style={TIPPS_PAGE_STYLES.bannerError}>
                ❌ Abgabe noch nicht möglich, es müssen noch Spiele getippt werden: {
                  completionStatus.groupRanksMissing ? "Es fehlen noch Stichwahlen in den Tabellen!" :
                  completionStatus.thirdsRanksMissing ? "Kritischer Gleichstand bei Gruppendritten (Platz 8 vs 9) benötigt Stichwahl!" :
                  numericPhaseId === 5 
                    ? `${completionStatus.currentM}/${completionStatus.targetM} Spiele getippt`
                    : `${completionStatus.currentM}/${completionStatus.targetM} Spiele getippt & ${completionStatus.currentP}/${completionStatus.targetP} Prognosen getippt`
                }
              </div>
            ) : (
              <button onClick={() => setShowConfirmModal(true)} style={TIPPS_PAGE_STYLES.submitButton}>
                🚀 Tipps final abgeben
              </button>
            )}
          </div>
        </div>
      )}

      {showContent ? (
        <div style={TIPPS_PAGE_STYLES.contentGrid}>
          {numericPhaseId === 1 && (
            <div style={TIPPS_PAGE_STYLES.columnWidth}>
              <div ref={groupRef}>
                <div style={TIPPS_PAGE_STYLES.groupPadding}>
                  <h3 style={TIPPS_PAGE_STYLES.sectionTitle}>Gruppenphase</h3>
                  <div style={TIPPS_PAGE_STYLES.groupGrid}>
                    {Object.keys(grouped).sort().map(name => {
                      const groupMatches = grouped[name] || [];
                      const isGroupSaved = groupMatches.length === 6 && groupMatches.every(m => dbTips[m.id] !== undefined);

                      return (
                        <div key={name} style={TIPPS_PAGE_STYLES.groupFrame}>
                          <GroupTable 
                            groupName={name} matches={groupMatches} tips={tips} dbTips={dbTips}
                            tableData={allGroupsArray.find(g => g.id === name)?.teams || []} 
                            onSaveTip={saveTip} isSubmitted={isReadOnly} isGroupSaved={isGroupSaved} 
                            manualRanks={manualRanks} onSaveManualRank={saveManualRank} 
                            onDeleteTips={isReadOnly ? null : resetGroup} groupStatus={groupStatus[name]} 
                            onSaveGroup={saveGroup}          
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {allGroupsSaved && (
                  <div style={TIPPS_PAGE_STYLES.thirdsPadding}>
                    <h3 style={TIPPS_PAGE_STYLES.sectionTitle}>Vergleich der Gruppendritten</h3>
                    <BestThirdsTable 
                      teams={bestThirds} manualRanks={manualRanks} onSaveManualRank={saveManualRank} 
                      isSubmitted={isReadOnly} isGroupPhaseComplete={allGroupsSaved} 
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={TIPPS_PAGE_STYLES.columnWidth}>
            <div style={TIPPS_PAGE_STYLES.koPadding}>
              <h3 style={TIPPS_PAGE_STYLES.sectionTitleKO}>KO-Phase</h3>
              
              {numericPhaseId === 1 && !allGroupsSaved && (
                <div style={TIPPS_PAGE_STYLES.koWarning}>
                  ⚠️ Der KO-Baum wird erst freigeschaltet, wenn alle Gruppen vollständig gespeichert wurden.
                </div>
              )}

              <div style={TIPPS_PAGE_STYLES.koFlex}>
                <KOBracket 
                  koByRound={koByRound} tips={tips} treeHeight={treeHeight} roundNames={ROUND_NAMES} 
                  phase={{ ...phase, is_submitted: isReadOnly }} 
                  getTopPosition={(rIdx, mIdx) => getTopPosition(rIdx, mIdx, treeHeight, currentSpacing) - topOffset} 
                  getTeamFromPrevious={(rIdx, mIdx, side) => {
                    if (numericPhaseId === 1 && !allGroupsSaved) return null;
                    if (numericPhaseId === 1 && rIdx === 0) {
                      const matchPair = KO_STRUCTURE.round16[mIdx];
                      const slot = side === "A" ? matchPair[0] : matchPair[1];
                      return resolveSlot(slot, tournamentContext) || null;
                    }
                    return getTeamFromPrevious(rIdx, mIdx, side, koByRound, tips, tournamentContext);
                  }}
                  resolveSlot={(slot) => {
                    if (numericPhaseId === 1 && !allGroupsSaved) return null;
                    return resolveSlot(slot, tournamentContext);
                  }} 
                  saveTip={isReadOnly || (numericPhaseId === 1 && !allGroupsSaved) ? null : saveTip} 
                  deleteKORound={isReadOnly ? null : deleteKORound} KO_STRUCTURE={KO_STRUCTURE} isAdmin={false} 
                />
                {numericPhaseId === 5 && (
                  <Phase5Matrix 
                    koByRound={koByRound} tips={tips} isReadOnly={isReadOnly} resetOption={resetOption} saveTip={saveTip}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : <div style={TIPPS_PAGE_STYLES.lockedGlobal}>Die Tippabgabe ist aktuell gesperrt.</div>}

      {showConfirmModal && (
        <div style={TIPPS_PAGE_STYLES.modalOverlay}>
          <div style={TIPPS_PAGE_STYLES.modalContent}>
            <div style={TIPPS_PAGE_STYLES.modalEmoji}>🚀</div>
            <h3 style={TIPPS_PAGE_STYLES.modalTitle}>Tipps final abgeben?</h3>
            <p style={TIPPS_PAGE_STYLES.modalText}>
              Bist du dir absolut sicher? Nach der Abgabe kannst du deine Tipps für diese Phase **nicht mehr ändern**.
            </p>
            <div style={TIPPS_PAGE_STYLES.modalActions}>
              <button onClick={() => setShowConfirmModal(false)} style={TIPPS_PAGE_STYLES.modalBtnCancel}>Abbrechen</button>
              <button onClick={submitTipsFinal} style={TIPPS_PAGE_STYLES.modalBtnConfirm}>Ja, jetzt abgeben</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default TippsPage;