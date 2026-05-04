import Foundation
import IOKit
import IOKit.hid

// fn_watcher — watches for fn key (usage 0xFF00003) via IOHIDManager
// Prints "down" on press, "up" on release, then flushes stdout
// Used by main.js via child_process spawn

let manager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))

let matchingDict: CFDictionary = [
    kIOHIDDeviceUsagePageKey: kHIDPage_GenericDesktop,
    kIOHIDDeviceUsageKey: kHIDUsage_GD_Keyboard
] as NSDictionary as CFDictionary

IOHIDManagerSetDeviceMatching(manager, matchingDict)

IOHIDManagerRegisterInputValueCallback(manager, { context, result, sender, value in
    let elem = IOHIDValueGetElement(value)
    let usagePage = IOHIDElementGetUsagePage(elem)
    let usage = IOHIDElementGetUsage(elem)
    let intVal = IOHIDValueGetIntegerValue(value)

    // fn key: usagePage=0xFF, usage=0x03 (vendor-defined)
    if usagePage == 0xFF && usage == 0x03 {
        if intVal == 1 {
            print("down")
        } else {
            print("up")
        }
        fflush(stdout)
    }
}, nil)

IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetCurrent(), CFRunLoopMode.defaultMode.rawValue)
IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))

RunLoop.current.run()
  