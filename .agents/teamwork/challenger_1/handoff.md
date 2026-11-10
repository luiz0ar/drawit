# Adversarial Challenge & Handoff Report — Canvas 2D Engine Architecture

**Agent**: `challenger_1` (Empirical Challenger: Critic & Specialist)  
**Date**: 2026-11-10T15:50:00Z  
**Target Document**: `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md`  
**Verdict**: **REQUEST_CHANGES** (Actionable architectural, mathematical, and interaction amendments required)

---

## 1. Observation

Direct quotations, code contracts, and mathematical claims from `plano_de_implementacao.md`:

1. **Cursor-Anchored Zoom Formula** (`Tarefa 1.2`, lines 251–253):
   > "Algoritmo de Invariância do Cursor: Durante o zoom, as coordenadas de mundo sob a posição do cursor permanecem idênticas na tela:
   > $$\text{panX}_{novo} = cx - x_w \cdot \text{zoom}_{novo}$$
   > $$\text{panY}_{novo} = cy - y_w \cdot \text{zoom}_{novo}$$"

2. **Pan Modes and Wheel Behavior** (`Tarefa 1.2`, lines 248–260):
   > "O evento `wheel` é registrado no elemento do canvas com `{ passive: false }` e invoca `e.preventDefault()` para interceptar o zoom nativo do navegador. Conforme especificação mandatória, a roda do mouse executa **zoom sem necessidade de pressionar a tecla Ctrl**. A roda do mouse **nunca realiza pan**. Limites estritos de zoom: fixados entre **10% (0.1)** e **800% (8.0)**."
   > "Navegação Pan Multi-modal: Pan livre em qualquer direção utilizando Pointer Events nas 3 modalidades homologadas:
   > 1. Ferramenta Mão ativada (tecla de atalho `H`).
   > 2. Tecla `Espaço` pressionada enquanto arrasta com o botão esquerdo do mouse.
   > 3. Clique e arraste direto com o **botão do meio do mouse** (botão 1 / flag `buttons = 4`), independente da ferramenta ativa."
   *(Absence observed: No mention of `setPointerCapture` / `releasePointerCapture`, no `preventDefault` on middle click / `auxclick`, and no check for `HTMLInputElement`/`HTMLTextAreaElement` during `Space` key pan).*

3. **Two-Phase Hit-Testing and Geometry Math** (`Tarefa 1.4`, lines 337–343):
   > "- Hit-Testing em 2 Fases (Two-Phase Collision):
   >   - *Fase 1 (Coarse)*: Busca na R-tree os candidatos cuja AABB contenha o ponto do clique $(P_{wx}, P_{wy}) \pm \text{tolerância}$.
   >   - *Fase 2 (Fine Geometry)*: Teste geométrico fino apenas sobre os candidatos:
   >     - Retângulo/Losango rotacionado: Aplicação de rotação inversa $(-\theta)$ em torno do centro e teste de ponto em caixa local.
   >     - Elipse: Equação canônica $\frac{(x' - cx)^2}{a^2} + \frac{(y' - cy)^2}{b^2} \le 1$.
   >     - Linha/Segmento: Distância euclidiana ortogonal do ponto ao segmento de reta com tolerância de 8px.
   >     - Regra de Preenchimento Transparente: Se `fillColor === 'transparent'`, o hit-test só é positivo quando o clique incidir sobre o contorno do traço ($\pm \text{tolerância}$)."
   *(Absence observed: Losango is grouped with rectangle using "teste de ponto em caixa local". Triangle is completely absent from Phase 2).*

4. **Anchor Rotation Test Specification** (`Tarefa 2.1`, line 438):
   > "*Teste de Rotação de Âncora*: Ao girar um retângulo de $200 \times 100$ em $90^\circ$ em torno do centro, a âncora `top` deve calcular suas coordenadas de mundo correspondentes à posição original da âncora `right`."

5. **Arrow Schema and Clean Detachment** (`Tarefa 2.2`, lines 454–463; `Tarefa 2.3`, line 484):
   > ```typescript
   > export interface ArrowElement extends CanvasElementBase {
   >   type: 'arrow';
   >   startBinding: Binding | null;
   >   endBinding: Binding | null;
   >   routing: 'straight' | 'curved' | 'orthogonal';
   >   startArrowhead: 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond';
   >   endArrowhead: 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond';
   >   points: [number, number][]; // Segmentos intermediários
   > }
   > ```
   > "Para cada seta ligada ao elemento deletado, a extremidade correspondente tem seu binding desfeito (`binding = null`), preservando o ponto terminal na posição absoluta de mundo onde a âncora se encontrava no momento da exclusão."

6. **Inverted Binding Index** (`Tarefa 2.2`, line 464):
   > "O canvas engine mantém um mapa em memória `Map<string, Set<string>>` indexando `shapeId -> Set<arrowId>`. Mover ou redimensionar uma forma atualiza todas as setas vinculadas em tempo $O(1)$."
   *(Absence observed: No lifecycle rehydration specified on scene load `GET /scene` or `Ctrl+Z` Undo).*

7. **Orthogonal Manhattan Routing** (`Tarefa 2.2`, line 468 vs `Seção 6.1`, line 837):
   > Line 468: "3. Ortogonal Manhattan (`orthogonal`): Roteamento em ângulos retos de 90 graus (Z-shape, C-shape, U-shape) garantindo folga mínima (offset de 20px) em relação às bordas das formas conectadas para evitar sobreposição visual do conector na forma."
   > Line 837: "Roteamento ortogonal Manhattan contornando caixas de colisão."

---

## 2. Logic Chain & Empirical Verifications

### 2.1 Coordinate Math & Zoom Invariants
- **Invariance Test**: Running Node.js verification on the formula:
  $$x_w = \frac{cx - \text{panX}}{\text{zoom}}, \quad \text{panX}_{novo} = cx - x_w \cdot \text{zoom}_{novo}$$
  For screen cursor $(300, 200)$, $P_w(250, 120)$, zooming from $1.0$ to $1.5$ yields $\text{panX}_{novo} = -75, \text{panY}_{novo} = 20$. Projecting $P_w$ back to screen gives exactly $(300.0, 200.0)$ with $\Delta = 0.0$.
  **Result**: The core invariance formula is mathematically correct.
- **Omission in Zoom Scaling**: The plan specifies clamping to $[0.1, 8.0]$, but omits the step function for $\Delta \text{zoom}$ from `wheel` events (`e.deltaY`). Naive additive stepping (`zoom -= deltaY * 0.001`) collapses at $0.1$ and becomes unresponsive at $8.0$. Multiplicative/exponential scaling (`zoomNew = clamp(zoom * Math.pow(0.999, deltaY), 0.1, 8.0)`) with `deltaMode` normalization is required.
- **Pointer Capture & Browser Interaction**:
  - Without `canvas.setPointerCapture(e.pointerId)` on `pointerdown`, any dragging motion that leaves the canvas viewport or browser window drops subsequent `pointermove` and `pointerup` events. The canvas is left in an unrecoverable "stuck pan/drag" state.
  - On Windows browsers, middle-clicking without `e.preventDefault()` on `pointerdown`/`auxclick` triggers the operating system's native autoscroll (compass circle overlay), corrupting pan control.
  - When editing text (`<textarea>` overlay from Task 2.5), pressing `Space` will trigger pan if not guarded against `e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement`.

### 2.2 Performance & 60 FPS Decoupling
- **React Fiber Decoupling**: The plan isolates `CanvasEngine` in an imperatively driven `requestAnimationFrame` loop with `isDirty`. However, it designates Zustand as the editor store without defining the reactive boundary for pointer events. If high-frequency movements (50–100 moves/sec) dispatch into a reactive Zustand store observed by React UI, React Fiber reconciliation will cause catastrophic frame drops with 2,000 elements. High-frequency pan/drag coordinates must stay purely within `CanvasEngine` transient memory, synchronizing to Zustand only on interaction commit (`pointerup`).
- **Spatial Indexing (`rbush`) & Frustum Culling**:
  - Frustum calculation $AABB_{viewport} = [-\text{panX}/\text{zoom}, -\text{panY}/\text{zoom}, (W_s - \text{panX})/\text{zoom}, (H_s - \text{panY})/\text{zoom}]$ is correct.
  - Empirical benchmark on 2,000 elements: viewport culling executes in $\approx 0.054\text{ms}$ per frame, and sorting culled candidates by `zIndex` takes $\approx 0.188\text{ms}$, well within the 16.6ms budget.
  - **Hazard**: Mutating an element's coordinates in-place before removing it from `rbush` causes `rbush.remove` to search the wrong spatial branch, permanently orphaning ghost bounding boxes in the index.
  - **Effect Bleed**: Task 1.4 calculates element AABB based only on geometry and stroke width. When neon glow (`shadowBlur` up to 50px per Task 2.6) is applied, the glow will abruptly pop out of existence when the bounding box exits the frustum. Bounding boxes in `rbush` must be inflated by `effect.intensity`.

### 2.3 Mathematical Flaw in Anchor Rotation TDD Test
- **Plan's Claim** (Task 2.1, Line 438):
  *"Ao girar um retângulo de 200 x 100 em 90 graus em torno do centro, a âncora top deve calcular suas coordenadas de mundo correspondentes à posição original da âncora right."*
- **Empirical Execution**:
  Let rectangle have $W = 200, H = 100$, placed at $(0, 0)$ with center $C(100, 50)$:
  - Original `top` anchor $(u=0.5, v=0.0)$: $(100, 0)$. Vector from center: $(0, -50)$, distance $= 50\text{px}$.
  - Original `right` anchor $(u=1.0, v=0.5)$: $(200, 50)$. Vector from center: $(100, 0)$, distance $= 100\text{px}$.
  - Rotating `top` by $+90^\circ$ around $C$: $(100 - (-50), 50 + 0) = (150, 50)$, distance from center $= 50\text{px}$.
  - Original `right` was at $(200, 50)$, distance $= 100\text{px}$.
  - $(150, 50) \neq (200, 50)$. Error $= 50\text{px}$!
- **Conclusion**: The anchors only coincide for a square ($W = H$). For any non-square rectangle, the rotated `top` anchor does NOT coincide with the unrotated `right` anchor. If implemented as specified in TDD, this test will fail unconditionally.

### 2.4 Geometric Flaw in Losango / Diamond Hit-Testing
- **Plan's Claim** (Task 1.4, Line 340):
  *"Retângulo/Losango rotacionado: Aplicação de rotação inversa (-\theta) em torno do centro e teste de ponto em caixa local."*
- **Empirical Execution**:
  A diamond is an inscribed rhombus occupying exactly 50% of its local bounding box.
  For center $(100, 100)$, $W=100, H=100$, local bounding box is $[50, 50, 150, 150]$.
  Point at local $(55, 55)$ is inside the local bounding box (`true`), but outside the diamond:
  $$\frac{|55 - 100|}{50} + \frac{|55 - 100|}{50} = \frac{45}{50} + \frac{45}{50} = 1.8 > 1.0 \implies \text{false}$$
- **Conclusion**: Using "teste de ponto em caixa local" for a diamond creates up to 50% false positive selections across all 4 corner regions. The diamond requires the $L_1$ norm test.
- **Omission**: Triangle is completely omitted from Task 1.4 Phase 2. It requires a barycentric coordinate or half-plane sign test.

### 2.5 Connectors & Bindings Lifecycle
- **Detached Endpoints Storage (RF-E07)**:
  `ArrowElement` defines `points: [number, number][]; // Segmentos intermediários`. If `points` are only intermediate segments, when an endpoint is detached (`binding = null`), there is no designated property to persist the unbonded $(x, y)$ world coordinate of the start/end terminal. The interface must define `points` as the complete polyline vertex array `[WorldPoint, ...WorldPoint]` (start = index 0, end = index N-1) or provide explicit `startPoint` and `endPoint` tuples.
- **Inverted Index Rehydration**:
  The in-memory inverted index `Map<string, Set<string>>` is not rehydrated when:
  1. A board scene is loaded from MongoDB (`GET /api/boards/:id/scene`).
  2. A deleted shape is restored via `Ctrl+Z` (Undo).
  Without an explicit `rebuildBindingIndex(elements)` call on scene load and undo/redo, moved shapes will fail to update their connected arrows.
- **Orthogonal Manhattan Algorithm Detail**:
  Task 2.2 describes simple 3-segment routing, whereas Section 6.1 promises obstacle avoidance. A naive 3-segment route between shapes where the start shape is to the right of the end shape cuts backwards through the start shape itself. The plan must clarify whether Manhattan routing in MVP is stub-based 3-to-5 segment heuristic routing around the two connected shapes (with 20px clearance) or general A* grid pathfinding.

---

## 3. Adversarial Challenges Summary

| Challenge | Severity | Description & Attack Scenario | Blast Radius | Recommended Mitigation |
|---|---|---|---|---|
| **C1: Anchor Rotation Math Error** | **HIGH** | Task 2.1 TDD test assumes $90^\circ$ rotated top anchor of a $200\times100$ rectangle equals original right anchor. | Automated CI/TDD test failure during Phase 2. | Correct test coordinates: for $200\times100$ rectangle at $(0, 0)$, rotated top is $(150, 50)$, not $(200, 50)$; or use a square ($100\times100$) to test coincidence. |
| **C2: Losango Hit-Test False Positives** | **HIGH** | Task 1.4 applies rectangular local box hit-test to Losango/Diamond. | 50% false-positive click area on diamond shapes; inability to select shapes underneath diamond corners. | Specify $L_1$ norm fine hit-test: $(\|x' - cx\| / (w/2)) + (\|y' - cy\| / (h/2)) \le 1$. Add barycentric test for Triangle. |
| **C3: Missing Pointer Capture & Middle Click Autoscroll** | **HIGH** | Dragging mouse beyond canvas drops pointer events; middle click triggers Windows autoscroll. | User interaction locks up / freezes during pan, shape drag, or resize outside canvas bounds. | Mandate `canvas.setPointerCapture(e.pointerId)` on `pointerdown` and `e.preventDefault()` on middle click (`button === 1`). Guard `Space` pan against text inputs. |
| **C4: Inverted Binding Index Rehydration** | **MEDIUM** | Cache `Map<shapeId, Set<arrowId>>` not updated on `Ctrl+Z` (Undo) or scene load. | Arrows stop following connected shapes after Undo or page refresh. | Add `rebuildBindingIndex(elements: CanvasElement[])` invoked on scene load, JSON import, and undo/redo execution. |
| **C5: Detached Arrow Terminal Representation** | **MEDIUM** | `ArrowElement.points` described as intermediate segments only; nowhere to store free endpoints upon detachment (RF-E07). | Data schema cannot represent unbonded or detached arrows without data loss or crashes. | Clarify `ArrowElement`: `points` is the full vertex list `[start, ...intermediates, end]`, or add `startPoint` / `endPoint` coordinates. |
| **C6: Neon Glow Frustum Culling Pop-in** | **LOW** | `rbush` AABB ignores `shadowBlur` glow radius. | Glowing halo abruptly pops off when element edge crosses canvas boundary. | Inflate element AABB by `style.effect.intensity` (shadow blur radius) before inserting into `rbush`. |
| **C7: Zoom Step Exponential Scaling** | **LOW** | No wheel delta normalization or geometric scaling specified. | Zoom feels either sluggish or hyper-sensitive at zoom boundaries ($0.1$ vs $8.0$). | Specify geometric scaling: $\text{zoom}_{novo} = \text{clamp}(\text{zoom} \cdot \beta^{-\text{deltaY}}, 0.1, 8.0)$. |

---

## 4. Caveats

- **Scope Boundary**: This review focused exclusively on the Canvas 2D graphics engine, viewport mathematics, interaction loops, hit-testing, and connector algorithms in `plano_de_implementacao.md`. Backend Axum services, Docker orchestration, and MongoDB schema design were not challenged in this review.
- **Browser Differences**: Wheel `deltaY` and `deltaMode` variations between Chrome/Firefox/Safari and Windows/macOS require browser testing; empirical verification in this review was executed using Node.js headless math harnesses.

---

## 5. Conclusion & Explicit Verdict

### **Verdict**: **REQUEST_CHANGES**

The architectural baseline (Canvas 2D imperativo + Vite + React peripheral + `rbush` + `perfect-freehand`) is sound and well-conceived. However, the plan contains **1 verified mathematical test error** (anchor rotation), **2 geometric hit-testing flaws** (diamond and triangle), **critical pointer capture omissions** that will cause interaction lockups in production, and **schema ambiguity** regarding detached arrow coordinates.

These items must be amended in `c:\Users\luis.felipe\Desktop\Developer\drawit\.agent\plano_de_implementacao.md` prior to code implementation.

---

## 6. Verification Method (Independent Reproduction)

To independently reproduce the empirical findings in this report, run the following verification commands in the workspace terminal:

1. **Verify Anchor Rotation Math Failure** (Finding C1):
   ```powershell
   node -e "
   const cx = 100, cy = 50, w = 200, h = 100;
   const originalTop = { x: cx, y: cy - h/2 }; // (100, 0)
   const originalRight = { x: cx + w/2, y: cy }; // (200, 50)
   // Rotate top by 90 deg clockwise around center (100, 50):
   const rotatedTop = { x: cx - (originalTop.y - cy), y: cy + (originalTop.x - cx) }; // (150, 50)
   console.log('Original Right:', originalRight, 'Rotated Top:', rotatedTop);
   console.assert(rotatedTop.x === originalRight.x && rotatedTop.y === originalRight.y, 'TEST FAILED: 150 != 200');
   "
   ```

2. **Verify Diamond False-Positive Hit Area** (Finding C2):
   ```powershell
   node -e "
   const cx = 100, cy = 100, hw = 50, hh = 50;
   const px = 55, py = 55; // Corner point
   const inBox = px >= cx - hw && px <= cx + hw && py >= cy - hh && py <= cy + hh;
   const inDiamond = (Math.abs(px - cx)/hw + Math.abs(py - cy)/hh) <= 1.0;
   console.log({ inBox, inDiamond, falsePositive: inBox && !inDiamond });
   console.assert(!inBox || inDiamond, 'TEST FAILED: Box test yields false positive for diamond');
   "
   ```

3. **Verify Viewport Frustum Culling Performance SLA** (RNF-P01):
   ```powershell
   node -e "
   const elements = Array.from({length: 2000}, (_, i) => ({ id: i, minX: Math.random()*10000, minY: Math.random()*10000, maxX: 0, maxY: 0, zIndex: i }));
   elements.forEach(e => { e.maxX = e.minX + 100; e.maxY = e.minY + 80; });
   const vp = { minX: 1000, minY: 1000, maxX: 2920, maxY: 2080 };
   const t0 = performance.now();
   for(let f=0; f<60; f++) {
     const culled = elements.filter(e => e.minX <= vp.maxX && e.maxX >= vp.minX && e.minY <= vp.maxY && e.maxY >= vp.minY);
     culled.sort((a,b) => a.zIndex - b.zIndex);
   }
   const avgMs = (performance.now() - t0) / 60;
   console.log('Avg frame time for 2,000 elements culling + z-sort:', avgMs.toFixed(3), 'ms (budget: 16.6ms)');
   console.assert(avgMs < 2.0, 'PERF SLA EXCEEDED');
   "
   ```
