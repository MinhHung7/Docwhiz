import React, { useState, useEffect } from "react";
import { PiNotepadBold } from "react-icons/pi";
import MindmapPopup from "../MindmapPopup/MindmapPopup";
import { supabase } from "../SupabaseClient/SupabaseClient";
import { HiOutlineDotsVertical } from "react-icons/hi";
import { RiMindMap } from "react-icons/ri";
import { LuNotebookPen } from "react-icons/lu";
import { useTranslation } from "react-i18next";
import "./NoteStorage.css";

const NoteStorage = ({
  selectedChatId,
  setSelectedMindmapNote,
  setSelectedMindmapNoteId,
}) => {
  const { t } = useTranslation();

  const [mindmapNotes, setMindmapNotes] = useState([]);
  const [showPopup, setShowPopup] = useState(false); // sửa lại kiểu boolean
  const [jsonData, setJsonData] = useState(null);
  const [activeMenuMindmapNoteId, setActiveMenuMindmapNoteId] = useState(null);
  const [renamingMindmapNoteId, setRenamingMindmapNoteId] = useState(null);
  const [newNameInput, setNewNameInput] = useState("");

  const handleNoteClick = async (note) => {
    try {
      //   const {
      //     data: { session },
      //   } = await supabase.auth.getSession();
      //   const token = session?.access_token;

      //   const response = await fetch(
      //     `http://localhost:8000/getNoteContent?chat_history_id=${selectedChatId}&mindmap_note_id=${note.mindmap_note_id}`,
      //     {
      //       headers: {
      //         Authorization: `Bearer ${token}`,
      //       },
      //     }
      //   );

      //   if (!response.ok) throw new Error("Không thể tải nội dung");

      // const result = await response.json();
      setSelectedMindmapNote(note.note_content);
      setSelectedMindmapNoteId(note.mindmap_note_id);
    } catch (error) {
      console.error("Lỗi khi lấy nội dung file:", error);
    }
  };

  const fetchedMindmapNotes = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token || !selectedChatId) {
        return;
      }

      const response = await fetch(
        `http://localhost:8000/getAllMindmapNotes?chat_history_id=${selectedChatId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Lỗi khi lấy danh sách mindmap note");
      }

      const result = await response.json();
      setMindmapNotes(result.mindmap_notes);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách mind map note:", error);
    }
  };

  useEffect(() => {
    fetchedMindmapNotes();
  }, [selectedChatId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const dotWrappers = document.querySelectorAll(".dot-wrapper");
      const isClickInsideAny = Array.from(dotWrappers).some((wrapper) =>
        wrapper.contains(event.target)
      );

      if (!isClickInsideAny) {
        setActiveMenuMindmapNoteId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleRename = (mindmap_note) => {
    setRenamingMindmapNoteId(mindmap_note.mindmap_note_id);
    setNewNameInput(mindmap_note.mindmap_note_name);
    setActiveMenuMindmapNoteId(null); // đóng menu
  };

  const handleDelete = async (mindmap_note) => {
    // Gọi API xóa tại đây nếu có
    setMindmapNotes((prev) =>
      prev.filter((f) => f.mindmap_note_id !== mindmap_note.mindmap_note_id)
    );
    setActiveMenuMindmapNoteId(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const response = await fetch("http://localhost:8000/deleteMindmapNote", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          chat_history_id: selectedChatId,
          mindmap_note_id: mindmap_note.mindmap_note_id,
        }),
      });
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const submitRename = async (mindmap_note) => {
    if (!newNameInput || newNameInput === mindmap_note.mindmap_note_name) {
      setRenamingMindmapNoteId(null);
      return;
    }

    try {
      // Update local state
      setMindmapNotes((prev) =>
        prev.map((f) =>
          f.mindmap_note_id === mindmap_note.mindmap_note_id
            ? { ...f, mindmap_note_name: newNameInput }
            : f
        )
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch("http://localhost:8000/renameMindmapNote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chat_history_id: selectedChatId,
          mindmap_note_id: mindmap_note.mindmap_note_id,
          new_name: newNameInput,
        }),
      });

      if (!response.ok) throw new Error("Đổi tên thất bại");
    } catch (err) {
      console.error("Rename error:", err);
    }
    setRenamingMindmapNoteId(null);
  };

  const handleShowMindmap = async (mindmap_note) => {
    try {
      const data = mindmap_note.mindmap_content;
      console.log(data);
      setJsonData(data);
      setShowPopup(true);
    } catch (err) {
      console.error("Show mindmap error:", err);
    }
  };

  return (
    <div className="mindmap-note-storage">
      <div className="mindmap-note-title">
        <PiNotepadBold className="mindmap-note-icon" />
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: "14px",
            paddingLeft: "5px",
            color: "#859398",
          }}
        >
          {t("mindmapnote_list")}
        </p>
      </div>
      <div className="mindmap-note-list">
        {mindmapNotes.map((mindmap_note) => {
          return (
            <div
              key={mindmap_note.mindmap_note_id}
              className="mindmap-note-card"
            >
              {renamingMindmapNoteId === mindmap_note.mindmap_note_id ? (
                <input
                  autoFocus
                  type="text"
                  value={newNameInput}
                  onChange={(e) => setNewNameInput(e.target.value)}
                  onBlur={() => submitRename(mindmap_note)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      submitRename(mindmap_note);
                    } else if (e.key === "Escape") {
                      setRenamingMindmapNoteId(null);
                    }
                  }}
                  className="rename-input"
                />
              ) : (
                <button
                  className="mindmap-note-btn"
                  title={mindmap_note.mindmap_note_name}
                  onClick={
                    mindmap_note.type === "note"
                      ? () => handleNoteClick(mindmap_note)
                      : () => handleShowMindmap(mindmap_note)
                  }
                >
                  <div className="mindmap-note-content">
                    {mindmap_note.type === "mindmap" ? (
                      <RiMindMap size={20} />
                    ) : (
                      <LuNotebookPen size={18} />
                    )}
                    <span className="mindmap-note-text">
                      {mindmap_note.mindmap_note_name}
                    </span>
                  </div>
                </button>
              )}
              <div className="dot-wrapper">
                <button
                  className="dot-vertical"
                  onClick={() =>
                    setActiveMenuMindmapNoteId(
                      activeMenuMindmapNoteId === mindmap_note.mindmap_note_id
                        ? null
                        : mindmap_note.mindmap_note_id
                    )
                  }
                >
                  <HiOutlineDotsVertical />
                </button>

                {/* In kiểm tra trong JSX */}
                {activeMenuMindmapNoteId === mindmap_note.mindmap_note_id && (
                  <>
                    <div className="context-menu">
                      <div
                        className="context-menu-item"
                        onClick={() => handleRename(mindmap_note)}
                      >
                        {t("rename")}
                      </div>
                      <div
                        className="context-menu-item"
                        onClick={() => handleDelete(mindmap_note)}
                      >
                        {t("delete")}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showPopup && (
        <MindmapPopup jsonData={jsonData} onClose={() => setShowPopup(false)} />
      )}
    </div>
  );
};

export default NoteStorage;
