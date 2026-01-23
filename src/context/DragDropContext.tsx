import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DragDirection } from '../types';

interface DragState {
  isDragging: boolean;
  draggedId: string | null;
  draggedType: string | null;
  sourceContainerId: string | null;
}

interface ContainerData {
  id: string;
  direction?: DragDirection;
  acceptsTypes: string[];
  items: string[];
  onReorder: (items: string[]) => void;
  onItemMove?: (itemId: string, fromContainerId: string, toContainerId: string, atIndex: number) => void;
  element: HTMLElement | null;
}

interface DragDropContextValue {
  dragState: DragState;
  startDrag: (
    id: string, 
    type: string, 
    containerId: string,
    e: React.MouseEvent, 
    element: HTMLElement, 
    content: React.ReactNode
  ) => void;
  registerContainer: (
    id: string,
    acceptsTypes: string[],
    direction: DragDirection | undefined, 
    items: string[], 
    onReorder: (items: string[]) => void,
    element: HTMLElement | null,
    onItemMove?: (itemId: string, fromContainerId: string, toContainerId: string, atIndex: number) => void
  ) => void;
  unregisterContainer: (id: string) => void;
}

const initialDragState: DragState = {
  isDragging: false,
  draggedId: null,
  draggedType: null,
  sourceContainerId: null,
};

const DragDropContext = createContext<DragDropContextValue | null>(null);

const SCROLL_THRESHOLD = 60;
const SCROLL_SPEED = 15;

function DragPortal({ 
  children, 
  initialRect,
  onPositionChange,
  containers,
  draggedType,
}: { 
  children: React.ReactNode;
  initialRect: DOMRect;
  onPositionChange: (x: number, y: number, targetContainerId: string | null) => void;
  containers: React.MutableRefObject<Map<string, ContainerData>>;
  draggedType: string;
}) {
  const startMouseRef = useRef<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState({ x: initialRect.left, y: initialRect.top });
  const scrollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!startMouseRef.current) {
        startMouseRef.current = { x: e.clientX, y: e.clientY };
      }

      const deltaX = e.clientX - startMouseRef.current.x;
      const deltaY = e.clientY - startMouseRef.current.y;

      // Always allow free movement for the visual drag
      // Direction constraints only apply to reordering logic, not visual movement
      const newX = initialRect.left + deltaX;
      const newY = initialRect.top + deltaY;

      setPosition({ x: newX, y: newY });

      const centerX = newX + initialRect.width / 2;
      const centerY = newY + initialRect.height / 2;
      
      let targetContainerId: string | null = null;
      let smallestArea = Infinity;
      
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      
      // Find the smallest (most specific) container that accepts this type
      for (const [id, container] of containers.current.entries()) {
        if (!container.element || !container.acceptsTypes.includes(draggedType)) continue;
        
        const rect = container.element.getBoundingClientRect();
        const area = rect.width * rect.height;
        
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom &&
          area < smallestArea
        ) {
          smallestArea = area;
          targetContainerId = id;
          
          // Auto-scroll using the container element directly
          const scrollEl = container.element;
          
          // Auto-scroll for vertical containers
          if (container.direction === 'vertical' || !container.direction) {
            if (e.clientY < rect.top + SCROLL_THRESHOLD && scrollEl.scrollTop > 0) {
              scrollIntervalRef.current = window.setInterval(() => {
                scrollEl.scrollTop -= SCROLL_SPEED;
              }, 16);
            } else if (e.clientY > rect.bottom - SCROLL_THRESHOLD && 
                       scrollEl.scrollTop < scrollEl.scrollHeight - scrollEl.clientHeight) {
              scrollIntervalRef.current = window.setInterval(() => {
                scrollEl.scrollTop += SCROLL_SPEED;
              }, 16);
            }
          }
          
          // Auto-scroll for horizontal containers
          if (container.direction === 'horizontal') {
            if (e.clientX < rect.left + SCROLL_THRESHOLD && scrollEl.scrollLeft > 0) {
              scrollIntervalRef.current = window.setInterval(() => {
                scrollEl.scrollLeft -= SCROLL_SPEED;
              }, 16);
            } else if (e.clientX > rect.right - SCROLL_THRESHOLD && 
                       scrollEl.scrollLeft < scrollEl.scrollWidth - scrollEl.clientWidth) {
              scrollIntervalRef.current = window.setInterval(() => {
                scrollEl.scrollLeft += SCROLL_SPEED;
              }, 16);
            }
          }
        }
      }
      
      onPositionChange(centerX, centerY, targetContainerId);
    };

    const handleMouseUp = () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
    };
  }, [initialRect, onPositionChange, containers, draggedType]);

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: initialRect.width,
        zIndex: 10000,
        pointerEvents: 'none',
        cursor: 'grabbing',
      }}
    >
      {children}
    </div>,
    document.body
  );
}

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const [portalContent, setPortalContent] = useState<React.ReactNode | null>(null);
  const [portalRect, setPortalRect] = useState<DOMRect | null>(null);
  
  const containers = useRef<Map<string, ContainerData>>(new Map());
  const itemRects = useRef<Map<string, DOMRect>>(new Map());
  const dragDataRef = useRef<{ id: string; type: string; currentContainerId: string } | null>(null);
  const lastReorderTime = useRef<number>(0);

  const registerContainer = useCallback(
    (
      id: string,
      acceptsTypes: string[],
      direction: DragDirection | undefined, 
      items: string[], 
      onReorder: (items: string[]) => void,
      element: HTMLElement | null,
      onItemMove?: (itemId: string, fromContainerId: string, toContainerId: string, atIndex: number) => void
    ) => {
      containers.current.set(id, { id, acceptsTypes, direction, items, onReorder, element, onItemMove });
    },
    []
  );

  const unregisterContainer = useCallback((id: string) => {
    containers.current.delete(id);
  }, []);

  const updateItemRects = useCallback((containerId: string) => {
    const container = containers.current.get(containerId);
    if (!container) return;
    
    container.items.forEach((itemId) => {
      const itemEl = document.querySelector(`[data-id="${itemId}"]`);
      if (itemEl) {
        itemRects.current.set(itemId, itemEl.getBoundingClientRect());
      }
    });
  }, []);

  const findInsertionIndex = useCallback((
    centerX: number,
    centerY: number,
    items: string[],
    draggedId: string,
    direction?: DragDirection
  ): number => {
    const filteredItems = items.filter(id => id !== draggedId);
    
    if (filteredItems.length === 0) return 0;
    
    for (let i = 0; i < filteredItems.length; i++) {
      const rect = itemRects.current.get(filteredItems[i]);
      if (!rect) continue;
      
      const itemCenterY = rect.top + rect.height / 2;
      const itemCenterX = rect.left + rect.width / 2;
      
      if (direction === 'horizontal') {
        if (centerX < itemCenterX) return i;
      } else if (direction === 'vertical') {
        if (centerY < itemCenterY) return i;
      } else {
        if (centerY < rect.top) return i;
        if (centerY < rect.bottom && centerX < itemCenterX) return i;
      }
    }
    
    return filteredItems.length;
  }, []);

  // FLIP animation helper - captures positions before DOM change and animates after
  const animateReorder = useCallback((containerId: string, draggedId: string) => {
    const container = containers.current.get(containerId);
    if (!container) return;

    // Capture "First" positions before the DOM updates
    const firstPositions = new Map<string, DOMRect>();
    container.items.forEach((itemId) => {
      if (itemId === draggedId) return; // Skip the dragged item
      const el = document.querySelector(`[data-id="${itemId}"]`) as HTMLElement;
      if (el) {
        firstPositions.set(itemId, el.getBoundingClientRect());
      }
    });

    // Return function to be called after state update
    return () => {
      requestAnimationFrame(() => {
        container.items.forEach((itemId) => {
          if (itemId === draggedId) return;
          const el = document.querySelector(`[data-id="${itemId}"]`) as HTMLElement;
          if (!el) return;

          const first = firstPositions.get(itemId);
          if (!first) return;

          // "Last" position after DOM change
          const last = el.getBoundingClientRect();

          // "Invert" - calculate the difference
          const deltaX = first.left - last.left;
          const deltaY = first.top - last.top;

          if (deltaX === 0 && deltaY === 0) return;

          // Apply inverse transform immediately (no transition)
          el.style.transition = 'none';
          el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

          // Force reflow
          el.offsetHeight;

          // "Play" - animate back to final position
          el.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
          el.style.transform = '';

          // Clean up after animation
          const cleanup = () => {
            el.style.transition = '';
            el.style.transform = '';
            el.removeEventListener('transitionend', cleanup);
          };
          el.addEventListener('transitionend', cleanup);
        });
      });
    };
  }, []);

  const handleReorder = useCallback((centerX: number, centerY: number, targetContainerId: string | null) => {
    const dragData = dragDataRef.current;
    if (!dragData || !targetContainerId) return;

    const now = Date.now();
    if (now - lastReorderTime.current < 100) return;

    const targetContainer = containers.current.get(targetContainerId);
    if (!targetContainer) return;

    // Update rects for target container
    updateItemRects(targetContainerId);

    const isMovingToNewContainer = targetContainerId !== dragData.currentContainerId;
    const currentIndex = targetContainer.items.indexOf(dragData.id);
    
    const insertIndex = findInsertionIndex(
      centerX,
      centerY,
      targetContainer.items,
      dragData.id,
      targetContainer.direction
    );

    // Cross-container move
    if (isMovingToNewContainer) {
      lastReorderTime.current = now;
      
      // Capture positions before move for both containers
      const sourceContainer = containers.current.get(dragData.currentContainerId);
      const animateSource = sourceContainer ? animateReorder(dragData.currentContainerId, dragData.id) : null;
      const animateTarget = animateReorder(targetContainerId, dragData.id);
      
      if (targetContainer.onItemMove) {
        targetContainer.onItemMove(dragData.id, dragData.currentContainerId, targetContainerId, insertIndex);
      }
      
      dragData.currentContainerId = targetContainerId;
      
      // Run FLIP animations after state update
      requestAnimationFrame(() => {
        animateSource?.();
        animateTarget?.();
        updateItemRects(targetContainerId);
      });
      
      return;
    }

    // Same container reorder
    if (currentIndex !== -1 && insertIndex !== currentIndex) {
      lastReorderTime.current = now;
      
      // Capture positions before reorder (FLIP - First)
      const playAnimation = animateReorder(targetContainerId, dragData.id);
      
      const newItems = [...targetContainer.items];
      newItems.splice(currentIndex, 1);
      newItems.splice(insertIndex, 0, dragData.id);
      targetContainer.onReorder(newItems);

      // Run FLIP animation after state update (Last, Invert, Play)
      requestAnimationFrame(() => {
        playAnimation?.();
        updateItemRects(targetContainerId);
      });
    }
  }, [findInsertionIndex, updateItemRects, animateReorder]);

  const handleMouseUp = useCallback(() => {
    setDragState(initialDragState);
    setPortalContent(null);
    setPortalRect(null);
    dragDataRef.current = null;
    itemRects.current.clear();
    lastReorderTime.current = 0;
    document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const startDrag = useCallback((
    id: string, 
    type: string,
    containerId: string,
    e: React.MouseEvent, 
    element: HTMLElement,
    content: React.ReactNode
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    const rect = element.getBoundingClientRect();
    
    // Store item rects for the source container
    const container = containers.current.get(containerId);
    if (container) {
      container.items.forEach((itemId) => {
        const itemEl = document.querySelector(`[data-id="${itemId}"]`);
        if (itemEl) {
          itemRects.current.set(itemId, itemEl.getBoundingClientRect());
        }
      });
    }

    dragDataRef.current = { id, type, currentContainerId: containerId };
    
    setDragState({
      isDragging: true,
      draggedId: id,
      draggedType: type,
      sourceContainerId: containerId,
    });
    
    setPortalRect(rect);
    setPortalContent(content);
    
    document.addEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  return (
    <DragDropContext.Provider
      value={{
        dragState,
        startDrag,
        registerContainer,
        unregisterContainer,
      }}
    >
      {children}
      {dragState.isDragging && portalContent && portalRect && dragState.draggedType && (
        <DragPortal 
          initialRect={portalRect}
          onPositionChange={handleReorder}
          containers={containers}
          draggedType={dragState.draggedType}
        >
          {portalContent}
        </DragPortal>
      )}
    </DragDropContext.Provider>
  );
}

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within a DragDropProvider');
  }
  return context;
}
