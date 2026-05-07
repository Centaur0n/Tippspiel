/**
 * TURNIER-STRUKTUR
 * Definiert, welche Gruppen-Positionen im Achtelfinale aufeinandertreffen.
 * "1E", "1I" etc. sind die Platzhalter für die qualifizierten Gruppendritten.
 */
export const KO_STRUCTURE = {
  round16: [
    ["E1", "1E"], ["I1", "1I"], ["F1", "C2"], ["B2", "A2"],
    ["K2", "L2"], ["H1", "J2"], ["D1", "1D"], ["G1", "1G"],
    ["C1", "F2"], ["E2", "I2"], ["A1", "1A"], ["L1", "1L"],
    ["J1", "H2"], ["D2", "G2"], ["B1", "1B"], ["K1", "1K"]
  ],
};

export const ROUND_NAMES = { 
  1: "Sechzehntelfinale", 2: "Achtelfinale", 3: "Viertelfinale", 4: "Halbfinale", 5: "Finale" 
};

/**
 * UI-METRIKEN
 * Diese Werte steuern das visuelle "Wachstum" des Turnierbaums.
 */
export const PHASE_HEIGHTS = { 
  1: "4000px", 
  2: "3300px", 
  3: "1650px", 
  4: "900px", 
  5: "600px" 
};

export const PHASE_SPACING = { 1: 300, 2: 200, 3: 100, 4: 50, 5: 25 };

// --- UI STYLES FÜR DASHBOARD & ALLGEMEIN ---
export const UI_STYLES = {
  matrixBoxOuter: { 
    width: "240px", minHeight: "115px", background: "#fff", borderRadius: "10px", 
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)", border: "1px solid #e2e8f0", 
    display: "flex", flexDirection: "column", overflow: "hidden" 
  },
  teamRowSimulated: { 
    padding: "10px 12px", display: "flex", alignItems: "center", 
    height: "40px", fontSize: "0.85rem", gap: "10px", position: "relative" 
  },
  flagWrapper: { 
    width: "22px", height: "16px", overflow: "hidden", 
    borderRadius: "2px", border: "1px solid #eee", display: "flex", alignItems: "center" 
  },
  flagImg: { width: "100%", height: "auto" },
  matrixLabel: { 
    fontSize: "0.65rem", fontWeight: "bold", color: "#878b8e", 
    textTransform: "uppercase", marginBottom: "4px" 
  },
  headerColumn: { 
    width: "240px", textAlign: "center", display: "flex", 
    flexDirection: "column", gap: "8px", marginBottom: "32px", marginTop: "20px" 
  },
  roundTitle: { fontWeight: "bold", fontSize: "1rem", color: "#2d3748" },
  resetButton: { 
    padding: "4px 8px", fontSize: "0.75rem", backgroundColor: "#fff", 
    border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer", color: "#666" 
  },
  tipContainer: { padding: "6px 10px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" },
  savedTipDisplay: { 
    fontSize: "0.9rem", textAlign: "center", fontWeight: "bold", 
    color: "#1a73e8", display: "flex", flexDirection: "column", gap: "2px" 
  },
  winnerSubText: { fontSize: "0.65rem", color: "#666", fontWeight: "normal" }
};

// --- KO-BRACKET SPEZIFISCHE STYLES ---
export const BRACKET_STYLES = {
  loading: { padding: "20px", color: "#666" },
  
  viewport: (minHeight) => ({ 
    minHeight, 
    padding: "20px", 
    backgroundColor: "#fff", 
    display: "inline-block", 
    verticalAlign: "top" 
  }),

  treeContainer: (height) => ({ 
    position: "relative", 
    height: `${height}px`, 
    backgroundColor: "#fff", 
    width: "fit-content", 
    minWidth: "100%"
  }),

  headerRow: { display: "flex", marginBottom: "60px" },

  headerColumn: { 
    width: "240px", 
    marginRight: "60px", 
    textAlign: "center", 
    display: "flex", 
    flexDirection: "column", 
    gap: "8px" 
  },

  roundTitle: { fontWeight: "bold", fontSize: "1rem", color: "#2d3748" },

  resetButton: { 
    padding: "4px 8px", 
    fontSize: "0.75rem", 
    backgroundColor: "#fff", 
    border: "1px solid #ccc", 
    borderRadius: "4px", 
    cursor: "pointer", 
    color: "#666", 
    zIndex: 10 
  },

  matchLabel: { 
    fontSize: "0.65rem", 
    fontWeight: "bold", 
    color: "#878b8e", 
    textTransform: "uppercase", 
    marginBottom: "4px" 
  },

  matchBox: { 
    width: "240px", 
    minHeight: "115px", 
    background: "#fff", 
    borderRadius: "10px", 
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)", 
    border: "1px solid #e2e8f0", 
    display: "flex", 
    flexDirection: "column", 
    overflow: "hidden" 
  },

  teamRow: (isWinner, isFirst) => ({
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "40px",
    background: isWinner ? "#f0fff4" : "transparent",
    borderBottom: isFirst ? "1px solid #f1f5f9" : "none",
    position: "relative"
  }),

  teamInfoFlex: { display: "flex", alignItems: "center", gap: "10px" },
  teamNameText: { fontSize: "0.85rem" },
  checkMark: { color: "#48bb78", fontWeight: "bold" },
  tipContainer: { padding: "6px 10px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" },
  savedTipDisplay: { fontSize: "0.9rem", textAlign: "center", fontWeight: "bold", color: "#1a73e8", display: "flex", flexDirection: "column", gap: "2px" },
  finalResult: { fontSize: "0.75rem", textAlign: "center", fontWeight: "bold", color: "#475569" },

  lineHorizontal: { 
    position: "absolute", 
    top: "82px", 
    right: "-30px", 
    width: "30px", 
    height: "2px", 
    background: "#cbd5e0" 
  },

  lineVertical: { 
    position: "absolute", 
    right: "-30px", 
    width: "2px", 
    background: "#cbd5e0" 
  }
};

// --- RESTLICHE STYLES (DASHBOARD, GROUP TABLES ETC.) ---
export const DASHBOARD_STYLES = {
  layout: { display: "flex", minHeight: "100vh", backgroundColor: "#f8fafc" },
  sidebar: { width: "240px", backgroundColor: "#fff", borderRight: "1px solid #e2e8f0", padding: "25px", display: "flex", flexDirection: "column", position: "fixed", height: "100vh", zIndex: 100 },
  mainContent: { flex: 1, marginLeft: "240px", padding: "40px", overflowX: "auto", minWidth: 0 },
  whiteCard: { backgroundColor: "#fff", padding: "25px", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" },
  flexibleCard: { backgroundColor: "#fff", padding: "25px", borderRadius: "16px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", width: "fit-content", minWidth: "100%" },
  profileBox: { marginBottom: "30px", paddingBottom: "20px", borderBottom: "1px solid #f1f5f9" },
  badge: { fontSize: "11px", backgroundColor: "#e2e8f0", padding: "2px 8px", borderRadius: "10px", color: "#475569", fontWeight: "bold" },
  nav: { display: "flex", flexDirection: "column", gap: "6px", flex: 1 },
  sectionHeader: { fontSize: "11px", fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", margin: "15px 0 10px 5px" },
  divider: { margin: "15px 0", border: "0", borderTop: "1px solid #f1f5f9" },
  contentTitle: { fontSize: "1.25rem", fontWeight: "700", marginBottom: "15px", color: "#0f172a" },
  matchGrid: { display: "flex", gap: "15px" },
  matchCard: { flex: 1, backgroundColor: "#fff", padding: "20px", borderRadius: "16px", border: "1px solid #e2e8f0", textAlign: "center" },
  groupBadge: { fontSize: "10px", color: "#64748b", fontWeight: "700", marginBottom: "8px" },
  matchTeams: { fontSize: "15px", fontWeight: "700", color: "#1e293b", marginBottom: "12px" },
  quickTippButton: { padding: "6px 12px", backgroundColor: "#f1f5f9", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "600", color: "#2563eb" },
  table: { width: "100%", borderCollapse: "collapse" },
  tableHeader: { borderBottom: "2px solid #f1f5f9" },
  th: { textAlign: "left", padding: "15px", color: "#64748b", fontSize: "13px", fontWeight: "600" },
  td: { padding: "15px", borderBottom: "1px solid #f1f5f9" },
  myRow: { backgroundColor: "#f0f9ff", fontWeight: "700", color: "#0369a1" },
  logoutButton: { padding: "12px", marginTop: "20px", cursor: "pointer", backgroundColor: "#fff", border: "1px solid #fee2e2", borderRadius: "10px", color: "#dc2626", fontWeight: "600" }
};

export const getTabButtonStyle = (active) => ({
  padding: "12px 15px", textAlign: "left", borderRadius: "10px", border: "none", cursor: "pointer",
  backgroundColor: active ? "#eff6ff" : "transparent",
  color: active ? "#2563eb" : "#64748b",
  fontWeight: "600"
});

export const getPhaseButtonStyle = (active, isCurrent) => ({
  padding: "10px 15px", textAlign: "left", borderRadius: "10px", border: "none", cursor: "pointer",
  backgroundColor: active ? "#2563eb" : "transparent",
  color: active ? "#fff" : (isCurrent ? "#0f172a" : "#94a3b8"),
  fontWeight: isCurrent || active ? "700" : "400"
});

export const GROUP_TABLE_STYLES = {
  mainContainer: { display: "flex", gap: "80px", alignItems: "flex-start", marginBottom: "60px", fontFamily: "sans-serif" },
  matchSection: { width: "400px" },
  tableSection: { marginTop: "48px", flex: 1 },
  headerContainer: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" },
  groupTitle: { margin: 0, color: "#333" },
  resetButton: { padding: "4px 8px", fontSize: "0.75em", backgroundColor: "#fff", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer", color: "#666" },
  matchCard: { marginBottom: "12px", padding: "10px", backgroundColor: "#f8f9fa", borderRadius: "8px", fontSize: "0.85em", border: "1px solid #edf2f7", width: "360px", position: "relative" },
  matchFlex: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" },
  teamAContainer: { display: "flex", alignItems: "center", gap: "6px", flex: 1, justifyContent: "flex-end" },
  teamBContainer: { display: "flex", alignItems: "center", gap: "6px", flex: 1 },
  teamName: { fontWeight: "600" },
  scoreDisplayContainer: { minWidth: "60px", textAlign: "center" },
  savedScore: { color: "#1a73e8", fontWeight: "bold", fontSize: "1.1em" },
  tableBase: { width: "100%", borderCollapse: "collapse", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", backgroundColor: "#fff" },
  tableHeaderRow: { backgroundColor: "#2d80ed", color: "#ffffff", textAlign: "left" },
  tableRow: { borderBottom: "1px solid #edf2f7" },
  teamCellContent: { display: "flex", alignItems: "center", gap: "10px" },
  th: { padding: "12px 10px", fontWeight: "600", fontSize: "0.85em", textTransform: "uppercase", letterSpacing: "0.05em" },
  td: { padding: "10px 10px", fontSize: "0.9em" },
  rankTd: { padding: "10px 10px", fontSize: "0.9em", color: "#718096", width: "30px" },
  pointsTd: { padding: "10px 10px", fontSize: "0.9em", textAlign: "center", fontWeight: "bold", color: "#000" },
  swContainer: { marginTop: "16px", padding: "12px", backgroundColor: "#fffaf0", border: "1px solid #feebc8", borderRadius: "8px", width: "260px" },
  swHeader: { fontSize: "0.9rem", fontWeight: "bold", color: "#c05621", marginBottom: "4px" },
  swInfoText: { fontSize: "0.75rem", color: "#718096", fontStyle: "italic", marginBottom: "10px", lineHeight: "1.2" },
  swGrid: { display: "flex", flexDirection: "column", gap: "4px" },
  swRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", backgroundColor: "#ffffff", border: "1px solid #edf2f7", borderRadius: "6px" },
  manualRankInput: { width: "40px", padding: "4px", textAlign: "center", border: "1px solid #cbd5e0", borderRadius: "4px", fontSize: "0.85rem", fontWeight: "bold", color: "#2d3748" }
};

// --- BestThirdsTable ---
export const BEST_THIRDS_STYLES = {
  container: { marginTop: "40px", width: "100%", fontFamily: "sans-serif" },
  title: { marginBottom: "15px", color: "#333", fontSize: "1.2em", fontWeight: "bold" },
  tableBase: { width: "100%", borderCollapse: "collapse", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", borderRadius: "8px", overflow: "hidden" },
  headerRow: { backgroundColor: "#6b94e7", color: "#ffffff", textAlign: "left" },
  row: (isQualified) => ({ 
    borderBottom: "1px solid #edf2f7", 
    transition: "background-color 0.2s",
    backgroundColor: isQualified ? "#f0fff4" : "#ffffff" 
  }),
  teamCell: { display: "flex", alignItems: "center", gap: "10px" },
  th: { padding: "12px 10px", fontWeight: "600", fontSize: "0.85em", textTransform: "uppercase", letterSpacing: "0.05em" },
  thCenter: { padding: "12px 10px", fontWeight: "600", fontSize: "0.85em", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center" },
  td: (isQualified) => ({ 
    padding: "10px 10px", 
    fontSize: "0.95em", 
    fontWeight: isQualified ? "bold" : "normal", 
    color: isQualified ? "#000" : "#718096" 
  }),
  tdCenter: (isQualified) => ({ 
    padding: "10px 10px", 
    fontSize: "0.95em", 
    textAlign: "center",
    fontWeight: isQualified ? "bold" : "normal", 
    color: isQualified ? "#000" : "#718096" 
  }),
  errorBox: { backgroundColor: "#fff5f5", border: "1px solid #fffaf0", borderRadius: "8px", padding: "15px", marginBottom: "25px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" },
  tieRow: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#ffffff", padding: "10px 15px", borderRadius: "6px", border: "1px solid #edf2f7", marginBottom: "5px" },
  tieInput: { width: "60px", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e0", textAlign: "center", fontWeight: "bold", outline: "none" }
};