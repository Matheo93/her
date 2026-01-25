"use client";

/**
 * TreeView Components - Sprint 680
 *
 * Hierarchical data display:
 * - Expandable nodes
 * - Selection
 * - Checkboxes
 * - Icons
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, ReactNode, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface TreeNode {
  id: string;
  label: string;
  icon?: ReactNode;
  children?: TreeNode[];
  disabled?: boolean;
  data?: any;
}

interface TreeViewContextType {
  expandedIds: Set<string>;
  selectedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onSelect: (id: string) => void;
  onCheck?: (id: string, checked: boolean) => void;
  checkedIds?: Set<string>;
  multiSelect: boolean;
  showCheckboxes: boolean;
  indentSize: number;
}

const TreeViewContext = createContext<TreeViewContextType | null>(null);

interface TreeViewProps {
  data: TreeNode[];
  defaultExpanded?: string[];
  defaultSelected?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  onExpandChange?: (expandedIds: string[]) => void;
  onNodeClick?: (node: TreeNode) => void;
  multiSelect?: boolean;
  showCheckboxes?: boolean;
  indentSize?: number;
  className?: string;
}

/**
 * TreeView Component
 */
export const TreeView = memo(function TreeView({
  data,
  defaultExpanded = [],
  defaultSelected = [],
  onSelectionChange,
  onExpandChange,
  onNodeClick,
  multiSelect = false,
  showCheckboxes = false,
  indentSize = 20,
  className = "",
}: TreeViewProps) {
  const { colors } = useTheme();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(defaultExpanded));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(defaultSelected));
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onExpandChange?.(Array.from(next));
      return next;
    });
  }, [onExpandChange]);

  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      let next: Set<string>;
      if (multiSelect) {
        next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      } else {
        next = new Set([id]);
      }
      onSelectionChange?.(Array.from(next));
      return next;
    });

    // Find node and call onNodeClick
    const findNode = (nodes: TreeNode[]): TreeNode | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return undefined;
    };

    const node = findNode(data);
    if (node) onNodeClick?.(node);
  }, [multiSelect, onSelectionChange, onNodeClick, data]);

  const handleCheck = useCallback((id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const contextValue: TreeViewContextType = {
    expandedIds,
    selectedIds,
    onToggleExpand: handleToggleExpand,
    onSelect: handleSelect,
    onCheck: showCheckboxes ? handleCheck : undefined,
    checkedIds: showCheckboxes ? checkedIds : undefined,
    multiSelect,
    showCheckboxes,
    indentSize,
  };

  return (
    <TreeViewContext.Provider value={contextValue}>
      <div
        className={"flex flex-col " + className}
        style={{ color: colors.textPrimary }}
        role="tree"
      >
        {data.map((node) => (
          <TreeNodeComponent key={node.id} node={node} level={0} />
        ))}
      </div>
    </TreeViewContext.Provider>
  );
});

interface TreeNodeComponentProps {
  node: TreeNode;
  level: number;
}

const TreeNodeComponent = memo(function TreeNodeComponent({
  node,
  level,
}: TreeNodeComponentProps) {
  const { colors } = useTheme();
  const context = useContext(TreeViewContext);

  if (!context) return null;

  const {
    expandedIds,
    selectedIds,
    onToggleExpand,
    onSelect,
    onCheck,
    checkedIds,
    showCheckboxes,
    indentSize,
  } = context;

  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedIds.has(node.id);
  const isChecked = checkedIds?.has(node.id) ?? false;

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggleExpand(node.id);
    }
  };

  const handleNodeClick = () => {
    if (!node.disabled) {
      onSelect(node.id);
    }
  };

  const handleCheckChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onCheck?.(node.id, e.target.checked);
  };

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isExpanded : undefined}>
      <motion.div
        className="flex items-center gap-1 py-1 px-2 rounded-md cursor-pointer select-none"
        style={{
          paddingLeft: level * indentSize + 8,
          backgroundColor: isSelected ? colors.coral + "20" : "transparent",
          opacity: node.disabled ? 0.5 : 1,
          cursor: node.disabled ? "not-allowed" : "pointer",
        }}
        onClick={handleNodeClick}
        whileHover={{ backgroundColor: isSelected ? colors.coral + "30" : colors.cream }}
      >
        {/* Expand/Collapse Icon */}
        <motion.button
          type="button"
          onClick={handleExpandClick}
          className="w-5 h-5 flex items-center justify-center rounded"
          style={{
            visibility: hasChildren ? "visible" : "hidden",
            color: colors.textMuted,
          }}
          whileHover={{ color: colors.textPrimary }}
        >
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRightIcon size={14} />
          </motion.div>
        </motion.button>

        {/* Checkbox */}
        {showCheckboxes && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={handleCheckChange}
            disabled={node.disabled}
            className="w-4 h-4 rounded border"
            style={{
              accentColor: colors.coral,
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Node Icon */}
        {node.icon && (
          <span className="flex-shrink-0" style={{ color: colors.textMuted }}>
            {node.icon}
          </span>
        )}

        {/* Default folder/file icon */}
        {!node.icon && (
          <span className="flex-shrink-0" style={{ color: colors.textMuted }}>
            {hasChildren ? (
              isExpanded ? <FolderOpenIcon size={16} /> : <FolderIcon size={16} />
            ) : (
              <FileIcon size={16} />
            )}
          </span>
        )}

        {/* Label */}
        <span
          className="text-sm truncate"
          style={{ color: isSelected ? colors.coral : colors.textPrimary }}
        >
          {node.label}
        </span>
      </motion.div>

      {/* Children */}
      <AnimatePresence>
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            role="group"
          >
            {node.children!.map((child) => (
              <TreeNodeComponent key={child.id} node={child} level={level + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface FileTreeProps {
  files: FileTreeNode[];
  onFileSelect?: (file: FileTreeNode) => void;
  selectedPath?: string;
  className?: string;
}

interface FileTreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileTreeNode[];
  icon?: ReactNode;
}

/**
 * File Tree Component
 */
export const FileTree = memo(function FileTree({
  files,
  onFileSelect,
  selectedPath,
  className = "",
}: FileTreeProps) {
  const convertToTreeNodes = (nodes: FileTreeNode[]): TreeNode[] => {
    return nodes.map((node) => ({
      id: node.path,
      label: node.name,
      icon: node.icon || (node.type === "folder" ? undefined : <FileIcon size={16} />),
      children: node.children ? convertToTreeNodes(node.children) : undefined,
      data: node,
    }));
  };

  const handleNodeClick = (treeNode: TreeNode) => {
    const fileNode = treeNode.data as FileTreeNode;
    if (fileNode.type === "file" && onFileSelect) {
      onFileSelect(fileNode);
    }
  };

  return (
    <TreeView
      data={convertToTreeNodes(files)}
      defaultExpanded={[]}
      defaultSelected={selectedPath ? [selectedPath] : []}
      onNodeClick={handleNodeClick}
      className={className}
    />
  );
});

interface CheckboxTreeProps {
  data: TreeNode[];
  checked: string[];
  onCheckedChange: (checked: string[]) => void;
  className?: string;
}

/**
 * Checkbox Tree Component
 */
export const CheckboxTree = memo(function CheckboxTree({
  data,
  checked,
  onCheckedChange,
  className = "",
}: CheckboxTreeProps) {
  const [checkedSet, setCheckedSet] = useState(new Set(checked));

  const handleCheck = useCallback((id: string, isChecked: boolean) => {
    setCheckedSet((prev) => {
      const next = new Set(prev);
      if (isChecked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      onCheckedChange(Array.from(next));
      return next;
    });
  }, [onCheckedChange]);

  return (
    <TreeView
      data={data}
      showCheckboxes
      onSelectionChange={() => {}}
      className={className}
    />
  );
});

interface VirtualTreeProps {
  data: TreeNode[];
  itemHeight?: number;
  visibleItems?: number;
  className?: string;
}

/**
 * Virtualized Tree for large datasets
 */
export const VirtualTree = memo(function VirtualTree({
  data,
  itemHeight = 32,
  visibleItems = 20,
  className = "",
}: VirtualTreeProps) {
  const { colors } = useTheme();
  const [scrollTop, setScrollTop] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Flatten tree for virtualization
  const flattenTree = useCallback((
    nodes: TreeNode[],
    level: number = 0,
  ): Array<{ node: TreeNode; level: number }> => {
    const result: Array<{ node: TreeNode; level: number }> = [];

    for (const node of nodes) {
      result.push({ node, level });
      if (node.children && expandedIds.has(node.id)) {
        result.push(...flattenTree(node.children, level + 1));
      }
    }

    return result;
  }, [expandedIds]);

  const flatNodes = flattenTree(data);
  const totalHeight = flatNodes.length * itemHeight;
  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(startIndex + visibleItems + 1, flatNodes.length);
  const visibleNodes = flatNodes.slice(startIndex, endIndex);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div
      className={"overflow-auto " + className}
      style={{ height: visibleItems * itemHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleNodes.map(({ node, level }, index) => {
          const hasChildren = node.children && node.children.length > 0;
          const isExpanded = expandedIds.has(node.id);

          return (
            <div
              key={node.id}
              className="absolute left-0 right-0 flex items-center gap-2 px-2"
              style={{
                top: (startIndex + index) * itemHeight,
                height: itemHeight,
                paddingLeft: level * 20 + 8,
              }}
            >
              <button
                onClick={() => handleToggle(node.id)}
                className="w-5 h-5 flex items-center justify-center"
                style={{ visibility: hasChildren ? "visible" : "hidden" }}
              >
                <motion.div animate={{ rotate: isExpanded ? 90 : 0 }}>
                  <ChevronRightIcon size={14} />
                </motion.div>
              </button>
              <span className="text-sm truncate" style={{ color: colors.textPrimary }}>
                {node.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// Icons
function ChevronRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function FolderIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function FolderOpenIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v1M5 12h16l-2 7H5l-2-7z" />
    </svg>
  );
}

function FileIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export default TreeView;
