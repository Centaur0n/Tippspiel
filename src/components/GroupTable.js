import React from 'react';
import TipInput from './TipInput'; 
import { FlagIcon } from '../Utils/teamUtils';

const GroupTable = ({ 
  groupName, 
  matches, 
  tips, 
  tableData, 
  isSubmitted, 
  onDeleteTips, 
  onSaveTip 
}) => {

  // Das Mapping für deine Teams
  return (
    <div
      style={{
        display: "flex",
        gap: "80px",
        alignItems: "flex-start",
        marginBottom: "60px",
        fontFamily: "sans-serif"
      }}
    >
      {/* 🔵 LINKS → Spiele */}
      <div style={{ width: "400px" }}> {/* Breite leicht erhöht für Flaggen */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
          <h3 style={{ margin: 0, color: "#333" }}>Gruppe {groupName}</h3>
          {!isSubmitted && (
            <button 
              onClick={() => onDeleteTips(groupName)}
              style={{
                padding: "4px 8px",
                fontSize: "0.75em",
                backgroundColor: "#fff",
                border: "1px solid #ccc",
                borderRadius: "4px",
                cursor: "pointer",
                color: "#666"
              }}
            >
              Reset
            </button>
          )}
        </div>

        {matches.map((m) => {
          const tip = tips[m.id];
          return (
            <div key={m.id} style={{ 
              marginBottom: "12px", 
              padding: "10px", 
              backgroundColor: "#f8f9fa", 
              borderRadius: "8px",
              fontSize: "0.85em",
              border: "1px solid #edf2f7",
              // Fix: Breite erhöhen, damit alles in eine Zeile passt
              width: "360px" 
            }}>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between", // Verteilt Teams und Ergebnis
                gap: "10px" 
              }}>
                {/* Team A */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, justifyContent: "flex-end" }}>
                  <span style={{ fontWeight: "600", textAlign: "right" }}>{m.team_a}</span>
                  <FlagIcon teamName={m.team_a} />
                </div>

                {/* Ergebnis / Input */}
                <div style={{ minWidth: "60px", textAlign: "center" }}>
                  {tip ? (
                    <div style={{ color: "#1a73e8", fontWeight: "bold", fontSize: "1.1em" }}>
                      {tip.goals_a} : {tip.goals_b}
                    </div>
                  ) : (
                    !isSubmitted && (
                      <TipInput
                        isKO={false}
                        onSave={(a, b, w) => onSaveTip(m.id, a, b, w)}
                      />
                    )
                  )}
                </div>

                {/* Team B */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                  <FlagIcon teamName={m.team_b} />
                  <span style={{ fontWeight: "600" }}>{m.team_b}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 🟢 RECHTS → Tabelle */}
      <div style={{ marginTop: "48px", flex: 1 }}>
        <table style={{ 
          width: "100%", 
          borderCollapse: "collapse",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          backgroundColor: "#fff"
        }}>
          <thead>
            <tr style={{ backgroundColor: "#1a73e8", color: "#ffffff", textAlign: "left" }}>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Team</th>
              <th style={thCenterStyle}>Pkt</th>
              <th style={thCenterStyle}>Tore</th>
              <th style={thCenterStyle}>GT</th>
              <th style={thCenterStyle}>Diff</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, index) => {
              const isQualified = index < 2;
              return (
                <tr key={row.team} style={{ 
                  borderBottom: "1px solid #edf2f7",
                  backgroundColor: isQualified ? "#f0fff4" : "#ffffff"
                }}>
                  <td style={{ ...tdStyle, color: "#718096", width: "30px" }}>{index + 1}.</td>
                  <td style={{ ...tdStyle, fontWeight: isQualified ? "600" : "400", color: "#2d3748" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <FlagIcon teamName={row.team} />
                      {row.team}
                    </div>
                  </td>
                  <td style={{ ...tdCenterStyle, fontWeight: "bold", color: "#000" }}>{row.points}</td>
                  <td style={tdCenterStyle}>{row.goals}</td>
                  <td style={tdCenterStyle}>{row.conceded}</td>
                  <td style={{ 
                    ...tdCenterStyle, 
                    color: row.diff < 0 ? "#e53e3e" : "#2d3748",
                    fontWeight: row.diff !== 0 ? "600" : "400"
                  }}>
                    {row.diff > 0 ? `+${row.diff}` : row.diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const thStyle = { padding: "12px 10px", fontWeight: "600", fontSize: "0.85em", textTransform: "uppercase", letterSpacing: "0.05em" };
const thCenterStyle = { ...thStyle, textAlign: "center" };
const tdStyle = { padding: "10px 10px", fontSize: "0.9em" };
const tdCenterStyle = { ...tdStyle, textAlign: "center" };

export default GroupTable;