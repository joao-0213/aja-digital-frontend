# Browser smoke — INT-05

- Command: `playwright-cli run-code --filename docs/http/evidence/INT-05/browser-smoke.js`
- Target: built static preview at `http://127.0.0.1:3001/login`
- Result: passed; page title, login heading, email field, password field, and submit button were present after load.
- Authentication: none; the script enters no credentials and emits no cookies or browser storage.
- Existing browser evidence for authenticated student, teacher, and administrator journeys is recorded in [`../../validation-INT-05.md`](../../validation-INT-05.md).
