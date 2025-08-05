// components/NoteStorage/NoteStorage.jsx
import React, { useState, useEffect, useRef } from "react";
import { CgFileAdd } from "react-icons/cg";
import { FaFilePdf } from "react-icons/fa6";
import { supabase } from "../SupabaseClient/SupabaseClient";
import { LuNotebookPen } from "react-icons/lu";
import { RiMindMap } from "react-icons/ri";
import "./FileStorage.css";

const FileStorage = ({ selectedChatId }) => {
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  const handleAddFileClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Giả lập lấy dữ liệu từ "database"
  useEffect(() => {
    // Gọi API thật ở đây nếu có
    const fetchedFiles = async () => {
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
      }
    };
    fetchedFiles();
  }, [selectedChatId]);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

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
      setFiles((prev) => [...prev, result]);
    }
  };

  const handleAddNoteClick = () => {
    alert("Chức năng thêm ghi chú đang được phát triển.");
  };

  const handleAddMindmapClick = () => {
    alert("Chức năng thêm mindmap đang được phát triển.");
  };

  return (
    <div className="file-storage">
      <button className="add-file-btn" onClick={handleAddFileClick}>
        <CgFileAdd className="add-file-icon" />
        Add file
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
          Available PDF Files
        </p>
      </div>
      <div className="file-list">
        {files.map((file) => (
          <button
            key={file.file_id}
            className="file-btn"
            title={file.file_name}
          >
            {file.file_name}
          </button>
        ))}
      </div>
      <div className="button-row">
        <button className="add-note-btn" onClick={handleAddNoteClick}>
          <LuNotebookPen className="add-note-icon" />
          Add note
        </button>
        <button className="add-mindmap-btn" onClick={handleAddMindmapClick}>
          <RiMindMap className="add-mindmap-icon" />
          Add mindmap
        </button>
      </div>
    </div>
  );
};

export default FileStorage;
