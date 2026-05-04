# Master UI Enhancement Prompt - Home.jsx Output Box Redesign

## Overview
Redesign the transcript output interface with improved layout, toolbar organization, tone management, and output comparison functionality.

---

## Change Requirements

### 1. **Fix Start Speaking Disappearance After Recording**
- **Issue**: After recording completes, the "Press Start Speaking to begin" empty state disappears unexpectedly
- **Solution**: Ensure the empty state only shows when `!editableTranscript` condition is true
- **Implementation**: Verify state management in `handleFileTranscribed` and recording completion callbacks

### 2. **Output Box Full-Page Fit**
- **Current**: Output box may scroll or not fit completely
- **Target**: Output box should fit completely within viewport without requiring scroll
- **Changes**:
  - Adjust main container: `flex: 1` with `maxHeight: 'calc(100vh - 120px)'`
  - Set textarea height to fit available space with overflow handling
  - Use `overflow: auto` on transcript textarea instead of `rows` calculation

### 3. **Toolbar Reorganization - Top Left Corner**
- **Current Buttons Location**: Speak, Copy, Save, Clear at top right
- **New Location**: Move these 4 buttons to **top left corner** of output box
- **Styling**:
  - Horizontal flex layout: `flex items-center gap-2`
  - Smaller icons: Use `w-3.5 h-3.5` instead of `w-4 h-4`
  - Compact padding: `px-2 py-1` instead of `px-3 py-1.5`
  - Arrange as: `[Speech Icon] [Copy] [Save] [Clear]`

### 4. **New Control Buttons - Replace Current Action Buttons**
- **Old Location**: Where Speak/Copy/Save/Clear were
- **New Buttons** (top right area):
  1. **Language Selector** (dropdown)
     - Default: "English"
     - Options: Show available target languages
     - Icon: `Globe` from lucide-react
  
  2. **Translate Button**
     - Trigger translation to selected language
     - Icon: `ArrowLeftRight`
     - Action: Send transcript to backend translation API
  
  3. **Retone Button** (special dropdown)
     - Opens tone selection dropdown
     - No immediate action on click
     - Only applies when user confirms with checkmark

### 5. **Retone Dropdown with Confirmation**
- **Trigger**: User clicks "Retone" button
- **Dropdown Structure**:
  ```
  ┌─────────────────────┐
  │ Email Formal   ◐    │
  │ Email Casual        │
  │ Slack               │
  │ LinkedIn            │
  │ WhatsApp Business   │
  │ Custom              │
  │─────────────────────│
  │ ✓ Apply             │
  └─────────────────────┘
  ```
- **Behavior**:
  - Radio button selection (only one active at a time)
  - Selected tone shows checkmark/highlight
  - "Apply" button at bottom executes retoning
  - On Apply: Call retoning API and show result

### 6. **Retoned Output Display**
- **Output Location**: Same textarea location as original transcript
- **Toggle Requirement**: User can switch between:
  - Original transcribed text
  - Retoned text version
- **Data Structure**:
  - Store both: `editableTranscript` (original) and `rewrittenText` (retoned)
  - Show one-at-a-time based on toggle state

### 7. **Send Icon - Bottom Right**
- **Location**: Bottom right corner of output box
- **Icon**: `Send` from lucide-react
- **Styling**:
  - Position: Sticky/fixed relative to output box
  - Size: `w-5 h-5`
  - Color: `text-saffron` or primary color
  - Hover: Scale/color transition
- **Action**: Open channel modal (email, Slack, LinkedIn, etc.)

### 8. **Original/Retoned Toggle**
- **Location**: Below the textarea or in the transcript header
- **Design Options**:
  - Option A: Pill-style toggle switch
    ```
    [Original] / [Retoned] ← Currently showing indicator
    ```
  - Option B: Inline buttons with indicator
    ```
    📄 Original  ✏️ Retoned (currently showing)
    ```
- **Behavior**:
  - Toggle switches displayed content in textarea
  - Preserves both versions independently
  - Remembers last selection during session

---

## Layout Structure (New Design)

```
┌─────────────────────────────────────────────────────┐
│ TRANSCRIPT HEADER                                   │
│ [Speech] [Copy] [Save] [Clear]  ┌─────────────────┐│
│                               │ [Language ▼]   ││
│                               │ [Translate ]   ││
│                               │ [Retone ▼]     ││
│                               └─────────────────┘│
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Original] / [Retoned]  ← Toggle indicator        │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ Yes, right. My name is Praveen Kumar.        │  │
│  │                                              │  │
│  │ [textarea fits entire available space]      │  │
│  │                                              │  │
│  │                                              │  │
│  └──────────────────────────────────────────────┘  │
│                                      [Send icon] ➤  │
│                                                     │
├─────────────────────────────────────────────────────┤
│ [Confidence] [Sentiment] [Word count] [Char count]  │
│                                                     │
│ [AI Tools] ▼                                        │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Steps

1. **State Management Updates**
   - Add: `selectedRetoneOption` state for tone selection
   - Add: `showOriginalTranscript` boolean toggle state
   - Keep: `editableTranscript`, `rewrittenText` existing states

2. **Render Conditional Content**
   - Move Speak/Copy/Save/Clear buttons to top-left using conditional render
   - Create new control buttons component on top-right
   - Add toggle component below header

3. **Textarea Management**
   - Remove `rows` calculation, use height-based sizing
   - Add `overflow: auto` for scrolling
   - Display content based on `showOriginalTranscript` toggle

4. **Dropdown Components**
   - Create `RetoneDropdown` component with tone options + apply button
   - Integrate with existing retone handler

5. **Styling & Layout**
   - Use flexbox for button grouping
   - Add proper spacing (gap-2, gap-1 variants)
   - Ensure output box doesn't exceed viewport height

6. **API Integrations**
   - Translate button → calls translation API with selected language
   - Retone Apply → calls existing rewrite endpoint with selected tone
   - Send icon → opens channel modal with either original or retoned text

---

## Key Files to Modify

- **[react-frontend/src/pages/Home.jsx](react-frontend/src/pages/Home.jsx)** (Main changes)
- **[react-frontend/src/components/RecordingControls.jsx](react-frontend/src/components/RecordingControls.jsx)** (If needed for state sync)
- **[react-frontend/src/services/api.js](react-frontend/src/services/api.js)** (Add translation endpoint if missing)

---

## Design System to Apply

- **Colors**: 
  - Primary: `var(--saffron)` #E8820C
  - Surface: `var(--surface)` #FDFAF4
  - Icons: `text-gray-500` (inactive), `text-gray-900` (active)
  
- **Typography**:
  - Labels: DM Sans, 11px, bold, uppercase, tracking-widest
  - Content: DM Sans, 13px-16px
  
- **Spacing**:
  - Button gaps: `gap-2` (standard), `gap-1` (compact)
  - Container padding: `24px`
  - Header margin-bottom: `mb-4`
  
- **Shadows**:
  - `shadow-sm` for dropdowns
  - `shadow-lg` for elevated modals

---

## Testing Checklist

- [ ] Textarea fits completely on page without scrolling (on standard 1080p display)
- [ ] All 4 action buttons visible in top-left corner
- [ ] Language selector works and shows available languages
- [ ] Translate button triggers API and shows result
- [ ] Retone dropdown opens with all tone options
- [ ] Clicking tone option in dropdown shows selection indicator
- [ ] Clicking "Apply" in retone dropdown triggers retoning
- [ ] Retoned text displays in same textarea location
- [ ] Original/Retoned toggle switches between both versions
- [ ] Send icon visible at bottom-right and opens channel modal
- [ ] All states persist during session (language, toggle selection, etc.)
- [ ] Empty state still shows correctly before first recording

---

## Notes

- Preserve existing functionality: Summarize, Meeting Notes, Q&A, Share Link
- Keep confidence badge and sentiment indicator visible
- Maintain keyboard shortcuts (⌘+Enter, etc.)
- Ensure responsive design works on tablet/mobile (if applicable)
