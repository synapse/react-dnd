import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import type { DragDirection, ReorderResult, ItemMoveResult } from "../types";
import "../components/Draggable.css";

// ============================================================================
// TYPES
// ============================================================================

interface ContainerConfig {
  id: string;
  acceptsTypes: string[];
  direction?: DragDirection;
  element: HTMLElement;
  onReorder?: (result: ReorderResult) => void;
  onItemMove?: (result: ItemMoveResult) => void;
}

interface DragState {
  isDragging: boolean;
  draggedId: string | null;
  draggedType: string | null;
  sourceContainerId: string | null;
}

interface DragData {
  id: string;
  type: string;
  sourceContainerId: string;
  sourceIndex: number;
  element: HTMLElement;
  rect: DOMRect;
  content: React.ReactNode;
  offsetX: number;
  offsetY: number;
  clientX: number;
  clientY: number;
}

interface DropTarget {
  containerId: string;
  index: number;
}

interface DragDropContextValue {
  dragState: DragState;
  startDrag: (
    id: string,
    type: string,
    containerId: string,
    e: React.MouseEvent,
    element: HTMLElement,
    content: React.ReactNode,
    placeholderTag?: keyof HTMLElementTagNameMap
  ) => void;
  registerContainer: (
    id: string,
    acceptsTypes: string[],
    direction: DragDirection | undefined,
    element: HTMLElement | null,
    onReorder?: (result: ReorderResult) => void,
    onItemMove?: (result: ItemMoveResult) => void
  ) => void;
  unregisterContainer: (id: string) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCROLL_THRESHOLD = 60; // Distance from edge to trigger scroll
const SCROLL_SPEED = 12; // Pixels per frame
const PLACEHOLDER_CLASS = "dnd-placeholder";

// ============================================================================
// CONTEXT
// ============================================================================

const DragDropContext = createContext<DragDropContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  // State
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedId: null,
    draggedType: null,
    sourceContainerId: null,
  });
  const [dragData, setDragData] = useState<DragData | null>(null);

  // Refs
  const containersRef = useRef<Map<string, ContainerConfig>>(new Map());
  const placeholderRef = useRef<HTMLElement | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const scrollAnimationRef = useRef<number | null>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });

  // ============================================================================
  // PLACEHOLDER MANAGEMENT
  // ============================================================================

  /**
   * Creates the placeholder element with styles matching the dragged element.
   * Base styles come from CSS (.dnd-placeholder), only dynamic dimensions set here.
   */
  const createPlaceholder = useCallback(
    (rect: DOMRect, element: HTMLElement, tagName: keyof HTMLElementTagNameMap = "div") => {
      const placeholder = document.createElement(tagName);
      placeholder.className = PLACEHOLDER_CLASS;

      const computedStyle = window.getComputedStyle(element);

      // Only set dynamic properties - base styles are in Draggable.css
      placeholder.style.width = `${rect.width}px`;
      placeholder.style.height = `${rect.height}px`;
      placeholder.style.margin = computedStyle.margin;

      return placeholder;
    },
    []
  );

  /**
   * Removes placeholder from DOM
   */
  const removePlaceholder = useCallback(() => {
    if (placeholderRef.current) {
      placeholderRef.current.remove();
      placeholderRef.current = null;
    }
  }, []);

  /**
   * Inserts placeholder at specified position in container
   */
  const insertPlaceholder = useCallback(
    (container: HTMLElement, index: number, draggables: HTMLElement[]) => {
      if (!placeholderRef.current) return;

      const placeholder = placeholderRef.current;

      // Remove from current position if needed
      if (placeholder.parentElement) {
        placeholder.remove();
      }

      // Insert at correct position
      if (index >= draggables.length) {
        container.appendChild(placeholder);
      } else {
        container.insertBefore(placeholder, draggables[index]);
      }
    },
    []
  );

  // ============================================================================
  // CONTAINER REGISTRATION
  // ============================================================================

  const registerContainer = useCallback(
    (
      id: string,
      acceptsTypes: string[],
      direction: DragDirection | undefined,
      element: HTMLElement | null,
      onReorder?: (result: ReorderResult) => void,
      onItemMove?: (result: ItemMoveResult) => void
    ) => {
      if (!element) return;

      containersRef.current.set(id, {
        id,
        acceptsTypes,
        direction,
        element,
        onReorder,
        onItemMove,
      });
    },
    []
  );

  const unregisterContainer = useCallback((id: string) => {
    containersRef.current.delete(id);
  }, []);

  // ============================================================================
  // DROP TARGET CALCULATION
  // ============================================================================

  /**
   * Finds the container under the cursor that accepts the dragged type
   */
  const findTargetContainer = useCallback(
    (clientX: number, clientY: number, draggedType: string): ContainerConfig | null => {
      const elementsUnderCursor = document.elementsFromPoint(clientX, clientY);

      for (const el of elementsUnderCursor) {
        const containerEl = (el as HTMLElement).closest("[data-container-id]");
        if (containerEl) {
          const containerId = containerEl.getAttribute("data-container-id");
          if (containerId) {
            const config = containersRef.current.get(containerId);
            if (config && config.acceptsTypes.includes(draggedType)) {
              return config;
            }
          }
        }
      }

      return null;
    },
    []
  );

  /**
   * Gets all draggable children of a container (excluding the placeholder and dragged element)
   */
  const getDraggableChildren = useCallback(
    (container: HTMLElement, draggedId: string | null): HTMLElement[] => {
      return Array.from(
        container.querySelectorAll(`:scope > [data-id]:not(.${PLACEHOLDER_CLASS})`)
      ).filter((el) => {
        const id = el.getAttribute("data-id");
        return id !== draggedId;
      }) as HTMLElement[];
    },
    []
  );

  /**
   * Calculates the drop index based on cursor position and 50% threshold
   */
  const calculateDropIndex = useCallback(
    (
      clientX: number,
      clientY: number,
      container: ContainerConfig,
      draggables: HTMLElement[]
    ): number => {
      const isHorizontal = container.direction === "horizontal";

      for (let i = 0; i < draggables.length; i++) {
        const rect = draggables[i].getBoundingClientRect();

        if (isHorizontal) {
          // For horizontal: use X position and check 50% threshold
          const midpoint = rect.left + rect.width / 2;
          if (clientX < midpoint) {
            return i;
          }
        } else {
          // For vertical: use Y position and check 50% threshold
          const midpoint = rect.top + rect.height / 2;
          if (clientY < midpoint) {
            return i;
          }
        }
      }

      // If we're past all elements, drop at the end
      return draggables.length;
    },
    []
  );

  /**
   * Updates the drop target and placeholder position
   */
  const updateDropTarget = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragData) return;

      const targetContainer = findTargetContainer(clientX, clientY, dragData.type);

      if (!targetContainer) {
        // No valid container under cursor - remove placeholder
        removePlaceholder();
        dropTargetRef.current = null;
        return;
      }

      // Get draggable children (excluding the dragged element)
      const draggables = getDraggableChildren(targetContainer.element, dragData.id);

      // Calculate drop index based on 50% threshold
      const dropIndex = calculateDropIndex(clientX, clientY, targetContainer, draggables);

      // Check if target changed
      const currentTarget = dropTargetRef.current;
      const targetChanged =
        !currentTarget ||
        currentTarget.containerId !== targetContainer.id ||
        currentTarget.index !== dropIndex;

      if (targetChanged) {
        // Update drop target
        dropTargetRef.current = {
          containerId: targetContainer.id,
          index: dropIndex,
        };

        // Create placeholder if it doesn't exist
        if (!placeholderRef.current) {
          placeholderRef.current = createPlaceholder(dragData.rect, dragData.element);
        }

        // Insert placeholder at new position
        insertPlaceholder(targetContainer.element, dropIndex, draggables);
      }
    },
    [
      dragData,
      findTargetContainer,
      getDraggableChildren,
      calculateDropIndex,
      removePlaceholder,
      createPlaceholder,
      insertPlaceholder,
    ]
  );

  // ============================================================================
  // AUTO-SCROLL
  // ============================================================================

  /**
   * Finds scrollable containers under the cursor and scrolls them
   */
  const performAutoScroll = useCallback(() => {
    const { x, y } = mousePositionRef.current;
    const elementsUnderCursor = document.elementsFromPoint(x, y);
    let didScroll = false;

    for (const el of elementsUnderCursor) {
      if (!(el instanceof HTMLElement)) continue;

      const style = window.getComputedStyle(el);
      const isScrollable = /(auto|scroll)/.test(
        style.overflow + style.overflowY + style.overflowX
      );

      if (!isScrollable) continue;

      const rect = el.getBoundingClientRect();
      const canScrollUp = el.scrollTop > 0;
      const canScrollDown = el.scrollTop < el.scrollHeight - el.clientHeight;

      // Check vertical edges
      if (y < rect.top + SCROLL_THRESHOLD && canScrollUp) {
        // Near top edge - scroll up
        el.scrollTop -= SCROLL_SPEED;
        didScroll = true;
      } else if (y > rect.bottom - SCROLL_THRESHOLD && canScrollDown) {
        // Near bottom edge - scroll down
        el.scrollTop += SCROLL_SPEED;
        didScroll = true;
      }

      // Only scroll one container at a time
      if (didScroll) break;
    }

    // Update placeholder position after scroll
    if (didScroll) {
      updateDropTarget(x, y);
    }

    return didScroll;
  }, [updateDropTarget]);

  /**
   * Auto-scroll animation loop
   */
  const startAutoScrollLoop = useCallback(() => {
    const loop = () => {
      if (!dragState.isDragging) return;

      performAutoScroll();
      scrollAnimationRef.current = requestAnimationFrame(loop);
    };

    scrollAnimationRef.current = requestAnimationFrame(loop);
  }, [dragState.isDragging, performAutoScroll]);

  const stopAutoScrollLoop = useCallback(() => {
    if (scrollAnimationRef.current) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
  }, []);

  // ============================================================================
  // DRAG LIFECYCLE
  // ============================================================================

  /**
   * Starts the drag operation
   */
  const startDrag = useCallback(
    (
      id: string,
      type: string,
      containerId: string,
      e: React.MouseEvent,
      element: HTMLElement,
      content: React.ReactNode,
      placeholderTag: keyof HTMLElementTagNameMap = "div"
    ) => {
      const rect = element.getBoundingClientRect();
      const container = containersRef.current.get(containerId);

      // Calculate source index
      let sourceIndex = 0;
      if (container) {
        const siblings = getDraggableChildren(container.element, null);
        sourceIndex = siblings.findIndex((el) => el.getAttribute("data-id") === id);
      }

      // Create drag data
      const newDragData: DragData = {
        id,
        type,
        sourceContainerId: containerId,
        sourceIndex,
        element,
        rect,
        content,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        clientX: e.clientX,
        clientY: e.clientY,
      };

      // Update state
      setDragData(newDragData);
      setDragState({
        isDragging: true,
        draggedId: id,
        draggedType: type,
        sourceContainerId: containerId,
      });

      // Initialize mouse position
      mousePositionRef.current = { x: e.clientX, y: e.clientY };

      // Create and position placeholder immediately (before hiding the element)
      const placeholder = createPlaceholder(rect, element, placeholderTag);
      placeholderRef.current = placeholder;

      // Insert placeholder at current position
      if (container) {
        const draggables = getDraggableChildren(container.element, id);
        insertPlaceholder(container.element, sourceIndex, draggables);
      }

      // Hide original element completely from layout (after placeholder is in place)
      element.style.display = "none";

      // Set initial drop target
      dropTargetRef.current = {
        containerId,
        index: sourceIndex,
      };
    },
    [getDraggableChildren, createPlaceholder, insertPlaceholder]
  );

  /**
   * Handles mouse move during drag
   */
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };

      // Update drag data position for portal
      setDragData((prev) =>
        prev ? { ...prev, clientX: e.clientX, clientY: e.clientY } : null
      );

      // Update drop target and placeholder
      updateDropTarget(e.clientX, e.clientY);
    },
    [updateDropTarget]
  );

  /**
   * Handles mouse up - finishes the drag operation
   */
  const handleMouseUp = useCallback(() => {
    if (!dragData) return;

    const dropTarget = dropTargetRef.current;
    const targetContainer = dropTarget
      ? containersRef.current.get(dropTarget.containerId)
      : null;

    // Calculate final indices and trigger callbacks
    if (dropTarget && targetContainer) {
      if (dropTarget.containerId === dragData.sourceContainerId) {
        // Reorder within same container
        const fromIndex = dragData.sourceIndex;
        let toIndex = dropTarget.index;

        // Adjust toIndex if moving forward (account for the removed item)
        if (toIndex > fromIndex) {
          toIndex--;
        }

        if (fromIndex !== toIndex) {
          targetContainer.onReorder?.({
            itemId: dragData.id,
            fromIndex,
            toIndex,
          });
        }
      } else {
        // Move to different container
        targetContainer.onItemMove?.({
          itemId: dragData.id,
          fromContainerId: dragData.sourceContainerId,
          toContainerId: dropTarget.containerId,
          fromIndex: dragData.sourceIndex,
          toIndex: dropTarget.index,
        });
      }
    }

    // Restore original element visibility
    dragData.element.style.display = "";

    // Cleanup
    removePlaceholder();
    stopAutoScrollLoop();
    dropTargetRef.current = null;

    // Reset state
    setDragState({
      isDragging: false,
      draggedId: null,
      draggedType: null,
      sourceContainerId: null,
    });
    setDragData(null);
  }, [dragData, removePlaceholder, stopAutoScrollLoop]);

  // ============================================================================
  // EFFECT: Event Listeners
  // ============================================================================

  useEffect(() => {
    if (!dragState.isDragging) return;

    // Add event listeners
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);

    // Start auto-scroll loop
    startAutoScrollLoop();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      stopAutoScrollLoop();
    };
  }, [
    dragState.isDragging,
    handleMouseMove,
    handleMouseUp,
    startAutoScrollLoop,
    stopAutoScrollLoop,
  ]);

  // ============================================================================
  // RENDER
  // ============================================================================

  const contextValue: DragDropContextValue = {
    dragState,
    startDrag,
    registerContainer,
    unregisterContainer,
  };

  return (
    <DragDropContext.Provider value={contextValue}>
      {children}

      {/* Dragged element portal */}
      {dragData &&
        createPortal(
          <div
            style={{
              position: "fixed",
              pointerEvents: "none",
              zIndex: 10000,
              left: dragData.clientX - dragData.offsetX,
              top: dragData.clientY - dragData.offsetY,
              width: dragData.rect.width,
              height: dragData.rect.height,
              transform: "rotate(2deg) scale(1.02)",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.25)",
              opacity: 0.95,
              transition: "transform 0.1s ease, box-shadow 0.1s ease",
            }}
          >
            {dragData.content}
          </div>,
          document.body
        )}
    </DragDropContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

export function useDragDrop(): DragDropContextValue {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error("useDragDrop must be used within a DragDropProvider");
  }
  return context;
}
