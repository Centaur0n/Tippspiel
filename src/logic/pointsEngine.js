import { supabase } from "../supabaseClient";

export const POINTS_CONFIG = {
  MATCH_BASE_DYNAMIC: [3, 4, 5], 
  MATCH_DIFF: 2,
  MATCH_GOALS_SINGLE: 1,
  MATCH_GOALS_SUM: 1,
  BONUS_EXACT_LOW: 3,
  BONUS_EXACT_MID: 4,
  BONUS_EXACT_HIGH: 5,

  PROG_REACH_16: 16.1,
  PROG_OUT_16: 16.2,
  PROG_REACH_8: 8.1,
  PROG_OUT_8: 8.2,
  PROG_REACH_4: 4.1,
  PROG_OUT_4: 4.2,
  PROG_REACH_2: 2.1,
  PROG_OUT_2: 2.2,
  PROG_REACH_FINAL: 20.1, 
  PROG_PLACE_4: 4.3,      
  PROG_PLACE_3: 3.3,      
  PROG_VIZE: 2.3,         
  PROG_CHAMPION: 1.3,     

  PROG_OUT_VORRUNDE: 2.2,
  PROG_TABLE_POS: 2.5,

  BONUS_QUESTION_BASE: 20, // Basis-Punkte für Bonusfragen

  DIVISORS: {
    1: 1, 2: 1, 3: 1, 4: 1, 5: 1
  }
};

// ==========================================
// CENTRAL ORCHESTRATION FUNCTION
// ==========================================
export async function processAllPointsForMatch(currentMatch, phaseId, allMatches = []) {
  if (!currentMatch || currentMatch.goals_a_real === null || currentMatch.goals_b_real === null) {
    console.log(`[ENGINE] Match ${currentMatch?.id || '?'} hat noch kein Ergebnis. Abbruch.`);
    return;
  }

  console.log(`[ENGINE] 🚀 Starte komplette Punkteberechnung für Match #${currentMatch.id} (${currentMatch.team_a} vs. ${currentMatch.team_b})`);

  try {
    await processStandardMatchTips(currentMatch, phaseId);
    await processPrognosisPoints(allMatches, currentMatch);
    await processBonusQuestionsPoints();
    console.log(`[ENGINE] 🎉 Alle Punkte für Match #${currentMatch.id} erfolgreich verarbeitet!`);
  } catch (error) {
    console.error(`[ENGINE] ❌ Fehler während der Gesamtberechnung für Match #${currentMatch.id}:`, error);
  }
}

// --- HELPER: BERECHNET DIE PUNKTE FÜR DIE BONUSFRAGEN ---
export const calculateBonusPoints = (qId, userAnswer, realAnswer, basePoints = 20) => {
  if (!realAnswer || realAnswer === "EMPTY" || userAnswer === undefined || userAnswer === null || userAnswer === "") {
    console.log(`[DEBUG-BONUS-CALC] Überspringe Frage ${qId}. UserAnswer: ${userAnswer}, RealAnswer: ${realAnswer}`);
    return 0;
  }

  const userStr = String(userAnswer).trim().toLowerCase();
  const realStr = String(realAnswer).trim().toLowerCase();

  if (userStr === realStr) return basePoints;

  const partialPointsQuestions = ["total_goals", "extra_times", "own_goals"];
  if (partialPointsQuestions.includes(qId)) {
    const userNum = parseInt(userStr, 10);
    const realNum = parseInt(realStr, 10);

    if (!isNaN(userNum) && !isNaN(realNum)) {
      if (Math.abs(userNum - realNum) === 1) {
        return Math.ceil(basePoints / 2);
      }
    }
  }
  return 0;
};

// --- HELPER: BERECHNET DIE PUNKTE FÜR EINEN EINZELNEN TIPP ---
export const calculateDetailedMatchPoints = (tip, actual, winnerPoints) => {
  const points = { winner: 0, diff: 0, goals_a: 0, goals_b: 0, sum: 0, exact_bonus: 0 };
  if (!tip || actual.goals_a === null || actual.goals_a === undefined) return { total: 0, breakdown: {} };

  const tA = Number(tip.goals_a);
  const tB = Number(tip.goals_b);
  const aA = Number(actual.goals_a);
  const aB = Number(actual.goals_b);

  const tipWinner = tA > tB ? "1" : tA < tB ? "2" : "0";
  const actualWinner = aA > aB ? "1" : aA < aB ? "2" : "0";

  if (tipWinner === actualWinner) points.winner = winnerPoints;
  if ((tA - tB) === (aA - aB)) points.diff = POINTS_CONFIG.MATCH_DIFF;
  if (tA === aA) points.goals_a = POINTS_CONFIG.MATCH_GOALS_SINGLE;
  if (tB === aB) points.goals_b = POINTS_CONFIG.MATCH_GOALS_SINGLE;
  if ((tA + tB) === (aA + aB)) points.sum = POINTS_CONFIG.MATCH_GOALS_SUM;

  if (tA === aA && tB === aB) {
    const totalGoals = aA + aB;
    if (totalGoals <= 3) points.exact_bonus = POINTS_CONFIG.BONUS_EXACT_LOW;
    else if (totalGoals <= 6) points.exact_bonus = POINTS_CONFIG.BONUS_EXACT_MID;
    else points.exact_bonus = POINTS_CONFIG.BONUS_EXACT_HIGH;
  }

  const total = Object.values(points).reduce((acc, val) => acc + val, 0);
  
  return { 
    total, 
    breakdown: {
      descr: `Tendenz: ${points.winner}, Diff: ${points.diff}, Tore: ${points.goals_a + points.goals_b}, Summe: ${points.sum}, Bonus: ${points.exact_bonus}`,
      tip: `${tA}:${tB}`, real: `${aA}:${aB}`, tip_a: tA, tip_b: tB, real_a: aA, real_b: aB,
      points_winner: points.winner, points_exact: points.exact_bonus, sum_points: total
    } 
  };
};

// --- HELPER: DYNAMISCHE TENDENZ-PUNKTE ---
export const getDynamicWinnerPoints = (rankA, rankB) => {
  const diff = rankA - rankB; 
  if (diff < -20) return 3; 
  if (diff > 20) return 5;   
  return 4; 
};

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
    winnerPoints = getDynamicWinnerPoints(rankA, rankB);
    console.log(`[DEBUG-MATCH-TIPS] Dynamische Winner-Points für Match #${mId}: ${winnerPoints} Pkt. (Ränge: ${rankA} vs ${rankB})`);
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

        const isFinal = currentMatch.group_name === "Finale" || currentMatch.match_order === 79;

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
          const isReallyFinale = groupNameClean === "finale" || currentMatch.match_order === 79;
          const isReallyPlatz3 = groupNameClean.includes("platz 3") || currentMatch.match_order === 78;

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

    const { total, breakdown } = calculateDetailedMatchPoints(activeTip, actualResults, winnerPoints);
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

// ==========================================
// FUNKTION FÜR DIE BONUS-FRAGEN
// ==========================================
export async function processBonusQuestionsPoints() {
  const { data: bonusTips, error: fetchErr } = await supabase.from("user_bonus_tips").select("*");

  if (fetchErr) {
    console.error(`[DEBUG-BONUS] ❌ Fehler beim Holen der user_bonus_tips:`, fetchErr.message);
    return;
  }
  if (!bonusTips || bonusTips.length === 0) {
    console.log(`[DEBUG-BONUS] ⚠️ Keine Einträge in user_bonus_tips gefunden.`);
    return;
  }

  const pointsEntries = [];
  const basePoints = POINTS_CONFIG.BONUS_QUESTION_BASE || 10;

  bonusTips.forEach(tip => {
    const realAnswer = tip.real_answer;
    if (!realAnswer || realAnswer === "EMPTY") {
      // Keine Log-Ausgabe hier um Spam zu vermeiden, falls erwünscht einkommentieren:
      // console.log(`[DEBUG-BONUS] Frage ${tip.question} für User ${tip.user_id} übersprungen, da real_answer leer.`);
      return;
    }

    const pointsTotal = calculateBonusPoints(tip.question, tip.user_answer, realAnswer, basePoints);

    let questionLabel = tip.question;
    if (tip.question === "total_goals") questionLabel = "Meisten Gesamttore Spiel";
    if (tip.question === "extra_times") questionLabel = "Anzahl Verlängerungen";
    if (tip.question === "own_goals") questionLabel = "Anzahl Eigentore";
    if (tip.question === "most_cards") questionLabel = "Meisten Karten pro Spiel (Team)";
    if (tip.question === "most_team_goals") questionLabel = "Team meisten Tore pro Spiel";
    if (tip.question === "most_conceded_goals") questionLabel = "Meiste Gegentore Gruppenphase";
    if (tip.question === "pot4_furthest") questionLabel = "Topf 4 Team am weitesten";

    console.log(`[DEBUG-BONUS] User #${tip.user_id}, Q: ${tip.question}. User-Tipp: '${tip.user_answer}' | Real: '${realAnswer}' => Punkte: ${pointsTotal}`);

    pointsEntries.push({
      player_id: tip.user_id, match_id: null, match_order: 999, category: "BONUS", matchday: 99, 
      points_total: pointsTotal, phase_id: 1, group_name: "BONUS", is_prognosis: true,
      reference_team: ["pot4_furthest", "most_team_goals", "most_conceded_goals", "most_cards"].includes(tip.question) ? tip.user_answer : "",
      breakdown: {
        info: `Bonus: ${questionLabel}`,
        descr: pointsTotal > 0 
          ? `Erfolgreich! Tipp: ${tip.user_answer}, Ergebnis: ${realAnswer} (+${pointsTotal} Pkt.)`
          : `Nicht korrekt. Tipp: ${tip.user_answer}, Ergebnis: ${realAnswer}`,
        question_id: tip.question, user_answer: tip.user_answer, real_answer: realAnswer
      }
    });
  });

  console.log(`[DEBUG-BONUS] Lösche alte Bonus-Einträge...`);
  const { error: delErr } = await supabase.from("user_points_detail").delete().eq("category", "BONUS");
  if (delErr) console.error(`[DEBUG-BONUS] ❌ Fehler beim Löschen alter Bonus-Zeilen:`, delErr.message);

  if (pointsEntries.length > 0) {
    const { error: insertErr } = await supabase.from("user_points_detail").insert(pointsEntries);
    if (insertErr) console.error("[BONUS-ENGINE] Fehler beim Speichern:", insertErr.message);
    else console.log(`[BONUS-ENGINE] ===== ${pointsEntries.length} Bonus-Punkte erfolgreich berechnet! =====`);
  }
}

export async function processPrognosisPoints(allMatches, currentMatch, forcedGroupName = null) {
  if (currentMatch.goals_a_real === null || currentMatch.goals_b_real === null) {
    console.log(`[DEBUG-PROG] Abbruch: Match #${currentMatch.id} hat noch kein reales Ergebnis.`);
    return;
  }

  const { id: mId, match_order: mOrder, stage } = currentMatch;
  const activeGroupName = forcedGroupName || currentMatch.group_name;

  let realGroup = null;
  let realKO = null;

  if (stage === "group" || activeGroupName) {
    const { data: groupData, error: groupErr } = await supabase
      .from("real_group_state")
      .select("*")
      .eq("group_name", activeGroupName || "")
      .maybeSingle();

    if (groupErr) console.error("[POINTS] Fehler bei real_group_state:", groupErr.message);
    else realGroup = groupData;
  }

  if (stage === "ko") {
    const { data: koData, error: koErr } = await supabase .from("real_ko_state") .select("*") .eq("id", 1) .single();
    if (koErr) console.error("[POINTS] Fehler bei real_ko_state:", koErr.message);
    else realKO = koData;
  }

  if (stage === "group" && !realGroup) {
    console.log(`[DEBUG-PROG] Abbruch: Gruppenphase aktiv, aber kein Eintrag in 'real_group_state' für '${activeGroupName}' gefunden.`);
    return;
  }
  if (stage === "ko" && !realKO) {
    console.log(`[DEBUG-PROG] Abbruch: KO-Phase aktiv, aber kein Eintrag in 'real_ko_state' mit ID 1 gefunden.`);
    return;
  }

  const pointsEntries = [];

  // --- A. GRUPPEN-PUNKTE ---
  if (stage === "group" && realGroup) {
    const groupMatches = allMatches.filter(m => m.group_name === activeGroupName);
    const lastMatchOfThisGroup = groupMatches.reduce((max, m) => m.match_order > max.match_order ? m : max, groupMatches[0]);

    if (currentMatch.id !== lastMatchOfThisGroup?.id) {
      console.log(`[DEBUG-PROG] ℹ️ Match #${mId} ist nicht das LETZTE Spiel der Gruppe ${activeGroupName} (Letztes ist #${lastMatchOfThisGroup?.id}). Berechnung für Gruppenplatzierung übersprungen.`);
      return;
    }

    const allMatchesPlayed = groupMatches.every(m => m.goals_a_real !== null && m.goals_b_real !== null);
    const isGroupReallyFinished = realGroup.is_finished || allMatchesPlayed;
          
    if (isGroupReallyFinished) {
      const targetMatchId = lastMatchOfThisGroup?.id || mId;
      const targetMatchOrder = lastMatchOfThisGroup?.match_order || mOrder;

      console.log(`\n==================================================`);
      console.log(`[GROUP-PROG-DIAG] 📦 Starte Stufe 1 für Gruppe ${activeGroupName}`);
      console.log(`[GROUP-PROG-DIAG] Realität aus DB:`);
      console.log(`  - Rank 1-4: 1:${realGroup.rank_1}, 2:${realGroup.rank_2}, 3:${realGroup.rank_3}, 4:${realGroup.rank_4}`);
      console.log(`  - realGroup.reached_ko (Sichere Weiterkommer):`, JSON.stringify(realGroup.reached_ko));
      console.log(`==================================================`);
      
      const { data: userGroupProgs, error: uProgErr } = await supabase
        .from("user_prognosis_group")
        .select("*")
        .eq("group_name", activeGroupName);
      
      if (uProgErr) console.error("[PROG-DIAG] Fehler beim Laden von user_prognosis_group:", uProgErr.message);

      if (userGroupProgs) {
        const validProgs = userGroupProgs.filter(p => p.rank_1 && p.rank_2 && p.rank_3 && p.rank_4);
        console.log(`[GROUP-PROG-DIAG] Gefundene User-Prognosen für diese Gruppe: ${validProgs.length}`);

        let totalPathMatches = 0;
        let sampleLogged = false;

        validProgs.forEach(prog => {
          ['rank_1', 'rank_2', 'rank_3', 'rank_4'].forEach((rankKey) => {
            if (prog[rankKey] === realGroup[rankKey] && realGroup[rankKey] !== null) {
              console.log(`[DEBUG-PROG-MATCH] 🔥 Rang-Treffer! User #${prog.player_id} hat ${rankKey} richtig: ${prog[rankKey]}`);
              pointsEntries.push(createPointEntry(prog.player_id, 'GROUP_RANK', POINTS_CONFIG.PROG_TABLE_POS, prog[rankKey], 1, activeGroupName, targetMatchId, targetMatchOrder, currentMatch.matchday));
            }
          });

          const userQualifiers = [...(prog.reached_ko || []), ...(prog.reached_ko_best_thirds || [])];
          const realQualifiers = [...(realGroup.reached_ko || [])];

          if (!sampleLogged) {
            console.log(`[GROUP-PROG-DIAG] 👀 Sample-Check für Spieler ${prog.player_id}:`);
            console.log(`  - Vom User getippte Weiterkommer (userQualifiers):`, JSON.stringify(userQualifiers));
            console.log(`  - Reale Weiterkommer aus DB (realQualifiers):`, JSON.stringify(realQualifiers));
            sampleLogged = true;
          }

          userQualifiers.forEach(team => {
            if (team && realQualifiers.includes(team)) {
              totalPathMatches++;
              
              if (prog.rank_3 === team && realGroup.rank_2 === team) {
                console.log(`[GROUP-PROG-DIAG] 🔥 TREFFER: Spieler ${prog.player_id} hat "${team}" auf P3 getippt, ist aber als P2 weiter!`);
              }

              pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_REACH_16, team, 1, activeGroupName, targetMatchId, targetMatchOrder, currentMatch.matchday, { original: POINTS_CONFIG.PROG_REACH_16 }));
            }
          });

          const userDroppedOut = [...(prog.dropped_out || [])];
          if (realGroup.rank_4 && userDroppedOut.includes(realGroup.rank_4)) {
            console.log(`[DEBUG-PROG-MATCH] 🔥 Ausscheider-Treffer! User #${prog.player_id} hat P4-Ausscheiden richtig für: ${realGroup.rank_4}`);
            pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_OUT_VORRUNDE, realGroup.rank_4, 1, activeGroupName, targetMatchId, targetMatchOrder, currentMatch.matchday, { original: POINTS_CONFIG.PROG_OUT_VORRUNDE }));
          }
        });

        console.log(`[GROUP-PROG-DIAG] 🏁 Stufe 1 fertig. "Turnier-Pfad"-Treffer in dieser Gruppe gesamt: ${totalPathMatches}`);
      }
    } else {
      console.log(`[DEBUG-PROG] Gruppe ${activeGroupName} ist laut DB oder Match-Ständen noch nicht vollständig beendet.`);
    }

    if (mOrder === 72) {
      console.log("[ENGINE] 🏁 Spiel 72 erreicht! Werte jetzt das Schicksal aller Gruppendritten aus...");
      
      const { data: allRealGroups, error: allGroupsErr } = await supabase.from("real_group_state").select("*");
      const { data: allUserProgs, error: allUserProgsErr } = await supabase.from("user_prognosis_group").select("*");

      if (!allGroupsErr && !allUserProgsErr && allRealGroups && allUserProgs) {
        allRealGroups.forEach(rg => {
          const groupThirdTeam = rg.rank_3;
          if (!groupThirdTeam) return;

          const realThirdsReachedKO = rg.reached_ko_best_thirds || [];
          const realDroppedOut = rg.dropped_out || [];
          const relevantProgs = allUserProgs.filter(p => p.group_name === rg.group_name);

          relevantProgs.forEach(prog => {
            if (realThirdsReachedKO.includes(groupThirdTeam)) {
              const userExpectedQualifiers = [...(prog.reached_ko || []), ...(prog.reached_ko_best_thirds || [])];
              if (userExpectedQualifiers.includes(groupThirdTeam)) {
                console.log(`[DEBUG-PROG-DRITTE] User #${prog.player_id} bekommt Punkte: Bester Gruppendritter ${groupThirdTeam} kam weiter.`);
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_REACH_16, groupThirdTeam, 1, rg.group_name, mId, mOrder, currentMatch.matchday, { original: POINTS_CONFIG.PROG_REACH_16 }));
              }
            }
            if (realDroppedOut.includes(groupThirdTeam) && groupThirdTeam !== rg.rank_4) {
              if (prog.dropped_out?.includes(groupThirdTeam)) {
                console.log(`[DEBUG-PROG-DRITTE] User #${prog.player_id} bekommt Punkte: Schlechterer Gruppendritter ${groupThirdTeam} ist ausgeschieden.`);
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_OUT_VORRUNDE, groupThirdTeam, 1, rg.group_name, mId, mOrder, currentMatch.matchday, { original: POINTS_CONFIG.PROG_OUT_VORRUNDE }));
              }
            }
          });
        });
      } else {
        console.error(`[DEBUG-PROG-DRITTE] Fehler beim Laden der Gesamtdaten für Spiel 72. GroupsErr: ${allGroupsErr?.message}, ProgsErr: ${allUserProgsErr?.message}`);
      }
    }
  }

  // --- B. KO-PHASEN PUNKTE ---
  if (stage === "ko" && currentMatch.winner_real !== 0 && realKO) {
    const { data: userKOProgs, error: koProgErr } = await supabase.from("user_prognosis_ko").select("*");
    if (koProgErr) {
      console.error(`[DEBUG-PROG-KO] ❌ Fehler beim Laden von user_prognosis_ko:`, koProgErr.message);
      return;
    }

    if (userKOProgs) {
      const validKOProgs = userKOProgs.filter(p => p.reached_16 || p.reached_8 || p.reached_4 || p.reached_2 || p.winner_final);
      console.log(`[DEBUG-PROG-KO] Verarbeite KO-Prognosen für Match #${mId}. Gefundene Zeilen: ${validKOProgs.length}`);
      
      const roundMapping = {
        1: { name: "Sechzehntelfinale", progKey: 'reached_8', pts: POINTS_CONFIG.PROG_REACH_8, dropKey: 'drop_out_16', dropPts: POINTS_CONFIG.PROG_OUT_16 },
        2: { name: "Achtelfinale", progKey: 'reached_4', pts: POINTS_CONFIG.PROG_REACH_4, dropKey: 'drop_out_8', dropPts: POINTS_CONFIG.PROG_OUT_8 },
        3: { name: "Viertelfinale", progKey: 'reached_2', pts: POINTS_CONFIG.PROG_REACH_2, dropKey: 'drop_out_4', dropPts: POINTS_CONFIG.PROG_OUT_4 },
        4: { name: "Halbfinale", isSemifinal: true, pts: POINTS_CONFIG.PROG_REACH_FINAL, dropKey: 'drop_out_2', dropPts: POINTS_CONFIG.PROG_OUT_2 }, 
        5: { name: "Finale / Platz 3", isFinalsRound: true }
      };

      const activeRound = roundMapping[currentMatch.stage_order];
      if (activeRound) {
        const realWinnerOfThisMatch = currentMatch.winner_real === 1 ? currentMatch.team_a : currentMatch.team_b;
        const realLoserOfThisMatch = currentMatch.winner_real === 1 ? currentMatch.team_b : currentMatch.team_a;
        console.log(`[DEBUG-PROG-KO] Runde ermittelt: ${activeRound.name}. Realer Sieger: ${realWinnerOfThisMatch}, Realer Verlierer: ${realLoserOfThisMatch}`);

        validKOProgs.forEach(prog => {
          const divisor = POINTS_CONFIG.DIVISORS[prog.phase_id] || 1;
          
          if (!activeRound.isFinalsRound) {
            let isWinnerPredicted = false;
            if (activeRound.isSemifinal) {
              isWinnerPredicted = (prog.winner_final === realWinnerOfThisMatch || prog.loser_final === realWinnerOfThisMatch);
            } else {
              const progTeams = Array.isArray(prog[activeRound.progKey]) ? prog[activeRound.progKey] : [prog[activeRound.progKey]];
              isWinnerPredicted = progTeams.includes(realWinnerOfThisMatch);
            }

            if (isWinnerPredicted) {
              console.log(`[DEBUG-PROG-KO] 🔥 Treffer! User #${prog.player_id} hat das Weiterkommen von ${realWinnerOfThisMatch} prognostiziert.`);
              pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.pts / divisor, realWinnerOfThisMatch, prog.phase_id, "KO", mId, mOrder, currentMatch.matchday, { original: activeRound.pts, divisor, roundName: activeRound.name, isWinner: true }));
            }
            
            if (activeRound.dropKey) {
              const progDropped = Array.isArray(prog[activeRound.dropKey]) ? prog[activeRound.dropKey] : [prog[activeRound.dropKey]];
              if (progDropped.includes(realLoserOfThisMatch)) {
                console.log(`[DEBUG-PROG-KO] 🔥 Treffer! User #${prog.player_id} hat das Ausscheiden von ${realLoserOfThisMatch} prognostiziert.`);
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', activeRound.dropPts / divisor, realLoserOfThisMatch, prog.phase_id, "KO", mId, mOrder, currentMatch.matchday, { original: activeRound.dropPts, divisor, roundName: activeRound.name, isWinner: false }));
              }
            }
          } else {
            const isChampMatch = (mOrder === 79 || currentMatch.ko_order === 0);
            if (isChampMatch) {
              if (prog.winner_final && realKO.winner_final === prog.winner_final && prog.winner_final === realWinnerOfThisMatch) {
                console.log(`[DEBUG-PROG-KO] 🔥 Champ-Treffer für User #${prog.player_id}: ${prog.winner_final}`);
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_CHAMPION / divisor, prog.winner_final, prog.phase_id, "KO", mId, mOrder, currentMatch.matchday, { original: POINTS_CONFIG.PROG_CHAMPION, divisor }));
              }
              if (prog.loser_final && realKO.loser_final === prog.loser_final && prog.loser_final === realLoserOfThisMatch) {
                console.log(`[DEBUG-PROG-KO] 🔥 Vize-Treffer für User #${prog.player_id}: ${prog.loser_final}`);
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_VIZE / divisor, prog.loser_final, prog.phase_id, "KO", mId, mOrder, currentMatch.matchday, { original: POINTS_CONFIG.PROG_VIZE, divisor }));
              }
            } else {
              if (prog.winner_small_final && realKO.winner_small_final === prog.winner_small_final && prog.winner_small_final === realWinnerOfThisMatch) {
                console.log(`[DEBUG-PROG-KO] 🔥 Platz 3 Treffer für User #${prog.player_id}: ${prog.winner_small_final}`);
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_PLACE_3 / divisor, prog.winner_small_final, prog.phase_id, "KO", mId, mOrder, currentMatch.matchday, { original: POINTS_CONFIG.PROG_PLACE_3, divisor }));
              }
              if (prog.loser_small_final && realKO.loser_small_final === prog.loser_small_final && prog.loser_small_final === realLoserOfThisMatch) {
                console.log(`[DEBUG-PROG-KO] 🔥 Platz 4 Treffer für User #${prog.player_id}: ${prog.loser_small_final}`);
                pointsEntries.push(createPointEntry(prog.player_id, 'PROGNOSIS_PATH', POINTS_CONFIG.PROG_PLACE_4 / divisor, prog.loser_small_final, prog.phase_id, "KO", mId, mOrder, currentMatch.matchday, { original: POINTS_CONFIG.PROG_PLACE_4, divisor }));
              }
            }
          }
        });
      } else {
        console.log(`[DEBUG-PROG-KO] Keine gemappte KO-Runde für stage_order: ${currentMatch.stage_order}`);
      }
    }
  }

  // --- DUPLIKATSFILTER & SPEICHERUNG ---
  const uniquePointsMap = {};
  pointsEntries.forEach(entry => {
    const uniqueKey = `${entry.player_id}_${entry.category}_${entry.reference_team}_${entry.phase_id}`;
    uniquePointsMap[uniqueKey] = entry;
  });

  const finalPointsEntries = Object.values(uniquePointsMap);
  
  const matchIdsToDelete = [mId];
  if (stage === "group") {
    const groupMatches = allMatches.filter(m => m.group_name === activeGroupName);
    const lastMatchOfThisGroup = groupMatches.reduce((max, m) => m.match_order > max.match_order ? m : max, groupMatches[0]);
    if (lastMatchOfThisGroup && !matchIdsToDelete.includes(lastMatchOfThisGroup.id)) {
      matchIdsToDelete.push(lastMatchOfThisGroup.id);
    }
  }
  
  console.log(`[DEBUG-PROG] Bereinige alte Prognose-Punkte aus user_points_detail für MatchIDs: [${matchIdsToDelete.join(", ")}]...`);
  const { error: delErr } = await supabase
    .from("user_points_detail")
    .delete()
    .in("match_id", matchIdsToDelete)
    .eq("is_prognosis", true);
  
  if (delErr) console.error(`[DEBUG-PROG] ❌ Fehler beim Löschen alter Prognose-Punkte:`, delErr.message);
  
  if (finalPointsEntries.length > 0) {
    console.log(`[DEBUG-PROG] Upserte ${finalPointsEntries.length} Zeilen in user_points_detail...`);
    const { error } = await supabase
      .from("user_points_detail")
      .upsert(finalPointsEntries, { 
        onConflict: "player_id,match_id,category,reference_team,phase_id" 
      });

    if (error) console.error("[PROG-DIAG] Upsert-Fehler:", error.message);
    else console.log(`[PROG-DIAG] ===== ${finalPointsEntries.length} Prognosen erfolgreich aktualisiert! =====`);
  } else {
    console.log(`[DEBUG-PROG] Keine Prognose-Punkte zu speichern für Match #${mId}.`);
  }
}

function createPointEntry(playerId, category, points, team, phase, groupName, matchId, matchOrder, matchday, extra = {}) {
  let typeLabel = category === "GROUP_RANK" ? "Tabellenplatz" : "Turnier-Pfad";
  let detailDesc = `Erfolgreiche Prognose in Phase ${phase}`;

  if (category === "GROUP_RANK") {
    detailDesc = `Richtige Gruppenplatzierung von ${team} in Phase ${phase}`;
  } else if (category === "PROGNOSIS_PATH") {
    const originalPoints = extra.original || points;
    const decimal = Math.round((originalPoints * 10) % 10); 

    if (decimal === 1) {
      if (originalPoints >= 20) detailDesc = `${team} erreicht das Finale`;
      else if (originalPoints >= 16) detailDesc = `${team} erreicht das Sechzehntelfinale`; 
      else if (originalPoints >= 8) detailDesc = `${team} erreicht das Achtelfinale`;
      else if (originalPoints >= 4) detailDesc = `${team} erreicht das Viertelfinale`;
      else if (originalPoints >= 2) detailDesc = `${team} erreicht das Halbfinale`;
    } else if (decimal === 2) {
      detailDesc = `${team} scheidet korrekterweise aus`;
    } else if (decimal === 3) {
      if (originalPoints === POINTS_CONFIG.PROG_CHAMPION) detailDesc = `${team} ist Turniersieger 🎉`;
      else if (originalPoints === POINTS_CONFIG.PROG_VIZE) detailDesc = `${team} ist Vize-Meister`;
      else if (originalPoints === POINTS_CONFIG.PROG_PLACE_3) detailDesc = `${team} holt Platz 3`;
      else if (originalPoints === POINTS_CONFIG.PROG_PLACE_4) detailDesc = `${team} beendet das Turnier auf Platz 4`;
    }
  }

  return {
    player_id: playerId, category, points_total: points, reference_team: team, phase_id: phase, 
    group_name: groupName || "KO", is_prognosis: true, match_id: matchId, match_order: matchOrder, matchday: matchday, 
    breakdown: { info: `${typeLabel}: ${team}`, descr: detailDesc, team, originalPoints: extra.original || points, divisor: extra.divisor || 1 }
  };
}