"use client";

/**
 * File Upload Components - Sprint 662
 *
 * File upload features:
 * - Drag and drop zone
 * - File preview
 * - Progress tracking
 * - Multiple files
 * - HER-themed styling
 */

import React, { memo, useState, useCallback, useRef, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";

interface FileInfo {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
  preview?: string;
}

interface FileUploadProps {
  onUpload: (files: File[]) => void | Promise<void>;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  showPreview?: boolean;
  className?: string;
}

/**
 * File Upload Zone
 */
export const FileUpload = memo(function FileUpload({
  onUpload,
  accept,
  multiple = false,
  maxSize = 10 * 1024 * 1024,
  maxFiles = 10,
  disabled = false,
  showPreview = true,
  className = "",
}: FileUploadProps) {
  const { colors } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const createPreview = useCallback((file: File): Promise<string | undefined> => {
    return new Promise((resolve) => {
      if (!file.type.startsWith("image/")) {
        resolve(undefined);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(file);
    });
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    if (maxSize && file.size > maxSize) {
      return "File too large (max " + formatBytes(maxSize) + ")";
    }
    if (accept) {
      const acceptedTypes = accept.split(",").map(t => t.trim());
      const fileType = file.type;
      const fileExt = "." + file.name.split(".").pop();
      const isValid = acceptedTypes.some(t => 
        t === fileType || 
        t === fileExt || 
        (t.endsWith("/*") && fileType.startsWith(t.replace("/*", "/")))
      );
      if (!isValid) {
        return "File type not accepted";
      }
    }
    return null;
  }, [accept, maxSize]);

  const handleFiles = useCallback(async (newFiles: FileList | File[]) => {
    setError(null);

    const fileArray = Array.from(newFiles);
    if (!multiple && fileArray.length > 1) {
      setError("Only one file allowed");
      return;
    }

    if (files.length + fileArray.length > maxFiles) {
      setError("Maximum " + maxFiles + " files allowed");
      return;
    }

    const processedFiles: FileInfo[] = [];

    for (const file of fileArray) {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        continue;
      }

      const preview = showPreview ? await createPreview(file) : undefined;

      processedFiles.push({
        id: generateId(),
        file,
        progress: 0,
        status: "pending",
        preview,
      });
    }

    if (processedFiles.length > 0) {
      setFiles(prev => [...prev, ...processedFiles]);
      onUpload(processedFiles.map(f => f.file));
    }
  }, [files.length, maxFiles, multiple, onUpload, validateFile, showPreview, createPreview]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) {
      handleFiles(e.dataTransfer.files);
    }
  }, [disabled, handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className={className}>
      {/* Drop Zone */}
      <motion.div
        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors"
        style={{
          borderColor: isDragging ? colors.coral : colors.cream,
          backgroundColor: isDragging ? colors.coral + "10" : colors.warmWhite,
          opacity: disabled ? 0.5 : 1,
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        whileHover={disabled ? {} : { scale: 1.01 }}
        whileTap={disabled ? {} : { scale: 0.99 }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
          disabled={disabled}
        />

        <UploadIcon color={isDragging ? colors.coral : colors.textMuted} />

        <p className="mt-4 text-sm" style={{ color: colors.textPrimary }}>
          {isDragging ? "Drop files here" : "Drag & drop files or click to browse"}
        </p>
        <p className="mt-1 text-xs" style={{ color: colors.textMuted }}>
          {accept ? "Accepted: " + accept : "All file types accepted"}
          {maxSize && " • Max " + formatBytes(maxSize)}
        </p>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-2 text-sm"
            style={{ color: "#ef4444" }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <AnimatePresence>
            {files.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ backgroundColor: colors.cream }}
              >
                {/* Preview or icon */}
                {file.preview ? (
                  <img
                    src={file.preview}
                    alt={file.file.name}
                    className="w-10 h-10 object-cover rounded"
                  />
                ) : (
                  <FileIcon color={colors.coral} />
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: colors.textPrimary }}
                  >
                    {file.file.name}
                  </p>
                  <p className="text-xs" style={{ color: colors.textMuted }}>
                    {formatBytes(file.file.size)}
                  </p>
                </div>

                {/* Remove button */}
                <motion.button
                  onClick={() => removeFile(file.id)}
                  className="p-1 rounded-full hover:bg-opacity-50"
                  style={{ color: colors.textMuted }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <CloseIcon />
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
});

interface FileDropZoneProps {
  onDrop: (files: File[]) => void;
  children: ReactNode;
  accept?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Minimal Drop Zone wrapper
 */
export const FileDropZone = memo(function FileDropZone({
  onDrop,
  children,
  accept,
  disabled = false,
  className = "",
}: FileDropZoneProps) {
  const { colors } = useTheme();
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled) {
      onDrop(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div
      className={"relative " + className}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); !disabled && setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
    >
      {children}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center rounded-lg"
            style={{
              backgroundColor: colors.coral + "20",
              border: "2px dashed " + colors.coral,
            }}
          >
            <p className="font-medium" style={{ color: colors.coral }}>
              Drop files here
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface UploadProgressProps {
  progress: number;
  fileName?: string;
  onCancel?: () => void;
  className?: string;
}

/**
 * Upload Progress Display
 */
export const UploadProgress = memo(function UploadProgress({
  progress,
  fileName,
  onCancel,
  className = "",
}: UploadProgressProps) {
  const { colors } = useTheme();

  return (
    <div className={"p-4 rounded-lg " + className} style={{ backgroundColor: colors.cream }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>
          {fileName || "Uploading..."}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: colors.coral }}>
            {progress}%
          </span>
          {onCancel && (
            <motion.button
              onClick={onCancel}
              className="p-1 rounded-full"
              style={{ color: colors.textMuted }}
              whileHover={{ scale: 1.1 }}
            >
              <CloseIcon />
            </motion.button>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: colors.warmWhite }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: colors.coral }}
          initial={{ width: 0 }}
          animate={{ width: progress + "%" }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
});

// Helper functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// Icons
function UploadIcon({ color }: { color: string }) {
  return (
    <svg className="w-12 h-12 mx-auto" fill="none" stroke={color} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  );
}

function FileIcon({ color }: { color: string }) {
  return (
    <svg className="w-10 h-10" fill="none" stroke={color} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default FileUpload;
