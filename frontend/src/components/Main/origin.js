// Main.js
import React, { useState, useEffect, useCallback } from "react";
import TopBar from "../TopBar/TopBar";
import SideBar from "../SideBar/SideBar";
import ChatArea from "../ChatArea/ChatArea";
import NoteStorage from "../NoteStorage/NoteStorage";
import FileStorage from "../FileStorage/FileStorage";
import { supabase } from "../SupabaseClient/SupabaseClient";
import "./Main.css";

const Main = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [chatsHistory, setChatsHistory] = useState([]);
  const [selectedChatIndex, setSelectedChatIndex] = useState(0);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messages, setMessages] = useState([
    { role: "bot", content: "Xin chào! Tôi có thể giúp gì cho bạn?" },
  ]);

  const handleSendMessage = async (message) => {
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "bot", content: "Đây là phản hồi mẫu từ GPT 😄" },
    ]);

    const currentChat = chatsHistory[selectedChatIndex];

    // Nếu là câu hỏi đầu tiên và tên mặc định thì đổi tên
    if (currentChat && currentChat.title === "Cuộc trò chuyện mới") {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token || !currentChat.id) return;

        await fetch("http://localhost:8000/renameChatHistoryTitle", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_history_id: currentChat.id,
            new_title: message.slice(0, 30), // hoặc message.slice(0, 30)
          }),
        });

        await fetchChatHistory(); // Cập nhật lại sidebar
      } catch (err) {
        console.error("Lỗi cập nhật tiêu đề đoạn chat:", err);
      }
    }

    if (currentChat) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token || !currentChat.id) return;

        await fetch("http://localhost:8000/createChatContent", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_history_id: currentChat.id,
            query: message,
            response: "Đây là phản hồi mẫu từ GPT 😄",
          }),
        });
      } catch (err) {
        console.error("Lỗi lưu nội dung đoạn chat:", err);
      }
    }
  };

  const fetchChatHistory = async () => {
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
    }
  };

  const handleNewChat = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (!token) return;

    const defaultTitle = "Cuộc trò chuyện mới";

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
    }
  }, [selectedChatId]); // 👈 khai báo dependency ở đây

  useEffect(() => {
    fetchChatHistory();
  }, []);

  useEffect(() => {
    fetchChatMessages();
  }, [fetchChatMessages]);

  return (
    <div className="frame">
      <TopBar />
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
          />
          <ChatArea
            messages={
              messages && messages.length > 0
                ? messages
                : [
                    {
                      role: "bot",
                      content: "Xin chào! Tôi có thể giúp gì cho bạn?",
                    },
                  ]
            }
            onSend={handleSendMessage}
          />

          <div className="extra">
            <FileStorage selectedChatId={selectedChatId} />
            <NoteStorage />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Main;
