import { useRef, ElementType } from 'react';
import { useDragDrop } from '../context/DragDropContext';
import './Draggable.css';

interface DraggableProps {
  /** HTML element or component to render as (default: 'div') */
  as?: ElementType;
  /** Unique identifier for this draggable item */
  id: string;
  /** Type identifier - must match Container's type or acceptsTypes */
  type: string;
  /** ID of the parent Container */
  containerId: string;
  /** Content to render */
  children: React.ReactNode;
  /** Additional CSS class names */
  className?: string;
  /** Optional class name of the drag handle element. If provided, only that element initiates drag. */
  handleClassName?: string;
  /** Any additional props to pass to the element */
  [key: string]: unknown;
}

export function Draggable({ 
  as: Component = 'div',
  id, 
  type, 
  containerId, 
  children, 
  className = '', 
  handleClassName,
  ...rest
}: DraggableProps) {
  const { dragState, startDrag } = useDragDrop();
  const elementRef = useRef<HTMLElement | null>(null);

  const isBeingDragged = dragState.isDragging && 
    dragState.draggedId === id && 
    dragState.sourceContainerId === containerId;

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
      <Component className={`draggable draggable--dragging ${className}`}>
        {children}
      </Component>
    );
    
    startDrag(id, type, containerId, e, elementRef.current, portalContent);
  };

  return (
    <Component
      ref={elementRef}
      className={`draggable ${isBeingDragged ? 'draggable--placeholder' : ''} ${className}`}
      onMouseDown={handleMouseDown}
      data-id={id}
      data-type={type}
      data-container-id={containerId}
      {...rest}
    >
      {children}
    </Component>
  );
}
