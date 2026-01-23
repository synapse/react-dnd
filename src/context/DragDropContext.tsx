import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DragDirection, ReorderResult, ItemMoveResult } from '../types';

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
  element: HTMLElement | null;
  onReorder?: (result: ReorderResult) => void;
  onItemMove?: (result: ItemMoveResult) => void;
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
    element: HTMLElement | null,
    onReorder?: (result: ReorderResult) => void,
    onItemMove?: (result: ItemMoveResult) => void
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

// Store original item data at drag start
interface OriginalItemData {
  id: string;
  index: number;
  rect: DOMRect;
  element: HTMLElement;
}

export function DragDropProvider({ children }: { children: React.ReactNode }) {
  const [dragState, setDragState] = useState<DragState>(initialDragState);
  const [portalContent, setPortalContent] = useState<React.ReactNode | null>(null);
  const [portalRect, setPortalRect] = useState<DOMRect | null>(null);
  
  const containers = useRef<Map<string, ContainerData>>(new Map());
  
  // Drag session data
  const dragDataRef = useRef<{ 
    id: string; 
    type: string; 
    sourceContainerId: string;
    sourceIndex: number;
    itemSize: { width: number; height: number };
  } | null>(null);
  
  // Original positions captured at drag start (before any transforms)
  const originalItemsRef = useRef<Map<string, OriginalItemData[]>>(new Map());
  
  // Track current preview state
  const previewStateRef = useRef<{ containerId: string | null; index: number }>({ 
    containerId: null, 
    index: -1 
  });
  
  // Track transformed elements for cleanup
  const transformedElements = useRef<Set<HTMLElement>>(new Set());

  const registerContainer = useCallback(
    (
      id: string,
      acceptsTypes: string[],
      direction: DragDirection | undefined, 
      element: HTMLElement | null,
      onReorder?: (result: ReorderResult) => void,
      onItemMove?: (result: ItemMoveResult) => void
    ) => {
      containers.current.set(id, { id, acceptsTypes, direction, element, onReorder, onItemMove });
    },
    []
  );

  const unregisterContainer = useCallback((id: string) => {
    containers.current.delete(id);
  }, []);

  // Capture original positions of all items in relevant containers
  const captureOriginalPositions = useCallback((draggedType: string) => {
    originalItemsRef.current.clear();
    
    for (const [containerId, container] of containers.current.entries()) {
      if (!container.element || !container.acceptsTypes.includes(draggedType)) continue;
      
      // Only get direct children draggables that belong to THIS container
      const draggables = Array.from(
        container.element.querySelectorAll(`[data-container-id="${containerId}"]`)
      ) as HTMLElement[];
      
      const items: OriginalItemData[] = draggables.map((el, index) => ({
        id: el.getAttribute('data-id')!,
        index,
        rect: el.getBoundingClientRect(),
        element: el,
      }));
      
      originalItemsRef.current.set(containerId, items);
    }
  }, []);

  const clearAllTransforms = useCallback(() => {
    transformedElements.current.forEach(el => {
      // First, disable transitions to prevent animation when clearing
      el.style.transition = 'none';
      el.style.transform = '';
      el.style.opacity = '';
      
      // Force reflow to apply the changes immediately
      el.offsetHeight;
      
      // Then clear the transition style completely
      el.style.transition = '';
    });
    transformedElements.current.clear();
  }, []);

  // Calculate preview index using original positions (not affected by transforms)
  // Swap happens when dragged item's trailing edge passes 50% of the target item
  const calculatePreviewIndex = useCallback((
    containerId: string,
    centerX: number,
    centerY: number,
    draggedId: string
  ): number => {
    const container = containers.current.get(containerId);
    const originalItems = originalItemsRef.current.get(containerId);
    const dragData = dragDataRef.current;
    
    if (!container || !originalItems || originalItems.length === 0 || !dragData) return 0;
    
    // Filter out the dragged item for position calculations
    const items = originalItems.filter(item => item.id !== draggedId);
    
    if (items.length === 0) return 0;
    
    const direction = container.direction;
    const isHorizontal = direction === 'horizontal';
    
    // Get dragged item's trailing edge
    const draggedHalfSize = isHorizontal ? dragData.itemSize.width / 2 : dragData.itemSize.height / 2;
    const dragTrailingEdge = isHorizontal ? centerX + draggedHalfSize : centerY + draggedHalfSize;
    
    for (let i = 0; i < items.length; i++) {
      const { rect } = items[i];
      
      // Get this item's midpoint
      const itemMidpoint = isHorizontal 
        ? rect.left + rect.width / 2 
        : rect.top + rect.height / 2;
      
      // Return this index if we haven't passed the midpoint yet
      if (dragTrailingEdge < itemMidpoint) {
        return i;
      }
    }
    
    return items.length;
  }, []);

  // Apply transforms to show preview - uses only captured rect positions (layout-agnostic)
  const applyTransforms = useCallback((
    targetContainerId: string | null,
    previewIndex: number,
    draggedId: string,
    sourceContainerId: string
  ) => {
    // Only update if preview changed
    if (
      previewStateRef.current.containerId === targetContainerId &&
      previewStateRef.current.index === previewIndex
    ) {
      return;
    }
    
    previewStateRef.current = { containerId: targetContainerId, index: previewIndex };
    
    // Clear all transforms first
    clearAllTransforms();
    
    if (!targetContainerId) return;
    
    const dragData = dragDataRef.current;
    if (!dragData) return;
    
    const container = containers.current.get(targetContainerId);
    const originalItems = originalItemsRef.current.get(targetContainerId);
    const sourceItems = originalItemsRef.current.get(sourceContainerId);
    
    if (!container || !originalItems) return;
    
    const isSameContainer = targetContainerId === sourceContainerId;
    const direction = container.direction;
    const isHorizontal = direction === 'horizontal';
    
    // Find the placeholder element (the dragged item's original element)
    const placeholderItem = sourceItems?.find(item => item.id === draggedId);
    
    if (isSameContainer) {
      // Same container reorder - calculate new positions based on actual rects
      const draggedOriginalIndex = originalItems.findIndex(item => item.id === draggedId);
      
      if (draggedOriginalIndex === -1 || !placeholderItem) return;
      if (previewIndex === draggedOriginalIndex) return; // No change needed
      
      // Build the new order (what positions would look like after reorder)
      const newOrder = originalItems
        .filter(item => item.id !== draggedId)
        .map(item => ({ ...item }));
      
      // Insert placeholder at preview position
      newOrder.splice(previewIndex, 0, { ...placeholderItem, id: draggedId });
      
      // Now calculate transforms: each item moves from its original position to its new position
      originalItems.forEach((originalItem) => {
        const newIndex = newOrder.findIndex(item => item.id === originalItem.id);
        if (newIndex === -1) return;
        
        const newPositionItem = originalItems[newIndex];
        if (!newPositionItem) return;
        
        // Calculate the pixel difference between original and target positions
        const deltaX = newPositionItem.rect.left - originalItem.rect.left;
        const deltaY = newPositionItem.rect.top - originalItem.rect.top;
        
        // Only apply transform if there's actual movement
        if (deltaX !== 0 || deltaY !== 0) {
          const transform = isHorizontal
            ? `translateX(${deltaX}px)`
            : `translateY(${deltaY}px)`;
          
          originalItem.element.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
          originalItem.element.style.transform = transform;
          transformedElements.current.add(originalItem.element);
        }
      });
    } else {
      // Cross-container move
      const sourceContainer = containers.current.get(sourceContainerId);
      const sourceDirection = sourceContainer?.direction;
      const isSourceHorizontal = sourceDirection === 'horizontal';
      
      // In source container: collapse items to fill the gap
      if (sourceItems && placeholderItem) {
        const draggedOriginalIndex = sourceItems.findIndex(item => item.id === draggedId);
        
        // Hide the placeholder
        placeholderItem.element.style.transition = 'opacity 0.2s ease';
        placeholderItem.element.style.opacity = '0';
        transformedElements.current.add(placeholderItem.element);
        
        // Shift items to their new positions
        sourceItems.forEach((originalItem) => {
          if (originalItem.id === draggedId) return;
          
          // Items after the dragged item shift to fill the gap
          if (originalItem.index > draggedOriginalIndex) {
            const prevItem = sourceItems[originalItem.index - 1];
            if (prevItem) {
              const deltaX = prevItem.rect.left - originalItem.rect.left;
              const deltaY = prevItem.rect.top - originalItem.rect.top;
              
              if (deltaX !== 0 || deltaY !== 0) {
                const transform = isSourceHorizontal
                  ? `translateX(${deltaX}px)`
                  : `translateY(${deltaY}px)`;
                
                originalItem.element.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
                originalItem.element.style.transform = transform;
                transformedElements.current.add(originalItem.element);
              }
            }
          }
        });
      }
      
      // In target container: shift items to make room
      if (originalItems.length > 0) {
        // Calculate how much space the dragged item needs (use its actual size)
        const draggedSize = isHorizontal ? dragData.itemSize.width : dragData.itemSize.height;
        
        // Estimate gap from target container (if possible)
        let gap = 0;
        if (originalItems.length >= 2) {
          gap = isHorizontal
            ? originalItems[1].rect.left - originalItems[0].rect.right
            : originalItems[1].rect.top - originalItems[0].rect.bottom;
        }
        const shiftAmount = draggedSize + Math.max(0, gap);
        
        // Shift items at and after preview index
        originalItems.forEach((item, originalIndex) => {
          if (originalIndex >= previewIndex) {
            const transform = isHorizontal
              ? `translateX(${shiftAmount}px)`
              : `translateY(${shiftAmount}px)`;
            
            item.element.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
            item.element.style.transform = transform;
            transformedElements.current.add(item.element);
          }
        });
      }
    }
  }, [clearAllTransforms]);

  const handleDrop = useCallback((targetContainerId: string | null, previewIndex: number) => {
    const dragData = dragDataRef.current;
    
    if (dragData && targetContainerId) {
      const sourceContainer = containers.current.get(dragData.sourceContainerId);
      const targetContainer = containers.current.get(targetContainerId);

      if (targetContainerId === dragData.sourceContainerId) {
        // Same container reorder
        if (previewIndex !== dragData.sourceIndex && sourceContainer?.onReorder) {
          sourceContainer.onReorder({
            itemId: dragData.id,
            fromIndex: dragData.sourceIndex,
            toIndex: previewIndex,
          });
        }
      } else {
        // Cross-container move
        if (targetContainer?.onItemMove) {
          targetContainer.onItemMove({
            itemId: dragData.id,
            fromContainerId: dragData.sourceContainerId,
            toContainerId: targetContainerId,
            fromIndex: dragData.sourceIndex,
            toIndex: previewIndex,
          });
        }
      }
    }

    // Clean up
    clearAllTransforms();
    setDragState(initialDragState);
    setPortalContent(null);
    setPortalRect(null);
    dragDataRef.current = null;
    originalItemsRef.current.clear();
    previewStateRef.current = { containerId: null, index: -1 };
  }, [clearAllTransforms]);

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
    
    // Capture original positions BEFORE setting drag state
    captureOriginalPositions(type);
    
    // Find source index from captured positions
    const sourceItems = originalItemsRef.current.get(containerId);
    const sourceIndex = sourceItems?.findIndex(item => item.id === id) ?? 0;

    dragDataRef.current = { 
      id, 
      type, 
      sourceContainerId: containerId, 
      sourceIndex,
      itemSize: { width: rect.width, height: rect.height }
    };
    
    previewStateRef.current = { containerId, index: sourceIndex };
    
    setDragState({
      isDragging: true,
      draggedId: id,
      draggedType: type,
      sourceContainerId: containerId,
    });
    
    setPortalRect(rect);
    setPortalContent(content);
  }, [captureOriginalPositions]);

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
      {dragState.isDragging && portalContent && portalRect && dragState.draggedType && dragState.draggedId && dragState.sourceContainerId && (
        <DragPortal 
          initialRect={portalRect}
          containers={containers}
          draggedId={dragState.draggedId}
          draggedType={dragState.draggedType}
          sourceContainerId={dragState.sourceContainerId}
          calculatePreviewIndex={calculatePreviewIndex}
          applyTransforms={applyTransforms}
          onDrop={handleDrop}
        >
          {portalContent}
        </DragPortal>
      )}
    </DragDropContext.Provider>
  );
}

// Separate portal component to handle mouse tracking
function DragPortal({ 
  children, 
  initialRect,
  containers,
  draggedId,
  draggedType,
  sourceContainerId,
  calculatePreviewIndex,
  applyTransforms,
  onDrop,
}: { 
  children: React.ReactNode;
  initialRect: DOMRect;
  containers: React.MutableRefObject<Map<string, ContainerData>>;
  draggedId: string;
  draggedType: string;
  sourceContainerId: string;
  calculatePreviewIndex: (containerId: string, centerX: number, centerY: number, draggedId: string) => number;
  applyTransforms: (targetContainerId: string | null, previewIndex: number, draggedId: string, sourceContainerId: string) => void;
  onDrop: (targetContainerId: string | null, previewIndex: number) => void;
}) {
  const startMouseRef = useRef<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState({ x: initialRect.left, y: initialRect.top });
  const scrollIntervalRef = useRef<number | null>(null);
  const currentTargetRef = useRef<{ containerId: string | null; previewIndex: number }>({ 
    containerId: sourceContainerId, 
    previewIndex: -1 
  });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!startMouseRef.current) {
        startMouseRef.current = { x: e.clientX, y: e.clientY };
      }

      const deltaX = e.clientX - startMouseRef.current.x;
      const deltaY = e.clientY - startMouseRef.current.y;

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
          
          // Auto-scroll
          const scrollEl = container.element;
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
      
      // Calculate preview index if we have a target container
      let previewIndex = 0;
      if (targetContainerId) {
        previewIndex = calculatePreviewIndex(targetContainerId, centerX, centerY, draggedId);
      }
      
      currentTargetRef.current = { containerId: targetContainerId, previewIndex };
      applyTransforms(targetContainerId, previewIndex, draggedId, sourceContainerId);
    };

    const handleMouseUp = () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
      onDrop(currentTargetRef.current.containerId, currentTargetRef.current.previewIndex);
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
  }, [initialRect, containers, draggedType, draggedId, sourceContainerId, calculatePreviewIndex, applyTransforms, onDrop]);

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

export function useDragDrop() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDrop must be used within a DragDropProvider');
  }
  return context;
}
