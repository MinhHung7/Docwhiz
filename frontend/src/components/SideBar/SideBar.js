import React, { useState, useRef, useEffect } from "react";
import { IoIosArrowDropright, IoIosArrowDropleft } from "react-icons/io";
import { FiMoreVertical } from "react-icons/fi";
import { supabase } from "../SupabaseClient/SupabaseClient";
import { useTranslation } from "react-i18next";
import "./SideBar.css";

const SideBar = ({
  chats,
  setChats,
  selectedChatIndex,
  setSelectedChatIndex,
  setSelectedChatId,
  onNewChat,
  loading,
}) => {
  const { t } = useTranslation();

  const [collapsed, setCollapsed] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [menuOpenIndex, setMenuOpenIndex] = useState(null);
  const menuRef = useRef(null);
  const editInputRef = useRef(null);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpenIndex(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRename = (index) => {
    setEditIndex(index);
    setEditValue(chats[index].title);
    setMenuOpenIndex(null);
  };

  const handleDelete = async (index) => {
    const updated = [...chats];

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const response = await fetch("http://localhost:8000/deleteChatHistory", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ chat_history_id: updated[index].id }),
      });
    } catch (error) {
      console.error("Lỗi khi xoá chat:", error);
    }

    updated.splice(index, 1);
    setChats(updated);
    if (selectedChatIndex === index) {
      if (updated.length > 0) {
        setSelectedChatIndex(0);
        setSelectedChatId(updated[0].id);
      } else {
        setSelectedChatIndex(null);
        setSelectedChatId(null);
      }
    } else if (selectedChatIndex > index) {
      // Điều chỉnh index nếu xoá item trước selected
      setSelectedChatIndex((prev) => prev - 1);
    }
    setMenuOpenIndex(null);
  };

  return (
    <div className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <button onClick={toggleSidebar} className="toggle-btn">
        {collapsed ? (
          <IoIosArrowDropright size={35} />
        ) : (
          <IoIosArrowDropleft size={35} />
        )}
      </button>

      {!collapsed && (
        <>
          <div className="sidebar-buttons">
            <button onClick={onNewChat} className="sidebar-btn">
              <img
                src="/assets/new_chat.png"
                alt="new_chat"
                className="btn-icon-img"
              />
              {t("new_conversation")}
            </button>
            <button className="sidebar-btn">
              <img
                src="/assets/search_chat.png"
                alt="search_chat"
                className="btn-icon-img"
              />
              {t("search_conversation")}
            </button>
          </div>

          <p
            className="chat-label"
            style={{
              fontFamily: "sans-serif",
              fontSize: "14px",
              paddingLeft: "10px",
              color: "#859398",
            }}
          >
            {t("recent_conversations")}
          </p>

          <div className="history_chat">
            {loading
              ? Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="chat-row">
                    <div className="chat-skeleton" />
                  </div>
                ))
              : chats.map((chat, index) => (
                  <div key={chat.id} className="chat-row">
                    {editIndex === index ? (
                      <input
                        ref={editInputRef}
                        autoFocus
                        className="chat-edit-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            const updated = [...chats];
                            updated[index].title = editValue;
                            setChats(updated);
                            setEditIndex(null);

                            try {
                              const { data: sessionData } =
                                await supabase.auth.getSession();
                              const accessToken =
                                sessionData?.session?.access_token;

                              const response = await fetch(
                                "http://localhost:8000/renameChatHistoryTitle",
                                {
                                  method: "PUT",
                                  headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${accessToken}`,
                                  },
                                  body: JSON.stringify({
                                    chat_history_id: updated[index].id,
                                    new_title: editValue,
                                  }),
                                }
                              );

                              if (!response.ok) {
                                throw new Error("Lỗi cập nhật database");
                              }
                            } catch (error) {
                              console.error("Lỗi khi cập nhật title:", error);
                            }
                          }
                        }}
                      />
                    ) : (
                      <button
                        className={`chat-btn ${
                          selectedChatIndex === index ? "active" : ""
                        }`}
                        onClick={() => {
                          setSelectedChatIndex(index);
                          setSelectedChatId(chat.id);
                        }}
                        title={chat.title}
                      >
                        {chat.title}
                      </button>
                    )}

                    <button
                      className="chat-options-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenIndex(
                          menuOpenIndex === index ? null : index
                        );
                      }}
                    >
                      <FiMoreVertical size={18} />
                    </button>

                    {menuOpenIndex === index && (
                      <div className="chat-options-menu" ref={menuRef}>
                        <button onClick={() => handleRename(index)}>
                          {t("rename")}
                        </button>
                        <button onClick={() => handleDelete(index)}>
                          {t("delete")}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
          </div>
        </>
      )}
    </div>
  );
};

export default SideBar;
