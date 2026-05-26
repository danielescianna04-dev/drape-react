import React from "react";
import { useCurrentFrame } from "remotion";
import { Colors } from "../design/colors";
import { fontFamily } from "../design/tokens";

/**
 * Pixel-perfect replicas of real Bynot app screens.
 * Recreated from actual device screenshots + source code styles.
 * All text in Italian to match real app locale.
 */

const mono = "'SF Mono', 'Fira Code', 'Menlo', monospace";

/* ================================================================
   SIDEBAR — 44px vertical icon bar on left edge
   Matches VSCodeSidebar.tsx
   ================================================================ */
const Sidebar: React.FC<{ activeIndex?: number }> = ({ activeIndex = 0 }) => {
  const topIcons = [
    { d: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z", label: "grid" },        // grid
    { d: "M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z", label: "folder" }, // folder
    { d: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z", label: "chat" },    // chat
    { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z", label: "eye" }, // eye
  ];

  const midIcons = [
    { d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8", label: "receipt" },
    { d: "M6 3v18 M18 9a3 3 0 01-3 3H6 M18 3a3 3 0 00-3 3H6", label: "git" },
  ];

  const bottomIcons = [
    { d: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9", label: "exit" },
    { d: "M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M12 8a4 4 0 100 8 4 4 0 000-8z", label: "settings" },
  ];

  return (
    <div
      style={{
        width: 44,
        height: "100%",
        background: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 50,
        paddingBottom: 20,
        gap: 0,
        flexShrink: 0,
      }}
    >
      {/* Top icons */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        {topIcons.map((icon, i) => (
          <SidebarIcon key={i} path={icon.d} active={i === activeIndex} />
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Mid icons */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginBottom: 16 }}>
        {midIcons.map((icon, i) => (
          <SidebarIcon key={i} path={icon.d} active={false} />
        ))}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Bottom icons */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        {bottomIcons.map((icon, i) => (
          <SidebarIcon key={i} path={icon.d} active={false} />
        ))}
      </div>
    </div>
  );
};

const SidebarIcon: React.FC<{ path: string; active: boolean }> = ({ path, active }) => (
  <div
    style={{
      width: 44,
      height: 44,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    }}
  >
    {/* Active indicator bar on left */}
    {active && (
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 8,
          bottom: 8,
          width: 3,
          borderRadius: "0 2px 2px 0",
          background: Colors.primary,
        }}
      />
    )}
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? Colors.primary : "#888"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  </div>
);

/* ================================================================
   HOME SCREEN — matches real screenshots exactly (Italian)
   ================================================================ */
export const HomeScreen: React.FC = () => (
  <div
    style={{
      width: "100%",
      height: "100%",
      background: "#0A0A0C",
      fontFamily,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}
  >
    {/* Status bar */}
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 20px 0",
        height: 44,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>15:22</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 1 }}>
          {[3, 5, 7, 9].map((h, i) => (
            <div key={i} style={{ width: 3, height: h, borderRadius: 1, background: "#fff" }} />
          ))}
        </div>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="#fff">
          <path d="M8 2.4C5.6 2.4 3.4 3.4 2 5l1.2 1.2C4.2 5 6 4 8 4s3.8 1 4.8 2.2L14 5c-1.4-1.6-3.6-2.6-6-2.6zM8 5.6c-1.6 0-3 .7-4 1.8L5.2 8.6c.7-.8 1.7-1.4 2.8-1.4s2.1.6 2.8 1.4L12 7.4c-1-1.1-2.4-1.8-4-1.8zM8 9a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>
        </svg>
        {/* Battery */}
        <div style={{ width: 25, height: 12, borderRadius: 3, border: "1.5px solid rgba(255,255,255,0.5)", position: "relative", display: "flex", alignItems: "center", padding: 1.5 }}>
          <div style={{ width: "80%", height: "100%", borderRadius: 1.5, background: "#fff" }} />
        </div>
      </div>
    </div>

    {/* Header */}
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 20px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Avatar */}
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            background: Colors.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>D</span>
        </div>
        <div>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", display: "block" }}>
            Buongiorno
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 1 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>
              Daniele
            </span>
            <div style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(155,138,255,0.15)" }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: Colors.primary, letterSpacing: "0.5px" }}>
                PRO
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* Settings gear */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    </div>

    {/* Scrollable content */}
    <div style={{ flex: 1, paddingTop: 20, overflow: "hidden" }}>
      {/* INIZIA section */}
      <div style={{ padding: "0 20px", marginBottom: 28 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            letterSpacing: "0.8px",
            marginBottom: 14,
          }}
        >
          Inizia
        </div>

        {/* 3 action cards */}
        <div style={{ display: "flex", gap: 10 }}>
          {/* Nuovo — gradient */}
          <div style={{ flex: 1, borderRadius: 14, overflow: "hidden", background: `linear-gradient(135deg, ${Colors.primary}, #7B6BFF)` }}>
            <div style={{ padding: "16px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Nuovo</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>Crea progetto</span>
            </div>
          </div>
          {/* Clona — dark */}
          <div style={{ flex: 1, borderRadius: 14, background: "rgba(20,20,22,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ padding: "16px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Clona</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>clona repo</span>
            </div>
          </div>
          {/* File — dark */}
          <div style={{ flex: 1, borderRadius: 14, background: "rgba(20,20,22,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ padding: "16px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>File</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Apri locale</span>
            </div>
          </div>
        </div>
      </div>

      {/* RECENTI section */}
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            Recenti
          </span>
        </div>

        <HomeProjectCard name="dd" lang="nextjs" time="ora" iconColor="#9B8AFF" />
        <HomeProjectCard name="ff" lang="nextjs" time="13h fa" iconColor="#9B8AFF" />
        <HomeProjectCard name="dj" lang="html" time="14h fa" iconColor="#E34F26" />
        <HomeProjectCard name="Dashboard" lang="react" time="15h fa" iconColor="#61DAFB" />
        <HomeProjectCard name="bynot-dev.it" lang="danielescianna04-dev..." time="1g fa" iconColor="#888" isGithub />

        {/* Vedi tutti button */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          <div
            style={{
              padding: "10px 18px",
              borderRadius: 100,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", letterSpacing: "0.4px" }}>
              Vedi tutti
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const HomeProjectCard: React.FC<{
  name: string;
  lang: string;
  time: string;
  iconColor: string;
  isGithub?: boolean;
}> = ({ name, lang, time, iconColor, isGithub }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      padding: "14px 14px",
      background: "rgba(20,20,22,0.5)",
      borderRadius: 16,
      marginBottom: 8,
    }}
  >
    {/* Project icon */}
    <div
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        background: `${iconColor}18`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {isGithub ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={iconColor}>
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      )}
    </div>
    {/* Info */}
    <div style={{ flex: 1, marginLeft: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{name}</div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: isGithub ? mono : fontFamily }}>
          {lang}
        </span>
        <div style={{ width: 3, height: 3, borderRadius: 1.5, background: "rgba(255,255,255,0.2)", margin: "0 8px" }} />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{time}</span>
      </div>
    </div>
    {/* Chevron */}
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  </div>
);

/* ================================================================
   CHAT SCREEN — Welcome state (empty) matching screenshot 2
   With sidebar, welcome text, suggestion chips, input bar
   ================================================================ */
interface ChatScreenProps {
  visibleMessages?: number;
  streaming?: boolean;
  /** Text currently being typed in the input bar */
  typedText?: string;
  /** User message that has been sent (shows as bubble in conversation) */
  sentMessage?: string;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  visibleMessages = 0,
  streaming = false,
  typedText,
  sentMessage,
}) => {
  const frame = useCurrentFrame();
  const cursorBlink = Math.floor(frame / 15) % 2 === 0;
  const showWelcome = visibleMessages === 0 && !typedText && !sentMessage;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: Colors.bg,
        fontFamily,
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Left sidebar */}
      <Sidebar activeIndex={0} />

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Tab bar — 48px top padding clears Dynamic Island */}
        <div
          style={{
            padding: "48px 12px 8px",
            display: "flex",
            alignItems: "center",
            gap: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 8,
              background: "rgba(155,138,255,0.2)",
              maxWidth: 120,
            }}
          >
            <div style={{ width: 14, height: 14, borderRadius: 7, background: Colors.primary, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 8, color: "#fff" }}>AI</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {showWelcome ? "Nuova C..." : "Rest"}
            </span>
          </div>
        </div>

        {/* Purple decorative gradient at top */}
        <div
          style={{
            position: "absolute",
            top: 58,
            left: 0,
            right: 0,
            height: 120,
            background: "linear-gradient(135deg, rgba(155,138,255,0.15) 0%, rgba(100,80,200,0.08) 50%, transparent 100%)",
            borderRadius: "0 0 40% 0",
          }}
        />

        {showWelcome ? (
          /* ── Welcome State ── */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 24px",
              marginTop: -40,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 8, textAlign: "center" }}>
              Come posso aiutarti?
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginBottom: 28, textAlign: "center", lineHeight: "18px" }}>
              Scrivi cosa vuoi fare o prova un suggerimento
            </div>

            {/* Suggestion chips */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", width: "100%" }}>
              <SuggestionChip icon="sparkles" text="Aggiungi una nuova feature" />
              <SuggestionChip icon="bug" text="Trova e correggi i bug" />
              <SuggestionChip icon="brush" text="Migliora il design" />
              <SuggestionChip icon="rocket" text="Ottimizza le performance" />
            </div>
          </div>
        ) : (
          /* ── Conversation State ── */
          <div style={{ flex: 1, padding: "12px 12px", overflow: "hidden" }}>
            {/* User sent message bubble */}
            {sentMessage && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: 16,
                    borderBottomRightRadius: 4,
                    background: Colors.primary,
                    fontSize: 13,
                    color: "#fff",
                    lineHeight: "18px",
                    fontWeight: 500,
                  }}
                >
                  {sentMessage}
                </div>
              </div>
            )}
            {/* Agent steps */}
            {visibleMessages > 0 && (
              <AgentConversation streaming={streaming} visibleSteps={visibleMessages} />
            )}
            {/* Typing state — only input bar is active, no conversation yet */}
            {typedText && !sentMessage && visibleMessages === 0 && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.3,
                  fontSize: 13,
                  color: "#fff",
                }}
              />
            )}
          </div>
        )}

        {/* ── Input Bar ── */}
        <div style={{ padding: "0 12px 20px", position: "relative", zIndex: 2 }}>
          {/* Glow underneath */}
          <div
            style={{
              position: "absolute",
              top: 4, left: 16, right: 16, bottom: 12,
              borderRadius: 28,
              background: "rgba(139,124,246,0.06)",
              filter: "blur(8px)",
            }}
          />
          <div
            style={{
              position: "relative",
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "linear-gradient(180deg, rgba(35,35,40,0.95), rgba(25,25,30,0.98))",
              overflow: "hidden",
            }}
          >
            {/* Top controls — matches real app screenshot */}
            <div style={{ height: 36, padding: "4px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {/* Left: AI label + image icon */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* AI badge */}
                <div style={{ padding: "3px 8px", borderRadius: 6, background: "rgba(255,255,255,0.1)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>AI</span>
                </div>
                {/* Image picker icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8A8A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              {/* Right: model selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {/* Circle icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <span style={{ fontSize: 11, color: "#888", fontWeight: 500 }}>Claude 4.6 Opus</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            {/* Input row */}
            <div style={{ display: "flex", alignItems: "center", padding: "0 12px 10px", gap: 8 }}>
              {/* Plus button */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {/* Input text or placeholder */}
              <div style={{ flex: 1, fontSize: 14, color: typedText ? "#fff" : "#6E7681", padding: "10px 0", overflow: "hidden", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                <span>{typedText || "Chiedi qualcosa..."}</span>
                {/* Blinking cursor when typing */}
                {typedText && !sentMessage && cursorBlink && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 2,
                      height: 16,
                      background: Colors.primary,
                      marginLeft: 1,
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
              {/* Send / Stop button */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: streaming ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)",
                  border: streaming ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {streaming ? (
                  /* Red stop square */
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: "#EF4444" }} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Purple decorative wave at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            background: "linear-gradient(180deg, transparent, rgba(155,138,255,0.04))",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
};

const SuggestionChip: React.FC<{ icon: string; text: string }> = ({ icon, text }) => {
  const iconPaths: Record<string, string> = {
    sparkles: "M12 2L9 9l-7 3 7 3 3 7 3-7 7-3-7-3z",
    bug: "M8 2l1.88 1.88 M14.12 3.88L16 2 M9 7.13v-1a3.003 3.003 0 116 0v1 M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6 M12 20v-9 M6.53 9C4.6 8.8 3 7.1 3 5 M6 13H2 M3 21c0-2.1 1.7-3.9 3.8-4 M20.97 5c0 2.1-1.6 3.8-3.5 4 M22 13h-4 M17.2 17c2.1.1 3.8 1.9 3.8 4",
    brush: "M9.06 11.9l8.07-8.06a2.85 2.85 0 114.03 4.03l-8.06 8.08 M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 00-3-3.02z",
    rocket: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0 M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.06)",
        width: "85%",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d={iconPaths[icon] || iconPaths.sparkles} />
      </svg>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{text}</span>
    </div>
  );
};

/* ══════════════════════════════════════════
   AGENT CONVERSATION — matches real chat output
   Shows tool use badges, timeline dots, bash cards
   ══════════════════════════════════════════ */

const AgentConversation: React.FC<{ streaming?: boolean; visibleSteps?: number }> = ({
  streaming,
  visibleSteps = 6,
}) => {
  const steps = [
    // Step 1: AI text response
    {
      type: "text" as const,
      content: "Perfetto! Creo una dashboard React con tema scuro elegante, effetti glassmorphism e gradienti vibranti.",
    },
    // Step 2: CMD - reading files
    {
      type: "cmd" as const,
      command: "cat src/App.tsx src/index.css",
      status: "Command completed",
      output: "import React from 'react';\nconst App = () => {\n  return (\n    <div className=\"app\">\n      ...\n    </div>\n  );\n};",
    },
    // Step 3: AI text
    {
      type: "text" as const,
      content: "Iniziamo aggiornando la configurazione di Tailwind per aggiungere colori personalizzati e animazioni.",
    },
    // Step 4: WRITE file
    {
      type: "write" as const,
      file: "tailwind.config.js",
      status: "Writing...",
    },
    // Step 5: WRITE file
    {
      type: "write" as const,
      file: "index.css",
      status: "Writing...",
    },
    // Step 6: TODO
    {
      type: "todo" as const,
      label: "List",
      status: "Updating.",
    },
  ];

  return (
    <div style={{ position: "relative", paddingLeft: 20 }}>
      {/* Vertical timeline line */}
      <div
        style={{
          position: "absolute",
          left: 8,
          top: 8,
          bottom: 20,
          width: 2,
          background: "rgba(255,255,255,0.06)",
        }}
      />

      {steps.slice(0, visibleSteps).map((step, i) => (
        <div key={i} style={{ position: "relative", marginBottom: 14 }}>
          {/* Timeline dot */}
          <div
            style={{
              position: "absolute",
              left: -14,
              top: step.type === "text" ? 6 : 8,
              width: 8,
              height: 8,
              borderRadius: 4,
              background:
                step.type === "cmd" ? Colors.success :
                step.type === "write" ? Colors.primary :
                step.type === "todo" ? "#D29922" :
                "rgba(255,255,255,0.3)",
            }}
          />

          {step.type === "text" && (
            <div style={{ fontSize: 13, color: "#fff", lineHeight: "20px", paddingRight: 8 }}>
              {step.content}
            </div>
          )}

          {step.type === "cmd" && (
            <div>
              {/* CMD badge + command */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <ToolBadge label="CMD" color={Colors.success} icon="terminal" />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontFamily: mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {step.command}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6, paddingLeft: 4 }}>
                {step.status}
              </div>
              {/* Bash output card */}
              <div
                style={{
                  background: "rgba(20,20,20,0.95)",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: 10,
                  overflow: "hidden",
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    fontSize: 11,
                    lineHeight: 1.5,
                    fontFamily: mono,
                    color: "rgba(255,255,255,0.7)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {step.output}
                </pre>
              </div>
              {/* Expand button */}
              <div
                style={{
                  marginTop: 6,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.4)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Mostra 41 righe in piu
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          )}

          {step.type === "write" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <ToolBadge label="WRITE" color={Colors.success} icon="file" />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontFamily: mono }}>
                  {step.file}
                </span>
              </div>
              <div style={{ paddingLeft: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>└</span>
                <span style={{ fontSize: 11, color: Colors.success, fontStyle: "italic" }}>
                  {step.status}
                </span>
              </div>
            </div>
          )}

          {step.type === "todo" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <ToolBadge label="TODO" color="#D29922" icon="check" />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                  {step.label}
                </span>
              </div>
              <div style={{ paddingLeft: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.15)" }}>└</span>
                <span style={{ fontSize: 11, color: "#D29922", fontStyle: "italic" }}>
                  {step.status}
                </span>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Loading indicator */}
      {streaming && (
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              position: "absolute",
              left: -14,
              top: 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "rgba(255,255,255,0.25)",
            }}
          />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
            Preparazione risposta... (4s)...
          </span>
        </div>
      )}
    </div>
  );
};

/** Tool use badge (CMD, WRITE, TODO) */
const ToolBadge: React.FC<{ label: string; color: string; icon: string }> = ({
  label,
  color,
  icon,
}) => {
  const iconSvg: Record<string, string> = {
    terminal: "M4 17l6-6-6-6 M12 19h8",
    file: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6",
    check: "M9 11l3 3L22 4 M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
  };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 6,
        background: `${color}20`,
        border: `1px solid ${color}40`,
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={iconSvg[icon] || iconSvg.file} />
      </svg>
      <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.5px" }}>
        {label}
      </span>
    </div>
  );
};

/* ================================================================
   GITHUB SCREEN — Repository panel (matches screenshot 3)
   Glass panel overlay with repo info, branch, commit tabs
   ================================================================ */
export const GitHubScreen: React.FC = () => (
  <div
    style={{
      width: "100%",
      height: "100%",
      background: Colors.bg,
      fontFamily,
      display: "flex",
      flexDirection: "row",
      overflow: "hidden",
      position: "relative",
    }}
  >
    {/* Left sidebar */}
    <Sidebar activeIndex={0} />

    {/* Main area */}
    <div
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Purple decorative gradient */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: -20,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: "rgba(155,138,255,0.1)",
          filter: "blur(40px)",
        }}
      />

      {/* Repository glass panel — centered in screen */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: 16,
          right: 16,
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(30,30,34,0.85)",
          backdropFilter: "blur(20px)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Panel header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Git branch icon in purple bg */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(155,138,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={Colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3v18 M18 9a3 3 0 01-3 3H6 M18 3a3 3 0 00-3 3H6" />
              </svg>
            </div>
            <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Repository</span>
          </div>
          {/* Close X */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: "rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        </div>

        {/* Branch + action buttons row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Branch badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",
              borderRadius: 8,
              background: "rgba(155,138,255,0.12)",
              border: "1px solid rgba(155,138,255,0.2)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={Colors.primary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3v18 M18 9a3 3 0 01-3 3H6" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: Colors.primary }}>main</span>
          </div>
          {/* Action buttons: refresh, pull, push */}
          <div style={{ display: "flex", gap: 6 }}>
            {["M1 4v6h6 M3.51 15a9 9 0 1014.85-3.36L23 1", "M12 5v14 M19 12l-7 7-7-7", "M12 19V5 M5 12l7-7 7 7"].map((d, i) => (
              <div
                key={i}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={d} />
                </svg>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs: Commit, Branch, Modifiche */}
        <div style={{ display: "flex", gap: 0 }}>
          {["Commit", "Branch", "Modifiche"].map((tab, i) => (
            <div
              key={tab}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: i === 0 ? "rgba(255,255,255,0.1)" : "transparent",
                fontSize: 13,
                fontWeight: i === 0 ? 600 : 500,
                color: i === 0 ? "#fff" : "rgba(255,255,255,0.4)",
              }}
            >
              {tab}
            </div>
          ))}
        </div>

        {/* GitHub connect area */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "20px 0",
            gap: 12,
          }}
        >
          {/* GitHub icon circle */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              background: "rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          </div>

          <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>Connetti Repository</span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Nessun account disponibile</span>

          {/* CTA button */}
          <div
            style={{
              marginTop: 8,
              padding: "12px 28px",
              borderRadius: 14,
              background: Colors.primary,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Connetti Repository</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);
