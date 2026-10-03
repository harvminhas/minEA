# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: add-flow.spec.ts >> BuboMap Add Flow Tests >> 01 - Sign in and access workspace
- Location: tests/add-flow.spec.ts:23:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.fill: Target page, context or browser has been closed
Call log:
  - waiting for locator('input[type="email"]')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - img "BuboMap" [ref=e5]
        - generic [ref=e16]: BuboMap
        - generic [ref=e17]: beta
      - generic [ref=e18]:
        - link "Pricing" [ref=e19] [cursor=pointer]:
          - /url: "#pricing"
        - link "Sign in" [ref=e20] [cursor=pointer]:
          - /url: /auth/sign-in
        - link "Get started free" [ref=e21] [cursor=pointer]:
          - /url: /auth/sign-up
    - main [ref=e22]:
      - generic [ref=e23]:
        - generic [ref=e24]:
          - generic [ref=e25]: Zero TOGAF
          - generic [ref=e26]: Zero consultants
          - generic [ref=e27]: Zero Visio
        - heading "The IT estate your whole team can finally see." [level=1] [ref=e28]
        - paragraph [ref=e29]:
          - text: Leaders need visibility. Architects need a model they can maintain. Engineers need context on what they're touching.
          - strong [ref=e30]: BuboMap gives all three a single connected source of truth
          - text: — without the heavyweight tooling or framework baggage.
        - generic [ref=e31]:
          - link "Get started free" [ref=e32] [cursor=pointer]:
            - /url: /auth/sign-up
          - link "Sign in" [ref=e33] [cursor=pointer]:
            - /url: /auth/sign-in
        - paragraph [ref=e34]: Free for individuals — no credit card required.
        - generic [ref=e35]:
          - generic [ref=e36]: IT leaders
          - generic [ref=e37]: Architects
          - generic [ref=e38]: IT professionals
      - generic [ref=e39]:
        - generic [ref=e40]:
          - article [ref=e41]:
            - paragraph [ref=e42]: For IT leaders
            - heading "Answer executive questions without scrambling" [level=2] [ref=e44]
            - paragraph [ref=e45]:
              - text: Portfolio health, capability gaps, investment mix —
              - strong [ref=e46]: board-ready views derived from your actual repository.
              - text: Not manually assembled every quarter.
          - article [ref=e47]:
            - paragraph [ref=e48]: For architects
            - heading "A model that stays current without heroic effort" [level=2] [ref=e50]
            - paragraph [ref=e51]:
              - text: Every system, capability, and integration is a
              - strong [ref=e52]: real connected object
              - text: — not a shape on a slide. No more Visio files going stale between reviews.
          - article [ref=e53]:
            - paragraph [ref=e54]: For IT professionals
            - heading "Know what you're touching before you touch it" [level=2] [ref=e56]
            - paragraph [ref=e57]:
              - text: Who owns this system. What depends on it. What breaks if it goes down.
              - strong [ref=e58]: Context that used to live in someone's head
              - text: — now in one place.
        - generic [ref=e59]:
          - article [ref=e60]:
            - heading "Know what breaks before it does" [level=2] [ref=e62]
            - paragraph [ref=e63]:
              - text: Surface tech debt, dependency chains, and end-of-life systems
              - strong [ref=e64]: before they become incidents.
              - text: Blast radius and severity — not buried in a spreadsheet.
          - article [ref=e65]:
            - heading "Priced for teams without EA departments" [level=2] [ref=e67]
            - paragraph [ref=e68]:
              - text: LeanIX and Ardoq price out most SMB teams before they start. BuboMap gives you
              - strong [ref=e69]: the same source of truth
              - text: without the six-figure contract.
      - generic [ref=e70]:
        - heading "Simple pricing" [level=2] [ref=e71]
        - paragraph [ref=e72]: Start free. Upgrade when your team is ready.
        - generic [ref=e73]:
          - generic [ref=e74]:
            - heading "Free" [level=3] [ref=e75]
            - paragraph [ref=e76]: $0 forever
            - paragraph [ref=e77]: Everything one person needs to map an architecture.
            - list [ref=e78]:
              - listitem [ref=e79]: All views — heatmap, journeys, investments, tech debt
              - listitem [ref=e82]: Full repository, up to 50 objects
              - listitem [ref=e85]: One workspace, one share link
              - listitem [ref=e88]: Join unlimited workspaces shared with you
            - link "Start free" [ref=e91] [cursor=pointer]:
              - /url: /auth/sign-up
          - generic [ref=e92]:
            - heading "Business" [level=3] [ref=e93]
            - paragraph [ref=e94]: Contact us
            - paragraph [ref=e95]: For teams that run on their architecture model.
            - list [ref=e96]:
              - listitem [ref=e97]: Unlimited workspaces and repository objects
              - listitem [ref=e100]: AI architecture chat
              - listitem [ref=e103]: Team collaboration — contributor licenses, unlimited viewers
              - listitem [ref=e106]: Guided onboarding — we set you up for success
            - link "Talk to us" [ref=e109] [cursor=pointer]:
              - /url: /contact?interest=business
      - paragraph [ref=e110]:
        - text: BuboMap · BOO-bo MAP · bubomap.com ·
        - link "Contact us" [ref=e111] [cursor=pointer]:
          - /url: /contact
  - button "Open Next.js Dev Tools" [ref=e117] [cursor=pointer]
  - alert [ref=e121]
  - button "Open Tanstack query devtools" [ref=e172] [cursor=pointer]
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import path from 'path';
  3   | 
  4   | const BASE_URL = 'http://localhost:3000';
  5   | const TEST_EMAIL = 'test@example.com';
  6   | const TEST_PASSWORD = 'test123456';
  7   | const ORG_SLUG = 'test-org';
  8   | const WORKSPACE_SLUG = 'test-workspace';
  9   | 
  10  | test.describe('BuboMap Add Flow Tests', () => {
  11  |   let page: Page;
  12  | 
  13  |   test.beforeAll(async ({ browser }) => {
  14  |     page = await browser.newPage({
  15  |       viewport: { width: 1280, height: 1024 }
  16  |     });
  17  |   });
  18  | 
  19  |   test.afterAll(async () => {
  20  |     await page.close();
  21  |   });
  22  | 
  23  |   test('01 - Sign in and access workspace', async () => {
  24  |     // Go to login
  25  |     await page.goto(BASE_URL);
  26  |     await page.waitForTimeout(1000);
  27  | 
  28  |     // Sign in
> 29  |     await page.fill('input[type="email"]', TEST_EMAIL);
      |                ^ Error: page.fill: Target page, context or browser has been closed
  30  |     await page.fill('input[type="password"]', TEST_PASSWORD);
  31  |     await page.click('button[type="submit"]');
  32  | 
  33  |     // Wait for redirect
  34  |     await page.waitForTimeout(3000);
  35  | 
  36  |     // Navigate to test workspace
  37  |     await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}`);
  38  |     await page.waitForTimeout(2000);
  39  | 
  40  |     // Verify we're in the workspace
  41  |     await expect(page).toHaveURL(new RegExp(`/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}`));
  42  |   });
  43  | 
  44  |   test('47 - Add existing: "add ms 365"', async () => {
  45  |     // Navigate to Ask
  46  |     await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}/ask`);
  47  |     await page.waitForTimeout(1000);
  48  | 
  49  |     // Type "add ms 365" in Ask bar
  50  |     const askInput = page.locator('#ask-input, [data-ask-input], input[placeholder*="Ask"]').first();
  51  |     await askInput.fill('add ms 365');
  52  |     await askInput.press('Enter');
  53  | 
  54  |     // Wait for result
  55  |     await page.waitForTimeout(2000);
  56  | 
  57  |     // Take screenshot
  58  |     await page.screenshot({
  59  |       path: '/opt/cursor/artifacts/screenshots/real-47-add-existing-record.png',
  60  |       fullPage: false
  61  |     });
  62  | 
  63  |     // Verify RecordCard is shown (no button, no "Added" text)
  64  |     const recordCard = page.locator('text=Microsoft 365').first();
  65  |     await expect(recordCard).toBeVisible();
  66  | 
  67  |     // Verify no "Added" confirmation text
  68  |     const addedText = page.locator('text=/Added.*app/i');
  69  |     await expect(addedText).not.toBeVisible();
  70  | 
  71  |     // Verify no disabled button
  72  |     const disabledButton = page.locator('button:disabled');
  73  |     await expect(disabledButton).toHaveCount(0);
  74  |   });
  75  | 
  76  |   test('48 - Add new items: "add Zoom, NetSuite and Plant scheduling"', async () => {
  77  |     await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}/ask`);
  78  |     await page.waitForTimeout(1000);
  79  | 
  80  |     const askInput = page.locator('#ask-input, [data-ask-input], input[placeholder*="Ask"]').first();
  81  |     await askInput.fill('add Zoom, NetSuite and Plant scheduling');
  82  |     await askInput.press('Enter');
  83  | 
  84  |     await page.waitForTimeout(2000);
  85  | 
  86  |     await page.screenshot({
  87  |       path: '/opt/cursor/artifacts/screenshots/real-48-add-new-cards.png',
  88  |       fullPage: false
  89  |     });
  90  | 
  91  |     // Verify cards are shown
  92  |     const zoomCard = page.locator('text=Zoom').first();
  93  |     await expect(zoomCard).toBeVisible();
  94  | 
  95  |     // Verify only custom item asks hosting
  96  |     const hostingQuestion = page.locator('text=/Where does it live/i');
  97  |     // Only Plant scheduling should ask
  98  |     const plantSchedulingCard = page.locator('text=Plant scheduling').first();
  99  |     await expect(plantSchedulingCard).toBeVisible();
  100 |   });
  101 | 
  102 |   test('49 - Mixed add: "add Zoom, HubSpot and NetSuite"', async () => {
  103 |     await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}/ask`);
  104 |     await page.waitForTimeout(1000);
  105 | 
  106 |     const askInput = page.locator('#ask-input, [data-ask-input], input[placeholder*="Ask"]').first();
  107 |     await askInput.fill('add Zoom, HubSpot and NetSuite');
  108 |     await askInput.press('Enter');
  109 | 
  110 |     await page.waitForTimeout(2000);
  111 | 
  112 |     await page.screenshot({
  113 |       path: '/opt/cursor/artifacts/screenshots/real-49-add-mixed.png',
  114 |       fullPage: false
  115 |     });
  116 | 
  117 |     // Verify HubSpot shows as already existing (AlreadyLine)
  118 |     const hubspotLine = page.locator('text=/HubSpot.*already in your map/i');
  119 |     await expect(hubspotLine).toBeVisible();
  120 | 
  121 |     // Verify button says "Add 2 apps" (not 3)
  122 |     const addButton = page.locator('button:has-text("Add 2 apps")');
  123 |     await expect(addButton).toBeVisible();
  124 |   });
  125 | 
  126 |   test('50 - Save confirmation', async () => {
  127 |     await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}/ask`);
  128 |     await page.waitForTimeout(1000);
  129 | 
```