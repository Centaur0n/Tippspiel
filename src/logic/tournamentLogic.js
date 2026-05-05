/**
 * Berechnet die Tabelle einer Gruppe basierend auf Tipps
 */
export function calculateTable(groupMatches, currentTips) {
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

export function calculateFIFADataTable(groupMatches, tips, manualRanks = {}) {
  // Wir nutzen deine bestehende Logik für die Grundwerte
  let table = calculateTable(groupMatches, tips);

  // Jetzt sortieren wir das Ergebnis nach FIFA-Kriterien
  table.sort((a, b) => {
    // 1. Punkte (Höher ist besser)
    if (b.pts !== a.pts) return b.pts - a.pts;

    // 2. Tordifferenz (Höher ist besser)
    if (b.diff !== a.diff) return b.diff - a.diff;

    // 3. Erzielte Tore (Höher ist besser)
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

    // 4. Stichwahl / Manueller Rang (Niedrigerer Wert ist besser, z.B. Platz 1 vor Platz 2)
    // Wir nehmen 99 als Standardwert, falls nichts eingetragen wurde
    const rankA = manualRanks[a.team] || 99;
    const rankB = manualRanks[b.team] || 99;
    
    return rankA - rankB; 
  });

  return table;
}