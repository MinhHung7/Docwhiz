import React, { useEffect, useRef } from "react";
import "./AutoResizeTextarea.css";

const AutoResizeTextarea = ({ value, onChange, onKeyDown, placeholder }) => {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className="auto-textarea"
    />
  );
};

export default AutoResizeTextarea;
