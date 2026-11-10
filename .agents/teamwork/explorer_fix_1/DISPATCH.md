## 2026-11-10T15:46:26Z
You are explorer_fix_1, a graphics and geometry specialist explorer for drawit.
Working directory: c:\Users\luis.felipe\Desktop\Developer\drawit
State folder: c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\explorer_fix_1\

Read c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\ORIGINAL_REQUEST.md first.
Read the findings from challenger_1:
c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\challenger_1\handoff.md
And the current plan:
c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md

Your mission:
Formulate an exact, mathematically sound fix strategy for all issues identified by challenger_1:
1. Fix Task 2.1: Correct the anchor rotation test specification. When a shape centered at (150, 150) rotates 90 deg clockwise, calculate the exact world coordinates for all cardinal anchors (right anchor at (200, 150) rotates to (150, 200), etc.).
2. Fix Task 1.4: Refine the geometric hit-testing for non-rectangular shapes (diamond: $|(x-cx)/a| + |(y-cy)/b| \le 1$, triangle/cylinder) so hit testing is exact.
3. Fix Task 1.2: Specify pointer capture (`setPointerCapture`) and middle-click autoscroll suppression (`window.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); })`).
4. Fix Task 2.2 / Task 2.3: Specify how unbonded/detached connector coordinates are stored (`points: [Point, Point]` in world coordinates) when anchors are detached upon shape deletion (RF-E07).
5. Fix Task 2.5: Specify binding index rehydration on Undo/Redo and initial scene load.

Write your fix recommendations in:
c:\Users\luis.felipe\Desktop\Developer\drawit\.agents\teamwork\explorer_fix_1\handoff.md
Notify caller via send_message with a summary and handoff path.
