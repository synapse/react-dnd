import { useEffect, useRef } from 'react';
import { useDragDrop } from '../context/DragDropContext';
import { DragDirection, ReorderResult, ItemMoveResult } from '../types';

interface ContainerProps {
  /** Unique identifier for this container */
  id: string;
  /** Type identifier - draggables must match this type */
  type: string;
  /** Optional array of accepted types (defaults to [type]) */
  acceptsTypes?: string[];
  /** Optional direction constraint: 'horizontal' or 'vertical' */
  direction?: DragDirection;
  /** Callback when items are reordered within this container (called on drop) */
  onReorder?: (result: ReorderResult) => void;
  /** Callback when an item moves from another container into this one (called on drop) */
  onItemMove?: (result: ItemMoveResult) => void;
  /** Additional CSS class names */
  className?: string;
  /** Content to render (typically Draggable components) */
  children: React.ReactNode;
}

export function Container({ 
  id,
  type, 
  acceptsTypes,
  direction, 
  onReorder,
  onItemMove,
  className = '',
  children,
}: ContainerProps) {
  const { dragState, registerContainer, unregisterContainer } = useDragDrop();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const acceptedTypes = acceptsTypes || [type];

  useEffect(() => {
    registerContainer(
      id, 
      acceptedTypes, 
      direction, 
      containerRef.current,
      onReorder,
      onItemMove
    );
  }, [id, acceptedTypes, direction, onReorder, onItemMove, registerContainer]);

  useEffect(() => {
    return () => unregisterContainer(id);
  }, [id, unregisterContainer]);

  const isValidDropTarget = dragState.isDragging && 
    dragState.draggedType && 
    acceptedTypes.includes(dragState.draggedType);
    
  const directionClass = direction ? `container--${direction}` : '';

  return (
    <div
      ref={containerRef}
      className={`container ${directionClass} ${isValidDropTarget ? 'container--active' : ''} ${className}`}
      data-container-id={id}
      data-type={type}
      data-direction={direction}
    >
      {children}
    </div>
  );
}
