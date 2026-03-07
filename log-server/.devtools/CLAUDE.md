# Browser Log Feed for Claude Code

When the developer asks you to debug a browser error, read the log file below
before responding. It contains real-time output captured from the browser console.

## Log File

.devtools/browser_logs.txt

## Log Format

[ISO-TIMESTAMP] [TYPE ] message  (page url)
          optional stack trace
          Network: METHOD url → STATUS statusText

## Types

- LOG   — console.log
- WARN  — console.warn
- ERROR — console.error / window.onerror
- INFO  — console.info
- DEBUG — console.debug
- NET   — failed fetch / XHR
- REJCT — unhandled promise rejection

## How to Use

When the developer asks 'why is this failing?' or 'what does the error say?':
1. Read .devtools/browser_logs.txt
2. Find the most recent ERROR or REJCT entries
3. Use the stack traces and network details to pinpoint the root cause
4. Suggest targeted fixes based on the actual captured logs
