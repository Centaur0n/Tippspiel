import React, { useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { getBestThirds } from "../Utils/calcTable";
import { getCountryCode } from '../Utils/teamUtils';

// --- KONSTANTEN & STYLES ---
import { 
  UI_STYLES, KO_STRUCTURE, ROUND_NAMES, 
  PHASE_SPACING, PHASE_HEIGHTS, 
} from '../Utils/uiConstants';

// --- LOGIK-FUNKTIONEN ---
import { calculateFIFADataTable } from "../logic/tournamentLogic";
import { getTopPosition, resolveSlot, getTeamFromPrevious } from "../logic/koLogic";

// --- UI-KOMPONENTEN ---
import GroupTable from './GroupTable';
import KOBracket from './KOBracket';
import BestThirdsTable from './BestThirdsTable';
import TipInput from './TipInput';

const TourTooltip = ({ step, totalSteps, text, onNext, onPrev, onClose, placement = "top" }) => {
  const isTop = placement === "top";
  const isLeft = placement === "left";

  return (
    <div style={{
      position: "absolute",
      left: isLeft ? "auto" : "50%",
      right: isLeft ? "calc(100% + 16px)" : "auto",
      transform: isLeft ? "none" : "translateX(-50%)",
      ...(isTop ? { bottom: "calc(100% + 16px)" } : isLeft ? { top: "20%" } : { top: "calc(100% + 16px)" }),
      backgroundColor: "#1e293b",
      color: "white",
      padding: "16px",
      borderRadius: "12px",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
      zIndex: 9999,
      width: "280px",
      textAlign: "left",
      fontSize: "13px",
      fontWeight: "normal",
      textTransform: "none",
      letterSpacing: "normal"
    }}>
      <div style={{ fontWeight: "700", marginBottom: "6px", color: "#38bdf8", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Schritt {step + 1} von {totalSteps}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "14px", padding: 0 }}>✕</button>
      </div>
      <p style={{ margin: "0 0 12px 0", lineHeight: "1.5", color: "#f1f5f9" }}>{text}</p>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
        <button 
          onClick={onPrev} 
          disabled={step === 0} 
          style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid #475569", backgroundColor: "transparent", color: step === 0 ? "#475569" : "#f1f5f9", cursor: step === 0 ? "not-allowed" : "pointer", fontSize: "12px" }}
        >
          Zurück
        </button>
        <button 
          onClick={onNext} 
          style={{ padding: "6px 12px", borderRadius: "6px", border: "none", backgroundColor: "#2563eb", color: "white", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}
        >
          {step === totalSteps - 1 ? "Fertig" : "Weiter"}
        </button>
      </div>
      <div style={{ 
        position: "absolute", 
        width: "12px", 
        height: "12px", 
        backgroundColor: "#1e293b",
        transform: "rotate(45deg)",
        ...(isLeft 
          ? { right: "-6px", top: "calc(20% + 12px)", left: "auto" } 
          : { left: "50%", transform: "translateX(-50%) rotate(45deg)", ...(isTop ? { bottom: "-6px" } : { top: "-6px" }) }
        )
      }} />
    </div>
  );
};

function TippsPage({ player, phaseId }) {
  const numericPhaseId = useMemo(() => Number(phaseId), [phaseId]);

  // --- STATES ---
  const [matches, setMatches] = useState([]);         
  const [tips, setTips] = useState({});               
  const [manualRanks, setManualRanks] = useState({}); 
  const [phase, setPhase] = useState(null);           
  const [systemConfig, setSystemConfig] = useState(null); 
  const [isPlayerSubmitted, setIsPlayerSubmitted] = useState(false); // NEU: User-Abgabestatus
  const [showConfirmModal, setShowConfirmModal] = useState(false);   // NEU: Popup-Sicherheitsabfrage
  const [treeHeight, setTreeHeight] = useState(800);  
  const groupRef = useRef(null);                      

  const [currentTourIndex, setCurrentTourIndex] = useState(null);

  // --- INITIALES LADEN ---
  useEffect(() => {
    if (player?.id && phaseId) {
      fetchMatches();      
      fetchTips();         
      fetchPhase();        
      fetchSystemConfig(); 
      fetchPlayerSubmission(); // NEU: Abgabestatus prüfen
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

  // --- NEU: ABSOLUT FIXE VOLLSTÄNDIGKEITS-ERKENNUNG CLIENTSEITE ---
  const completionStatus = useMemo(() => {
    const targets = { 1: { m: 72, p: 32 }, 2: { m: 16, p: 16 }, 3: { m: 8, p: 8 }, 4: { m: 4, p: 4 }, 5: { m: 10, p: 6 } };
    const currentTarget = targets[numericPhaseId] || { m: 0, p: 0 };

    // Reale Spiele zählen (Tore eingetragen)
    let matchesCount = Object.keys(tips).filter(key => {
      if (typeof key === 'string' && key.startsWith('OPT')) return false;
      return tips[key]?.goals_a !== null && tips[key]?.goals_b !== null;
    }).length;

    // Für Phase 5 die ausgefüllten Matrizen dazurechnen
    if (numericPhaseId === 5) {
      const matrixCount = Object.keys(tips).filter(key => typeof key === 'string' && key.startsWith('OPT') && tips[key]?.goals_a !== null && tips[key]?.goals_b !== null).length;
      matchesCount += matrixCount;
    }

    // Prognose-Spiele zählen (Nur Winner eingetragen, Tore leer)
    const prognosisCount = Object.keys(tips).filter(key => {
      if (typeof key === 'string' && key.startsWith('OPT')) return false;
      return tips[key]?.winner !== null && tips[key]?.goals_a === null && tips[key]?.goals_b === null;
    }).length;

    return {
      isReady: matchesCount >= currentTarget.m && prognosisCount >= currentTarget.p,
      currentM: matchesCount,
      targetM: currentTarget.m,
      currentP: prognosisCount,
      targetP: currentTarget.p
    };
  }, [tips, numericPhaseId]);

  // --- LOCK DEFINITION ---
  // Ein User darf nichts mehr ändern, wenn global gesperrt, Phase adminseitig zu, ODER er selbst abgegeben hat!
  const isReadOnly = phase?.is_submitted || systemConfig?.tips_locked_global || isPlayerSubmitted;
  const showContent = !systemConfig?.tips_locked_global;

  // --- TOUR CONFIGURATION ---
  const tourSteps = useMemo(() => [
    { id: 'intro', title: 'Tipp-Zentrale', text: 'Willkommen! Hier gibst du deine Vorhersagen ab. Alle Eingaben werden sofort im Hintergrund gesichert.', placement: 'bottom' },
    ...(numericPhaseId === 1 ? [
      { id: 'groups', title: 'Gruppenphase', text: 'Trage hier deine Ergebnistipps ein. Die Tabellenstände berechnen und aktualisieren sich vollautomatisch in Echtzeit!', placement: 'bottom' },
      { id: 'thirds', title: 'Beste Gruppendritte', text: 'Diese Sondertabelle filtert die vier besten Gruppendritten heraus, die sich ebenfalls für das Achtelfinale qualifizieren.', placement: 'top' }
    ] : []),
    { id: 'ko', title: 'KO-Phase & Turnierbaum', text: 'Tippe hier den Verlauf der KO-Runden. Steht es nach regulärer Spielzeit unentschieden, kannst du per Klick direkt das Sieger-Team bestimmen.', placement: 'top' },
    ...(numericPhaseId === 5 ? [
      { id: 'matrix', title: 'Final-Matrix', text: 'In Phase 5 tippst du hier alle mathematisch möglichen Finalkonstellationen parallel, um die Maximalpunkte abzuräumen!', placement: 'left' }
    ] : [])
  ], [numericPhaseId]);

  const currentTourStep = currentTourIndex !== null ? tourSteps[currentTourIndex] : null;

  useEffect(() => {
    if (currentTourIndex !== null && currentTourStep?.id) {
      const targetElement = document.getElementById(`tour-${currentTourStep.id}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
    }
  }, [currentTourIndex, currentTourStep]);

  const handleTourNext = () => {
    if (currentTourIndex === tourSteps.length - 1) {
      setCurrentTourIndex(null);
    } else {
      setCurrentTourIndex(prev => prev + 1);
    }
  };

  const handleTourPrev = () => {
    if (currentTourIndex > 0) setCurrentTourIndex(prev => prev - 1);
  };

  const getTourStyle = (stepId) => {
    const isActive = currentTourStep?.id === stepId;
    return {
      transition: "all 0.3s ease-in-out",
      position: "relative",
      ...(isActive && {
        outline: "3px solid #2563eb",
        outlineOffset: "6px",
        borderRadius: "12px",
        boxShadow: "0 0 25px rgba(37, 99, 235, 0.35)",
        backgroundColor: "rgba(37, 99, 235, 0.02)",
        zIndex: 10
      })
    };
  };

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
    const { data: rankData } = await supabase.from("tip_manual_rank").select("*").eq("player_id", player.id).eq("phase_id", phaseId);

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
    const { data } = await supabase.from("player_phase_submission")
      .select("is_submitted")
      .eq("player_id", player.id)
      .eq("phase_id", phaseId)
      .single();
    if (data) setIsPlayerSubmitted(data.is_submitted);
  }

  // Finales Abspeichern der Abgabe durch den User
  async function submitTipsFinal() {
    if (!completionStatus.isReady || isReadOnly) return;
    
    const { error } = await supabase.from("player_phase_submission").upsert([{
      player_id: player.id,
      phase_id: phaseId,
      is_submitted: true,
      submitted_at: new Date().toISOString()
    }], { onConflict: 'player_id, phase_id' });

    if (!error) {
      setIsPlayerSubmitted(true);
      setShowConfirmModal(false);
    } else {
      console.error("Fehler bei der Finalabgabe:", error.message);
    }
  }

  const getWinner = (matchId, currentTips) => {
    const tip = currentTips[matchId];
    if (!tip || tip.winner === null) return null;
    return Number(tip.winner);
  };

  const getWinningSide = (tip) => {
    if (!tip) return null;
    const gA = (tip.goals_a !== undefined && tip.goals_a !== null && tip.goals_a !== "") ? Number(tip.goals_a) : null;
    const gB = (tip.goals_b !== undefined && tip.goals_b !== null && tip.goals_b !== "") ? Number(tip.goals_b) : null;
    if (gA !== null && gB !== null) {
      if (gA > gB) return "1";
      if (gB > gA) return "2";
    }
    return tip.winner ? String(tip.winner) : null;
  };

  const getWLphase5 = (match, type) => {
    if (!match) return "?";
    const tip = tips[match.id];
    if (!tip || !tip.winner) return "?";
    return tip.winner === "1" 
      ? (type === "SH" ? match.team_a : match.team_b) 
      : (type === "SH" ? match.team_b : match.team_a);
  };

  // --- SPEICHER-AKTIONEN (JETZT KORREKT GEGUARDED GEGEN LOCKS) ---
  async function saveTip(matchId, goalsA, goalsB, winner) {
    if (isReadOnly) return; // FIX: Verhindert jegliche Eingabe bei gesperrter Phase/Abgabe!
    const gA = (goalsA !== null && goalsA !== "") ? Number(goalsA) : null;
    const gB = (goalsB !== null && goalsB !== "") ? Number(goalsB) : null;
    
    let calculatedWinner = winner; 
    if (gA !== null && gB !== null) {
      if (gA > gB) calculatedWinner = "1";
      else if (gB > gA) calculatedWinner = "2";
    }

    const isSpecial = typeof matchId === 'string' && matchId.startsWith('OPT');
    const isInputEmpty = (goalsA === "" || goalsA === null) && 
                        (goalsB === "" || goalsB === null) && 
                        (!winner);

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
    fetchTips();
  }

  async function resetOption(optId) {
    if (isReadOnly) return; 
    await supabase.from("tip_final_matrix").delete().eq("player_id", player.id).in("matrix_key", [`OPT${optId}_F`, `OPT${optId}_S3`]);
    fetchTips();
  }

  const currentSpacing = phase ? (PHASE_SPACING[phase.id] || 70) : 70;
  const startIdxOfPhase = phase ? (phase.id <= 2 ? 0 : phase.id - 2) : 0;
  const topOffset = getTopPosition(startIdxOfPhase, 0, treeHeight, currentSpacing);

  // --- DB UPDATER FOR PROGNOSIS ---
  useEffect(() => {
    if (!player?.id || matches.length === 0 || isReadOnly) return; // FIX: Schreibt nichts mehr in DB wenn gesperrt

    const handler = setTimeout(async () => {
      if (numericPhaseId === 1 && allGroupsArray.length > 0) {
        const top8Thirds = bestThirds.slice(0, 8).map(t => t.team);
        await updateGroupPrognosisDB(player.id, allGroupsArray, top8Thirds);
      }
      if (Object.keys(koByRound).length > 0) {
        await updateKOPrognosisDB(player.id, phaseId, koByRound, tips, tournamentContext);
      }
      console.log("DB Prognose-Update ausgeführt!");
    }, 500);

    return () => clearTimeout(handler);
  }, [tips, phaseId, player?.id, allGroupsArray, bestThirds, koByRound, numericPhaseId, tournamentContext, isReadOnly]);

  // --- RENDER-HELPER ---
  const renderMatrixTeamRow = (teamName, side, isFirst, winningSide) => {
    const isWinner = winningSide === side;
    return (
      <div style={{ ...UI_STYLES.teamRowSimulated, background: isWinner ? "#f0fff4" : "transparent", borderBottom: isFirst ? "1px solid #f1f5f9" : "none", justifyContent: "space-between", paddingRight: "15px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {teamName !== "?" ? (
            <div style={UI_STYLES.flagWrapper}>
              <img src={`https://flagcdn.com/w40/${getCountryCode(teamName)}.png`} alt="" style={UI_STYLES.flagImg} />
            </div>
          ) : (
            <div style={{ width: "22px", height: "16px", backgroundColor: "#f1f5f9", borderRadius: "2px" }} />
          )}
          <span style={{ fontWeight: isWinner ? "700" : "400", color: teamName === "?" ? "#cbd5e0" : "#1e293b" }}>{teamName}</span>
        </div>
        {isWinner && <span style={{ color: "#48bb78", fontWeight: "bold" }}>✓</span>}
      </div>
    );
  };

  const renderPhase5Matrix = () => {
    const h1 = koByRound[4]?.[0];
    const h2 = koByRound[4]?.[1];
    if (!h1 || !h2) return null;
    const semiFinalsComplete = tips[h1.id] && tips[h2.id];
    
    const options = [
      { id: 2, fA: getWLphase5(h1, "SH"), fB: getWLphase5(h2, "VH"), sA: getWLphase5(h1, "VH"), sB: getWLphase5(h2, "SH") },
      { id: 3, fA: getWLphase5(h1, "VH"), fB: getWLphase5(h2, "SH"), sA: getWLphase5(h1, "SH"), sB: getWLphase5(h2, "VH") },
      { id: 4, fA: getWLphase5(h1, "VH"), fB: getWLphase5(h2, "VH"), sA: getWLphase5(h1, "SH"), sB: getWLphase5(h2, "SH") }
    ];

    return (
      <div id="tour-matrix" style={{ ...getTourStyle('matrix'), display: "flex", gap: "30px", marginLeft: "40px", padding: "10px" }}>
        {options.map(opt => {
          const tipF = tips[`OPT${opt.id}_F`];
          const tipS3 = tips[`OPT${opt.id}_S3`];
          const winF = getWinningSide(tipF);
          const winS3 = getWinningSide(tipS3);
          const canEdit = !isReadOnly && semiFinalsComplete;

          return (
            <div key={opt.id} style={{ display: "flex", flexDirection: "column", opacity: semiFinalsComplete ? 1 : 0.6 }}>
              <div style={UI_STYLES.headerColumn}>
                <span style={UI_STYLES.roundTitle}>Variante {opt.id} F/Sp3</span>
                {canEdit && <button onClick={() => resetOption(opt.id)} style={UI_STYLES.resetButton}>Reset</button>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "35px", marginTop: "120px" }}>
                {[ {label: 'Finale', key: `OPT${opt.id}_F`, tA: opt.fA, tB: opt.fB, tip: tipF, win: winF}, 
                   {label: 'Platz 3', key: `OPT${opt.id}_S3`, tA: opt.sA, tB: opt.sB, tip: tipS3, win: winS3} 
                ].map(m => (
                  <div key={m.key}>
                    <div style={UI_STYLES.matrixLabel}>{m.label} (V{opt.id})</div>
                    <div style={UI_STYLES.matrixBoxOuter}>
                      {renderMatrixTeamRow(m.tA, "1", true, m.win)}
                      {renderMatrixTeamRow(m.tB, "2", false, m.win)}
                      <div style={UI_STYLES.tipContainer}>
                        {m.tip || !canEdit ? (
                          <div style={UI_STYLES.savedTipDisplay}>
                            {m.tip ? <>{m.tip.goals_a ?? "-"} : {m.tip.goals_b ?? "-"} {m.tip.goals_a === m.tip.goals_b && <span style={UI_STYLES.winnerSubText}>{m.win === "1" ? m.tA : m.tB}</span>}</> : <span style={{color: "#94a3b8", fontSize: "0.7rem"}}>{!semiFinalsComplete ? "Warten..." : "Kein Tipp"}</span>}
                          </div>
                        ) : <TipInput teamA={m.tA} teamB={m.tB} isKO={true} onSave={(a,b,w) => saveTip(m.key, a,b,w)} />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {currentTourStep?.id === 'matrix' && (
          <TourTooltip 
            step={currentTourIndex} totalSteps={tourSteps.length} text={currentTourStep.text} placement={currentTourStep.placement}
            onNext={handleTourNext} onPrev={handleTourPrev} onClose={() => setCurrentTourIndex(null)}
          />
        )}
      </div>
    );
  };

  async function updateGroupPrognosisDB(playerId, groupsArr, bestThirdsTeams) {
    const records = groupsArr.map(g => {
      const groupFourth = g.teams[3]?.team;
      const groupThird = g.teams[2]?.team;
      let finalDroppedOut = [groupFourth].filter(Boolean);
      if (groupThird && !bestThirdsTeams.includes(groupThird)) {
        finalDroppedOut.push(groupThird);
      }
      const isThirdOfThisGroupInTop8 = groupThird && bestThirdsTeams.includes(groupThird);

      return {
        player_id: playerId, group_name: g.id,
        rank_1: g.teams[0]?.team || null, rank_2: g.teams[1]?.team || null,
        rank_3: g.teams[2]?.team || null, rank_4: g.teams[3]?.team || null,
        reached_ko: [g.teams[0]?.team, g.teams[1]?.team].filter(Boolean),
        reached_ko_best_thirds: isThirdOfThisGroupInTop8 ? [groupThird] : [], dropped_out: finalDroppedOut
      };
    });
    await supabase.from("user_prognosis_group").upsert(records, { onConflict: 'player_id, group_name' });
  }

  async function updateKOPrognosisDB(playerId, phId, koData, currentTips, context) {
    const currentId = Number(phId);
    const getTeamForPrognosis = (roundIdx, matchIdx, side) => {
      if (currentId === 1 && roundIdx === 0) {
        const slot = KO_STRUCTURE.round16[matchIdx][side === "A" ? 0 : 1];
        return resolveSlot(slot, context) || null;
      }
      const name = getTeamFromPrevious(roundIdx, matchIdx, side, koData, currentTips, context);
      return (name && name !== "?") ? name : null;
    };

    const getProgWinner = (roundIdx, matchIdx) => {
      const stageOrder = roundIdx + 1;
      const m = (koData[stageOrder] || [])[matchIdx];
      if (!m) return null;
      const winSide = getWinner(m.id, currentTips);
      return winSide ? getTeamForPrognosis(roundIdx, matchIdx, winSide === 1 ? "A" : "B") : null;
    };

    const getProgLoser = (roundIdx, matchIdx) => {
      const stageOrder = roundIdx + 1;
      const m = (koData[stageOrder] || [])[matchIdx];
      if (!m) return null;
      const winSide = getWinner(m.id, currentTips);
      return winSide ? getTeamForPrognosis(roundIdx, matchIdx, winSide === 1 ? "B" : "A") : null;
    };

    const getSortedMatches = (stage) => (koData[stage] || []).sort((a, b) => a.ko_order - b.ko_order);
    const r16 = getSortedMatches(1); const r8 = getSortedMatches(2); const r4 = getSortedMatches(3); const r2 = getSortedMatches(4);
    const r3placeMatch = koData[5]?.[1];

    const finalRecord = {
      player_id: playerId, phase_id: currentId,
      reached_16: (currentId >= 2) ? [] : r16.flatMap((_, i) => [getTeamForPrognosis(0, i, "A"), getTeamForPrognosis(0, i, "B")]).filter(Boolean),
      reached_8:  (currentId >= 3) ? [] : r8.flatMap((_, i) => [getTeamForPrognosis(1, i, "A"), getTeamForPrognosis(1, i, "B")]).filter(Boolean),
      reached_4:  (currentId >= 4) ? [] : r4.flatMap((_, i) => [getTeamForPrognosis(2, i, "A"), getTeamForPrognosis(2, i, "B")]).filter(Boolean),
      reached_2:  r2.flatMap((_, i) => [getTeamForPrognosis(3, i, "A"), getTeamForPrognosis(3, i, "B")]).filter(Boolean),
      drop_out_16: (currentId >= 3) ? [] : r16.map((_, i) => getProgLoser(0, i)).filter(Boolean),
      drop_out_8:  (currentId >= 4) ? [] : r8.map((_, i) => getProgLoser(1, i)).filter(Boolean),
      drop_out_4:  r4.map((_, i) => getProgLoser(2, i)).filter(Boolean),
      drop_out_2:  r2.map((_, i) => getProgLoser(3, i)).filter(Boolean),
      winner_final: koData[5]?.[0] ? getProgWinner(4, 0) : null,
      loser_final:  koData[5]?.[0] ? getProgLoser(4, 0) : null,
      winner_small_final: r3placeMatch ? getProgWinner(4, 1) : null,
      loser_small_final:  r3placeMatch ? getProgLoser(4, 1) : null
    };

    await supabase.from("user_prognosis_ko").upsert([finalRecord], { onConflict: 'player_id, phase_id' });
  }

  if (!player || !phaseId) return <div style={{ padding: "20px" }}>Lade Benutzerdaten...</div>;

  return (
    <div style={{ padding: "20px", width: "100%", overflowX: "auto", position: "relative" }}>
      
      {/* OBERE NAVIGATIONS- UND SEITENLEISTE */}
      {showContent && (
        <div id="tour-intro" style={{ ...getTourStyle('intro'), display: "flex", justifyContent: "flex-start", alignItems: "center", marginBottom: "20px", padding: "10px", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div>
            <h2 style={{ margin: 0, color: "#0f172a", marginRight: "30px" }}>Tippabgabe – Phase {phaseId}</h2>
          </div>
          
          {/* RECHTS NEBEN DER ÜBERSCHRIFT: DYNAMISCHER STATUS- / ABGABEBUTTON */}
          <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
            {isPlayerSubmitted ? (
              <div style={{ padding: "8px 16px", borderRadius: "8px", backgroundColor: "#dcfce7", color: "#15803d", fontWeight: "700", fontSize: "14px", border: "1px solid #bbf7d0" }}>
                ✓ Tipps erfolgreich abgegeben
              </div>
            ) : phase?.is_submitted || systemConfig?.tips_locked_global ? (
              <div style={{ padding: "8px 16px", borderRadius: "8px", backgroundColor: "#fee2e2", color: "#b91c1c", fontWeight: "700", fontSize: "14px", border: "1px solid #fca5a5" }}>
                🔒 Phase gesperrt
              </div>
            ) : !completionStatus.isReady ? (
              <div style={{ color: "#dc2626", fontWeight: "600", fontSize: "13px", padding: "8px 12px", border: "1px dashed #fca5a5", borderRadius: "8px", backgroundColor: "#fff5f5" }}>
                ❌ Noch nicht alle Tipps wurden eingegeben ({completionStatus.currentM}/{completionStatus.targetM} Gruppenspiele & {completionStatus.currentP}/{completionStatus.targetP} Prognosen)
              </div>
            ) : (
              <button 
                onClick={() => setShowConfirmModal(true)}
                style={{ padding: "10px 20px", borderRadius: "8px", border: "none", backgroundColor: "#22c55e", color: "white", cursor: "pointer", fontWeight: "700", fontSize: "14px", boxShadow: "0 4px 6px -1px rgba(34, 197, 94, 0.2)", transition: "transform 0.1s" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#16a34a")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#22c55e")}
              >
                🚀 Tipps final abgeben
              </button>
            )}

            <button 
              onClick={() => setCurrentTourIndex(0)}
              style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "white", color: "#475569", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}
            >
              Anleitung anzeigen 🚀
            </button>
          </div>

          {currentTourStep?.id === 'intro' && (
            <TourTooltip step={currentTourIndex} totalSteps={tourSteps.length} text={currentTourStep.text} placement={currentTourStep.placement} onNext={handleTourNext} onPrev={handleTourPrev} onClose={() => setCurrentTourIndex(null)} />
          )}
        </div>
      )}

      {showContent ? (
        <div style={{ display: "flex", flexDirection: "row", gap: "40px", alignItems: "flex-start" }}>
          {numericPhaseId === 1 && (
            <div style={{ flexShrink: 0, width: "fit-content" }}>
              <div ref={groupRef}>
                <div id="tour-groups" style={{ ...getTourStyle('groups'), padding: "10px", marginBottom: "20px" }}>
                  <h3>Gruppenphase</h3>
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
                  {currentTourStep?.id === 'groups' && (
                    <TourTooltip step={currentTourIndex} totalSteps={tourSteps.length} text={currentTourStep.text} placement={currentTourStep.placement} onNext={handleTourNext} onPrev={handleTourPrev} onClose={() => setCurrentTourIndex(null)} />
                  )}
                </div>

                <div id="tour-thirds" style={{ ...getTourStyle('thirds'), padding: "10px" }}>
                  <BestThirdsTable teams={bestThirds} manualRanks={manualRanks} onSaveManualRank={saveManualRank} isSubmitted={isReadOnly} />
                  {currentTourStep?.id === 'thirds' && (
                    <TourTooltip step={currentTourIndex} totalSteps={tourSteps.length} text={currentTourStep.text} placement={currentTourStep.placement} onNext={handleTourNext} onPrev={handleTourPrev} onClose={() => setCurrentTourIndex(null)} />
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ flexGrow: 1 }}>
            <div id="tour-ko" style={{ ...getTourStyle('ko'), padding: "10px" }}>
              <h3 style={{ marginLeft: "20px" }}>KO-Phase</h3>
              <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
                <KOBracket 
                  koByRound={koByRound} tips={tips} treeHeight={treeHeight} roundNames={ROUND_NAMES} 
                  phase={{ ...phase, is_submitted: isReadOnly }} 
                  getTopPosition={(rIdx, mIdx) => getTopPosition(rIdx, mIdx, treeHeight, currentSpacing) - topOffset} 
                  getTeamFromPrevious={(rIdx, mIdx, side) => {
                    if (numericPhaseId === 1 && rIdx === 0) {
                      const matchPair = KO_STRUCTURE.round16[mIdx];
                      const slot = side === "A" ? matchPair[0] : matchPair[1];
                      return resolveSlot(slot, tournamentContext) || null;
                    }
                    return getTeamFromPrevious(rIdx, mIdx, side, koByRound, tips, tournamentContext);
                  }}
                  resolveSlot={(slot) => resolveSlot(slot, tournamentContext)} 
                  saveTip={isReadOnly ? null : saveTip} deleteKORound={isReadOnly ? null : deleteKORound} 
                  KO_STRUCTURE={KO_STRUCTURE} isAdmin={false} 
                />
                {numericPhaseId === 5 && renderPhase5Matrix()}
              </div>
              {currentTourStep?.id === 'ko' && (
                <TourTooltip step={currentTourIndex} totalSteps={tourSteps.length} text={currentTourStep.text} placement={currentTourStep.placement} onNext={handleTourNext} onPrev={handleTourPrev} onClose={() => setCurrentTourIndex(null)} />
              )}
            </div>
          </div>
        </div>
      ) : <div style={{ padding: "100px", textAlign: "center", color: "#94a3b8" }}>Die Tippabgabe ist aktuell gesperrt.</div>}

      {/* MODALES POPUP FÜR DIE SICHERHEITSABFRAGE */}
      {showConfirmModal && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(15, 23, 42, 0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 10000, backdropFilter: "blur(4px)" }}>
          <div style={{ backgroundColor: "white", padding: "30px", borderRadius: "16px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)", width: "420px", textAlign: "center" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🚀</div>
            <h3 style={{ margin: "0 0 10px 0", color: "#0f172a", fontSize: "18px", fontWeight: "700" }}>Tipps final abgeben?</h3>
            <p style={{ margin: "0 0 24px 0", color: "#475569", fontSize: "14px", lineHeight: "1.5" }}>
              Bist du dir absolut sicher? Nach der Abgabe kannst du deine Tipps für diese Phase **nicht mehr ändern**.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button 
                onClick={() => setShowConfirmModal(false)}
                style={{ padding: "10px 18px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "white", color: "#475569", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}
              >
                Abbrechen
              </button>
              <button 
                onClick={submitTipsFinal}
                style={{ padding: "10px 18px", borderRadius: "8px", border: "none", backgroundColor: "#22c55e", color: "white", cursor: "pointer", fontWeight: "600", fontSize: "13px" }}
              >
                Ja, jetzt abgeben
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default TippsPage;