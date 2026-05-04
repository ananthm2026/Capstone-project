import Cocoa
import ApplicationServices

// Usage: ax_text_at_cursor <x> <y>
// Prints JSON: {"text": "...", "source": "ax"} or {"text": "", "source": "none"}

func getTextAtPoint(_ point: CGPoint) -> String? {
    // Get the app under the cursor
    guard let app = NSWorkspace.shared.runningApplications.first(where: { app in
        guard app.activationPolicy == .regular else { return false }
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        var element: AXUIElement?
        let result = AXUIElementCopyElementAtPosition(axApp, Float(point.x), Float(point.y), &element)
        return result == .success && element != nil
    }) else { return nil }

    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    var element: AXUIElement?
    let result = AXUIElementCopyElementAtPosition(axApp, Float(point.x), Float(point.y), &element)
    guard result == .success, let el = element else { return nil }

    // Try to get selected text first
    var selectedVal: AnyObject?
    if AXUIElementCopyAttributeValue(el, kAXSelectedTextAttribute as CFString, &selectedVal) == .success,
       let selected = selectedVal as? String, !selected.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return selected.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // Try value (text fields, text areas)
    var valueVal: AnyObject?
    if AXUIElementCopyAttributeValue(el, kAXValueAttribute as CFString, &valueVal) == .success,
       let value = valueVal as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        // Limit to reasonable size
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count <= 2000 { return trimmed }
    }

    // Try title (buttons, labels, links)
    var titleVal: AnyObject?
    if AXUIElementCopyAttributeValue(el, kAXTitleAttribute as CFString, &titleVal) == .success,
       let title = titleVal as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // Try description
    var descVal: AnyObject?
    if AXUIElementCopyAttributeValue(el, kAXDescriptionAttribute as CFString, &descVal) == .success,
       let desc = descVal as? String, !desc.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return desc.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // Walk up parent chain to find text
    var parent: AXUIElement? = el
    for _ in 0..<4 {
        var parentRef: AnyObject?
        guard AXUIElementCopyAttributeValue(parent!, kAXParentAttribute as CFString, &parentRef) == .success,
              let p = parentRef else { break }
        parent = (p as! AXUIElement)

        var pVal: AnyObject?
        if AXUIElementCopyAttributeValue(parent!, kAXValueAttribute as CFString, &pVal) == .success,
           let v = pVal as? String, !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let t = v.trimmingCharacters(in: .whitespacesAndNewlines)
            if t.count <= 2000 { return t }
        }
    }

    return nil
}

// Main
let args = CommandLine.arguments
guard args.count >= 3,
      let x = Double(args[1]),
      let y = Double(args[2]) else {
    print("{\"text\": \"\", \"source\": \"none\", \"error\": \"usage: ax_text_at_cursor x y\"}")
    exit(1)
}

let point = CGPoint(x: x, y: y)
if let text = getTextAtPoint(point) {
    // JSON-escape the text
    let escaped = text
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
        .replacingOccurrences(of: "\n", with: "\\n")
        .replacingOccurrences(of: "\r", with: "\\r")
        .replacingOccurrences(of: "\t", with: "\\t")
    print("{\"text\": \"\(escaped)\", \"source\": \"ax\"}")
} else {
    print("{\"text\": \"\", \"source\": \"none\"}")
}
