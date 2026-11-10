# Dispatch for spec_miner_1
Focus: Frontend, Canvas 2D, interaction model, UI/UX, and complete mapping of RFs/RNFs from Spec v0.2.


## 2026-11-10T15:20:45Z
You are spec_miner_1, an authoritative specification miner for the drawit project.
Working directory: c:\Users\luis.felipe\Desktop\Developer\drawit
State folder: c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\spec_miner_1\

Read c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\ORIGINAL_REQUEST.md first.
Then thoroughly read and analyze the project specification:
c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\Spec — Whiteboard de System Design.md

Your mission:
1. Extract and enumerate all functional and non-functional requirements (RFs and RNFs) with specific IDs and descriptions.
2. Mine all details related to Frontend and Canvas 2D engine:
   - Infinite virtual plane, coordinate systems (screen <-> world coordinate transforms), viewport (x, y, zoom), pixel ratio / HiDPI handling.
   - Zoom interactions (mouse wheel without Ctrl, pinch gesture, +/- shortcuts, zoom levels 10% to 800%).
   - Pan interactions (Hand tool, Space+drag, middle mouse button drag).
   - Canvas 2D custom rendering loop (requestAnimationFrame, dirty rect / full redraw, React boundary restricted to outer UI).
   - Selection mechanism (single click, marquee/lasso bounding box, shift multi-select).
   - Transform box (bounding box, corner/side resize handles, aspect ratio lock).
   - Hit testing and spatial indexing (AABB / Bounding box check before precise geometry).
   - Diagramming entities: basic shapes (rectangle, rounded rect, ellipse, diamond, cloud/cylinder), connection anchors (4 or 8 attachment points per shape), connectors (orthogonal with routing / avoidance, straight, curved/bezier, arrowheads, persistent binding to shapes on move/resize).
   - Text editing on shapes and free text (in-place inline text editor overlay or canvas text rendering, auto-wrap, typography).
   - Styling: stroke color, fill color, stroke width, stroke style (solid, dashed), opacity, font size/family.
   - Clipboard (copy, cut, paste, duplicate with offset).
   - History: Undo/Redo stack with snapshot/command pattern.
   - Export: PNG, SVG, JSON with bounds calculation.
3. Identify all constraints, interfaces, edge cases, and cross-module contracts.
4. Write your comprehensive analysis and findings in c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\spec_miner_1\handoff.md. Include full requirement matrices and technical recommendations.
5. Notify caller with send_message with a summary and the handoff path.
