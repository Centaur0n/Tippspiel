// src/utils/calcTable.js

/**
 * Berechnet die 8 besten Gruppendritten
 * @param {Array} allGroups - Array aller 12 Gruppentabellen
 * @param {Object} adminOverrides - Deine manuellen Korrekturen (Fairplay)
 */
export const getBestThirds = (allGroups, adminOverrides = {}) => {
  // Wir holen von jeder der 12 Gruppen das Team auf Platz 3 (Index 2)
  const thirds = allGroups.map(group => {
    const team = group.teams[2]; 
    return { ...team, groupId: group.id };
  });

  // Sortierung nach deinen Kriterien
  return thirds.sort((a, b) => {
    // 1. Punkte
    if (b.points !== a.points) return b.points - a.points;
    // 2. Tordifferenz
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    // 3. Erzielte Tore
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    
    // 4. Admin-Joker (Falls alles gleich ist, schaust du in deine Liste)
    // adminOverrides sieht so aus: { "TeamName": 1, "AnderesTeam": 2 }
    const rankA = adminOverrides[a.name] || 99;
    const rankB = adminOverrides[b.name] || 99;
    return rankA - rankB;
  }).slice(0, 8); // Gib nur die Top 8 zurück
};