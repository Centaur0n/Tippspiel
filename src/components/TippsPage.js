import React, { useEffect, useState, useRef } from "react";
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

function TippsPage({ player, phaseId }) {
  // --- STATES ---
  const [matches, setMatches] = useState([]);         // Alle Spiele aus der DB
  const [tips, setTips] = useState({});               // Map der User-Tipps {matchId: tipData}
  const [manualRanks, setManualRanks] = useState({}); // Manuelle Rang-Korrekturen (z.B. Losentscheid)
  const [phase, setPhase] = useState(null);           // Infos zur aktuellen Tipp-Phase
  const [systemConfig, setSystemConfig] = useState(null); // Globale Einstellungen (z.B. Sperre)
  const [treeHeight, setTreeHeight] = useState(800);  // Dynamische Höhe für den KO-Baum
  const groupRef = useRef(null);                      // Referenz um Höhe der Gruppenphase zu messen

  // --- INITIALES LADEN ---
  useEffect(() => {
    if (player?.id && phaseId) {
      fetchMatches();      // Holt alle Spielansetzungen
      fetchTips();         // Holt Tipps, Matrix-Tipps und manuelle Ränge des Spielers
      fetchPhase();        // Prüft Phase (z.B. ob schon abgegeben)
      fetchSystemConfig(); // Prüft globale Sperren
    }
  }, [phaseId, player?.id]);

  // Passt die Höhe des KO-Baums an die aktuelle Phase oder die Gruppen-Sidebar an
  useEffect(() => {
    const currentId = Number(phaseId);
    if (PHASE_HEIGHTS[currentId]) {
      setTreeHeight(PHASE_HEIGHTS[currentId]);
    } else if (currentId === 1 && groupRef.current) {
      setTreeHeight(groupRef.current.offsetHeight);
    }
  }, [matches, tips, phaseId]);

  // --- API CALLS (DB INTERAKTION) ---
  
  // Lädt alle Spiele der Datenbank
  async function fetchMatches() {
    const { data } = await supabase.from("match").select("*");
    setMatches(data || []);
  }

  // Lädt Tipps, Spezial-Matrix-Tipps (Phase 5) und manuelle Platzierungen
  async function fetchTips() {
    if (!player?.id || !phaseId) return;
    const { data: normalData } = await supabase.from("tip").select("*").eq("player_id", player.id).eq("phase_id", phaseId);
    let matrixData = [];
    if (Number(phaseId) === 5) {
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

  // Holt Details zur Tipp-Phase (Abgabe-Status)
  async function fetchPhase() {
    if (!phaseId) return;
    const { data } = await supabase.from("tip_phase").select("*").eq("id", phaseId).single();
    setPhase(data);
  }

  // Holt die globale Konfiguration (Wartungsmodus/Sperre)
  async function fetchSystemConfig() {
    const { data } = await supabase.from("system_config").select("*").single();
    setSystemConfig(data);
  }

  // Status-Variablen für Schreibschutz
  const isReadOnly = phase?.is_submitted || systemConfig?.tips_locked_global;
  const showContent = !systemConfig?.tips_locked_global;

  // --- HELPER FUNKTIONEN (UI LOGIK) ---
  
  // Ermittelt den Gewinner-Index (1 oder 2) aus dem Tipps-Objekt
  const getWinner = (matchId, currentTips) => {
    const tip = currentTips[matchId];
    if (!tip || tip.winner === null) return null;
    return Number(tip.winner);
  };

  // Bestimmt die Gewinner-Seite basierend auf Toren oder manuellem Sieger (KO)
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

  // Ermittelt Teamnamen für die Phase 5 Matrix (Spezialfall für Halbfinal-Paarungen)
  const getWLphase5 = (match, type) => {
    if (!match) return "?";
    const tip = tips[match.id];
    if (!tip || !tip.winner) return "?";
    return tip.winner === "1" ? (type === "SH" ? match.team_a : match.team_b) : (type === "SH" ? match.team_b : match.team_a);
  };

  // --- SPEICHER-AKTIONEN (USER EINGABE) ---
  
  // Speichert Tore und Gewinner eines Tipps in 'tip' oder 'tip_final_matrix'
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
    
    // Prüfen, ob es sich um ein KO-Spiel handelt (entweder über die Matches-Liste oder matchId-Typ)
    const currentMatch = matches.find(m => m.id === matchId);
    const isKOMatch = currentMatch?.stage === "ko";

    if (isSpecial) {
      await supabase.from("tip_final_matrix").upsert([{
        player_id: player.id, matrix_key: matchId, goals_a: gA, goals_b: gB,
        winner: calculatedWinner, phase_id: phaseId,
      }], { onConflict: 'player_id, matrix_key' });
    } else {
      // --- DIE NEUE WEGWEISER-LOGIK ---
      // Wenn wir in Phase 1 sind UND es ein KO-Spiel ist -> NICHT in 'tip' speichern!
      if (Number(phaseId) === 1 && isKOMatch) {
        console.log(`[SAVE-SHIELD] Phase 1 KO-Match ${matchId} wird nicht in 'tip' gespeichert, da es eine reine Prognose ist.`);
        // Wir überspringen den DB-Upsert für 'tip' komplett!
      } else {
        // In allen anderen Fällen (Gruppenspiele in Phase 1, oder KO-Spiele in Phase 2+) ganz normal speichern
        await supabase.from("tip").upsert([{
          player_id: player.id, match_id: matchId, phase_id: phaseId,
          goals_a: gA, goals_b: gB, winner: calculatedWinner,
        }], { onConflict: 'player_id, match_id, phase_id' });
      }
    }
    
    // WICHTIG: Den lokalen State setzen wir IMMER, damit die UI flüssig reagiert 
    // und der useEffect-Debouncer die 'user_prognosis_ko' Tabelle füttern kann!
    setTips(prev => ({ ...prev, [matchId]: { goals_a: gA, goals_b: gB, winner: calculatedWinner } }));
  }

  // Speichert einen manuellen Rang (Losentscheid) für die Gruppentabelle
  async function saveManualRank(teamName, rank) {
    if (isReadOnly) return; 
    const val = rank === "" ? null : Number(rank);
    await supabase.from("tip_manual_rank").upsert([{ player_id: player.id, phase_id: phaseId, team_name: teamName, manual_rank: val }], { onConflict: 'player_id, phase_id, team_name' });
    setManualRanks(prev => ({ ...prev, [teamName]: val }));
  }

  // Löscht alle Tipps und Rang-Korrekturen einer kompletten Gruppe sowie Folge-KO-Spiele
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

  // Löscht kaskadierend alle KO-Tipps und zugehörige Punkte-Details ab einer bestimmten Runde
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

  // Löscht spezifische Varianten-Tipps in der Phase 5 Matrix
  async function resetOption(optId) {
    if (isReadOnly) return; 
    await supabase.from("tip_final_matrix").delete().eq("player_id", player.id).in("matrix_key", [`OPT${optId}_F`, `OPT${optId}_S3`]);
    fetchTips();
  }

  // --- VORBEREITUNG DER DATEN (UI-BERECHNUNG) ---
  
  // Gruppiert alle Spiele nach Gruppennamen
  const grouped = {};
  matches.filter(m => m.stage === "group").forEach(m => {
    if (!grouped[m.group_name]) grouped[m.group_name] = [];
    grouped[m.group_name].push(m);
  });

  // Berechnet Tabellenstände pro Gruppe und identifiziert die besten Gruppendritten
  const allGroupsArray = Object.keys(grouped).map(name => ({ id: name, teams: calculateFIFADataTable(grouped[name], tips, manualRanks) }));
  const bestThirds = getBestThirds(allGroupsArray, manualRanks);
  const groupResults = {};
  allGroupsArray.forEach(g => { groupResults[g.id] = g.teams.map(t => t.team); });

  // Sortiert KO-Spiele nach Runden für das Bracket
  const koByRound = {};
  matches.filter(m => m.stage === "ko").sort((a,b) => a.stage_order - b.stage_order || a.ko_order - b.ko_order).forEach(m => {
    if (!koByRound[m.stage_order]) koByRound[m.stage_order] = [];
    koByRound[m.stage_order].push(m);
  });

  // Kontext-Objekt für die Auflösung der KO-Paarungen (wer spielt gegen wen?)
  const tournamentContext = { groups: groupResults, thirdPlaces: bestThirds.slice(0, 8), tips, phaseId };
  const currentSpacing = phase ? (PHASE_SPACING[phase.id] || 70) : 70;
  const startIdxOfPhase = phase ? (phase.id <= 2 ? 0 : phase.id - 2) : 0;
  const topOffset = getTopPosition(startIdxOfPhase, 0, treeHeight, currentSpacing);

  // --- DB UPDATER (DEBOUNCED PROGNOSE) ---
  
  // Aktualisiert die Tabellen 'user_prognosis_group/ko' verzögert (500ms) nach Tipp-Änderung
  useEffect(() => {
    if (!player?.id || matches.length === 0 || phase?.is_submitted) return;

    const handler = setTimeout(async () => {
      // 1. Speichert Gruppen-Endstände in die Prognose-Tabelle
      if (Number(phaseId) === 1 && allGroupsArray.length > 0) {
        const top8Thirds = bestThirds.slice(0, 8).map(t => t.team);
        await updateGroupPrognosisDB(player.id, allGroupsArray, top8Thirds);
      }
      // 2. Speichert berechneten KO-Verlauf in die Prognose-Tabelle
      if (Object.keys(koByRound).length > 0) {
        await updateKOPrognosisDB(player.id, phaseId, koByRound, tips, tournamentContext);
      }
      console.log("DB Prognose-Update ausgeführt!");
    }, 500);

    return () => clearTimeout(handler);
  }, [tips, phaseId, player?.id, allGroupsArray, bestThirds, koByRound]);

  // --- RENDER-HELPER ---
  
  // Zeichnet eine einzelne Team-Zeile innerhalb der Phase 5 Matrix
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

  // Zeichnet die Spezial-Matrix für Phase 5 (Finale-Varianten)
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
      <div style={{ display: "flex", gap: "30px", marginLeft: "40px" }}>
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
      </div>
    );
  };

  // --- DB UPDATER FUNKTIONEN (INTERNAL) ---
  
  // Schreibt die aktuelle Gruppentabelle in 'user_prognosis_group'
  async function updateGroupPrognosisDB(playerId, groupsArr, bestThirdsTeams) {
    const records = groupsArr.map(g => {
      const groupFourth = g.teams[3]?.team;
      const groupThird = g.teams[2]?.team;

      // 1. Logik für ausgeschiedene Teams (wie gehabt)
      let finalDroppedOut = [groupFourth].filter(Boolean);
      if (groupThird && !bestThirdsTeams.includes(groupThird)) {
        finalDroppedOut.push(groupThird);
      }
      const isThirdOfThisGroupInTop8 = groupThird && bestThirdsTeams.includes(groupThird);

      return {
        player_id: playerId, 
        group_name: g.id,
        rank_1: g.teams[0]?.team || null, 
        rank_2: g.teams[1]?.team || null,
        rank_3: g.teams[2]?.team || null, 
        rank_4: g.teams[3]?.team || null,
        reached_ko: [g.teams[0]?.team, g.teams[1]?.team].filter(Boolean),
        // Hier wird jetzt nur noch das Team gespeichert, wenn es aus dieser Gruppe kommt
        reached_ko_best_thirds: isThirdOfThisGroupInTop8 ? [groupThird] : [], 
        dropped_out: finalDroppedOut
      };
    });

    const { error } = await supabase.from("user_prognosis_group").upsert(records, { onConflict: 'player_id, group_name' });
    if (error) console.error("Fehler user_prognosis_group:", error.message);
  }

  // Berechnet und schreibt den kompletten KO-Pfad in 'user_prognosis_ko'
  async function updateKOPrognosisDB(playerId, phId, koData, currentTips, context) {
    const currentId = Number(phId);

    const getPrognosisTeam = (roundIdx, matchIdx, side) => {
      const name = getTeamFromPrevious(roundIdx, matchIdx, side, koData, currentTips, context);
      return (name && name !== "?") ? name : null;
    };

    const getProgWinner = (roundIdx, matchIdx) => {
      const stageOrder = roundIdx + 1;
      const m = koData[stageOrder]?.[matchIdx];
      if (!m) return null;
      const winSide = getWinner(m.id, currentTips);
      if (!winSide) return null;
      return getPrognosisTeam(roundIdx, matchIdx, winSide === 1 ? "A" : "B");
    };

    const getProgLoser = (roundIdx, matchIdx) => {
      const stageOrder = roundIdx + 1;
      const m = koData[stageOrder]?.[matchIdx];
      if (!m) return null;
      const winSide = getWinner(m.id, currentTips);
      if (!winSide) return null;
      return getPrognosisTeam(roundIdx, matchIdx, winSide === 1 ? "B" : "A");
    };

    const getSortedMatches = (stage) => (koData[stage] || []).sort((a, b) => a.ko_order - b.ko_order);

    const r16 = getSortedMatches(1); 
    const r8  = getSortedMatches(2); 
    const r4  = getSortedMatches(3); 
    const r2  = getSortedMatches(4); 
    const r3placeMatch = koData[5]?.[1];

    const finalRecord = {
      player_id: playerId, phase_id: currentId,
      reached_16: (currentId >= 2) ? [] : r16.flatMap((_, i) => [getPrognosisTeam(0, i, "A"), getPrognosisTeam(0, i, "B")]).filter(Boolean),
      reached_8:  (currentId >= 3) ? [] : r8.flatMap((_, i) => [getPrognosisTeam(1, i, "A"), getPrognosisTeam(1, i, "B")]).filter(Boolean),
      reached_4:  (currentId >= 4) ? [] : r4.flatMap((_, i) => [getPrognosisTeam(2, i, "A"), getPrognosisTeam(2, i, "B")]).filter(Boolean),
      reached_2:  r2.flatMap((_, i) => [getPrognosisTeam(3, i, "A"), getPrognosisTeam(3, i, "B")]).filter(Boolean),
      drop_out_16: (currentId >= 3) ? [] : r16.map((_, i) => getProgLoser(0, i)).filter(Boolean),
      drop_out_8:  (currentId >= 4) ? [] : r8.map((_, i) => getProgLoser(1, i)).filter(Boolean),
      drop_out_4:  r4.map((_, i) => getProgLoser(2, i)).filter(Boolean),
      drop_out_2:  r2.map((_, i) => getProgLoser(3, i)).filter(Boolean),
      winner_final: koData[5]?.[0] ? getProgWinner(4, 0) : null,
      loser_final:  koData[5]?.[0] ? getProgLoser(4, 0) : null,
      winner_small_final: r3placeMatch ? getProgWinner(4, 1) : null,
      loser_small_final:  r3placeMatch ? getProgLoser(4, 1) : null
    };

    console.log("[KO-TRACE] --- FINALES PROGNOSE-OBJEKT FÜR DB ---", finalRecord);

    const { error } = await supabase.from("user_prognosis_ko").upsert([finalRecord], { onConflict: 'player_id, phase_id' });
    if (error) console.error(`DB-Fehler Phase ${currentId}:`, error.message);
  }

  // --- HAUPT-RENDER-METHODE ---
  if (!player || !phaseId) return <div style={{ padding: "20px" }}>Lade Benutzerdaten...</div>;

  return (
    <div style={{ padding: "20px", width: "100%", overflowX: "auto" }}>
      {showContent ? (
        <div style={{ display: "flex", flexDirection: "row", gap: "40px", alignItems: "flex-start" }}>
          {/* GRUPPENPHASE (Linke Seite, nur Phase 1) */}
          {Number(phaseId) === 1 && (
            <div style={{ flexShrink: 0, width: "fit-content" }}>
              <div ref={groupRef}>
                <h3>Gruppenphase</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "30px", marginBottom: "40px", maxWidth: "1100px" }}>
                  {Object.keys(grouped).sort().map(name => (
                    <div key={name} style={{ position: 'relative' }}>
                      <GroupTable groupName={name} matches={grouped[name]} tips={tips} tableData={allGroupsArray.find(g => g.id === name).teams} onSaveTip={saveTip} isSubmitted={isReadOnly} manualRanks={manualRanks} onSaveManualRank={saveManualRank} onDeleteTips={isReadOnly ? null : resetGroup} />
                    </div>
                  ))}
                </div>
                <BestThirdsTable teams={bestThirds} manualRanks={manualRanks} onSaveManualRank={saveManualRank} isSubmitted={isReadOnly} />
              </div>
            </div>
          )}
          {/* KO-PHASE & BAUM (Rechte Seite / Hauptinhalt) */}
          <div style={{ flexGrow: 1 }}>
            <h3 style={{ marginLeft: "20px" }}>KO-Phase</h3>
            <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
              <KOBracket koByRound={koByRound} tips={tips} treeHeight={treeHeight} roundNames={ROUND_NAMES} phase={{ ...phase, is_submitted: isReadOnly }} getTopPosition={(rIdx, mIdx) => getTopPosition(rIdx, mIdx, treeHeight, currentSpacing) - topOffset} getTeamFromPrevious={(rIdx, mIdx, side) => getTeamFromPrevious(rIdx, mIdx, side, koByRound, tips, tournamentContext)} resolveSlot={(slot) => resolveSlot(slot, tournamentContext)} saveTip={isReadOnly ? null : saveTip} deleteKORound={isReadOnly ? null : deleteKORound} KO_STRUCTURE={KO_STRUCTURE} />
              {Number(phaseId) === 5 && renderPhase5Matrix()}
            </div>
          </div>
        </div>
      ) : <div style={{ padding: "100px", textAlign: "center", color: "#94a3b8" }}>Die Tippabgabe ist aktuell gesperrt.</div>}
    </div>
  );
}

export default TippsPage;