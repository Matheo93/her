"use client";

/**
 * Code Block Components - Sprint 784
 *
 * Code display and highlighting:
 * - Syntax highlighting
 * - Line numbers
 * - Copy to clipboard
 * - Language detection
 * - Collapsible blocks
 * - HER-themed styling
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  filename?: string;
  showCopy?: boolean;
  collapsible?: boolean;
  initialCollapsed?: boolean;
  maxHeight?: number;
  className?: string;
}

/**
 * Code Block with Syntax Highlighting
 */
export const CodeBlock = memo(function CodeBlock({
  code,
  language = "text",
  showLineNumbers = true,
  highlightLines = [],
  filename,
  showCopy = true,
  collapsible = false,
  initialCollapsed = false,
  maxHeight,
  className = "",
}: CodeBlockProps) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const codeRef = useRef<HTMLPreElement>(null);

  const lines = code.split("\n");
  const highlightSet = new Set(highlightLines);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [code]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  // Token styles for basic syntax highlighting
  const tokenStyles: Record<string, string> = {
    keyword: colors.coral,
    string: "#22c55e",
    comment: colors.textMuted,
    number: "#f59e0b",
    function: "#8b5cf6",
    operator: colors.textPrimary,
    punctuation: colors.textMuted,
  };

  // Basic syntax highlighting (simplified)
  const highlightSyntax = (line: string): ReactNode[] => {
    const tokens: ReactNode[] = [];
    let remaining = line;
    let key = 0;

    // Keywords
    const keywords = [
      "const", "let", "var", "function", "return", "if", "else", "for",
      "while", "class", "import", "export", "from", "async", "await",
      "try", "catch", "throw", "new", "this", "true", "false", "null",
      "undefined", "def", "print", "self", "None", "True", "False",
    ];

    // Simple tokenization
    const regex = new RegExp(
      `(${keywords.join("|")})|` + // keywords
      `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')` + "|" + // strings
      `(//.*|#.*)` + "|" + // comments
      `(\\d+\\.?\\d*)` + "|" + // numbers
      `([a-zA-Z_][a-zA-Z0-9_]*(?=\\s*\\())` + "|" + // function calls
      `([{}()\\[\\];,.:])` + "|" + // punctuation
      `([+\\-*/%=<>!&|^~]+)` + "|" + // operators
      `([a-zA-Z_][a-zA-Z0-9_]*)` + "|" + // identifiers
      `(\\s+)`, // whitespace
      "g"
    );

    let match;
    let lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
      // Add any text before the match
      if (match.index > lastIndex) {
        tokens.push(
          <span key={key++}>{line.slice(lastIndex, match.index)}</span>
        );
      }

      const [full, keyword, string, comment, number, func, punct, op, ident, ws] = match;

      let style: string | undefined;
      if (keyword) style = tokenStyles.keyword;
      else if (string) style = tokenStyles.string;
      else if (comment) style = tokenStyles.comment;
      else if (number) style = tokenStyles.number;
      else if (func) style = tokenStyles.function;
      else if (punct) style = tokenStyles.punctuation;
      else if (op) style = tokenStyles.operator;

      tokens.push(
        <span key={key++} style={style ? { color: style } : undefined}>
          {full}
        </span>
      );

      lastIndex = match.index + full.length;
    }

    // Add remaining text
    if (lastIndex < line.length) {
      tokens.push(<span key={key++}>{line.slice(lastIndex)}</span>);
    }

    return tokens.length > 0 ? tokens : [<span key={0}>{line}</span>];
  };

  return (
    <div
      className={"rounded-xl overflow-hidden " + className}
      style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid " + colors.textMuted + "30",
      }}
    >
      {/* Header */}
      {(filename || showCopy || collapsible) && (
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{
            backgroundColor: "#0d0d1a",
            borderColor: colors.textMuted + "30",
          }}
        >
          <div className="flex items-center gap-3">
            {/* Window buttons */}
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="w-3 h-3 rounded-full bg-green-500" />
            </div>

            {filename && (
              <span
                className="text-sm font-mono"
                style={{ color: colors.textMuted }}
              >
                {filename}
              </span>
            )}

            {language && !filename && (
              <span
                className="text-xs uppercase tracking-wider"
                style={{ color: colors.textMuted }}
              >
                {language}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {collapsible && (
              <motion.button
                onClick={toggleCollapse}
                className="p-1.5 rounded"
                style={{ color: colors.textMuted }}
                whileHover={{ backgroundColor: colors.textMuted + "20" }}
              >
                <ChevronIcon direction={collapsed ? "down" : "up"} size={14} />
              </motion.button>
            )}

            {showCopy && (
              <motion.button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
                style={{
                  color: copied ? "#22c55e" : colors.textMuted,
                  backgroundColor: copied ? "#22c55e20" : "transparent",
                }}
                whileHover={{ backgroundColor: colors.textMuted + "20" }}
              >
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copied ? "Copied!" : "Copy"}
              </motion.button>
            )}
          </div>
        </div>
      )}

      {/* Code content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="overflow-auto"
              style={{
                maxHeight: maxHeight || "none",
              }}
            >
              <pre
                ref={codeRef}
                className="p-4 m-0 font-mono text-sm leading-relaxed"
                style={{ color: "#e1e1e1" }}
              >
                <code>
                  {lines.map((line, index) => (
                    <div
                      key={index}
                      className={
                        "flex " +
                        (highlightSet.has(index + 1) ? "bg-yellow-500/10" : "")
                      }
                      style={{
                        borderLeft: highlightSet.has(index + 1)
                          ? "2px solid " + colors.coral
                          : "2px solid transparent",
                        paddingLeft: 8,
                        marginLeft: -8,
                      }}
                    >
                      {showLineNumbers && (
                        <span
                          className="select-none pr-4 text-right"
                          style={{
                            color: highlightSet.has(index + 1)
                              ? colors.coral
                              : colors.textMuted + "60",
                            minWidth: lines.length > 99 ? 40 : 30,
                          }}
                        >
                          {index + 1}
                        </span>
                      )}
                      <span className="flex-1">
                        {highlightSyntax(line)}
                        {line === "" && "\n"}
                      </span>
                    </div>
                  ))}
                </code>
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface InlineCodeProps {
  children: string;
  className?: string;
}

/**
 * Inline Code Snippet
 */
export const InlineCode = memo(function InlineCode({
  children,
  className = "",
}: InlineCodeProps) {
  const { colors } = useTheme();

  return (
    <code
      className={"px-1.5 py-0.5 rounded font-mono text-sm " + className}
      style={{
        backgroundColor: colors.cream,
        color: colors.coral,
      }}
    >
      {children}
    </code>
  );
});

interface CodeDiffProps {
  oldCode: string;
  newCode: string;
  oldLabel?: string;
  newLabel?: string;
  language?: string;
  className?: string;
}

/**
 * Code Diff View
 */
export const CodeDiff = memo(function CodeDiff({
  oldCode,
  newCode,
  oldLabel = "Before",
  newLabel = "After",
  language = "text",
  className = "",
}: CodeDiffProps) {
  const { colors } = useTheme();

  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");

  // Simple diff: mark added/removed lines
  const maxLines = Math.max(oldLines.length, newLines.length);

  return (
    <div
      className={"rounded-xl overflow-hidden " + className}
      style={{
        backgroundColor: "#1a1a2e",
        border: "1px solid " + colors.textMuted + "30",
      }}
    >
      <div className="grid grid-cols-2">
        {/* Old code */}
        <div className="border-r" style={{ borderColor: colors.textMuted + "30" }}>
          <div
            className="px-4 py-2 text-sm font-medium border-b"
            style={{
              backgroundColor: "#0d0d1a",
              borderColor: colors.textMuted + "30",
              color: "#ef4444",
            }}
          >
            {oldLabel}
          </div>
          <pre className="p-4 font-mono text-sm overflow-auto">
            {oldLines.map((line, i) => {
              const removed = i < oldLines.length && (i >= newLines.length || oldLines[i] !== newLines[i]);
              return (
                <div
                  key={i}
                  className="flex"
                  style={{
                    backgroundColor: removed ? "rgba(239, 68, 68, 0.1)" : "transparent",
                    color: removed ? "#ef4444" : "#e1e1e1",
                  }}
                >
                  <span
                    className="select-none pr-4 text-right"
                    style={{ color: colors.textMuted + "60", minWidth: 30 }}
                  >
                    {i + 1}
                  </span>
                  <span className="pr-2">{removed ? "-" : " "}</span>
                  <span>{line}</span>
                </div>
              );
            })}
          </pre>
        </div>

        {/* New code */}
        <div>
          <div
            className="px-4 py-2 text-sm font-medium border-b"
            style={{
              backgroundColor: "#0d0d1a",
              borderColor: colors.textMuted + "30",
              color: "#22c55e",
            }}
          >
            {newLabel}
          </div>
          <pre className="p-4 font-mono text-sm overflow-auto">
            {newLines.map((line, i) => {
              const added = i < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[i]);
              return (
                <div
                  key={i}
                  className="flex"
                  style={{
                    backgroundColor: added ? "rgba(34, 197, 94, 0.1)" : "transparent",
                    color: added ? "#22c55e" : "#e1e1e1",
                  }}
                >
                  <span
                    className="select-none pr-4 text-right"
                    style={{ color: colors.textMuted + "60", minWidth: 30 }}
                  >
                    {i + 1}
                  </span>
                  <span className="pr-2">{added ? "+" : " "}</span>
                  <span>{line}</span>
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
});

interface CodeTabsProps {
  tabs: Array<{
    label: string;
    code: string;
    language?: string;
    filename?: string;
  }>;
  className?: string;
}

/**
 * Tabbed Code Blocks
 */
export const CodeTabs = memo(function CodeTabs({
  tabs,
  className = "",
}: CodeTabsProps) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className={className}>
      {/* Tab headers */}
      <div
        className="flex border-b"
        style={{
          backgroundColor: "#0d0d1a",
          borderColor: colors.textMuted + "30",
        }}
      >
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: index === activeTab ? colors.coral : colors.textMuted,
              borderBottom:
                index === activeTab
                  ? "2px solid " + colors.coral
                  : "2px solid transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <CodeBlock
            code={tabs[activeTab].code}
            language={tabs[activeTab].language}
            filename={tabs[activeTab].filename}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

interface TerminalBlockProps {
  commands: Array<{
    command: string;
    output?: string;
  }>;
  prompt?: string;
  className?: string;
}

/**
 * Terminal/Shell Block
 */
export const TerminalBlock = memo(function TerminalBlock({
  commands,
  prompt = "$",
  className = "",
}: TerminalBlockProps) {
  const { colors } = useTheme();

  return (
    <div
      className={"rounded-xl overflow-hidden " + className}
      style={{
        backgroundColor: "#0d0d1a",
        border: "1px solid " + colors.textMuted + "30",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b"
        style={{ borderColor: colors.textMuted + "30" }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <span className="text-xs" style={{ color: colors.textMuted }}>
          Terminal
        </span>
      </div>

      {/* Commands */}
      <div className="p-4 font-mono text-sm">
        {commands.map((item, index) => (
          <div key={index} className="mb-2">
            <div className="flex items-center gap-2">
              <span style={{ color: "#22c55e" }}>{prompt}</span>
              <span style={{ color: "#e1e1e1" }}>{item.command}</span>
            </div>
            {item.output && (
              <div
                className="mt-1 pl-4"
                style={{ color: colors.textMuted }}
              >
                {item.output.split("\n").map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

// Icons
const CopyIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronIcon = ({
  direction = "down",
  size = 16,
}: {
  direction?: "up" | "down";
  size?: number;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ transform: direction === "up" ? "rotate(180deg)" : "none" }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export default CodeBlock;
