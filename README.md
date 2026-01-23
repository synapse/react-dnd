# Drag & Drop Components

A React TypeScript implementation of drag and drop components with type matching and direction constraints.

## Features

- **Container Component**: Accepts draggable items with optional direction constraint
- **Draggable Component**: Items that can be dragged within matching containers
- **Type Matching**: Only items with matching types can interact
- **Direction Constraints**: Limit movement to horizontal or vertical axes

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Usage

```tsx
import { Container, Draggable } from './components';
import { DragDropProvider } from './context/DragDropContext';

function App() {
  return (
    <DragDropProvider>
      {/* Free movement container */}
      <Container type="cards">
        <Draggable id="card-1" type="cards">Card 1</Draggable>
        <Draggable id="card-2" type="cards">Card 2</Draggable>
      </Container>

      {/* Horizontal-only movement */}
      <Container type="slider" direction="horizontal">
        <Draggable id="slide-1" type="slider">Slide 1</Draggable>
      </Container>

      {/* Vertical-only movement */}
      <Container type="list" direction="vertical">
        <Draggable id="item-1" type="list">Item 1</Draggable>
      </Container>
    </DragDropProvider>
  );
}
```

## Props

### Container

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `type` | `string` | Yes | Type identifier for matching with Draggable items |
| `direction` | `'horizontal' \| 'vertical'` | No | Constrains movement direction |
| `children` | `ReactNode` | Yes | Draggable items |
| `className` | `string` | No | Additional CSS class |

### Draggable

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier |
| `type` | `string` | Yes | Must match Container type |
| `children` | `ReactNode` | Yes | Content to display |
| `className` | `string` | No | Additional CSS class |
