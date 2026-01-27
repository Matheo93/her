"use client";

/**
 * Rich Text Editor Components - Sprint 740
 *
 * WYSIWYG text editing:
 * - Toolbar with formatting
 * - Block types (headings, lists)
 * - Inline styles (bold, italic)
 * - Links and mentions
 * - HER-themed styling
 */

import React, { memo, useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type BlockType = "paragraph" | "heading1" | "heading2" | "heading3" | "quote" | "code" | "list" | "numbered-list";
type InlineStyle = "bold" | "italic" | "underline" | "strikethrough" | "code";

interface EditorState {
  content: string;
  selection: { start: number; end: number };
  activeStyles: InlineStyle[];
  activeBlock: BlockType;
}

interface RichTextEditorProps {
  initialContent?: string;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  onChange?: (content: string, html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * Rich Text Editor
 */
export const RichTextEditor = memo(function RichTextEditor({
  initialContent = "",
  placeholder = "Start typing...",
  minHeight = 200,
  maxHeight = 600,
  onChange,
  onFocus,
  onBlur,
  readOnly = false,
  className = "",
}: RichTextEditorProps) {
  const { colors } = useTheme();
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [activeStyles, setActiveStyles] = useState<Set<InlineStyle>>(new Set());
  const [activeBlock, setActiveBlock] = useState<BlockType>("paragraph");
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // Initialize content
  useEffect(() => {
    if (editorRef.current && initialContent) {
      editorRef.current.innerHTML = initialContent;
    }
  }, []);

  // Update active styles based on selection
  const updateActiveStyles = useCallback(() => {
    const styles = new Set<InlineStyle>();

    if (document.queryCommandState("bold")) styles.add("bold");
    if (document.queryCommandState("italic")) styles.add("italic");
    if (document.queryCommandState("underline")) styles.add("underline");
    if (document.queryCommandState("strikethrough")) styles.add("strikethrough");

    setActiveStyles(styles);

    // Check block type
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const parent = selection.anchorNode?.parentElement;
      if (parent) {
        const tag = parent.tagName.toLowerCase();
        if (tag === "h1") setActiveBlock("heading1");
        else if (tag === "h2") setActiveBlock("heading2");
        else if (tag === "h3") setActiveBlock("heading3");
        else if (tag === "blockquote") setActiveBlock("quote");
        else if (tag === "pre" || tag === "code") setActiveBlock("code");
        else if (tag === "li" && parent.parentElement?.tagName === "UL") setActiveBlock("list");
        else if (tag === "li" && parent.parentElement?.tagName === "OL") setActiveBlock("numbered-list");
        else setActiveBlock("paragraph");
      }
    }
  }, []);

  // Handle input
  const handleInput = useCallback(() => {
    if (editorRef.current && onChange) {
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.textContent || "";
      onChange(text, html);
    }
    updateActiveStyles();
  }, [onChange, updateActiveStyles]);

  // Handle focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocus?.();
  }, [onFocus]);

  // Handle blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    onBlur?.();
  }, [onBlur]);

  // Apply inline style
  const applyStyle = useCallback((style: InlineStyle) => {
    if (readOnly) return;

    const commands: Record<InlineStyle, string> = {
      bold: "bold",
      italic: "italic",
      underline: "underline",
      strikethrough: "strikeThrough",
      code: "fontName",
    };

    if (style === "code") {
      document.execCommand("fontName", false, "monospace");
    } else {
      document.execCommand(commands[style], false);
    }

    editorRef.current?.focus();
    updateActiveStyles();
  }, [readOnly, updateActiveStyles]);

  // Apply block type
  const applyBlock = useCallback((block: BlockType) => {
    if (readOnly) return;

    const blockCommands: Record<BlockType, [string, string?]> = {
      paragraph: ["formatBlock", "p"],
      heading1: ["formatBlock", "h1"],
      heading2: ["formatBlock", "h2"],
      heading3: ["formatBlock", "h3"],
      quote: ["formatBlock", "blockquote"],
      code: ["formatBlock", "pre"],
      list: ["insertUnorderedList"],
      "numbered-list": ["insertOrderedList"],
    };

    const [command, value] = blockCommands[block];
    document.execCommand(command, false, value);

    setActiveBlock(block);
    editorRef.current?.focus();
  }, [readOnly]);

  // Insert link
  const insertLink = useCallback(() => {
    if (readOnly || !linkUrl) return;

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const text = range.toString() || linkUrl;

      const link = document.createElement("a");
      link.href = linkUrl;
      link.textContent = text;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.color = colors.coral;

      range.deleteContents();
      range.insertNode(link);
    }

    setShowLinkModal(false);
    setLinkUrl("");
    editorRef.current?.focus();
  }, [readOnly, linkUrl, colors.coral]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case "b":
          e.preventDefault();
          applyStyle("bold");
          break;
        case "i":
          e.preventDefault();
          applyStyle("italic");
          break;
        case "u":
          e.preventDefault();
          applyStyle("underline");
          break;
        case "k":
          e.preventDefault();
          setShowLinkModal(true);
          break;
      }
    }
  }, [applyStyle]);

  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        border: `2px solid ${isFocused ? colors.coral : colors.cream}`,
        backgroundColor: colors.warmWhite,
        transition: "border-color 0.2s",
      }}
    >
      {/* Toolbar */}
      {!readOnly && (
        <EditorToolbar
          activeStyles={activeStyles}
          activeBlock={activeBlock}
          onStyleClick={applyStyle}
          onBlockChange={applyBlock}
          onLinkClick={() => setShowLinkModal(true)}
        />
      )}

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        className="outline-none p-4 prose prose-sm max-w-none overflow-y-auto"
        style={{
          minHeight,
          maxHeight,
          color: colors.textPrimary,
        }}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onSelect={updateActiveStyles}
        data-placeholder={placeholder}
      />

      {/* Link Modal */}
      <AnimatePresence>
        {showLinkModal && (
          <LinkModal
            url={linkUrl}
            onUrlChange={setLinkUrl}
            onInsert={insertLink}
            onClose={() => setShowLinkModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
});

interface EditorToolbarProps {
  activeStyles: Set<InlineStyle>;
  activeBlock: BlockType;
  onStyleClick: (style: InlineStyle) => void;
  onBlockChange: (block: BlockType) => void;
  onLinkClick: () => void;
}

/**
 * Editor Toolbar
 */
const EditorToolbar = memo(function EditorToolbar({
  activeStyles,
  activeBlock,
  onStyleClick,
  onBlockChange,
  onLinkClick,
}: EditorToolbarProps) {
  const { colors } = useTheme();

  const inlineButtons: { style: InlineStyle; icon: ReactNode; title: string }[] = [
    { style: "bold", icon: <BoldIcon />, title: "Bold (⌘B)" },
    { style: "italic", icon: <ItalicIcon />, title: "Italic (⌘I)" },
    { style: "underline", icon: <UnderlineIcon />, title: "Underline (⌘U)" },
    { style: "strikethrough", icon: <StrikethroughIcon />, title: "Strikethrough" },
    { style: "code", icon: <CodeIcon />, title: "Inline Code" },
  ];

  const blockOptions: { value: BlockType; label: string }[] = [
    { value: "paragraph", label: "Paragraph" },
    { value: "heading1", label: "Heading 1" },
    { value: "heading2", label: "Heading 2" },
    { value: "heading3", label: "Heading 3" },
    { value: "quote", label: "Quote" },
    { value: "code", label: "Code Block" },
  ];

  return (
    <div
      className="flex items-center gap-1 p-2 border-b flex-wrap"
      style={{ borderColor: colors.cream, backgroundColor: colors.cream }}
    >
      {/* Block type selector */}
      <select
        value={activeBlock}
        onChange={(e) => onBlockChange(e.target.value as BlockType)}
        className="px-2 py-1 rounded text-sm border-none outline-none cursor-pointer"
        style={{
          backgroundColor: colors.warmWhite,
          color: colors.textPrimary,
        }}
      >
        {blockOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <div className="w-px h-6 mx-1" style={{ backgroundColor: colors.textMuted }} />

      {/* Inline style buttons */}
      {inlineButtons.map(({ style, icon, title }) => (
        <ToolbarButton
          key={style}
          active={activeStyles.has(style)}
          onClick={() => onStyleClick(style)}
          title={title}
        >
          {icon}
        </ToolbarButton>
      ))}

      <div className="w-px h-6 mx-1" style={{ backgroundColor: colors.textMuted }} />

      {/* List buttons */}
      <ToolbarButton
        active={activeBlock === "list"}
        onClick={() => onBlockChange("list")}
        title="Bullet List"
      >
        <ListIcon />
      </ToolbarButton>

      <ToolbarButton
        active={activeBlock === "numbered-list"}
        onClick={() => onBlockChange("numbered-list")}
        title="Numbered List"
      >
        <NumberedListIcon />
      </ToolbarButton>

      <div className="w-px h-6 mx-1" style={{ backgroundColor: colors.textMuted }} />

      {/* Link button */}
      <ToolbarButton onClick={onLinkClick} title="Insert Link (⌘K)">
        <LinkIcon />
      </ToolbarButton>
    </div>
  );
});

interface ToolbarButtonProps {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Toolbar Button
 */
const ToolbarButton = memo(function ToolbarButton({
  active = false,
  onClick,
  title,
  children,
}: ToolbarButtonProps) {
  const { colors } = useTheme();

  return (
    <motion.button
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded"
      style={{
        backgroundColor: active ? colors.coral : "transparent",
        color: active ? colors.warmWhite : colors.textPrimary,
      }}
      whileHover={{ backgroundColor: active ? colors.coral : colors.warmWhite }}
      whileTap={{ scale: 0.95 }}
    >
      {children}
    </motion.button>
  );
});

interface LinkModalProps {
  url: string;
  onUrlChange: (url: string) => void;
  onInsert: () => void;
  onClose: () => void;
}

/**
 * Link Modal
 */
const LinkModal = memo(function LinkModal({
  url,
  onUrlChange,
  onInsert,
  onClose,
}: LinkModalProps) {
  const { colors } = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="p-6 rounded-xl shadow-lg w-full max-w-md"
        style={{ backgroundColor: colors.warmWhite }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: colors.textPrimary }}
        >
          Insert Link
        </h3>

        <input
          type="url"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com"
          className="w-full px-4 py-2 rounded-lg border-2 outline-none mb-4"
          style={{
            borderColor: colors.cream,
            backgroundColor: colors.warmWhite,
            color: colors.textPrimary,
          }}
          autoFocus
        />

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ color: colors.textMuted }}
          >
            Cancel
          </button>
          <button
            onClick={onInsert}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: colors.coral,
              color: colors.warmWhite,
            }}
          >
            Insert
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
});

// Icons
const BoldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8z" />
  </svg>
);

const ItalicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 4h4l-2 16h-4l2-16z" />
  </svg>
);

const UnderlineIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 20h12v2H6v-2zm6-2a6 6 0 006-6V4h-2v8a4 4 0 01-8 0V4H6v8a6 6 0 006 6z" />
  </svg>
);

const StrikethroughIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.154 14c.23.516.346 1.09.346 1.72 0 1.342-.524 2.392-1.571 3.147C14.88 19.622 13.433 20 11.586 20c-1.64 0-3.263-.381-4.87-1.144V16.6c1.52.877 3.075 1.316 4.666 1.316 2.551 0 3.83-.732 3.839-2.197a2.21 2.21 0 00-.648-1.603l-.12-.117H3v-2h18v2h-3.846zm-4.078-3H7.629a4.086 4.086 0 01-.481-.522C6.716 9.92 6.5 9.246 6.5 8.452c0-1.236.466-2.287 1.397-3.153C8.83 4.433 10.271 4 12.222 4c1.471 0 2.879.328 4.222.984v2.152c-1.2-.687-2.515-1.03-3.946-1.03-2.48 0-3.719.782-3.719 2.346 0 .42.218.786.654 1.097.436.311.983.547 1.643.707z" />
  </svg>
);

const CodeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.293 6.293L2.586 12l5.707 5.707 1.414-1.414L5.414 12l4.293-4.293-1.414-1.414zm7.414 0l-1.414 1.414L18.586 12l-4.293 4.293 1.414 1.414L21.414 12l-5.707-5.707z" />
  </svg>
);

const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 4h2v2H4V4zm4 0h12v2H8V4zM4 10h2v2H4v-2zm4 0h12v2H8v-2zM4 16h2v2H4v-2zm4 0h12v2H8v-2z" />
  </svg>
);

const NumberedListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 4h2v4H4V5H3V4zm1 8h2v1H4v1h1v1H3v1h3v-5H4v1zm0 7h2v1H4v1h2v1H3v-3zm5-12h12v2H8V7zm0 6h12v2H8v-2zm0 6h12v2H8v-2z" />
  </svg>
);

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10.586 13.414a1 1 0 01-1.414 1.414 5 5 0 010-7.07l3.535-3.536a5 5 0 017.071 7.071l-1.414 1.414a1 1 0 11-1.414-1.414l1.414-1.414a3 3 0 00-4.243-4.243l-3.535 3.536a3 3 0 000 4.242zm2.828-2.828a1 1 0 011.414-1.414 5 5 0 010 7.07l-3.535 3.536a5 5 0 01-7.071-7.07l1.414-1.415a1 1 0 111.414 1.414l-1.414 1.414a3 3 0 004.243 4.243l3.535-3.536a3 3 0 000-4.242z" />
  </svg>
);

export default RichTextEditor;
