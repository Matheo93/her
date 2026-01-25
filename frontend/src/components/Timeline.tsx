"use client";

/**
 * Timeline Components - Sprint 650
 *
 * Activity and event timeline:
 * - Vertical timeline
 * - Horizontal timeline
 * - Activity feed
 * - Milestone tracker
 * - HER-themed styling
 */

import React, { memo, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

type TimelineOrientation = "vertical" | "horizontal";
type TimelineItemStatus = "completed" | "current" | "upcoming" | "error";

interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  time?: string;
  icon?: ReactNode;
  status?: TimelineItemStatus;
  metadata?: Record<string, string>;
}

interface TimelineProps {
  items: TimelineItem[];
  orientation?: TimelineOrientation;
  showConnector?: boolean;
  animate?: boolean;
  className?: string;
}

/**
 * Timeline Component
 */
export const Timeline = memo(function Timeline({
  items,
  orientation = "vertical",
  showConnector = true,
  animate = true,
  className = "",
}: TimelineProps) {
  const { colors } = useTheme();

  if (orientation === "horizontal") {
    return (
      <HorizontalTimeline
        items={items}
        showConnector={showConnector}
        animate={animate}
        className={className}
      />
    );
  }

  return (
    <div className={"relative " + className}>
      {items.map((item, index) => (
        <TimelineEntry
          key={item.id}
          item={item}
          isLast={index === items.length - 1}
          showConnector={showConnector}
          animate={animate}
          index={index}
        />
      ))}
    </div>
  );
});

interface TimelineEntryProps {
  item: TimelineItem;
  isLast: boolean;
  showConnector: boolean;
  animate: boolean;
  index: number;
}

const TimelineEntry = memo(function TimelineEntry({
  item,
  isLast,
  showConnector,
  animate,
  index,
}: TimelineEntryProps) {
  const { colors } = useTheme();

  const statusColors = {
    completed: "#22c55e",
    current: colors.coral,
    upcoming: colors.textMuted,
    error: "#ef4444",
  };

  const status = item.status || "upcoming";
  const dotColor = statusColors[status];

  const content = (
    <div className="flex gap-4 pb-8">
      <div className="relative flex flex-col items-center">
        <motion.div
          className="w-3 h-3 rounded-full z-10 shrink-0"
          style={{ backgroundColor: dotColor }}
          initial={animate ? { scale: 0 } : undefined}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.1 }}
        />
        {!isLast && showConnector && (
          <div
            className="w-0.5 flex-1 mt-2"
            style={{ backgroundColor: colors.cream }}
          />
        )}
      </div>

      <motion.div
        className="flex-1 -mt-1"
        initial={animate ? { opacity: 0, x: -20 } : undefined}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.1 + 0.05 }}
      >
        <div className="flex items-center gap-2">
          {item.icon && (
            <span style={{ color: colors.textMuted }}>{item.icon}</span>
          )}
          <h4 className="font-medium" style={{ color: colors.textPrimary }}>
            {item.title}
          </h4>
        </div>
        {item.time && (
          <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
            {item.time}
          </p>
        )}
        {item.description && (
          <p className="text-sm mt-1" style={{ color: colors.textMuted }}>
            {item.description}
          </p>
        )}
        {item.metadata && (
          <div className="flex flex-wrap gap-2 mt-2">
            {Object.entries(item.metadata).map(([key, value]) => (
              <span
                key={key}
                className="px-2 py-0.5 text-xs rounded-full"
                style={{
                  backgroundColor: colors.cream,
                  color: colors.textMuted,
                }}
              >
                {key}: {value}
              </span>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );

  return content;
});

interface HorizontalTimelineProps {
  items: TimelineItem[];
  showConnector: boolean;
  animate: boolean;
  className: string;
}

const HorizontalTimeline = memo(function HorizontalTimeline({
  items,
  showConnector,
  animate,
  className,
}: HorizontalTimelineProps) {
  const { colors } = useTheme();

  const statusColors = {
    completed: "#22c55e",
    current: colors.coral,
    upcoming: colors.textMuted,
    error: "#ef4444",
  };

  return (
    <div className={"flex items-start overflow-x-auto pb-4 " + className}>
      {items.map((item, index) => {
        const status = item.status || "upcoming";
        const dotColor = statusColors[status];

        return (
          <div
            key={item.id}
            className="flex flex-col items-center min-w-[120px] relative"
          >
            <motion.div
              className="flex items-center w-full"
              initial={animate ? { opacity: 0 } : undefined}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.1 }}
            >
              {index > 0 && showConnector && (
                <div
                  className="flex-1 h-0.5"
                  style={{ backgroundColor: colors.cream }}
                />
              )}
              <div
                className="w-4 h-4 rounded-full shrink-0 z-10"
                style={{ backgroundColor: dotColor }}
              />
              {index < items.length - 1 && showConnector && (
                <div
                  className="flex-1 h-0.5"
                  style={{ backgroundColor: colors.cream }}
                />
              )}
            </motion.div>

            <motion.div
              className="mt-3 text-center px-2"
              initial={animate ? { opacity: 0, y: 10 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 + 0.05 }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: colors.textPrimary }}
              >
                {item.title}
              </p>
              {item.time && (
                <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
                  {item.time}
                </p>
              )}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
});

interface ActivityItem {
  id: string;
  user?: {
    name: string;
    avatar?: string;
  };
  action: string;
  target?: string;
  time: string;
  icon?: ReactNode;
}

interface ActivityFeedProps {
  activities: ActivityItem[];
  showAvatar?: boolean;
  animate?: boolean;
  className?: string;
}

/**
 * Activity Feed
 */
export const ActivityFeed = memo(function ActivityFeed({
  activities,
  showAvatar = true,
  animate = true,
  className = "",
}: ActivityFeedProps) {
  const { colors } = useTheme();

  return (
    <div className={className}>
      {activities.map((activity, index) => (
        <motion.div
          key={activity.id}
          className="flex items-start gap-3 py-3 border-b last:border-b-0"
          style={{ borderColor: colors.cream }}
          initial={animate ? { opacity: 0, y: 10 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          {showAvatar && activity.user && (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
              style={{
                backgroundColor: colors.coral,
                color: colors.warmWhite,
              }}
            >
              {activity.user.name.charAt(0).toUpperCase()}
            </div>
          )}
          {activity.icon && !showAvatar && (
            <span
              className="w-8 h-8 flex items-center justify-center"
              style={{ color: colors.textMuted }}
            >
              {activity.icon}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              {activity.user && (
                <span className="font-medium" style={{ color: colors.textPrimary }}>
                  {activity.user.name}
                </span>
              )}
              <span style={{ color: colors.textMuted }}> {activity.action}</span>
              {activity.target && (
                <span className="font-medium" style={{ color: colors.textPrimary }}>
                  {" "}
                  {activity.target}
                </span>
              )}
            </p>
            <p className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
              {activity.time}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
});

interface Milestone {
  id: string;
  title: string;
  description?: string;
  progress: number;
  target?: number;
  unit?: string;
}

interface MilestoneTrackerProps {
  milestones: Milestone[];
  className?: string;
}

/**
 * Milestone Tracker
 */
export const MilestoneTracker = memo(function MilestoneTracker({
  milestones,
  className = "",
}: MilestoneTrackerProps) {
  const { colors } = useTheme();

  return (
    <div className={"space-y-4 " + className}>
      {milestones.map((milestone) => {
        const target = milestone.target || 100;
        const percentage = Math.min(100, (milestone.progress / target) * 100);
        const isComplete = percentage >= 100;

        return (
          <div key={milestone.id}>
            <div className="flex justify-between items-center mb-1">
              <h4
                className="font-medium text-sm"
                style={{ color: colors.textPrimary }}
              >
                {milestone.title}
              </h4>
              <span
                className="text-sm"
                style={{ color: isComplete ? "#22c55e" : colors.textMuted }}
              >
                {milestone.progress}
                {milestone.unit || ""} / {target}
                {milestone.unit || ""}
              </span>
            </div>
            {milestone.description && (
              <p
                className="text-xs mb-2"
                style={{ color: colors.textMuted }}
              >
                {milestone.description}
              </p>
            )}
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: colors.cream }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  backgroundColor: isComplete ? "#22c55e" : colors.coral,
                }}
                initial={{ width: 0 }}
                animate={{ width: percentage + "%" }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});

interface EventTimelineItem {
  id: string;
  title: string;
  date: string;
  type?: "event" | "milestone" | "deadline" | "note";
  content?: ReactNode;
}

interface EventTimelineProps {
  events: EventTimelineItem[];
  className?: string;
}

/**
 * Event Timeline with cards
 */
export const EventTimeline = memo(function EventTimeline({
  events,
  className = "",
}: EventTimelineProps) {
  const { colors } = useTheme();

  const typeColors = {
    event: colors.coral,
    milestone: "#22c55e",
    deadline: "#ef4444",
    note: "#3b82f6",
  };

  return (
    <div className={"relative " + className}>
      <div
        className="absolute left-4 top-0 bottom-0 w-0.5"
        style={{ backgroundColor: colors.cream }}
      />

      {events.map((event, index) => {
        const eventType = event.type || "event";
        const dotColor = typeColors[eventType];

        return (
          <motion.div
            key={event.id}
            className="relative flex gap-4 pb-6 last:pb-0"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center z-10 shrink-0"
              style={{ backgroundColor: dotColor }}
            >
              <span className="text-white text-xs font-bold">
                {index + 1}
              </span>
            </div>

            <div
              className="flex-1 rounded-lg p-4"
              style={{
                backgroundColor: colors.warmWhite,
                border: "1px solid " + colors.cream,
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <h4
                  className="font-medium"
                  style={{ color: colors.textPrimary }}
                >
                  {event.title}
                </h4>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: dotColor + "20",
                    color: dotColor,
                  }}
                >
                  {event.date}
                </span>
              </div>
              {event.content && (
                <div style={{ color: colors.textMuted }}>
                  {event.content}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
});

export default Timeline;
