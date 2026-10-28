# 📱 Comprehensive UI/UX Audit Skill & Quality Model

## 1. Automated Design Tokens (Responsive & Cross-Platform)

*The headless browser scraper must evaluate computed CSS against these strict responsive rules.*

* **Responsive Breakpoints:**
  * Mobile: `< 768px`
  * Tablet: `768px - 1024px`
  * Desktop: `> 1024px`

* **Spacing Scale:**
  * Base scale is 4px (e.g., 4, 8, 12, 16, 24, 32, 48, 64).
  * All padding, margins, layout gaps, and absolute positioning values must be evenly divisible by 4.

* **Platform-Specific Touch Targets:**
  * Mobile/Tablet: Minimum `48px` by `48px` (iOS HIG & Android Material standard).
  * Desktop Web: Minimum `32px` by `32px`.

* **Accessibility (WCAG 2.2 AA):**
  * Normal text contrast ratio `≥ 4.5:1`.
  * Large text (18pt or 14pt bold) contrast ratio `≥ 3.0:1`.
  * Meaningful elements must not rely on color alone to convey state (e.g., links need underlines, not just a color change).

* **Brand Variables:**
  * Primary: `#0f172a`, Background: `#ffffff`, Danger: `#ef4444`, Success: `#10b981`.
  * Allowed Fonts: `Inter, system-ui, sans-serif`.

## 2. Heuristic Rules (For AI Vision & Layout Analysis)

*The AI vision model must analyze the provided screenshot and DOM to rigorously evaluate the following criteria:*

### A. Responsive & Layout Integrity
* **Mobile Overflow:** Check if any elements bleed off the screen horizontally on mobile viewports, causing a horizontal scrollbar.
* **Target Proximity (Fat-Finger Errors):** Ensure interactive elements on mobile are spaced at least 8px apart so they aren't accidentally tapped simultaneously.
* **Content Wrapping:** Verify that flexbox/grid containers correctly wrap text and cards on smaller screens instead of squishing them beyond legibility.

### B. Visual Hierarchy & Reading Flow (Fitts's Law & Gestalt)
* **CTA Salience:** The primary action on the page must command the most visual weight (highest contrast, largest button). Flag if secondary actions (like "Cancel") compete visually with the primary action (like "Submit").
* **Scanning Patterns:** Check if the layout supports an F-pattern (text-heavy) or Z-pattern (landing page). Elements should not be randomly scattered.
* **Typographic Hierarchy:** `H1` must be visually larger than `H2`, `H2` larger than `H3`, etc. Flag if paragraph text is too small (under 14px for desktop, 16px for mobile) or if line-height makes reading difficult (should be ~1.5x font size).

### C. Consistency & Standards (Nielsen Heuristic #4)
* **Shape Language:** Look at border radiuses. If buttons are pill-shaped (`border-radius: 999px`), cards should not be sharply squared (`border-radius: 0`). Flag inconsistent rounding.
* **Component Usage:** Check if links are styled as buttons, or buttons are styled as text links. Interactive paradigms must be consistent.
* **Shadows and Depth:** Ensure drop-shadows have a consistent light source direction and intensity.

### D. Error Prevention & Feedback (Nielsen Heuristic #5)
* **Form Clarity:** Flag text inputs that rely *only* on placeholder text (which disappears on click) rather than having persistent, visible labels.
* **State Visibility:** Check if disabled buttons are clearly muted/greyed out compared to active buttons.

## 3. Required Output Format (JSON)

*When a violation is found, output a strict JSON array. Each issue must follow this exact structure to ensure non-technical stakeholders understand the problem, while developers get the code needed to fix it.*

```json
{
  "issues": [
    {
      "selector": "The exact CSS selector of the broken element (e.g., '.hero-section > button:nth-child(2)')",
      "what_is_wrong": "Brief, layman's explanation of the problem (e.g., 'The Submit button is too small to tap on mobile.')",
      "why_it_matters": "Layman's explanation of the user impact (e.g., 'Users might accidentally tap the wrong button, causing frustration or abandoned forms.')",
      "layman_fix": "Simple instruction on how to fix it (e.g., 'Make the button taller and wider so it is easier to press.')",
      "developer_instruction": "Specific technical guidance for the dev (e.g., 'Increase height and width to min 48px to meet touch target standards.')",
      "css_patch": {
        "property": "min-height",
        "value": "48px"
      }
    }
  ]
}
```