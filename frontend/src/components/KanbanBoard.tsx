"use client";

/**
 * Kanban Board Components - Sprint 700
 *
 * Drag-and-drop task board:
 * - Multiple columns
 * - Card drag between columns
 * - Card ordering
 * - Add/Remove cards
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  assignee?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  [key: string]: any;
}

interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
  color?: string;
  limit?: number;
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  onCardMove: (cardId: string, fromColumnId: string, toColumnId: string, newIndex: number) => void;
  onCardReorder: (columnId: string, cards: KanbanCard[]) => void;
  onCardClick?: (card: KanbanCard) => void;
  onAddCard?: (columnId: string) => void;
  renderCard?: (card: KanbanCard) => ReactNode;
  className?: string;
}

/**
 * Kanban Board Component
 */
export const KanbanBoard = memo(function KanbanBoard({
  columns,
  onCardMove,
  onCardReorder,
  onCardClick,
  onAddCard,
  renderCard,
  className = "",
}: KanbanBoardProps) {
  const { colors } = useTheme();
  const [draggedCard, setDraggedCard] = useState<{ card: KanbanCard; columnId: string } | null>(null);

  const handleDragStart = useCallback((card: KanbanCard, columnId: string) => {
    setDraggedCard({ card, columnId });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedCard(null);
  }, []);

  const handleDropOnColumn = useCallback(
    (targetColumnId: string) => {
      if (draggedCard && draggedCard.columnId !== targetColumnId) {
        const targetColumn = columns.find((c) => c.id === targetColumnId);
        const newIndex = targetColumn ? targetColumn.cards.length : 0;
        onCardMove(draggedCard.card.id, draggedCard.columnId, targetColumnId, newIndex);
      }
    },
    [draggedCard, columns, onCardMove]
  );

  return (
    <div
      className={"flex gap-4 overflow-x-auto p-4 " + className}
      style={{ minHeight: 400 }}
    >
      {columns.map((column) => (
        <KanbanColumnComponent
          key={column.id}
          column={column}
          onCardReorder={(cards) => onCardReorder(column.id, cards)}
          onCardClick={onCardClick}
          onAddCard={onAddCard ? () => onAddCard(column.id) : undefined}
          onDragStart={(card) => handleDragStart(card, column.id)}
          onDragEnd={handleDragEnd}
          onDrop={() => handleDropOnColumn(column.id)}
          isDragOver={draggedCard !== null && draggedCard.columnId !== column.id}
          renderCard={renderCard}
        />
      ))}
    </div>
  );
});

interface KanbanColumnProps {
  column: KanbanColumn;
  onCardReorder: (cards: KanbanCard[]) => void;
  onCardClick?: (card: KanbanCard) => void;
  onAddCard?: () => void;
  onDragStart: (card: KanbanCard) => void;
  onDragEnd: () => void;
  onDrop: () => void;
  isDragOver: boolean;
  renderCard?: (card: KanbanCard) => ReactNode;
}

const KanbanColumnComponent = memo(function KanbanColumnComponent({
  column,
  onCardReorder,
  onCardClick,
  onAddCard,
  onDragStart,
  onDragEnd,
  onDrop,
  isDragOver,
  renderCard,
}: KanbanColumnProps) {
  const { colors } = useTheme();
  const isOverLimit = column.limit && column.cards.length >= column.limit;

  return (
    <motion.div
      className="flex flex-col shrink-0 rounded-xl"
      style={{
        width: 280,
        backgroundColor: isDragOver ? `${colors.coral}10` : colors.cream,
        border: isDragOver ? `2px dashed ${colors.coral}` : `1px solid transparent`,
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      layout
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 rounded-t-xl"
        style={{
          backgroundColor: column.color || colors.coral,
        }}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white text-sm">{column.title}</h3>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              color: "white",
            }}
          >
            {column.cards.length}
            {column.limit && ` / ${column.limit}`}
          </span>
        </div>
        {onAddCard && (
          <motion.button
            onClick={onAddCard}
            disabled={isOverLimit}
            className="p-1 rounded"
            style={{
              opacity: isOverLimit ? 0.5 : 1,
              color: "white",
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <PlusIcon />
          </motion.button>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 overflow-y-auto" style={{ maxHeight: 500 }}>
        <Reorder.Group
          axis="y"
          values={column.cards}
          onReorder={onCardReorder}
          className="flex flex-col gap-2"
        >
          <AnimatePresence>
            {column.cards.map((card) => (
              <Reorder.Item
                key={card.id}
                value={card}
                onDragStart={() => onDragStart(card)}
                onDragEnd={onDragEnd}
                whileDrag={{ scale: 1.02, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                {renderCard ? (
                  renderCard(card)
                ) : (
                  <DefaultKanbanCard card={card} onClick={onCardClick} />
                )}
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      </div>
    </motion.div>
  );
});

interface DefaultKanbanCardProps {
  card: KanbanCard;
  onClick?: (card: KanbanCard) => void;
}

const DefaultKanbanCard = memo(function DefaultKanbanCard({
  card,
  onClick,
}: DefaultKanbanCardProps) {
  const { colors } = useTheme();

  const priorityColors = {
    low: "#22C55E",
    medium: "#F59E0B",
    high: "#EF4444",
  };

  return (
    <motion.div
      onClick={() => onClick?.(card)}
      className="p-3 rounded-lg cursor-pointer"
      style={{
        backgroundColor: colors.warmWhite,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
      whileHover={{ y: -2 }}
    >
      {/* Priority indicator */}
      {card.priority && (
        <div
          className="w-8 h-1 rounded-full mb-2"
          style={{ backgroundColor: priorityColors[card.priority] }}
        />
      )}

      {/* Title */}
      <h4
        className="font-medium text-sm"
        style={{ color: colors.textPrimary }}
      >
        {card.title}
      </h4>

      {/* Description */}
      {card.description && (
        <p
          className="text-xs mt-1 line-clamp-2"
          style={{ color: colors.textMuted }}
        >
          {card.description}
        </p>
      )}

      {/* Tags */}
      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {card.tags.map((tag, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                backgroundColor: colors.cream,
                color: colors.textPrimary,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      {(card.assignee || card.dueDate) && (
        <div
          className="flex items-center justify-between mt-3 pt-2 border-t text-xs"
          style={{ borderColor: colors.cream, color: colors.textMuted }}
        >
          {card.assignee && <span>{card.assignee}</span>}
          {card.dueDate && <span>{card.dueDate}</span>}
        </div>
      )}
    </motion.div>
  );
});

interface SimpleKanbanProps {
  initialColumns: KanbanColumn[];
  onColumnsChange?: (columns: KanbanColumn[]) => void;
  className?: string;
}

/**
 * Simple Kanban with built-in state management
 */
export const SimpleKanban = memo(function SimpleKanban({
  initialColumns,
  onColumnsChange,
  className = "",
}: SimpleKanbanProps) {
  const [columns, setColumns] = useState(initialColumns);

  const handleCardMove = useCallback(
    (cardId: string, fromColumnId: string, toColumnId: string, newIndex: number) => {
      setColumns((prev) => {
        const newColumns = prev.map((col) => ({ ...col, cards: [...col.cards] }));

        const fromCol = newColumns.find((c) => c.id === fromColumnId);
        const toCol = newColumns.find((c) => c.id === toColumnId);

        if (!fromCol || !toCol) return prev;

        const cardIndex = fromCol.cards.findIndex((c) => c.id === cardId);
        if (cardIndex === -1) return prev;

        const [card] = fromCol.cards.splice(cardIndex, 1);
        toCol.cards.splice(newIndex, 0, card);

        onColumnsChange?.(newColumns);
        return newColumns;
      });
    },
    [onColumnsChange]
  );

  const handleCardReorder = useCallback(
    (columnId: string, cards: KanbanCard[]) => {
      setColumns((prev) => {
        const newColumns = prev.map((col) =>
          col.id === columnId ? { ...col, cards } : col
        );
        onColumnsChange?.(newColumns);
        return newColumns;
      });
    },
    [onColumnsChange]
  );

  return (
    <KanbanBoard
      columns={columns}
      onCardMove={handleCardMove}
      onCardReorder={handleCardReorder}
      className={className}
    />
  );
});

// Hook for kanban state management
export function useKanban(initialColumns: KanbanColumn[]) {
  const [columns, setColumns] = useState(initialColumns);

  const addCard = useCallback((columnId: string, card: Omit<KanbanCard, "id">) => {
    const newCard: KanbanCard = {
      ...card,
      id: `card-${Date.now()}`,
    };

    setColumns((prev) =>
      prev.map((col) =>
        col.id === columnId ? { ...col, cards: [...col.cards, newCard] } : col
      )
    );

    return newCard;
  }, []);

  const removeCard = useCallback((columnId: string, cardId: string) => {
    setColumns((prev) =>
      prev.map((col) =>
        col.id === columnId
          ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
          : col
      )
    );
  }, []);

  const updateCard = useCallback(
    (columnId: string, cardId: string, updates: Partial<KanbanCard>) => {
      setColumns((prev) =>
        prev.map((col) =>
          col.id === columnId
            ? {
                ...col,
                cards: col.cards.map((c) =>
                  c.id === cardId ? { ...c, ...updates } : c
                ),
              }
            : col
        )
      );
    },
    []
  );

  const moveCard = useCallback(
    (cardId: string, fromColumnId: string, toColumnId: string, newIndex: number) => {
      setColumns((prev) => {
        const newColumns = prev.map((col) => ({ ...col, cards: [...col.cards] }));

        const fromCol = newColumns.find((c) => c.id === fromColumnId);
        const toCol = newColumns.find((c) => c.id === toColumnId);

        if (!fromCol || !toCol) return prev;

        const cardIndex = fromCol.cards.findIndex((c) => c.id === cardId);
        if (cardIndex === -1) return prev;

        const [card] = fromCol.cards.splice(cardIndex, 1);
        toCol.cards.splice(newIndex, 0, card);

        return newColumns;
      });
    },
    []
  );

  const addColumn = useCallback((column: Omit<KanbanColumn, "cards">) => {
    const newColumn: KanbanColumn = {
      ...column,
      cards: [],
    };
    setColumns((prev) => [...prev, newColumn]);
    return newColumn;
  }, []);

  const removeColumn = useCallback((columnId: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
  }, []);

  return {
    columns,
    setColumns,
    addCard,
    removeCard,
    updateCard,
    moveCard,
    addColumn,
    removeColumn,
  };
}

// Icons
function PlusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export default KanbanBoard;
