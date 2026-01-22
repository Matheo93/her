"use client";

import { Component, ReactNode } from "react";
import { motion } from "framer-motion";
import { HER_COLORS } from "@/styles/her-theme";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <motion.div
          className="flex flex-col items-center justify-center p-6 rounded-2xl"
          style={{ backgroundColor: `${HER_COLORS.cream}90` }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <svg
            className="w-12 h-12 mb-4"
            fill={HER_COLORS.coral}
            viewBox="0 0 24 24"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <p
            className="text-center text-sm font-light mb-4"
            style={{ color: HER_COLORS.earth }}
          >
            Quelque chose s&apos;est mal passé
          </p>
          <motion.button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-full text-sm"
            style={{
              backgroundColor: HER_COLORS.coral,
              color: HER_COLORS.warmWhite,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Réessayer
          </motion.button>
        </motion.div>
      );
    }

    return this.props.children;
  }
}
