import { useRef } from 'react';
import { useDragDrop } from '../context/DragDropContext';
import './Draggable.css';

interface DraggableProps {
  id: string;
  type: string;
  containerId: string;
  children: React.ReactNode;
  className?: string;
  /** Optional class name of the drag handle element. If provided, only that element initiates drag. */
  handleClassName?: string;
}

export function Draggable({ id, type, containerId, children, className = '', handleClassName }: DraggableProps) {
  const { dragState, startDrag } = useDragDrop();
  const elementRef = useRef<HTMLDivElement>(null);

  const isBeingDragged = dragState.isDragging && dragState.draggedId === id;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!elementRef.current) return;
    
    // If handleClassName is specified, only start drag if clicking on the handle
    if (handleClassName) {
      const target = e.target as HTMLElement;
      const isHandle = target.classList.contains(handleClassName) || 
                       target.closest(`.${handleClassName}`) !== null;
      if (!isHandle) return;
    }
    
    const portalContent = (
      <div className={`draggable draggable--dragging ${className}`}>
        {children}
      </div>
    );
    
    startDrag(id, type, containerId, e, elementRef.current, portalContent);
  };

  return (
    <div
      ref={elementRef}
      className={`draggable ${isBeingDragged ? 'draggable--placeholder' : ''} ${className}`}
      onMouseDown={handleMouseDown}
      data-id={id}
      data-type={type}
      data-container-id={containerId}
    >
      {children}
    </div>
  );
}
