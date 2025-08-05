// components/NoteStorage/NoteStorage.jsx
import React, { useState, useEffect, useRef } from "react";
import { CgFileAdd } from "react-icons/cg";
import { FaFilePdf } from "react-icons/fa6";
import { supabase } from "../SupabaseClient/SupabaseClient";
import { LuNotebookPen } from "react-icons/lu";
import { RiMindMap } from "react-icons/ri";
import { HiOutlineDotsVertical } from "react-icons/hi";
import { useTranslation } from "react-i18next";

import "./FileStorage.css";

const FileStorage = ({
  selectedChatId,
  setSelectedFileSummary,
  setSelectedFileSummaryId,
}) => {
  const { t } = useTranslation();

  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [activeMenuFileId, setActiveMenuFileId] = useState(null);
  const [renamingFileId, setRenamingFileId] = useState(null);
  const [newNameInput, setNewNameInput] = useState("");
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [showMindmapOptions, setShowMindmapOptions] = useState(false);
  const [showNoteOptions, setShowNoteOptions] = useState(false);

  const [selectedCustomMindmapFileId, setSelectedCustomMindmapFileId] =
    useState(null);
  const [selectedCustomNoteFileId, setSelectedCustomNoteFileId] =
    useState(null);

  const [mindmapTarget, setMindmapTarget] = useState("study");
  const [mindmapLanguage, setMindmapLanguage] = useState("auto");
  const [mindmapDetailLevel, setMindmapDetailLevel] = useState("brief");
  const [mindmapTitle, setMindmapTitle] = useState("");

  const [noteTarget, setNoteTarget] = useState("study");
  const [noteLanguage, setNoteLanguage] = useState("auto");
  const [noteDetailLevel, setNoteDetailLevel] = useState("brief");
  const [noteTitle, setNoteTitle] = useState("");

  const handleFileClick = async (file) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(
        `http://localhost:8000/getFileSummary?chat_history_id=${selectedChatId}&file_id=${file.file_id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error("Không thể tải nội dung");

      const result = await response.json();
      setSelectedFileSummary(result.file_summary);
      setSelectedFileSummaryId(file.file_id);
    } catch (error) {
      console.error("Lỗi khi lấy nội dung file:", error);
    }
  };

  const handleCustomNoteClick = () => {
    setShowNoteOptions(true);
  };

  const handleCustomMindmapClick = () => {
    setShowMindmapOptions(true);
  };

  const handleAddFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const fetchedFiles = async () => {
    setLoadingFiles(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (!token || !selectedChatId) {
        return;
      }

      const response = await fetch(
        `http://localhost:8000/getAllFiles?chat_history_id=${selectedChatId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Lỗi khi lấy danh sách file");
      }

      const result = await response.json();
      setFiles(result.files);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách file:", error);
    } finally {
      setLoadingFiles(false); // End loading
    }
  };

  // Giả lập lấy dữ liệu từ "database"
  useEffect(() => {
    // Gọi API thật ở đây nếu có
    fetchedFiles();
  }, [selectedChatId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      const dotWrappers = document.querySelectorAll(".dot-wrapper");
      const isClickInsideAny = Array.from(dotWrappers).some((wrapper) =>
        wrapper.contains(event.target)
      );

      if (!isClickInsideAny) {
        setActiveMenuFileId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleRename = (file) => {
    setRenamingFileId(file.file_id);
    setNewNameInput(file.file_name);
    setActiveMenuFileId(null); // đóng menu
  };

  const handleDelete = async (file) => {
    // Gọi API xóa tại đây nếu có
    setFiles((prev) => prev.filter((f) => f.file_id !== file.file_id));
    setActiveMenuFileId(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const response = await fetch("http://localhost:8000/deleteFile", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          chat_history_id: selectedChatId,
          file_id: file.file_id,
          file_name: file.file_name,
        }),
      });
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  const submitRename = async (file) => {
    if (!newNameInput || newNameInput === file.file_name) {
      setRenamingFileId(null);
      return;
    }

    try {
      // Update local state
      setFiles((prev) =>
        prev.map((f) =>
          f.file_id === file.file_id ? { ...f, file_name: newNameInput } : f
        )
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch("http://localhost:8000/renameFile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chat_history_id: selectedChatId,
          file_id: file.file_id,
          old_name: file.file_name,
          new_name: newNameInput,
        }),
      });

      if (!response.ok) throw new Error("Đổi tên thất bại");
    } catch (err) {
      console.error("Rename error:", err);
    }
    setRenamingFileId(null);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFile(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token || !selectedChatId) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("chat_history_id", selectedChatId);

    console.log("FormData contents:");
    for (let [key, value] of formData.entries()) {
      console.log(key, value);
    }

    const response = await fetch("http://localhost:8000/uploadFile", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      // Update lại danh sách file
      setUploadingFile(false); // End upload loading
      setFiles((prev) => [...prev, result]);
    }
  };

  return (
    <div className="file-storage">
      <button className="add-file-btn" onClick={handleAddFileClick}>
        <CgFileAdd className="add-file-icon" />
        {t("add_file")}
      </button>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <div className="file-title">
        <FaFilePdf className="pdf-icon" />
        <p
          style={{
            fontFamily: "sans-serif",
            fontSize: "14px",
            paddingLeft: "5px",
            color: "#859398",
          }}
        >
          {t("pdf_list")}
        </p>
      </div>
      {uploadingFile && (
        <div className="upload-loader">
          <div className="loader" style={{ width: "20px", height: "20px" }} />
          {t("uploading")}
        </div>
      )}

      {loadingFiles ? (
        <div className="file-list">
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="file-card skeleton-card">
              <div className="skeleton skeleton-text" />
            </div>
          ))}
        </div>
      ) : (
        <div className="file-list">
          {files.map((file) => {
            return (
              <div key={file.file_id} className="file-card">
                {renamingFileId === file.file_id ? (
                  <input
                    autoFocus
                    type="text"
                    value={newNameInput}
                    onChange={(e) => setNewNameInput(e.target.value)}
                    onBlur={() => submitRename(file)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        submitRename(file);
                      } else if (e.key === "Escape") {
                        setRenamingFileId(null);
                      }
                    }}
                    className="rename-input"
                  />
                ) : (
                  <button
                    className="file-btn"
                    title={file.file_name}
                    onClick={() => handleFileClick(file)}
                  >
                    {file.file_name}
                  </button>
                )}
                <div className="dot-wrapper">
                  <button
                    className="dot-vertical"
                    onClick={() =>
                      setActiveMenuFileId(
                        activeMenuFileId === file.file_id ? null : file.file_id
                      )
                    }
                  >
                    <HiOutlineDotsVertical />
                  </button>

                  {/* In kiểm tra trong JSX */}
                  {activeMenuFileId === file.file_id && (
                    <>
                      <div className="context-menu">
                        <div
                          className="context-menu-item"
                          onClick={() => handleRename(file)}
                        >
                          {t("rename")}
                        </div>
                        <div
                          className="context-menu-item"
                          onClick={() => handleDelete(file)}
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
      )}

      <div className="button-row">
        <button className="add-note-btn" onClick={handleCustomNoteClick}>
          <LuNotebookPen className="add-note-icon" />
          {t("custom_note")}
        </button>
        <button className="add-mindmap-btn" onClick={handleCustomMindmapClick}>
          <RiMindMap className="add-mindmap-icon" />
          {t("custom_mindmap")}
        </button>
      </div>
      {showMindmapOptions && (
        <div className="mindmap-options-overlay">
          <div className="mindmap-options-content">
            <h3>{t("custom_mindmap")}</h3>
            <p>{t("mindmap_slogan")}</p>

            <label>
              {t("mindmap_source_file")}:
              <select
                onChange={(e) => setSelectedCustomMindmapFileId(e.target.value)}
              >
                <option value="">None</option>
                {files.map((file) => (
                  <option key={file.file_id} value={file.file_id}>
                    {file.file_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {t("mindmap_title")}:
              <input
                type="text"
                placeholder={t("mindmap_title_input")}
                value={mindmapTitle}
                onChange={(e) => setMindmapTitle(e.target.value)}
                style={{
                  width: "95%",
                  padding: "10px",
                  marginTop: "4px",
                  marginBottom: "12px",
                  fontSize: "14px",
                  backgroundColor: "transparent",
                  border: "1px solid #d0d7de",
                  borderRadius: "10px",
                  color: "#dce2e6",
                }}
              />
            </label>

            <label>
              {t("mindmap_target")}:
              <select onChange={(e) => setMindmapTarget(e.target.value)}>
                <option value="study">{t("study")}</option>
                <option value="work">{t("work")}</option>
                <option value="research">{t("research")}</option>
                <option value="presentation">{t("presentation")}</option>
                <option value="quick_reference">{t("quick_reference")}</option>
                <option value="general">{t("general")}</option>
              </select>
            </label>

            <label>
              {t("language")}:
              <select onChange={(e) => setMindmapLanguage(e.target.value)}>
                <option value="auto">{t("auto")}</option>
                <option value="vietnamese">Vietnamese</option>
                <option value="english">English</option>
                <option value="japanese">Japanese</option>
              </select>
            </label>

            <label>
              {t("level_of_detail")}:
              <select onChange={(e) => setMindmapDetailLevel(e.target.value)}>
                <option value="brief">{t("brief")}</option>
                <option value="moderate">{t("moderate")}</option>
                <option value="detailed">{t("detailed")}</option>
                <option value="comprehensive">{t("comprehensive")}</option>
              </select>
            </label>

            <div style={{ marginTop: "16px" }}>
              <button
                onClick={async () => {
                  console.log({
                    chat_history_id: selectedChatId,
                    file_id: selectedCustomMindmapFileId,
                    mindmap_title: mindmapTitle,
                    mindmap_target: mindmapTarget,
                    mindmap_language: mindmapLanguage,
                    mindmap_detailed_level: mindmapDetailLevel,
                  });
                  try {
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    const token = session?.access_token;

                    if (!token) return;

                    const response = await fetch(
                      "http://localhost:8000/createCustomMindmap",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          chat_history_id: selectedChatId,
                          file_id: selectedCustomMindmapFileId,
                          mindmap_title: mindmapTitle,
                          mindmap_target: mindmapTarget,
                          mindmap_language: mindmapLanguage,
                          mindmap_detailed_level: mindmapDetailLevel,
                        }),
                      }
                    );

                    if (!response.ok) {
                      const error = await response.json();
                      console.error("API Error:", error.detail);
                      return;
                    }

                    // Optional: lưu kết quả hoặc hiển thị ra UI
                  } catch (error) {
                    console.error("❌ Error calling API:", error);
                  } finally {
                    setShowMindmapOptions(false);
                  }
                }}
              >
                {t("create_mindmap")}
              </button>
              <button
                style={{ marginLeft: "8px" }}
                onClick={() => setShowMindmapOptions(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNoteOptions && (
        <div className="note-options-overlay">
          <div className="note-options-content">
            <h3>{t("custom_note")}</h3>
            <p>{t("note_slogan")}</p>
            <label>
              {t("note_source_file")}:
              <select
                onChange={(e) => setSelectedCustomNoteFileId(e.target.value)}
              >
                <option value="">None</option>
                {files.map((file) => (
                  <option key={file.file_id} value={file.file_id}>
                    {file.file_name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              {t("note_title")}:
              <input
                type="text"
                placeholder={t("note_title_input")}
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                style={{
                  width: "95%",
                  padding: "10px",
                  marginTop: "4px",
                  marginBottom: "12px",
                  fontSize: "14px",
                  backgroundColor: "transparent",
                  border: "1px solid #d0d7de",
                  borderRadius: "10px",
                  color: "#dce2e6",
                }}
              />
            </label>

            <label>
              {t("note_target")}:
              <select onChange={(e) => setNoteTarget(e.target.value)}>
                <option value="study">{t("study")}</option>
                <option value="work">{t("work")}</option>
                <option value="research">{t("research")}</option>
                <option value="presentation">{t("presentation")}</option>
                <option value="quick_reference">{t("quick_reference")}</option>
                <option value="general">{t("general")}</option>
              </select>
            </label>

            <label>
              {t("language")}:
              <select onChange={(e) => setNoteLanguage(e.target.value)}>
                <option value="auto">{t("auto")}</option>
                <option value="vietnamese">Vietnamese</option>
                <option value="english">English</option>
                <option value="japanese">Japanese</option>
              </select>
            </label>
            <label>
              {t("level_of_detail")}:
              <select onChange={(e) => setNoteDetailLevel(e.target.value)}>
                <option value="brief">{t("brief")}</option>
                <option value="moderate">{t("moderate")}</option>
                <option value="detailed">{t("detailed")}</option>
                <option value="comprehensive">{t("comprehensive")}</option>
              </select>
            </label>
            <div style={{ marginTop: "16px" }}>
              <button
                onClick={async () => {
                  console.log({
                    chat_history_id: selectedChatId,
                    file_id: selectedCustomNoteFileId,
                    note_title: noteTitle,
                    note_target: noteTarget,
                    note_language: noteLanguage,
                    note_detailed_level: noteDetailLevel,
                  });
                  try {
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    const token = session?.access_token;

                    if (!token) return;

                    const response = await fetch(
                      "http://localhost:8000/createCustomNote",
                      {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                          chat_history_id: selectedChatId,
                          file_id: selectedCustomNoteFileId,
                          note_title: noteTitle,
                          note_target: noteTarget,
                          note_language: noteLanguage,
                          note_detailed_level: noteDetailLevel,
                        }),
                      }
                    );

                    if (!response.ok) {
                      const error = await response.json();
                      console.error("API Error:", error.detail);
                      return;
                    }

                    // Optional: lưu kết quả hoặc hiển thị ra UI
                  } catch (error) {
                    console.error("❌ Error calling API:", error);
                  } finally {
                    setShowNoteOptions(false);
                  }
                }}
              >
                {t("create_note")}
              </button>
              <button
                style={{ marginLeft: "8px" }}
                onClick={() => setShowNoteOptions(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileStorage;
