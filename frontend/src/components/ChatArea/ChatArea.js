// components/ChatArea/ChatArea.jsx
import React, { useState, useRef, useEffect } from "react";
import { LuSendHorizontal } from "react-icons/lu";
import { RiVoiceprintLine } from "react-icons/ri";
import { FiCopy } from "react-icons/fi";
import { TiTick } from "react-icons/ti";
import { FaVolumeHigh } from "react-icons/fa6";
import AutoResizeTextarea from "../AutoResizeTextarea/AutoResizeTextarea";
import ReactMarkdown from "react-markdown";
import { useTranslation } from "react-i18next";

import "./ChatArea.css";

const ChatArea = ({ messages, onSend, loading, loadingResponse }) => {
  const { t } = useTranslation();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000); // 2s rồi reset
    } catch (err) {
      alert("Lỗi khi sao chép");
    }
  };

  const handlePlayAudio = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "vi-VN";
    speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {loading ? (
          <div className="chat-loading-overlay">
            <div className="loading-image-container">
              <img
                src="/assets/sleep.png"
                alt="Bot"
                className="loading-avatar"
              />
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`chat-message-wrapper ${
                msg.role === "user" ? "user" : "bot"
              }`}
            >
              <div className={`chat-message ${msg.role}`}>
                {msg.role === "bot" ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>

              {msg.role === "user" && (
                <button
                  className="copy-btn"
                  onClick={() => handleCopy(msg.content, idx)}
                  title={t("copy")}
                >
                  {copiedIndex === idx ? <TiTick /> : <FiCopy />}
                </button>
              )}

              {msg.role === "bot" && (
                <div className="bot-tools">
                  <div className="bot-action-buttons">
                    <button
                      className="action-btn"
                      onClick={() => handleCopy(msg.content)}
                      title={t("copy")}
                    >
                      <FiCopy />
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => handlePlayAudio(msg.content)}
                      title={t("read")}
                    >
                      <FaVolumeHigh />
                    </button>
                  </div>
                  <div className="bot-extra-buttons">
                    <button className="extra-btn">{t("create_note")}</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
        {loadingResponse && (
          <div className="chat-message-wrapper bot">
            <div className="chat-message bot">
              <div className="bot-loading">
                <img
                  src="/assets/thinking_bot_rmbg.png"
                  alt="Bot"
                  className="bot-avatar"
                />
                <div className="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <AutoResizeTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("default_prompt")}
        />
        <button onClick={handleSend}>
          <RiVoiceprintLine />
        </button>
        <button onClick={handleSend}>
          <LuSendHorizontal />
        </button>
      </div>
    </div>
  );
};

export default ChatArea;
