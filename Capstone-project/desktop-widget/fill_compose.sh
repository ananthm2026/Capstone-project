#!/bin/bash
# fill_compose.sh <target> <subject> <body>
TARGET="$1"
SUBJECT="$2"
BODY="$3"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

BODY_B64=$(printf '%s' "$BODY" | base64 | tr -d '\n')
SUBJ_B64=$(printf '%s' "$SUBJECT" | base64 | tr -d '\n')

# ── Run AppleScript from temp file ────────────────────────────────────────────
run_as() {
  local tmp=$(mktemp /tmp/fill_as_XXXXXX.scpt)
  printf '%s' "$1" > "$tmp"
  osascript "$tmp" 2>/dev/null
  local rc=$?
  rm -f "$tmp"
  return $rc
}

# ── Bring a browser tab with matching URL to front, then return its tab ref ──
activate_browser_tab() {
  local url_pat="$1"
  run_as "
set urlPat to \"$url_pat\"
set browsers to {\"Google Chrome\", \"Brave Browser\", \"Microsoft Edge\"}
repeat with bname in browsers
  try
    tell application bname
      repeat with w in windows
        set tidx to 1
        repeat with t in tabs of w
          if URL of t contains urlPat then
            set active tab index of w to tidx
            set index of w to 1
            activate
            return \"ok:\" & bname
          end if
          set tidx to tidx + 1
        end repeat
      end repeat
    end tell
  end try
end repeat
return \"no_tab\"
"
}

# ── Inject JS into a tab WITHOUT bringing it to front ────────────────────────
inject_to_tab() {
  local url_pat="$1"
  local js="$2"
  local tmp=$(mktemp /tmp/fill_js_XXXXXX.js)
  printf '%s' "$js" > "$tmp"
  run_as "
set urlPat to \"$url_pat\"
set jsFile to \"$tmp\"
set jsCode to \"\"
try
  set fRef to open for access POSIX file jsFile
  set jsCode to read fRef
  close access fRef
end try
do shell script \"rm -f \" & quoted form of jsFile
set browsers to {\"Google Chrome\", \"Brave Browser\", \"Microsoft Edge\"}
repeat with bname in browsers
  try
    tell application bname
      repeat with w in windows
        set tidx to 1
        repeat with t in tabs of w
          if URL of t contains urlPat then
            execute t javascript jsCode
            return \"ok\"
          end if
          set tidx to tidx + 1
        end repeat
      end repeat
    end tell
  end try
end repeat
return \"no_tab\"
"
}

# ── Activate browser tab then paste via clipboard ─────────────────────────────
activate_and_paste() {
  local url_pat="$1"
  local text="$2"
  # Write to clipboard first
  printf '%s' "$text" | pbcopy
  # Bring the tab to front
  activate_browser_tab "$url_pat"
  sleep 0.5
  # Cmd+V into whatever is focused
  osascript -e 'tell application "System Events" to keystroke "v" using command down' 2>/dev/null
}

# ── Gmail: subject + body via JS injection ────────────────────────────────────
GMAIL_JS="(function(){
  var sv=atob('$SUBJ_B64');var bv=atob('$BODY_B64');
  var s=document.querySelector('input[name=subjectbox]')||document.querySelector('.aoT');
  if(s){s.focus();var nv=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    if(nv&&nv.set)nv.set.call(s,sv);s.dispatchEvent(new Event('input',{bubbles:true}));}
  var b=document.querySelector('div[aria-label=\"Message Body\"]')||
        document.querySelector('div[aria-label=\"Message body\"]')||
        document.querySelector('div[g_editable=\"true\"]')||
        document.querySelector('div.Am.Al.editable')||
        document.querySelector('div[contenteditable][tabindex=\"1\"]');
  if(!b){var all=Array.from(document.querySelectorAll('[contenteditable]'));
    for(var i=0;i<all.length;i++){var lbl=(all[i].getAttribute('aria-label')||'').toLowerCase();
      if(lbl.indexOf('message')>-1||all[i].getAttribute('g_editable')||
         (all[i].className||'').indexOf('Am')>-1){b=all[i];break;}}
    if(!b&&all.length>0)b=all[all.length-1];}
  if(b){b.click();b.focus();document.execCommand('selectAll',false,null);
    document.execCommand('insertText',false,bv);b.dispatchEvent(new InputEvent('input',{bubbles:true}));}
  return 'subj:'+(s?'ok':'miss')+',body:'+(b?'ok':'miss');
})();"

# ── Slack: message compose box ────────────────────────────────────────────────
SLACK_JS="(function(){
  var bv=atob('$BODY_B64');
  // Slack's compose box — try multiple selectors
  var ed=document.querySelector('.ql-editor[data-placeholder]')||
         document.querySelector('[data-qa=\"message_input\"] .ql-editor')||
         document.querySelector('.c-texty_input .ql-editor')||
         document.querySelector('[contenteditable=\"true\"][role=\"textbox\"]')||
         document.querySelector('.p-rich_text_input .ql-editor');
  if(!ed){
    var all=Array.from(document.querySelectorAll('[contenteditable=\"true\"]'));
    for(var i=0;i<all.length;i++){
      var ph=(all[i].getAttribute('data-placeholder')||'').toLowerCase();
      if(ph.indexOf('message')>-1||ph.indexOf('type')>-1||ph.indexOf('talk')>-1){ed=all[i];break;}
    }
    if(!ed&&all.length>0)ed=all[all.length-1];
  }
  if(ed){
    ed.click();ed.focus();
    document.execCommand('selectAll',false,null);
    document.execCommand('insertText',false,bv);
    ed.dispatchEvent(new InputEvent('input',{bubbles:true}));
    return 'ok:'+ed.className.substring(0,40);
  }
  return 'miss';
})();"

# ── WhatsApp Web: message input ───────────────────────────────────────────────
WHATSAPP_JS="(function(){
  var bv=atob('$BODY_B64');
  // WhatsApp Web compose box
  var ed=document.querySelector('div[contenteditable=\"true\"][data-tab=\"10\"]')||
         document.querySelector('footer [contenteditable=\"true\"]')||
         document.querySelector('div[contenteditable=\"true\"][spellcheck=\"true\"]')||
         document.querySelector('[data-testid=\"conversation-compose-box-input\"]')||
         document.querySelector('div[contenteditable=\"true\"][role=\"textbox\"]');
  if(!ed){
    var all=Array.from(document.querySelectorAll('[contenteditable=\"true\"]'));
    for(var i=0;i<all.length;i++){
      var ph=(all[i].getAttribute('data-placeholder')||'').toLowerCase();
      if(ph.indexOf('message')>-1||ph.indexOf('type')>-1){ed=all[i];break;}
    }
    if(!ed&&all.length>0)ed=all[all.length-1];
  }
  if(ed){
    ed.click();ed.focus();
    // WhatsApp needs nativeInputValueSetter approach or execCommand
    document.execCommand('selectAll',false,null);
    document.execCommand('insertText',false,bv);
    ed.dispatchEvent(new InputEvent('input',{bubbles:true,data:bv}));
    return 'ok';
  }
  return 'miss';
})();"

# ── LinkedIn: post / message compose ─────────────────────────────────────────
# LinkedIn modals close when JS executes from AppleScript, so we must:
# 1. Activate the tab (bring it to front)
# 2. Wait for focus to settle
# 3. Paste via clipboard into the already-focused compose box
LINKEDIN_JS="(function(){
  var bv=atob('$BODY_B64');
  // LinkedIn post editor or message compose
  var ed=document.querySelector('.ql-editor[contenteditable=\"true\"]')||
         document.querySelector('[data-placeholder*=\"post\"] [contenteditable]')||
         document.querySelector('[data-placeholder*=\"Write\"] [contenteditable]')||
         document.querySelector('.msg-form__contenteditable')||
         document.querySelector('[contenteditable=\"true\"][role=\"textbox\"]')||
         document.querySelector('.share-creation-state__text-editor [contenteditable]');
  if(!ed){
    var all=Array.from(document.querySelectorAll('[contenteditable=\"true\"]'));
    for(var i=0;i<all.length;i++){
      var ph=(all[i].getAttribute('data-placeholder')||'').toLowerCase();
      if(ph.indexOf('post')>-1||ph.indexOf('write')>-1||ph.indexOf('share')>-1||ph.indexOf('message')>-1){ed=all[i];break;}
    }
    if(!ed&&all.length>0)ed=all[all.length-1];
  }
  if(ed){
    ed.click();ed.focus();
    document.execCommand('selectAll',false,null);
    document.execCommand('insertText',false,bv);
    ed.dispatchEvent(new InputEvent('input',{bubbles:true}));
    return 'ok';
  }
  return 'miss';
})();"

# ══════════════════════════════════════════════════════════════════════════════
case "$TARGET" in
  gmail)
    # app.hide() gave Chrome focus. Gmail compose is open.
    # Fill subject via JS (safe — doesn't close compose), then focus body and paste.
    SUBJ_ESCAPED=$(printf '%s' "$SUBJECT" | sed "s/'/\\\\'/g")
    osascript << ASEOF
tell application "Google Chrome"
  set js to "(function(){
    var s = document.querySelector('input[name=subjectbox]') || document.querySelector('.aoT');
    if (s) {
      s.click(); s.focus();
      var nv = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (nv && nv.set) nv.set.call(s, '$SUBJ_ESCAPED');
      s.dispatchEvent(new Event('input', {bubbles:true}));
    }
    var b = document.querySelector('div[aria-label=\"Message Body\"]') ||
            document.querySelector('div[aria-label=\"Message body\"]') ||
            document.querySelector('div[g_editable=\"true\"]') ||
            document.querySelector('div.Am.Al.editable');
    if (!b) {
      var all = Array.from(document.querySelectorAll('[contenteditable]'));
      for (var i = 0; i < all.length; i++) {
        var lbl = (all[i].getAttribute('aria-label') || '').toLowerCase();
        if (lbl.indexOf('message') > -1 || all[i].getAttribute('g_editable') || (all[i].className || '').indexOf('Am') > -1) {
          b = all[i]; break;
        }
      }
    }
    if (b) { b.click(); b.focus(); return 'ok'; }
    return 'miss';
  })()"
  execute active tab of front window javascript js
end tell
ASEOF
    printf '%s' "$BODY" | pbcopy
    sleep 0.3
    osascript -e 'tell application "System Events" to keystroke "v" using command down'
    echo "gmail: done"
    ;;

  linkedin)
    # Same — Electron is hidden, Chrome has focus, modal is still open.
    printf '%s' "$BODY" | pbcopy
    sleep 0.3
    osascript -e 'tell application "System Events" to keystroke "v" using command down'
    echo "linkedin: done"
    ;;

  slack)
    printf '%s' "$BODY" | pbcopy
    sleep 0.3
    osascript -e 'tell application "System Events" to keystroke "v" using command down'
    echo "slack: done"
    ;;

  whatsapp)
    printf '%s' "$BODY" | pbcopy
    sleep 0.3
    osascript -e 'tell application "System Events" to keystroke "v" using command down'
    echo "whatsapp: done"
    ;;

  outlook)
    printf '%s' "$BODY" | pbcopy
    sleep 0.3
    osascript -e 'tell application "System Events" to keystroke "v" using command down'
    echo "outlook: done"
    ;;

  applemail)
    run_as "tell application \"Mail\"
  set newMsg to make new outgoing message with properties {subject:\"$SUBJECT\", content:\"$BODY\", visible:true}
  activate
end tell"
    ;;

  *)
    # Generic fallback: try AX insert, then clipboard
    "$SCRIPT_DIR/ax_insert_text" "$BODY" 2>/dev/null || (printf '%s' "$BODY" | pbcopy)
    ;;
esac
exit 0
