import { useEffect, useRef } from 'react';
import { useDragDrop } from '../context/DragDropContext';
import { DragDirection } from '../types';

interface ContainerProps {
  id: string;
  type: string;
  acceptsTypes?: string[];
  direction?: DragDirection;
  items: string[];
  onReorder: (items: string[]) => void;
  onItemMove?: (itemId: string, fromContainerId: string, toContainerId: string, atIndex: number) => void;
  className?: string;
  renderItem: (itemId: string) => React.ReactNode;
}

export function Container({ 
  id,
  type, 
  acceptsTypes,
  direction, 
  items,
  onReorder,
  onItemMove,
  className = '',
  renderItem,
}: ContainerProps) {
  const { dragState, registerContainer, unregisterContainer } = useDragDrop();
  const containerRef = useRef<HTMLDivElement>(null);
  
  const acceptedTypes = acceptsTypes || [type];

  useEffect(() => {
    registerContainer(
      id, 
      acceptedTypes, 
      direction, 
      items, 
      onReorder, 
      containerRef.current,
      onItemMove
    );
  }, [id, acceptedTypes, direction, items, onReorder, onItemMove, registerContainer]);

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
      <div className="container__header">
        <span className="container__type">{type}</span>
        {direction && <span className="container__direction">{direction}</span>}
      </div>
      <div className="container__content">
        {items.map((itemId) => renderItem(itemId))}
      </div>
    </div>
  );
}
