"use client";

/**
 * Drag and Drop Components - Sprint 808
 *
 * Drag and drop functionality:
 * - Draggable items
 * - Drop zones
 * - Sortable lists
 * - Drag handles
 * - Multi-select drag
 * - HER-themed styling
 */

import React, {
  memo,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  createContext,
  useContext,
  ReactNode,
} from "react";
import {
  motion,
  useDragControls,
  Reorder,
  AnimatePresence,
  useMotionValue,
  useSpring,
  PanInfo,
} from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface DraggableProps {
  children: ReactNode;
  onDragStart?: () => void;
  onDragEnd?: (info: PanInfo) => void;
  disabled?: boolean;
  className?: string;
  dragConstraints?: React.RefObject<Element> | { top?: number; left?: number; right?: number; bottom?: number };
  dragElastic?: number | { top?: number; left?: number; right?: number; bottom?: number };
  axis?: "x" | "y" | "both";
}

/**
 * Draggable - Basic draggable component
 */
export const Draggable = memo(function Draggable({
  children,
  onDragStart,
  onDragEnd,
  disabled = false,
  className = "",
  dragConstraints,
  dragElastic = 0.5,
  axis = "both",
}: DraggableProps) {
  const { colors } = useTheme();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
    onDragStart?.();
  }, [onDragStart]);

  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      setIsDragging(false);
      onDragEnd?.(info);
    },
    [onDragEnd]
  );

  const dragOptions = useMemo(() => {
    if (axis === "x") return { drag: "x" as const };
    if (axis === "y") return { drag: "y" as const };
    return { drag: true };
  }, [axis]);

  return (
    <motion.div
      {...dragOptions}
      dragConstraints={dragConstraints}
      dragElastic={dragElastic}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={className}
      style={{
        cursor: disabled ? "default" : isDragging ? "grabbing" : "grab",
        touchAction: "none",
        userSelect: "none",
      }}
      whileDrag={{
        scale: 1.05,
        boxShadow: "0 10px 30px " + colors.coral + "30",
        zIndex: 100,
      }}
    >
      {children}
    </motion.div>
  );
});

interface DragHandleProps {
  children?: ReactNode;
  className?: string;
}

/**
 * DragHandle - Handle for initiating drag
 */
export const DragHandle = memo(function DragHandle({
  children,
  className = "",
}: DragHandleProps) {
  const { colors } = useTheme();
  const controls = useDragControls();

  return (
    <div
      className={"cursor-grab active:cursor-grabbing " + className}
      onPointerDown={(e) => controls.start(e)}
      style={{ touchAction: "none" }}
    >
      {children || (
        <div
          className="flex flex-col gap-1 p-2"
          style={{ color: colors.textSecondary }}
        >
          <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: colors.textSecondary }} />
          <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: colors.textSecondary }} />
          <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: colors.textSecondary }} />
        </div>
      )}
    </div>
  );
});

interface DropZoneProps {
  children: ReactNode;
  onDrop?: (item: unknown) => void;
  accepts?: string[];
  className?: string;
  activeClassName?: string;
  hoverClassName?: string;
}

// Drop zone context
interface DropZoneContextType {
  isOver: boolean;
  setIsOver: (value: boolean) => void;
  droppedItem: unknown;
  setDroppedItem: (item: unknown) => void;
}

const DropZoneContext = createContext<DropZoneContextType | null>(null);

/**
 * DropZone - Area where items can be dropped
 */
export const DropZone = memo(function DropZone({
  children,
  onDrop,
  accepts = [],
  className = "",
  activeClassName = "",
  hoverClassName = "",
}: DropZoneProps) {
  const { colors } = useTheme();
  const [isOver, setIsOver] = useState(false);
  const [droppedItem, setDroppedItem] = useState<unknown>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const types = Array.from(e.dataTransfer.types);
    if (accepts.length === 0 || accepts.some((t) => types.includes(t))) {
      setIsOver(true);
    }
  }, [accepts]);

  const handleDragLeave = useCallback(() => {
    setIsOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsOver(false);

      try {
        const data = e.dataTransfer.getData("application/json");
        const item = data ? JSON.parse(data) : null;
        setDroppedItem(item);
        onDrop?.(item);
      } catch {
        const text = e.dataTransfer.getData("text/plain");
        setDroppedItem(text);
        onDrop?.(text);
      }
    },
    [onDrop]
  );

  const contextValue = useMemo(
    () => ({ isOver, setIsOver, droppedItem, setDroppedItem }),
    [isOver, droppedItem]
  );

  return (
    <DropZoneContext.Provider value={contextValue}>
      <motion.div
        className={className + " " + (isOver ? hoverClassName : "")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        animate={{
          borderColor: isOver ? colors.coral : colors.textSecondary + "30",
          backgroundColor: isOver ? colors.coral + "10" : "transparent",
        }}
        style={{
          border: "2px dashed " + colors.textSecondary + "30",
          borderRadius: 8,
          transition: "border-color 0.2s, background-color 0.2s",
        }}
      >
        {children}
      </motion.div>
    </DropZoneContext.Provider>
  );
});

export function useDropZone() {
  const context = useContext(DropZoneContext);
  if (!context) {
    throw new Error("useDropZone must be used within a DropZone");
  }
  return context;
}

interface SortableListProps<T> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string | number;
  className?: string;
  itemClassName?: string;
  axis?: "x" | "y";
  gap?: number;
}

/**
 * SortableList - Reorderable list of items
 */
export const SortableList = memo(function SortableList<T>({
  items,
  onReorder,
  renderItem,
  getKey,
  className = "",
  itemClassName = "",
  axis = "y",
  gap = 8,
}: SortableListProps<T>) {
  const { colors } = useTheme();

  return (
    <Reorder.Group
      axis={axis}
      values={items}
      onReorder={onReorder}
      className={className}
      style={{
        display: "flex",
        flexDirection: axis === "y" ? "column" : "row",
        gap,
        listStyle: "none",
        padding: 0,
        margin: 0,
      }}
    >
      {items.map((item, index) => (
        <Reorder.Item
          key={getKey(item)}
          value={item}
          className={itemClassName}
          whileDrag={{
            scale: 1.02,
            boxShadow: "0 8px 20px rgba(0, 0, 0, 0.15)",
            backgroundColor: colors.background,
          }}
          style={{
            cursor: "grab",
            touchAction: "none",
          }}
        >
          {renderItem(item, index)}
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}) as <T>(props: SortableListProps<T>) => JSX.Element;

interface DraggableItemProps {
  id: string;
  data?: unknown;
  children: ReactNode;
  className?: string;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

/**
 * DraggableItem - Item that can be dragged with data transfer
 */
export const DraggableItem = memo(function DraggableItem({
  id,
  data,
  children,
  className = "",
  onDragStart,
  onDragEnd,
}: DraggableItemProps) {
  const { colors } = useTheme();
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const payload = data || { id };
      e.dataTransfer.setData("application/json", JSON.stringify(payload));
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      setIsDragging(true);
      onDragStart?.();
    },
    [id, data, onDragStart]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd?.();
  }, [onDragEnd]);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={className}
      style={{
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.5 : 1,
        touchAction: "none",
      }}
    >
      {children}
    </div>
  );
});

interface SortableGridProps<T> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string | number;
  columns: number;
  className?: string;
  itemClassName?: string;
  gap?: number;
}

/**
 * SortableGrid - Grid layout with reorderable items
 */
export const SortableGrid = memo(function SortableGrid<T>({
  items,
  onReorder,
  renderItem,
  getKey,
  columns,
  className = "",
  itemClassName = "",
  gap = 8,
}: SortableGridProps<T>) {
  const { colors } = useTheme();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setHoveredIndex(index);
  }, []);

  const handleDrop = useCallback(
    (index: number) => {
      if (draggedIndex === null || draggedIndex === index) {
        setDraggedIndex(null);
        setHoveredIndex(null);
        return;
      }

      const newItems = [...items];
      const [draggedItem] = newItems.splice(draggedIndex, 1);
      newItems.splice(index, 0, draggedItem);
      onReorder(newItems);

      setDraggedIndex(null);
      setHoveredIndex(null);
    },
    [draggedIndex, items, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setHoveredIndex(null);
  }, []);

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(" + columns + ", 1fr)",
        gap,
      }}
    >
      {items.map((item, index) => (
        <motion.div
          key={getKey(item)}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e as unknown as React.DragEvent, index)}
          onDrop={() => handleDrop(index)}
          onDragEnd={handleDragEnd}
          className={itemClassName}
          animate={{
            scale: draggedIndex === index ? 1.05 : hoveredIndex === index ? 1.02 : 1,
            opacity: draggedIndex === index ? 0.7 : 1,
          }}
          style={{
            cursor: "grab",
            touchAction: "none",
            backgroundColor: hoveredIndex === index && draggedIndex !== index
              ? colors.coral + "20"
              : "transparent",
            borderRadius: 8,
          }}
        >
          {renderItem(item, index)}
        </motion.div>
      ))}
    </div>
  );
}) as <T>(props: SortableGridProps<T>) => JSX.Element;

interface KanbanColumnProps<T> {
  id: string;
  title: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T) => string | number;
  onItemsChange: (items: T[]) => void;
  className?: string;
}

/**
 * KanbanColumn - Single kanban column
 */
export const KanbanColumn = memo(function KanbanColumn<T>({
  id,
  title,
  items,
  renderItem,
  getKey,
  onItemsChange,
  className = "",
}: KanbanColumnProps<T>) {
  const { colors } = useTheme();
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsOver(false);

      try {
        const data = e.dataTransfer.getData("application/json");
        const item = data ? JSON.parse(data) : null;
        if (item) {
          onItemsChange([...items, item]);
        }
      } catch {
        // Ignore
      }
    },
    [items, onItemsChange]
  );

  return (
    <div
      className={"flex flex-col rounded-lg overflow-hidden " + className}
      style={{
        backgroundColor: colors.background,
        border: "1px solid " + colors.textSecondary + "20",
      }}
    >
      <div
        className="px-4 py-3 font-semibold"
        style={{
          backgroundColor: colors.coral + "10",
          color: colors.textPrimary,
        }}
      >
        {title}
        <span
          className="ml-2 text-sm"
          style={{ color: colors.textSecondary }}
        >
          ({items.length})
        </span>
      </div>

      <motion.div
        className="flex-1 p-4 min-h-32"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        animate={{
          backgroundColor: isOver ? colors.coral + "10" : "transparent",
        }}
      >
        <Reorder.Group
          axis="y"
          values={items}
          onReorder={onItemsChange}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {items.map((item, index) => (
            <Reorder.Item
              key={getKey(item)}
              value={item}
              whileDrag={{ scale: 1.02, boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }}
              style={{ cursor: "grab" }}
            >
              {renderItem(item, index)}
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </motion.div>
    </div>
  );
}) as <T>(props: KanbanColumnProps<T>) => JSX.Element;

interface FileDropZoneProps {
  onFilesDropped: (files: File[]) => void;
  accept?: string[];
  multiple?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * FileDropZone - Drop zone for files
 */
export const FileDropZone = memo(function FileDropZone({
  onFilesDropped,
  accept = [],
  multiple = true,
  className = "",
  children,
}: FileDropZoneProps) {
  const { colors } = useTheme();
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);

      const files = Array.from(e.dataTransfer.files);
      const filtered = accept.length > 0
        ? files.filter((f) => accept.some((a) => f.type.match(a) || f.name.endsWith(a)))
        : files;

      if (filtered.length > 0) {
        onFilesDropped(multiple ? filtered : [filtered[0]]);
      }
    },
    [accept, multiple, onFilesDropped]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onFilesDropped(files);
      }
    },
    [onFilesDropped]
  );

  return (
    <motion.div
      className={"relative cursor-pointer " + className}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      animate={{
        borderColor: isOver ? colors.coral : colors.textSecondary + "40",
        backgroundColor: isOver ? colors.coral + "10" : "transparent",
      }}
      style={{
        border: "2px dashed " + colors.textSecondary + "40",
        borderRadius: 12,
        padding: 24,
        textAlign: "center",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept.join(",")}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />

      {children || (
        <div style={{ color: colors.textSecondary }}>
          <div className="text-4xl mb-2">📁</div>
          <div>Drag files here or click to upload</div>
          {accept.length > 0 && (
            <div className="text-sm mt-1 opacity-70">
              Accepts: {accept.join(", ")}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
});

interface DragOverlayProps {
  children: ReactNode;
  active: boolean;
}

/**
 * DragOverlay - Overlay shown during drag
 */
export const DragOverlay = memo(function DragOverlay({
  children,
  active,
}: DragOverlayProps) {
  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
    >
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        className="p-4 rounded-lg bg-white shadow-2xl"
      >
        {children}
      </motion.div>
    </motion.div>
  );
});

interface MultiSelectDragProps<T> {
  items: T[];
  selectedIds: Set<string | number>;
  onSelectionChange: (ids: Set<string | number>) => void;
  onDragEnd: (selectedItems: T[], dropTarget: string | null) => void;
  renderItem: (item: T, index: number, isSelected: boolean) => ReactNode;
  getKey: (item: T) => string | number;
  className?: string;
}

/**
 * MultiSelectDrag - Drag multiple selected items
 */
export const MultiSelectDrag = memo(function MultiSelectDrag<T>({
  items,
  selectedIds,
  onSelectionChange,
  onDragEnd,
  renderItem,
  getKey,
  className = "",
}: MultiSelectDragProps<T>) {
  const { colors } = useTheme();
  const [isDragging, setIsDragging] = useState(false);

  const handleItemClick = useCallback(
    (e: React.MouseEvent, itemId: string | number) => {
      const newSelection = new Set(selectedIds);

      if (e.metaKey || e.ctrlKey) {
        // Toggle selection
        if (newSelection.has(itemId)) {
          newSelection.delete(itemId);
        } else {
          newSelection.add(itemId);
        }
      } else if (e.shiftKey && selectedIds.size > 0) {
        // Range selection
        const lastSelected = Array.from(selectedIds).pop();
        const startIndex = items.findIndex((i) => getKey(i) === lastSelected);
        const endIndex = items.findIndex((i) => getKey(i) === itemId);
        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];

        for (let i = from; i <= to; i++) {
          newSelection.add(getKey(items[i]));
        }
      } else {
        // Single selection
        newSelection.clear();
        newSelection.add(itemId);
      }

      onSelectionChange(newSelection);
    },
    [items, selectedIds, onSelectionChange, getKey]
  );

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const selectedItems = items.filter((i) => selectedIds.has(getKey(i)));
    e.dataTransfer.setData("application/json", JSON.stringify(selectedItems));
    e.dataTransfer.effectAllowed = "move";
    setIsDragging(true);
  }, [items, selectedIds, getKey]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    const selectedItems = items.filter((i) => selectedIds.has(getKey(i)));
    onDragEnd(selectedItems, null);
  }, [items, selectedIds, onDragEnd, getKey]);

  return (
    <div className={className}>
      {items.map((item, index) => {
        const itemId = getKey(item);
        const isSelected = selectedIds.has(itemId);

        return (
          <div
            key={itemId}
            draggable={isSelected}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={(e) => handleItemClick(e, itemId)}
            className="cursor-pointer"
            style={{
              opacity: isDragging && isSelected ? 0.5 : 1,
              backgroundColor: isSelected ? colors.coral + "20" : "transparent",
              borderRadius: 4,
              transition: "background-color 0.2s",
            }}
          >
            {renderItem(item, index, isSelected)}
          </div>
        );
      })}

      {isDragging && selectedIds.size > 1 && (
        <div
          className="fixed bottom-4 right-4 px-3 py-2 rounded-lg shadow-lg"
          style={{
            backgroundColor: colors.coral,
            color: colors.background,
          }}
        >
          Moving {selectedIds.size} items
        </div>
      )}
    </div>
  );
}) as <T>(props: MultiSelectDragProps<T>) => JSX.Element;

export default Draggable;
