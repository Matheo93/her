"use client";

/**
 * usePortal - React Portal Management
 *
 * Creates and manages portal containers for rendering
 * content outside the normal React tree hierarchy.
 *
 * Sprint 226: Mobile UX improvements
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

interface UsePortalOptions {
  // ID for the portal container
  id?: string;

  // Custom container element (default: document.body)
  container?: Element | null;

  // Whether to create the portal immediately
  eager?: boolean;
}

interface UsePortalResult {
  // The portal container element
  portalNode: HTMLElement | null;

  // Function to render content into the portal
  Portal: ({ children }: { children: ReactNode }) => React.ReactPortal | null;

  // Whether the portal is ready
  isReady: boolean;

  // Manually mount the portal
  mount: () => void;

  // Manually unmount the portal
  unmount: () => void;
}

/**
 * Hook to create and manage a portal
 */
export function usePortal(options: UsePortalOptions = {}): UsePortalResult {
  const {
    id = `portal-${Math.random().toString(36).substr(2, 9)}`,
    container = null,
    eager = true,
  } = options;

  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const portalIdRef = useRef(id);

  // Create portal element
  const mount = useCallback(() => {
    if (typeof document === "undefined") return;

    // Check if portal already exists
    let element = document.getElementById(portalIdRef.current);

    if (!element) {
      element = document.createElement("div");
      element.id = portalIdRef.current;
      element.setAttribute("data-portal", "true");

      const containerElement = container ?? document.body;
      containerElement.appendChild(element);
    }

    setPortalNode(element);
  }, [container]);

  // Remove portal element
  const unmount = useCallback(() => {
    if (typeof document === "undefined") return;

    const element = document.getElementById(portalIdRef.current);
    if (element) {
      element.parentElement?.removeChild(element);
    }

    setPortalNode(null);
  }, []);

  // Mount on initial render if eager
  useEffect(() => {
    if (eager) {
      mount();
    }

    return () => {
      unmount();
    };
  }, [eager, mount, unmount]);

  // Portal component
  const Portal = useCallback(
    ({ children }: { children: ReactNode }) => {
      if (!portalNode) return null;
      return createPortal(children, portalNode);
    },
    [portalNode]
  );

  return {
    portalNode,
    Portal,
    isReady: !!portalNode,
    mount,
    unmount,
  };
}

/**
 * Hook to render content at a specific z-index layer
 */
export function useLayer(
  layer: "base" | "dropdown" | "modal" | "toast" | "tooltip" = "modal"
): UsePortalResult {
  const zIndexMap = {
    base: 0,
    dropdown: 10,
    modal: 40,
    toast: 50,
    tooltip: 60,
  };

  const result = usePortal({ id: `layer-${layer}` });

  // Apply z-index to portal node
  useEffect(() => {
    if (result.portalNode) {
      result.portalNode.style.position = "relative";
      result.portalNode.style.zIndex = String(zIndexMap[layer]);
    }
  }, [result.portalNode, layer]);

  return result;
}

/**
 * Hook to render content in a specific DOM container
 */
export function useContainerPortal(
  containerRef: React.RefObject<HTMLElement | null>
): UsePortalResult {
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const portalRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create portal element
    const element = document.createElement("div");
    element.setAttribute("data-portal", "true");
    container.appendChild(element);
    portalRef.current = element;
    setPortalNode(element);

    return () => {
      if (portalRef.current && container.contains(portalRef.current)) {
        container.removeChild(portalRef.current);
      }
      setPortalNode(null);
    };
  }, [containerRef]);

  const Portal = useCallback(
    ({ children }: { children: ReactNode }) => {
      if (!portalNode) return null;
      return createPortal(children, portalNode);
    },
    [portalNode]
  );

  return {
    portalNode,
    Portal,
    isReady: !!portalNode,
    mount: () => {},
    unmount: () => {},
  };
}

/**
 * Simple portal component for direct use
 */
export function Portal({
  children,
  containerId,
}: {
  children: ReactNode;
  containerId?: string;
}): React.ReactPortal | null {
  const { portalNode } = usePortal({ id: containerId });
  if (!portalNode) return null;
  return createPortal(children, portalNode);
}
