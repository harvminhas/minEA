# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: add-flow.spec.ts >> BuboMap Add Flow Tests >> 50 - Save confirmation
- Location: tests/add-flow.spec.ts:126:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Target page, context or browser has been closed
Call log:
  - waiting for locator('#ask-input, [data-ask-input], input[placeholder*="Ask"]').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]
  - alert [ref=e11]
  - generic [ref=e13]:
    - generic [ref=e15]:
      - img "BuboMap" [ref=e16]
      - generic [ref=e27]: BuboMap
    - heading "Sign in" [level=1] [ref=e28]
    - paragraph [ref=e29]: Welcome back.
    - button "Continue with Google" [ref=e30] [cursor=pointer]
    - generic [ref=e36]: or continue with email
    - generic [ref=e41]:
      - generic [ref=e42]:
        - generic [ref=e43]: Email
        - textbox "you@company.com" [ref=e44]
      - generic [ref=e45]:
        - generic [ref=e46]: Password
        - textbox "••••••••" [ref=e47]
      - button "Sign in" [ref=e48] [cursor=pointer]
    - paragraph [ref=e49]:
      - text: No account yet?
      - link "Sign up" [ref=e50] [cursor=pointer]:
        - /url: /auth/sign-up?redirect_url=%2Forgs%2Ftest-org%2Fworkspaces%2Ftest-workspace%2Fask
  - button "Open Tanstack query devtools" [ref=e101] [cursor=pointer]
```

# Test source

```ts
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
  130 |     const askInput = page.locator('#ask-input, [data-ask-input], input[placeholder*="Ask"]').first();
> 131 |     await askInput.fill('add Zoom and NetSuite');
      |                    ^ Error: locator.fill: Target page, context or browser has been closed
  132 |     await askInput.press('Enter');
  133 | 
  134 |     await page.waitForTimeout(2000);
  135 | 
  136 |     // Click Add button
  137 |     const addButton = page.locator('button:has-text("Add")').first();
  138 |     await addButton.click();
  139 | 
  140 |     // Wait for save to complete
  141 |     await page.waitForTimeout(3000);
  142 | 
  143 |     await page.screenshot({
  144 |       path: '/opt/cursor/artifacts/screenshots/real-50-add-saved.png',
  145 |       fullPage: false
  146 |     });
  147 | 
  148 |     // Verify confirmation is shown
  149 |     const confirmation = page.locator('text=/Added.*apps/i');
  150 |     await expect(confirmation).toBeVisible();
  151 | 
  152 |     // Verify Undo is available
  153 |     const undoButton = page.locator('button:has-text("Undo")');
  154 |     await expect(undoButton).toBeVisible();
  155 |   });
  156 | });
  157 | 
```