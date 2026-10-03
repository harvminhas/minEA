# BuboMap Add/Setup Features - Verification Status

## Environment Setup ✅

Successfully configured local development environment:

### Services Running:
- **Firebase Auth Emulator**: localhost:9099 (project: demo-minea)
- **API Server**: localhost:8000 (Python/FastAPI)
- **Web Server**: localhost:3000 (Next.js)
- **PostgreSQL**: localhost:5432 (database: minea)

### Test Data:
- **Empty Workspace**: `test-org/empty-workspace` (0 objects, 0 relationships)
- **Meridian Fasteners**: `test-org/meridian-fasteners` (5 objects, 3 relationships)
  - Microsoft 365 (platform)
  - HubSpot (application)
  - QuickBooks Online (application)
  - AS400 (infrastructure/server)
  - Fremont plant (location)
  - Relationships: HubSpot runs_on AS400, QuickBooks runs_on AS400, AS400 located_at Fremont

### Test Infrastructure:
- Playwright configured for screenshot capture (1280x720)
- Firebase emulator wiring (dev-only, env-gated)
- Seed data script for reproducible testing

## Code Structure Analysis

### Existing Implementation Files:
```
lib/setup/
├── setupMin.ts          ✅ SETUP_MIN constant, setupState(), setupGapLine()
├── setupMin.test.ts     ✅ Tests passing  
├── add-intent.ts        ✅ classifyAddIntent(), splitAddList()
├── add-intent.test.ts   ⚠️  Tests exist but need proper runner
├── add-plan.ts          ✅ Planning logic
├── add-plan.test.ts     ⚠️  Tests exist
├── add-cards.ts         ✅ Card-based add logic
├── add-cards.test.ts    ⚠️  Tests exist
├── match-tools.ts       ✅ TOOL_CATALOG, matcher functions
├── match-tools.test.ts  ⚠️  Tests exist
└── use-setup.ts         ✅ Setup hooks

components/
├── mvp/setup-flow.tsx   ✅ Main setup flow component (477 lines)
└── add/
    ├── AddFlow.tsx      ✅ Add flow component (existing)
    └── AddCards.tsx     ✅ Card-based UI components (existing)
```

### Git History:
- Recent commits show active ADD-CARDS implementation work
- Tests added for ADD-CARDS delta
- Card-based components integrated into AddFlow
- Previous failed PR branch: `cursor/audit-fix-add-deltas-16f2` (closed #1)

## Known Issues from User Report

Based on the attached screenshot of "add ms 365" when Microsoft 365 already exists:

### Critical Issues:
1. ❌ **Contradictory state**: Shows both "Already have this" AND "Added 1 app: Microsoft 365" simultaneously
2. ❌ **Debug text visible**: "skipped: all 1 are SaaS" and "Read as a list of apps" showing in UI
3. ❌ **UI clutter**: Kind chips (App/Platform/Server chips) showing when they shouldn't
4. ❌ **Disabled primary button**: Update button is disabled and is the only action available
5. ❌ **No proper handling**: Existing record should show RecordCard, not confirmation

### Design Requirements Not Met:
Per ADD-CARDS.md §47 (add existing record):
- Should show ONLY RecordCard
- No confirmation text
- No primary button
- No "Added" message before save

## Baseline Screenshots Captured

Successfully captured initial state screenshots:
- `38-before-empty-ask.png` - Empty workspace Ask home
- `meridian-ask-baseline.png` - Meridian Ask home  
- `45-before-model-applications.png` - Model Applications view
- `42-before-views-impact.png` - Views Impact
- `43-before-reports.png` - Reports page

Unable to capture "add ms 365" interaction - Ask input field not found (need to investigate DOM structure).

## Next Steps - Verification & Fix Plan

### Phase 2 - Complete Baseline (Current)
- [ ] Investigate Ask page DOM structure
- [ ] Capture remaining mockup states (39-43, 47-50, 44-45)
- [ ] Build comprehensive pass/fail checklist from design docs
- [ ] Document every discrepancy with screenshot evidence

### Phase 3 - Code Fixes
- [ ] Fix AddCards.tsx to handle existing-only records correctly (Rule 1)
- [ ] Fix confirmation timing (only after save resolves, Rule 2)
- [ ] Remove debug strings ("skipped", "Read as a list", kind chips for inferable input, Rule 4)
- [ ] Fix button states (never disabled primary, Rule 3)
- [ ] Review AddFlow.tsx for Ask inline integration

### Phase 4 - Tests
- [ ] Set up proper test runner for *.test.ts files
- [ ] Verify all design doc test cases pass
- [ ] Add new tests for edge cases found
- [ ] E2e test for "add ms 365" already-exists scenario

### Phase 5 - After Screenshots
- [ ] Re-run baseline.spec.ts after fixes
- [ ] Compare before/after for all states
- [ ] Create visual diff artifacts

### Phase 6 - PR
- [ ] Clean commits (no test-results/, playwright-report/, tsconfig.tsbuildinfo)
- [ ] Add playwright-report/ and test-results/ to .gitignore
- [ ] Document emulator setup in PR description
- [ ] Include before/after screenshots in PR
- [ ] List any intentional deviations from design

## Testing Notes

- Firebase emulator works reliably for auth
- API dev bypass (dev_{firebase_uid}) available but not needed
- Seed data is idempotent (can re-run migrations script)
- All services must be running for tests (check with ps aux | grep -E "firebase|uvicorn|next")

## Branch

Working branch: `cursor/verify-and-fix-add-deltas-c31a`
Base branch: `main`
Previous failed PR: #1 (branch: `cursor/audit-fix-add-deltas-16f2`)
