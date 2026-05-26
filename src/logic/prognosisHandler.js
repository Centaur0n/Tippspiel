import { supabase } from "../supabaseClient";
import { KO_STRUCTURE } from '../Utils/uiConstants';
import { resolveSlot, getTeamFromPrevious } from "./koLogic";

/**
 * Speichert die Gruppenprognose vollautomatisch im Hintergrund
 */
export async function updateGroupPrognosisDB(playerId, groupsArr, bestThirdsTeams) {
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

/**
 * Berechnet den gesamten simulierten Turnierbaum-Verlauf und sichert ihn in der DB
 */
export async function updateKOPrognosisDB(playerId, phId, koData, currentTips, context) {
  const currentId = Number(phId);

  const getWinner = (matchId, currentTips) => {
    const tip = currentTips[matchId];
    if (!tip || tip.winner === null) return null;
    return Number(tip.winner);
  };

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