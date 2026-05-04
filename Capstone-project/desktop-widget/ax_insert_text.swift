import Cocoa
import ApplicationServices

// Usage: ax_insert_text "text to insert"
// Finds the focused UI element in the frontmost app and inserts text into it.
// Works with native text fields, contenteditable (via AX), Slack, Gmail, etc.

func getFocusedElement() -> AXUIElement? {
    // Get the frontmost application
    guard let frontApp = NSWorkspace.shared.frontmostApplication else { return nil }
    let appElement = AXUIElementCreateApplication(frontApp.processIdentifier)
    
    // Get the focused UI element
    var focusedElement: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedElement)
    guard result == .success, let element = focusedElement else { return nil }
    return (element as! AXUIElement)
}

func insertText(_ text: String) -> Bool {
    guard let element = getFocusedElement() else {
        fputs("Error: No focused element found\n", stderr)
        return false
    }
    
    // Check if element is settable
    var settable: DarwinBoolean = false
    AXUIElementIsAttributeSettable(element, kAXValueAttribute as CFString, &settable)
    
    if settable.boolValue {
        // Get existing value and append, or just set
        var existingValue: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &existingValue)
        let existing = (existingValue as? String) ?? ""
        
        // Get selected text range to insert at cursor position
        var selectedRangeValue: CFTypeRef?
        let rangeResult = AXUIElementCopyAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, &selectedRangeValue)
        
        if rangeResult == .success, let rangeVal = selectedRangeValue {
            var range = CFRange()
            AXValueGetValue(rangeVal as! AXValue, AXValueType.cfRange, &range)
            
            // Insert at cursor position
            let nsStr = existing as NSString
            let insertPos = min(range.location, nsStr.length)
            let newStr = nsStr.substring(to: insertPos) + text + nsStr.substring(from: min(insertPos + range.length, nsStr.length))
            
            let setResult = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, newStr as CFString)
            if setResult == .success {
                // Move cursor to end of inserted text
                var newRange = CFRange(location: insertPos + text.count, length: 0)
                if let newRangeVal = AXValueCreate(AXValueType.cfRange, &newRange) {
                    AXUIElementSetAttributeValue(element, kAXSelectedTextRangeAttribute as CFString, newRangeVal)
                }
                return true
            }
        }
        
        // Fallback: just set the full value
        let setResult = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, text as CFString)
        return setResult == .success
    }
    
    // Element not directly settable — use clipboard + Cmd+V as fallback
    return false
}

// ── Main ──────────────────────────────────────────────────────────────────────
let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("Usage: ax_insert_text <text>\n", stderr)
    exit(1)
}

let textToInsert = args[1]

if insertText(textToInsert) {
    print("{\"success\":true}")
    exit(0)
} else {
    // Return false so caller can fall back to clipboard paste
    print("{\"success\":false}")
    exit(1)
}
