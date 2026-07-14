import { supabase } from "../supabaseClient";
import { getDynamicWinnerPoints, calculateDetailedMatchPoints } from "./pointsEngine.js";

// ==========================================
// FUNKTION FÜR DIE MATCH-TIPPS
// ==========================================
export async function processStandardMatchTips(currentMatch, phaseId) {
  if (currentMatch.goals_a_real === null || currentMatch.goals_b_real === null) {
    console.log(`[DEBUG-MATCH-TIPS] Abbruch: Match #${currentMatch.id} hat noch keine Echtzeit-Tore.`);
    return;
  }

  const mId = currentMatch.id;
  const isFinalsRound = currentMatch.stage_order === 5 || currentMatch.group_name === "Finale" || currentMatch.group_name === "Spiel um Platz 3";

  // 1. Standard-Tipps aus der regulären 'tip' Tabelle laden
  const { data: standardTips, error: tipsErr } = await supabase
    .from("tip")
    .select("*")
    .eq("phase_id", phaseId)
    .eq("match_id", mId);

  if (tipsErr) {
    console.error(`[DEBUG-MATCH-TIPS] ❌ Fehler beim Laden der Tipps für Match #${mId}:`, tipsErr.message);
    return;
  }

  // 2. Falls Finalrunde: Matrix-Optionen separat aus 'tip_final_matrix' laden
  let matrixTips = [];
  if (isFinalsRound) {
    const matrixKeys = ["OPT2_F", "OPT2_S3", "OPT3_F", "OPT3_S3", "OPT4_F", "OPT4_S3"];
    const { data: mData, error: mErr } = await supabase
      .from("tip_final_matrix")
      .select("*")
      .eq("phase_id", phaseId)
      .in("matrix_key", matrixKeys);

    if (mErr) {
      console.error(`[DEBUG-MATCH-TIPS] ❌ Fehler beim Laden aus tip_final_matrix:`, mErr.message);
    } else if (mData) {
      matrixTips = mData;
    }
  }

  // Wenn in beiden Tabellen keine Tipps existieren, brechen wir ab
  if ((!standardTips || standardTips.length === 0) && matrixTips.length === 0) {
    console.log(`[DEBUG-MATCH-TIPS] ⚠️ Keine User-Tipps in der Tabelle 'tip' für Match #${mId} gefunden.`);
    return;
  }

  let winnerPoints = 4; 
  if (currentMatch.stage === "group") {
    const { data: teams } = await supabase
      .from('teams')
      .select('name, fifa_rank')
      .in('name', [currentMatch.team_a, currentMatch.team_b]);

    const rankA = teams?.find(t => t.name === currentMatch.team_a)?.fifa_rank || 50;
    const rankB = teams?.find(t => t.name === currentMatch.team_b)?.fifa_rank || 50;

    // 1. Realen Ausgang des Spiels ermitteln ("1" = Team A, "2" = Team B, "0" = Unentschieden)
    const actualWinner = currentMatch.goals_a_real > currentMatch.goals_b_real 
      ? "1" 
      : currentMatch.goals_a_real < currentMatch.goals_b_real ? "2" : "0";

    // 2. Den Ausgang an die Hilfsfunktion übergeben
    winnerPoints = getDynamicWinnerPoints(rankA, rankB, actualWinner);
    
    console.log(`[DEBUG-MATCH-TIPS] Dynamische Winner-Points für Match #${mId}: ${winnerPoints} Pkt. (Ränge: ${rankA} vs ${rankB}, Ausgang: ${actualWinner})`);
  }

  // Pre-loading für Halbfinal-Konstellationen bei Finalspielen
  let hf1 = null, hf2 = null, semiTips = [];
  if (isFinalsRound) {
    const { data: semiMatches } = await supabase.from("match").select("*").eq("stage_order", 4);
    if (semiMatches && semiMatches.length >= 2) {
      const sortedSemis = [...semiMatches].sort((a, b) => a.match_order - b.match_order);
      hf1 = sortedSemis[0];
      hf2 = sortedSemis[1];

      const { data: sTips } = await supabase
        .from("tip")
        .select("*")
        .in("match_id", [hf1.id, hf2.id])
        .eq("phase_id", phaseId);
      if (sTips) semiTips = sTips;
      console.log(`[DEBUG-MATCH-TIPS] Finalrunden-Modus aktiv. HF1: ${hf1?.id}, HF2: ${hf2?.id}, Geladene Semi-Tipps: ${semiTips.length}`);
    }
  }

  const pointsEntries = [];
  
  // Alle Spieler-IDs sammeln, die entweder einen Standard- oder Matrix-Tipp abgegeben haben
  const playerIds = [
    ...new Set([
      ...(standardTips || []).map(t => t.player_id),
      ...matrixTips.map(t => t.player_id)
    ])
  ];
  
  console.log(`[DEBUG-MATCH-TIPS] Verarbeite Tipps für ${playerIds.length} eindeutige Spieler.`);

  playerIds.forEach(pId => {
    const actualResults = { goals_a: currentMatch.goals_a_real, goals_b: currentMatch.goals_b_real };
    let activeTip = null;

    if (isFinalsRound && hf1 && hf2) {
      const hf1Tip = semiTips.find(s => s.player_id === pId && s.match_id === hf1.id);
      const hf2Tip = semiTips.find(s => s.player_id === pId && s.match_id === hf2.id);

      if (hf1Tip && hf2Tip) {
        const sh1 = hf1Tip.winner === "1" ? hf1.team_a : hf1.team_b;
        const vh1 = hf1Tip.winner === "1" ? hf1.team_b : hf1.team_a;
        const sh2 = hf2Tip.winner === "1" ? hf2.team_a : hf2.team_b;
        const vh2 = hf2Tip.winner === "1" ? hf2.team_b : hf2.team_a;

        const isFinal = currentMatch.group_name === "Finale" || currentMatch.match_order === 104;

        const isStandardMatch = isFinal 
          ? ((currentMatch.team_a === sh1 && currentMatch.team_b === sh2) || (currentMatch.team_a === sh2 && currentMatch.team_b === sh1))
          : ((currentMatch.team_a === vh1 && currentMatch.team_b === vh2) || (currentMatch.team_a === vh2 && currentMatch.team_b === vh1));

        if (isStandardMatch) {
          const standardTip = (standardTips || []).find(t => t.player_id === pId && t.match_id === mId);
          if (standardTip) {
            let goalsA = standardTip.goals_a;
            let goalsB = standardTip.goals_b;
            let winner = standardTip.winner;
            const expectedTeamA = isFinal ? sh1 : vh1;
            if (currentMatch.team_a !== expectedTeamA) {
              goalsA = standardTip.goals_b;
              goalsB = standardTip.goals_a;
              winner = standardTip.winner === "1" ? "2" : standardTip.winner === "2" ? "1" : "0";
            }
            activeTip = { goals_a: goalsA, goals_b: goalsB, winner };
          }
        } else {
          // 1. Robuste Typbestimmung des aktuellen Echtzeit-Spiels
          const groupNameClean = (currentMatch.group_name || "").toLowerCase().trim();
          const isReallyFinale = groupNameClean === "finale" || currentMatch.match_order === 104;
          const isReallyPlatz3 = groupNameClean.includes("platz 3") || currentMatch.match_order === 103;

          const matrixDefinitions = {
            "OPT2_F":  { teamA: sh1, teamB: vh2 },
            "OPT2_S3": { teamA: vh1, teamB: sh2 },
            "OPT3_F":  { teamA: vh1, teamB: sh2 },
            "OPT3_S3": { teamA: sh1, teamB: vh2 },
            "OPT4_F":  { teamA: vh1, teamB: vh2 },
            "OPT4_S3": { teamA: sh1, teamB: sh2 }
          };

          let targetKey = null;

          // 2. Wir loopen durch alle Definitionen, filtern aber strikt nach dem Spieltyp
          for (const [key, def] of Object.entries(matrixDefinitions)) {
            
            // Wenn das echte Spiel ein Finale ist, überspringe alle Platz-3-Tipps (_S3)
            if (isReallyFinale && key.endsWith("_S3")) continue;
            
            // Wenn das echte Spiel ein Spiel um Platz 3 ist, überspringe alle Final-Tipps (_F)
            if (isReallyPlatz3 && key.endsWith("_F")) continue;

            // 3. Erst wenn der Typ stimmt, checken wir die Team-Namen
            if (
              (currentMatch.team_a === def.teamA && currentMatch.team_b === def.teamB) ||
              (currentMatch.team_a === def.teamB && currentMatch.team_b === def.teamA)
            ) {
              targetKey = key;
              break; // Match gefunden, Schleife beenden
            }
          }

          if (targetKey) {
            const matrixTip = matrixTips.find(t => t.player_id === pId && t.matrix_key === targetKey);
            if (matrixTip) {
              let goalsA = matrixTip.goals_a;
              let goalsB = matrixTip.goals_b;
              let winner = matrixTip.winner;
              const def = matrixDefinitions[targetKey];
              if (currentMatch.team_a !== def.teamA) {
                goalsA = matrixTip.goals_b;
                goalsB = matrixTip.goals_a;
                winner = matrixTip.winner === "1" ? "2" : matrixTip.winner === "2" ? "1" : "0";
              }
              activeTip = { goals_a: goalsA, goals_b: goalsB, winner };
            }
          }
        }
      }
    } else {
      const standardTip = (standardTips || []).find(t => t.player_id === pId && t.match_id === mId);
      if (standardTip) {
        activeTip = { goals_a: standardTip.goals_a, goals_b: standardTip.goals_b, winner: standardTip.winner };
      }
    }

    if (!activeTip) {
      console.log(`[DEBUG-MATCH-TIPS] ⚠️ Spieler #${pId} hat keinen aktiven Tipp für Match #${mId} (oder Matrix-Bedingung nicht erfüllt).`);
      return;
    }

    const { total, breakdown } = calculateDetailedMatchPoints(activeTip, actualResults, winnerPoints, phaseId);
    console.log(`[DEBUG-MATCH-TIPS] Spieler #${pId} erhält für Match #${mId}: Total ${total} Punkte. (${breakdown.descr})`);

    pointsEntries.push({
      player_id: pId, match_id: mId, match_order: currentMatch.match_order,
      category: "MATCH", matchday: currentMatch.matchday, points_total: total,
      phase_id: phaseId, group_name: currentMatch.group_name || "KO", is_prognosis: false, reference_team: "",  
      breakdown: { ...breakdown, info: `Spiel-Tipp: ${currentMatch.team_a} vs. ${currentMatch.team_b}` }
    });
  });

  console.log(`[DEBUG-MATCH-TIPS] Lösche alte Punkte-Einträge für Match #${mId}...`);
  const { error: delErr } = await supabase.from("user_points_detail").delete().eq("match_id", mId).eq("phase_id", phaseId).eq("is_prognosis", false);
  if (delErr) {
    console.error(`[DEBUG-MATCH-TIPS] ❌ Fehler beim Löschen der alten Match-Punkte aus DB:`, delErr.message);
  }

  if (pointsEntries.length > 0) {
    console.log(`[DEBUG-MATCH-TIPS] Schreibe ${pointsEntries.length} neue Zeilen in user_points_detail...`);
    const { error: insErr } = await supabase.from("user_points_detail").insert(pointsEntries);
    if (insErr) {
      console.error(`[DEBUG-MATCH-TIPS] ❌ Fehler beim Insert in user_points_detail:`, insErr.message);
    } else {
      console.log(`[ENGINE] ===== ${pointsEntries.length} Match-Tipps erfolgreich aktualisiert! =====`);
    }
  } else {
    console.log(`[DEBUG-MATCH-TIPS] Keine Punkte-Einträge generiert, Insert übersprungen.`);
  }
}