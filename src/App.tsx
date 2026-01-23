import { useState, useCallback } from "react";
import { Container } from "./components/Container";
import { Draggable } from "./components/Draggable";
import { DragDropProvider } from "./context/DragDropContext";
import "./index.css";

interface KanbanCard {
  id: string;
  title: string;
  tag?: string;
  tagColor?: string;
}

interface KanbanColumn {
  id: string;
  title: string;
}

const columns: KanbanColumn[] = [
  { id: "backlog", title: "Backlog" },
  { id: "todo", title: "To Do" },
  { id: "in-progress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

const initialCards: KanbanCard[] = [
  {
    id: "card-1",
    title: "Research competitors",
    tag: "Research",
    tagColor: "#8b5cf6",
  },
  {
    id: "card-2",
    title: "Define MVP scope",
    tag: "Planning",
    tagColor: "#3b82f6",
  },
  {
    id: "card-3",
    title: "Create wireframes",
    tag: "Design",
    tagColor: "#ec4899",
  },
  {
    id: "card-4",
    title: "Setup CI/CD pipeline",
    tag: "DevOps",
    tagColor: "#f59e0b",
  },
  {
    id: "card-5",
    title: "Write API documentation",
    tag: "Docs",
    tagColor: "#10b981",
  },
  {
    id: "card-6",
    title: "Security audit",
    tag: "Security",
    tagColor: "#ef4444",
  },
  {
    id: "card-7",
    title: "Design system setup",
    tag: "Design",
    tagColor: "#ec4899",
  },
  {
    id: "card-8",
    title: "Database schema design",
    tag: "Backend",
    tagColor: "#6366f1",
  },
  {
    id: "card-9",
    title: "User authentication flow",
    tag: "Feature",
    tagColor: "#14b8a6",
  },
  {
    id: "card-10",
    title: "Implement drag & drop",
    tag: "Feature",
    tagColor: "#14b8a6",
  },
  {
    id: "card-11",
    title: "API endpoints for cards",
    tag: "Backend",
    tagColor: "#6366f1",
  },
  {
    id: "card-12",
    title: "Landing page design",
    tag: "Design",
    tagColor: "#ec4899",
  },
  { id: "card-13", title: "Project setup", tag: "Setup", tagColor: "#64748b" },
  {
    id: "card-14",
    title: "Git repository init",
    tag: "Setup",
    tagColor: "#64748b",
  },
];

const initialColumnCards: Record<string, string[]> = {
  backlog: ["card-1", "card-2", "card-3", "card-4", "card-5", "card-6"],
  todo: ["card-7", "card-8", "card-9"],
  "in-progress": ["card-10", "card-11"],
  review: ["card-12"],
  done: ["card-13", "card-14"],
};

function KanbanCardContent({ card }: { card: KanbanCard }) {
  return (
    <>
      {card.tag && (
        <span
          className="kanban-card__tag"
          style={{ backgroundColor: card.tagColor }}
        >
          {card.tag}
        </span>
      )}
      <p className="kanban-card__title">{card.title}</p>
    </>
  );
}

function App() {
  const [columnOrder, setColumnOrder] = useState<string[]>(
    columns.map((c) => c.id),
  );
  const [columnCards, setColumnCards] =
    useState<Record<string, string[]>>(initialColumnCards);
  const [cards] = useState<KanbanCard[]>(initialCards);

  const getCard = useCallback(
    (cardId: string) => {
      return cards.find((c) => c.id === cardId);
    },
    [cards],
  );

  const handleColumnReorder = useCallback((newOrder: string[]) => {
    setColumnOrder(newOrder);
  }, []);

  const handleCardReorder = useCallback(
    (columnId: string, newCardIds: string[]) => {
      setColumnCards((prev) => ({
        ...prev,
        [columnId]: newCardIds,
      }));
    },
    [],
  );

  // Unified handler for moving cards between columns
  const handleCardMove = useCallback(
    (
      cardId: string,
      fromColumnId: string,
      toColumnId: string,
      atIndex: number,
    ) => {
      setColumnCards((prev) => {
        const newState = { ...prev };

        // Remove from source column
        newState[fromColumnId] = prev[fromColumnId].filter(
          (id) => id !== cardId,
        );

        // Add to target column at specified index
        const targetCards = [...(prev[toColumnId] || [])];
        targetCards.splice(atIndex, 0, cardId);
        newState[toColumnId] = targetCards;

        return newState;
      });
    },
    [],
  );

  return (
    <DragDropProvider>
      <div className="kanban">
        <header className="kanban__header">
          <h1 className="kanban__title">Project Board</h1>
          <p className="kanban__subtitle">
            Drag columns to reorder • Drag cards between columns • Auto-scroll
            on edges
          </p>
        </header>

        <Container
          id="board"
          type="column"
          direction="horizontal"
          items={columnOrder}
          onReorder={handleColumnReorder}
          className="kanban__board"
        >
          {columnOrder.map((columnId) => {
            const column = columns.find((c) => c.id === columnId);
            if (!column) return null;
            const cardIds = columnCards[columnId] || [];

            return (
              <Draggable
                key={columnId}
                id={columnId}
                type="column"
                containerId="board"
                className="kanban__column-wrapper"
                handleClassName="kanban__column-handle"
              >
                <div className="kanban__column">
                  <div className="kanban__column-header">
                    <span className="kanban__column-handle">||</span>
                    <h2 className="kanban__column-title">{column.title}</h2>
                    <span className="kanban__column-count">
                      {cardIds.length}
                    </span>
                  </div>

                  <Container
                    id={columnId}
                    type="card"
                    acceptsTypes={["card"]}
                    direction="vertical"
                    items={cardIds}
                    onReorder={(newItems) =>
                      handleCardReorder(columnId, newItems)
                    }
                    onItemMove={handleCardMove}
                    className="kanban__column-content"
                  >
                    {cardIds.map((cardId) => {
                      const card = getCard(cardId);
                      if (!card) return null;

                      return (
                        <Draggable
                          key={cardId}
                          id={cardId}
                          type="card"
                          containerId={columnId}
                          className="kanban__card"
                        >
                          <KanbanCardContent card={card} />
                        </Draggable>
                      );
                    })}
                  </Container>
                </div>
              </Draggable>
            );
          })}
        </Container>

        <Container
          id="column-order2"
          type="column2"
          direction="vertical"
          items={columnOrder}
          onReorder={handleColumnReorder}
          className="demo-vertical-list"
        >
          {columnOrder.map((columnId) => {
            const column = columns.find((c) => c.id === columnId);
            if (!column) return null;

            return (
              <Draggable
                key={columnId}
                id={columnId}
                type="column2"
                containerId="column-order2"
                className="demo-list-item"
              >
                {column.title}
              </Draggable>
            );
          })}
        </Container>
      </div>
    </DragDropProvider>
  );
}

export default App;
