import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import "./styles.css";

// 2. MODIFIED System instruction
const SYSTEM_MESSAGE = {
  role: "system",
  content: `
You are a Multilingual Energy Assistant.

**Style Rules:**
* Always reply in the user's language.
* **Use Markdown for professional formatting.**
* Use **bolding** for emphasis and labels (e.g., "**Key Risks:**").
* Use \`##\` for main titles (e.g., "## ⚡ Energy Scenario Analysis").
* Use \`###\` for sub-sections (e.g., "### Step-by-Step Recommendations").
* Use bulleted (\`*\`) or numbered (\`1.\`) lists for clarity.
* Use blockquotes (\`>\`) for important notes or summaries.
* Use inline \`code\` for technical terms, units, or variables.
* Use code fences ( \`\`\` ) for multi-line code blocks or data examples.

**Special Behaviour for "Energy scenario simulation":**
* When the user provides scenario data (solar, EV, storage), format your reply using Markdown headings as defined in the style rules.
* Start with \`## ⚡ Energy Scenario Simulation – Detailed Analysis\`
* Use \`###\` for these sections:
    * \`### Scenario\`
    * \`### Expected Load vs Generation\`
    * \`### Key Risks & Bottlenecks\`
    * \`### Step-by-Step Recommendations\`
    * \`### Useful Charts / Maps to Show\`
    * \`### TTS-Friendly Summary\`
`.trim(),
};

// Create a new conversation with welcome message
const createNewConversation = () => {
  const now = Date.now();
  return {
    id: `conv-${now}-${Math.random().toString(16).slice(2)}`,
    title: "New chat",
    createdAt: new Date().toISOString(),
    messages: [
      {
        id: `msg-${now}-welcome`,
        role: "assistant",
        text:
          "## ⚡ Welcome to the Multilingual Energy Assistant.\n\n" +
          "Ask anything about energy (solar, wind, EV, grid, policies, etc.) in English, Bangla, or any language. \n\n" +
          "> You can also attach images / documents, or use the **Scenario Simulation** panel on the right.",
      },
    ],
  };
};

const STORAGE_KEY = "ml-chat-conversations-v1";

// ❗️Changed: point directly to our Node server
const API_URL = "/api/chat";


const App = () => {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [scenario, setScenario] = useState({
    solar: "20",
    ev: "15",
    storage: "5",
  });

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Load conversations from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);
          setActiveId(parsed[0].id);
          return;
        }
      }
    } catch (err) {
      console.error("Error loading history:", err);
    }

    const first = createNewConversation();
    setConversations([first]);
    setActiveId(first.id);
  }, []);

  // Save conversations to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (err) {
      console.error("Error saving history:", err);
    }
  }, [conversations]);

  const activeConversation =
    conversations.find((c) => c.id === activeId) || conversations[0];

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeId, conversations, isLoading]);

  // Speech recognition setup
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
  }, []);

  const handleMicClick = () => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    if (isListening) {
      recognition.stop();
      return;
    }
    setIsListening(true);
    recognition.start();
  };

  // File helpers
  const readFileAsNeeded = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const id = `att-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;
        if (file.type.startsWith("image/")) {
          resolve({
            id,
            kind: "image",
            name: file.name,
            mime: file.type,
            dataUrl: reader.result,
          });
        } else {
          const text = String(reader.result || "");
          resolve({
            id,
            kind: "text",
            name: file.name,
            mime: file.type || "text/plain",
            content: text.slice(0, 8000),
          });
        }
      };

      reader.onerror = () => reject(reader.error);

      if (file.type.startsWith("image/")) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
       if (!files.length) return;
    try {
      const processed = await Promise.all(files.map(readFileAsNeeded));
      setPendingAttachments((prev) => [...prev, ...processed]);
    } catch (err) {
      console.error("Error reading file:", err);
      alert("There was a problem reading one of the files.");
    } finally {
      e.target.value = "";
    }
  };

  const removeAttachment = (id) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const startNewChat = () => {
    const conv = createNewConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setInput("");
    setPendingAttachments([]);
  };

  // Build messages for OpenAI (for normal chat)
  const buildApiMessagesFromConversation = (conv) => {
    const apiMessages = [SYSTEM_MESSAGE];

    for (const msg of conv.messages) {
      let role = msg.role;
      let content = msg.text || "";

      if (msg.attachments && msg.attachments.length > 0) {
        const summary = msg.attachments
          .map((att) =>
            att.kind === "image"
              ? `Image: ${att.name}`
              : `Document: ${att.name}`
          )
          .join("; ");
        content += `\n\n[Attachments: ${summary}]`;
      }

      if (role !== "user" && role !== "assistant" && role !== "system") {
        role = "user";
      }

      apiMessages.push({ role, content });
    }

    return apiMessages;
  };

  // ----- Normal chat send -----
  const sendMessage = async ({
    textOverride,
    attachmentsOverride,
  } = {}) => {
    if (!activeConversation) return;

    const baseText = textOverride !== undefined ? textOverride : input ?? "";
    const trimmed = baseText.trim();
    const attachmentsToUse =
      attachmentsOverride !== undefined
        ? attachmentsOverride
        : pendingAttachments;

    if (!trimmed && attachmentsToUse.length === 0) return;
    if (isLoading) return;

    const uiText =
      trimmed ||
      (attachmentsToUse.length
        ? "Please analyse the attached file(s) / image(s)."
        : "");

    const userMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      text: uiText,
      attachments: attachmentsToUse,
    };

    let updatedConversation = {
      ...activeConversation,
      messages: [...activeConversation.messages, userMessage],
    };

    const hasAnyUser = activeConversation.messages.some(
      (m) => m.role === "user"
    );
    if (!hasAnyUser && trimmed) {
      updatedConversation.title =
        trimmed.length > 40 ? trimmed.slice(0, 37) + "…" : trimmed;
    }

    const newConversations = conversations.map((c) =>
      c.id === activeConversation.id ? updatedConversation : c
    );

    setConversations(newConversations);
    setInput("");
    setPendingAttachments([]);
    setIsLoading(true);

    try {
      const apiMessages = buildApiMessagesFromConversation(
        updatedConversation
      );

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const textBody = await res.text();
      let data = {};
      if (textBody) {
        try {
          data = JSON.parse(textBody);
        } catch (e) {
          console.error("Non-JSON response from server:", textBody);
        }
      }

      if (!res.ok) {
        const errMsg =
          (data && (data.error || data.message)) ||
          (typeof data === "string" ? data : "") ||
          `Request failed with status ${res.status}`;
        throw new Error(errMsg);
      }

      const assistantMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        text: data.text || "I couldn’t generate a response.",
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === updatedConversation.id
            ? { ...c, messages: [...c.messages, assistantMessage] }
            : c
        )
      );
    } catch (err) {
      console.error(err);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === updatedConversation.id
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: `msg-${Date.now()}-error`,
                    role: "assistant",
                    text:
                      "⚠️ " +
                      (err.message ||
                        "Something went wrong talking to the model."),
                  },
                ],
              }
            : c
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    sendMessage();
  };

  // Scenario run (unchanged logic)
  const runScenario = () => {
    if (!activeConversation || isLoading) return;

    const { solar, ev, storage } = scenario;

    const scenarioText =
      `Energy scenario simulation.\n\n` +
      `Solar capacity: ${solar || "0"} MW\n` +
      `EV adoption: ${ev || "0"} %\n` +
      `Storage capacity: ${storage || "0"} MWh\n\n` +
      `Act as the Multilingual Energy Assistant and reply in the user's language.\n\n` +
      `Format the answer EXACTLY as requested in the system message's "Energy scenario simulation" section (using ## for the main title and ### for subsections).\n\n` +
      `Here is the data:\n` +
      `* Solar: ${solar || "0"} MW\n` +
      `* EV: ${ev || "0"} %\n` +
      `* Storage: ${storage || "0"} MWh\n`;

    sendMessage({
      textOverride: scenarioText,
      attachmentsOverride: [],
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const messagesToRender = activeConversation?.messages || [];

  // -------- UI --------
  return (
    <div className="app-root">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">ENERGYVERSE</div>
        <button className="sidebar-newchat" onClick={startNewChat}>
          New chat
        </button>

        <div className="sidebar-section-title">Chats</div>
        <div className="chat-list">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              className={`chat-item ${
                conv.id === activeConversation?.id ? "active" : ""
              }`}
              onClick={() => setActiveId(conv.id)}
            >
              <div className="chat-item-title">
                {conv.title || "New chat"}
              </div>
              <div className="chat-item-sub">
                {new Date(conv.createdAt).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "short",
                })}
              </div>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="assistant-chip">
            <div className="assistant-icon">⚡</div>
            <div className="assistant-text">
              <div className="assistant-name">
                Multilingual Energy Assistant
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main chat area */}
      <main className="chat-main">
        <header className="chat-header">
          <div>
            <div className="chat-title">Multilingual Energy Assistant</div>
            <div className="chat-subtitle">
              Ask in any language. Attach images &amp; documents. Use scenario
              simulation for quick what-if analysis.
            </div>
          </div>

          <a
            href="https://energy-verse-portal.netlify.app/?feature=8"
            className="btn-back-to-portal"
            target="_blank"
            rel="noopener noreferrer"
          >
            ← Back to Portal
          </a>
        </header>

        <div className="chat-content">
          {/* Chat messages */}
          <section className="chat-body">
            <div className="chat-bg-glow" />
            {messagesToRender.map((msg) => (
              <div
                key={msg.id}
                className={`message-row ${
                  msg.role === "user"
                    ? "message-user"
                    : "message-assistant"
                }`}
              >
                <div className="message-avatar">
                  {msg.role === "user" ? "U" : "AI"}
                </div>
                <div className="message-bubble">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>

                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="attachment-list in-message">
                      {msg.attachments.map((att) => (
                        <span
                          key={att.id}
                          className="attachment-pill small"
                        >
                          {att.kind === "image" ? "🖼" : "📄"} {att.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="message-row message-assistant">
                <div className="message-avatar">AI</div>
                <div className="message-bubble thinking">
                  <span className="dot dot1" />
                  <span className="dot dot2" />
                  <span className="dot dot3" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </section>

          {/* Scenario Simulation panel */}
          <aside className="scenario-panel">
            <div className="scenario-header">
              <div className="scenario-title">Scenario Simulation</div>
              <div className="scenario-sub">
                Quick what-if analysis for solar, EVs &amp; storage. Results
                appear in the chat.
              </div>
            </div>

            <div className="scenario-grid">
              <div className="scenario-field">
                <label>Solar (MW)</label>
                <input
                  className="scenario-input"
                  type="number"
                  value={scenario.solar}
                  onChange={(e) =>
                    setScenario((s) => ({
                      ...s,
                      solar: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="scenario-field">
                <label>EV adoption (%)</label>
                <input
                  className="scenario-input"
                  type="number"
                  value={scenario.ev}
                  onChange={(e) =>
                    setScenario((s) => ({
                      ...s,
                      ev: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="scenario-field">
                <label>Storage (MWh)</label>
                <input
                  className="scenario-input"
                  type="number"
                  value={scenario.storage}
                  onChange={(e) =>
                    setScenario((s) => ({
                      ...s,
                      storage: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <button
              type="button"
              className="scenario-button"
              onClick={runScenario}
              disabled={isLoading}
            >
              {isLoading ? "Running…" : "Run Scenario"}
            </button>

            <div className="scenario-note">
              Tip: you can still type follow-up questions in the chat (e.g.,
              “Compare this to 30 MW solar” or “Explain in Bangla”).
            </div>
          </aside>
        </div>

        {/* Footer input */}
        <footer className="chat-footer">
          {pendingAttachments.length > 0 && (
            <div className="attachment-list">
              {pendingAttachments.map((att) => (
                <button
                  key={att.id}
                  type="button"
                  className="attachment-pill"
                  onClick={() => removeAttachment(att.id)}
                >
                  {att.kind === "image" ? "🖼" : "📄"} {att.name}
                  <span className="attachment-x">×</span>
                </button>
              ))}
            </div>
          )}

          <div className="input-wrapper">
            <div className="input-tools">
              <button
                type="button"
                className="icon-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Attach images / text files"
              >
                📎
              </button>
              <button
                type="button"
                className={`icon-btn ${isListening ? "active" : ""}`}
                onClick={handleMicClick}
                title="Voice input"
              >
                🎤
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={handleFileChange}
                accept=".txt,.md,.csv,.json,image/*"
              />
            </div>

            <textarea
              className="chat-input"
              placeholder="Ask anything about energy… (Enter to send, Shift+Enter for new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />

            <button
              className="send-btn"
              onClick={handleSend}
              disabled={
                isLoading || (!input.trim() && !pendingAttachments.length)
              }
            >
              {isLoading ? (
                <span className="spinner" />
              ) : (
                <span className="send-icon">➤</span>
              )}
            </button>
          </div>

          <div className="footer-note">
            Multilingual Energy Assistant
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;
