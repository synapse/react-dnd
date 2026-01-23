import { useEffect, useRef, ElementType } from 'react';
import { useDragDrop } from '../context/DragDropContext';
import { DragDirection, ReorderResult, ItemMoveResult } from '../types';

interface ContainerProps {
  /** HTML element or component to render as (default: 'div') */
  as?: ElementType;
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
  /** Any additional props to pass to the element */
  [key: string]: unknown;
}

export function Container({ 
  as: Component = 'div',
  id,
  type, 
  acceptsTypes,
  direction, 
  onReorder,
  onItemMove,
  className = '',
  children,
  ...rest
}: ContainerProps) {
  const { dragState, registerContainer, unregisterContainer } = useDragDrop();
  const containerRef = useRef<HTMLElement | null>(null);
  
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
    <Component
      ref={containerRef}
      className={`container ${directionClass} ${isValidDropTarget ? 'container--active' : ''} ${className}`}
      data-container-id={id}
      data-type={type}
      data-direction={direction}
      {...rest}
    >
      {children}
    </Component>
  );
}
