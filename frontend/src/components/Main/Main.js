// Main.js
import React, { useState, useEffect, useCallback } from "react";
import TopBar from "../TopBar/TopBar";
import SideBar from "../SideBar/SideBar";
import ChatArea from "../ChatArea/ChatArea";
import NoteStorage from "../NoteStorage/NoteStorage";
import FileStorage from "../FileStorage/FileStorage";
import { supabase } from "../SupabaseClient/SupabaseClient";
import "./Main.css";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { color } from "d3";

const Main = () => {
  const { i18n } = useTranslation();

  const [collapsed, setCollapsed] = useState(false);
  const [loadingChatsHistory, setLoadingChatsHistory] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatsHistory, setChatsHistory] = useState([]);
  const [selectedChatIndex, setSelectedChatIndex] = useState(0);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messages, setMessages] = useState([
    { role: "bot", content: i18n.t("default_response") },
  ]);
  const [loadingResponse, setLoadingResponse] = useState(false);
  const [selectedFileSummary, setSelectedFileSummary] = useState(null);
  const [selectedFileSummaryId, setSelectedFileSummaryId] = useState(null);

  const [selectedMindmapNote, setSelectedMindmapNote] = useState(null);
  const [selectedMindmapNoteId, setSelectedMindmapNoteId] = useState(null);

  const [tabMode, setTabMode] = useState("preview"); // hoặc 'edit'
  const [editableSummary, setEditableSummary] = useState("");

  const [copied, setCopied] = useState(false);

  const typeBotResponse = (fullText) => {
    let index = 0;
    const typingSpeed = 15; // Có thể tăng nhẹ vì mỗi lần cập nhật nhiều ký tự hơn
    const chunkSize = 5; // Số ký tự thêm vào mỗi lần cập nhật

    // Thêm message rỗng ban đầu
    setMessages((prev) => [...prev, { role: "bot", content: "" }]);

    const intervalId = setInterval(() => {
      // Cập nhật index, đảm bảo không vượt quá độ dài của text
      index = Math.min(index + chunkSize, fullText.length);

      setMessages((prevMessages) => {
        const updatedMessages = [...prevMessages];
        const lastMessage = updatedMessages[updatedMessages.length - 1];

        if (lastMessage.role === "bot") {
          updatedMessages[updatedMessages.length - 1] = {
            ...lastMessage,
            content: fullText.slice(0, index), // Cập nhật nội dung theo index mới
          };
        }

        return updatedMessages;
      });

      // Nếu đã hiển thị hết, dừng interval
      if (index >= fullText.length) {
        clearInterval(intervalId);
      }
    }, typingSpeed);
  };

  const handleSendMessage = async (message) => {
    // Add user message immediately
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setLoadingResponse(true);

    const currentChat = chatsHistory[selectedChatIndex];

    try {
      // Get session token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token || !currentChat?.id) {
        // Fallback response if no token or chat ID
        setMessages((prev) => [
          ...prev,
          { role: "bot", content: i18n.t("error_response") },
        ]);
        return;
      }

      // Call the RAG system API to get response
      const apiResponse = await fetch(
        `http://localhost:8000/getResponseFromQuery?query=${encodeURIComponent(
          message
        )}&chat_history_id=${currentChat.id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!apiResponse.ok) {
        throw new Error(`API call failed: ${apiResponse.status}`);
      }

      const responseData = await apiResponse.json();
      // console.log("API Response:", responseData);
      const botResponse = responseData.response || i18n.t("sorry_response");

      // Add bot response to messages
      typeBotResponse(botResponse.answer.replace(/\n{2,}/g, "\n\n"));

      setLoadingResponse(false);

      // Rename chat if it's the first message with default title
      if (currentChat.title === i18n.t("new_chat")) {
        try {
          await fetch("http://localhost:8000/renameChatHistoryTitle", {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_history_id: currentChat.id,
              new_title: message.slice(0, 30),
            }),
          });

          await fetchChatHistory(); // Update sidebar
        } catch (err) {
          console.error("Lỗi cập nhật tiêu đề đoạn chat:", err);
        }
      }

      // Save chat content to database
      try {
        await fetch("http://localhost:8000/createChatContent", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_history_id: currentChat.id,
            query: message,
            response: botResponse.answer,
          }),
        });
      } catch (err) {
        console.error("Lỗi lưu nội dung đoạn chat:", err);
      }
    } catch (error) {
      console.error("Error in handleSendMessage:", error);

      // Add error message to chat
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          content: i18n.t("error_response"),
        },
      ]);
    }
  };

  const fetchChatHistory = async () => {
    setLoadingChatsHistory(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    if (!token) return;

    try {
      const response = await fetch("http://localhost:8000/getChatsHistory", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch chat history");
      }

      const data = await response.json();
      setChatsHistory(data.chatsHistory);
      if (selectedChatId === "") {
        setSelectedChatId(data.chatsHistory[0].id);
      }
    } catch (err) {
      console.error("Error fetching chats:", err);
    } finally {
      setLoadingChatsHistory(false);
    }
  };

  const handleNewChat = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (!token) return;

    const defaultTitle = i18n.t("new_chat");

    try {
      const response = await fetch("http://localhost:8000/createChatHistory", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: defaultTitle }),
      });

      if (!response.ok) {
        throw new Error("Lỗi khi tạo cuộc trò chuyện mới");
      }

      const result = await response.json();
      setSelectedChatId(result.chat_history_id);

      await fetchChatHistory(); // Cập nhật danh sách mới
      setSelectedChatIndex(0); // Chọn đoạn chat đầu tiên
    } catch (err) {
      console.error("Lỗi tạo cuộc trò chuyện mới:", err);
    }
  };

  const fetchChatMessages = useCallback(async () => {
    if (!selectedChatId) return;

    setLoadingMessages(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    try {
      const res = await fetch(
        `http://localhost:8000/getAllChatContent?chat_history_id=${selectedChatId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) throw new Error("Lỗi khi lấy messages");

      const data = await res.json();
      setMessages(data.messages);
    } catch (err) {
      console.error("Lỗi khi lấy chat content:", err);
    } finally {
      setLoadingMessages(false); // Kết thúc loading
    }
  }, [selectedChatId]); // 👈 khai báo dependency ở đây

  useEffect(() => {
    fetchChatHistory();
  }, []);

  useEffect(() => {
    fetchChatMessages();
  }, [fetchChatMessages]);

  useEffect(() => {
    if (selectedFileSummary) {
      setEditableSummary(selectedFileSummary);
      setTabMode("preview"); // Mặc định hiển thị Preview khi mở
    }
  }, [selectedFileSummary]);

  useEffect(() => {
    if (selectedMindmapNote) {
      setEditableSummary(selectedMindmapNote);
      setTabMode("preview"); // Mặc định hiển thị Preview khi mở
    }
  }, [selectedMindmapNote]);

  const updateFileSummary = async (newSummary) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token || !selectedFileSummaryId) {
      console.warn("Thiếu token hoặc file ID để cập nhật summary");
      return;
    }

    try {
      const response = await fetch("http://localhost:8000/updateFileSummary", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_history_id: selectedChatId,
          file_id: selectedFileSummaryId,
          new_summary: newSummary,
        }),
      });

      if (!response.ok) {
        throw new Error("Cập nhật file summary thất bại");
      }

      console.log("✅ File summary đã được cập nhật thành công!");
    } catch (error) {
      console.error("Lỗi khi cập nhật file summary:", error);
    }
  };

  return (
    <div className="frame">
      <TopBar
        currentLang={i18n.language}
        changeLanguage={(lang) => i18n.changeLanguage(lang)}
      />
      <div className="content">
        <div className="layout">
          <SideBar
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            chats={chatsHistory}
            setChats={setChatsHistory}
            selectedChatIndex={selectedChatIndex}
            setSelectedChatIndex={setSelectedChatIndex}
            setSelectedChatId={setSelectedChatId}
            fetchChatHistory={fetchChatHistory}
            onNewChat={handleNewChat}
            loading={loadingChatsHistory}
          />
          <ChatArea
            loading={loadingMessages}
            messages={
              messages && messages.length > 0
                ? messages
                : [
                    {
                      role: "bot",
                      content: i18n.t("default_response"),
                    },
                  ]
            }
            onSend={handleSendMessage}
            loadingResponse={loadingResponse}
          />

          <div className="extra">
            <FileStorage
              selectedChatId={selectedChatId}
              setSelectedFileSummary={setSelectedFileSummary}
              setSelectedFileSummaryId={setSelectedFileSummaryId}
            />
            {selectedFileSummary && (
              <div
                className="preview-overlay"
                onClick={() => setSelectedFileSummary(null)}
              >
                <div
                  className="preview-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="preview-header">
                    <h3>📄 {i18n.t("content_summary")}</h3>
                    <div style={{ marginTop: "8px" }}>
                      <button
                        className="preview-edit-btn"
                        onClick={() => setTabMode("edit")}
                        style={{
                          marginRight: "8px",
                          fontWeight: tabMode === "edit" ? "bold" : "normal",
                        }}
                      >
                        {i18n.t("edit")}
                      </button>
                      <button
                        className="preview-edit-btn"
                        onClick={() => setTabMode("preview")}
                        style={{
                          marginRight: "8px",
                          fontWeight: tabMode === "preview" ? "bold" : "normal",
                        }}
                      >
                        {i18n.t("preview")}
                      </button>
                      <button
                        className="preview-edit-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(editableSummary);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 3000); // Trở lại "Copy" sau 3s
                        }}
                      >
                        {copied ? i18n.t("copied") : i18n.t("copy")}
                      </button>
                    </div>
                  </div>

                  <div className="preview-content">
                    {tabMode === "preview" ? (
                      <ReactMarkdown>{editableSummary}</ReactMarkdown>
                    ) : (
                      <textarea
                        value={editableSummary}
                        onChange={(e) => setEditableSummary(e.target.value)}
                        spellCheck={false}
                        style={{
                          width: "800px",
                          height: "100%",
                          fontFamily: "monospace",
                          fontSize: "16px",
                          backgroundColor: "transparent",
                          color: "rgb(227, 224, 224)",
                          border: "none",
                        }}
                      />
                    )}
                  </div>

                  <div className="preview-footer">
                    <button
                      onClick={() => {
                        if (tabMode === "edit") {
                          setSelectedFileSummary(editableSummary);
                          setTabMode("preview");
                          updateFileSummary(editableSummary); // không block
                        } else {
                          setSelectedFileSummary(null);
                        }
                      }}
                    >
                      {i18n.t("save")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <NoteStorage
              selectedChatId={selectedChatId}
              setSelectedMindmapNote={setSelectedMindmapNote}
              setSelectedMindmapNoteId={setSelectedMindmapNoteId}
            />
            {selectedMindmapNote && (
              <div
                className="preview-overlay"
                onClick={() => setSelectedMindmapNote(null)}
              >
                <div
                  className="preview-card"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="preview-header">
                    <h3>📄 {i18n.t("content_note")}</h3>
                    <div style={{ marginTop: "8px" }}>
                      <button
                        className="preview-edit-btn"
                        onClick={() => setTabMode("edit")}
                        style={{
                          marginRight: "8px",
                          fontWeight: tabMode === "edit" ? "bold" : "normal",
                        }}
                      >
                        {i18n.t("edit")}
                      </button>
                      <button
                        className="preview-edit-btn"
                        onClick={() => setTabMode("preview")}
                        style={{
                          marginRight: "8px",
                          fontWeight: tabMode === "preview" ? "bold" : "normal",
                        }}
                      >
                        {i18n.t("preview")}
                      </button>
                      <button
                        className="preview-edit-btn"
                        onClick={() => {
                          navigator.clipboard.writeText(editableSummary);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 3000); // Trở lại "Copy" sau 3s
                        }}
                      >
                        {copied ? i18n.t("copied") : i18n.t("copy")}
                      </button>
                    </div>
                  </div>

                  <div className="preview-content">
                    {tabMode === "preview" ? (
                      <ReactMarkdown>{editableSummary}</ReactMarkdown>
                    ) : (
                      <textarea
                        value={editableSummary}
                        onChange={(e) => setEditableSummary(e.target.value)}
                        spellCheck={false}
                        style={{
                          width: "800px",
                          height: "100%",
                          fontFamily: "monospace",
                          fontSize: "16px",
                          backgroundColor: "transparent",
                          color: "rgb(227, 224, 224)",
                          border: "none",
                        }}
                      />
                    )}
                  </div>

                  <div className="preview-footer">
                    <button
                      onClick={() => {
                        if (tabMode === "edit") {
                          setSelectedMindmapNote(editableSummary);
                          setTabMode("preview");
                          updateFileSummary(editableSummary); // không block
                        } else {
                          setSelectedMindmapNote(null);
                        }
                      }}
                    >
                      {i18n.t("save")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Main;
