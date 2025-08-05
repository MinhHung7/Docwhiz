// components/ChatArea/ChatArea.jsx
import React, { useState, useRef, useEffect } from "react";
import { LuSendHorizontal } from "react-icons/lu";
import { RiVoiceprintLine } from "react-icons/ri";
import { FiCopy } from "react-icons/fi";
import { TiTick } from "react-icons/ti";
import { FaVolumeHigh } from "react-icons/fa6";
import AutoResizeTextarea from "../AutoResizeTextarea/AutoResizeTextarea";
import "./ChatArea.css";

const ChatArea = ({ messages, onSend }) => {
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
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chat-message-wrapper ${
              msg.role === "user" ? "user" : "bot"
            }`}
          >
            <div className={`chat-message ${msg.role}`}>{msg.content}</div>

            {/* USER chỉ hiện copy khi hover */}
            {msg.role === "user" && (
              <button
                className="copy-btn"
                onClick={() => handleCopy(msg.content, idx)}
                title="Sao chép"
              >
                {copiedIndex === idx ? <TiTick /> : <FiCopy />}
              </button>
            )}

            {/* BOT luôn hiện 2 nút */}
            {msg.role === "bot" && (
              <div className="bot-tools">
                <div className="bot-action-buttons">
                  <button
                    className="action-btn"
                    onClick={() => handleCopy(msg.content)}
                    title="Sao chép"
                  >
                    <FiCopy />
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => handlePlayAudio(msg.content)}
                    title="Đọc to"
                  >
                    <FaVolumeHigh />
                  </button>
                </div>

                <div className="bot-extra-buttons">
                  <button className="extra-btn">Tạo ghi chú</button>
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <AutoResizeTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Bạn muốn hỏi về điều gì?"
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
