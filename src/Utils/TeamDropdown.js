// TeamDropdown.jsx
import React, { useState, useRef, useEffect } from "react";
import { FlagIcon } from "./teamUtils";

const TeamDropdown = ({ options, value, onChange, disabled, placeholder = "Wähle ein Team..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Schließt das Dropdown, wenn man außerhalb klickt
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.ref?.contains(event.target) && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: "relative", width: "100%", maxWidth: "400px" }}>
      {/* Ausgewähltes Element / Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        style={{
          padding: "10px",
          borderRadius: "8px",
          border: `1px solid ${disabled ? "#e2e8f0" : "#cbd5e1"}`,
          backgroundColor: disabled ? "#f8fafc" : "white",
          color: value ? "#0f172a" : "#94a3b8",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          justifyContent: "space-between",
          userSelect: "none"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {value && <FlagIcon teamName={value} />}
          <span>{value || placeholder}</span>
        </div>
        <span style={{ fontSize: "12px" }}>{isOpen ? "▲" : "▼"}</span>
      </div>

      {/* Dropdown-Liste */}
      {isOpen && !disabled && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          zIndex: 999,
          background: "white",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          marginTop: "4px",
          maxHeight: "250px",
          overflowY: "auto",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
        }}>
          {options.map((team) => (
            <div
              key={team}
              onClick={() => {
                onChange(team);
                setIsOpen(false);
              }}
              style={{
                padding: "10px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                backgroundColor: value === team ? "#f1f5f9" : "transparent",
                transition: "background 0.1s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = value === team ? "#f1f5f9" : "transparent")}
            >
              <FlagIcon teamName={team} />
              <span style={{ color: "#0f172a", fontSize: "14px" }}>{team}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamDropdown;