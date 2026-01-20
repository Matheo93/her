#!/bin/bash
# Environment optimization for Ralph Dual System

# Node.js optimizations
export NODE_OPTIONS="--max-old-space-size=8192"  # 8GB for builds

# Python optimizations
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1

# Git optimizations for large repos
git config --global core.preloadindex true
git config --global core.fscache true
git config --global gc.auto 256

# Claude CLI optimizations (reduce context churn)
export ANTHROPIC_TIMEOUT=120000  # 2 min timeout

echo "Environment optimized for Ralph Dual System"
