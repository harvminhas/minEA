# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verify-current.spec.ts >> PHASE 2: Real App Verification >> 39 - Paste list and see matches
- Location: e2e/verify-current.spec.ts:203:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.screenshot: Target page, context or browser has been closed
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - button "Open Next.js Dev Tools" [ref=f1e7] [cursor=pointer]
  - alert [ref=f1e11]
  - generic [ref=f1e13]:
    - generic [ref=f1e15]:
      - img "BuboMap" [ref=f1e16]
      - generic [ref=f1e27]: BuboMap
    - heading "Sign in" [level=1] [ref=f1e28]
    - paragraph [ref=f1e29]: Welcome back.
    - button "Continue with Google" [ref=f1e30] [cursor=pointer]
    - generic [ref=f1e36]: or continue with email
    - generic [ref=f1e41]:
      - generic [ref=f1e42]:
        - generic [ref=f1e43]: Email
        - textbox "you@company.com" [ref=f1e44]
      - generic [ref=f1e45]:
        - generic [ref=f1e46]: Password
        - textbox "••••••••" [ref=f1e47]
      - button "Sign in" [ref=f1e48] [cursor=pointer]
    - paragraph [ref=f1e49]:
      - text: No account yet?
      - link "Sign up" [ref=f1e50] [cursor=pointer]:
        - /url: /auth/sign-up?redirect_url=%2Forgs%2Ftest-org%2Fworkspaces%2Fempty-workspace%2Fask
  - button "Open Tanstack query devtools" [ref=f1e101] [cursor=pointer]
```

# Test source

```ts
  137 |       await page.screenshot({ 
  138 |         path: '/opt/cursor/artifacts/screenshots/47-before-result.png',
  139 |         fullPage: true 
  140 |       });
  141 |     } catch (error) {
  142 |       console.log('Ask input error:', error);
  143 |       await page.screenshot({ 
  144 |         path: '/opt/cursor/artifacts/screenshots/47-before-error.png',
  145 |         fullPage: true 
  146 |       });
  147 |     }
  148 |   });
  149 | 
  150 |   test('48/49 - add Zoom, HubSpot and NetSuite (mixed) - CURRENT BEHAVIOR', async ({ page }) => {
  151 |     await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
  152 |     
  153 |     try {
  154 |       const askInput = await findAskInput(page);
  155 |       await askInput.click();
  156 |       await askInput.fill('add Zoom, HubSpot and NetSuite');
  157 |       await page.keyboard.press('Enter');
  158 |       
  159 |       await page.waitForTimeout(3000);
  160 |       
  161 |       await page.screenshot({ 
  162 |         path: '/opt/cursor/artifacts/screenshots/48-before-mixed-result.png',
  163 |         fullPage: true 
  164 |       });
  165 |     } catch (error) {
  166 |       console.log('Mixed add error:', error);
  167 |       await page.screenshot({ 
  168 |         path: '/opt/cursor/artifacts/screenshots/48-before-error.png',
  169 |         fullPage: true 
  170 |       });
  171 |     }
  172 |   });
  173 | 
  174 |   test('48 - add Zoom, NetSuite, Plant scheduling (new) - CURRENT BEHAVIOR', async ({ page }) => {
  175 |     await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
  176 |     
  177 |     try {
  178 |       const askInput = await findAskInput(page);
  179 |       await askInput.click();
  180 |       await askInput.fill('add Zoom, NetSuite and Plant scheduling');
  181 |       await page.keyboard.press('Enter');
  182 |       
  183 |       await page.waitForTimeout(3000);
  184 |       
  185 |       await page.screenshot({ 
  186 |         path: '/opt/cursor/artifacts/screenshots/48-before-new-cards.png',
  187 |         fullPage: true 
  188 |       });
  189 |     } catch (error) {
  190 |       console.log('New cards error:', error);
  191 |     }
  192 |   });
  193 | 
  194 |   test('38 - Empty workspace first-run Ask home', async ({ page }) => {
  195 |     await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/empty-workspace/ask`);
  196 |     
  197 |     await page.screenshot({ 
  198 |       path: '/opt/cursor/artifacts/screenshots/38-before-firstrun.png',
  199 |       fullPage: false 
  200 |     });
  201 |   });
  202 | 
  203 |   test('39 - Paste list and see matches', async ({ page }) => {
  204 |     await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/empty-workspace/ask`);
  205 |     
  206 |     const testList = `Salesforce
  207 | QuickBooks
  208 | M365
  209 | AS400
  210 | Order Entry
  211 | EDI
  212 | Shopify
  213 | label printing`;
  214 |     
  215 |     try {
  216 |       const setupInput = page.locator('textarea, input[type="text"]').first();
  217 |       await setupInput.click();
  218 |       await setupInput.fill(testList);
  219 |       
  220 |       await page.screenshot({ 
  221 |         path: '/opt/cursor/artifacts/screenshots/39-before-pasted.png',
  222 |         fullPage: false 
  223 |       });
  224 |       
  225 |       const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
  226 |       if (await continueButton.count() > 0) {
  227 |         await continueButton.click();
  228 |         await page.waitForTimeout(2000);
  229 |         
  230 |         await page.screenshot({ 
  231 |           path: '/opt/cursor/artifacts/screenshots/39-before-matched.png',
  232 |           fullPage: true 
  233 |         });
  234 |       }
  235 |     } catch (error) {
  236 |       console.log('First-run paste error:', error);
> 237 |       await page.screenshot({ 
      |                  ^ Error: page.screenshot: Target page, context or browser has been closed
  238 |         path: '/opt/cursor/artifacts/screenshots/39-before-error.png',
  239 |         fullPage: true 
  240 |       });
  241 |     }
  242 |   });
  243 | 
  244 |   test('40 - Where it lives step', async ({ page }) => {
  245 |     await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/empty-workspace/ask`);
  246 |     
  247 |     const testList = 'Salesforce, QuickBooks, M365';
  248 |     
  249 |     try {
  250 |       const setupInput = page.locator('textarea, input[type="text"]').first();
  251 |       await setupInput.fill(testList);
  252 |       
  253 |       const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
  254 |       if (await continueButton.count() > 0) {
  255 |         await continueButton.click();
  256 |         await page.waitForTimeout(2000);
  257 |         
  258 |         const nextButton = page.locator('button:has-text("Next")').first();
  259 |         if (await nextButton.count() > 0) {
  260 |           await nextButton.click();
  261 |           await page.waitForTimeout(2000);
  262 |           
  263 |           await page.screenshot({ 
  264 |             path: '/opt/cursor/artifacts/screenshots/40-before-where-lives.png',
  265 |             fullPage: true 
  266 |           });
  267 |         }
  268 |       }
  269 |     } catch (error) {
  270 |       console.log('Where-lives error:', error);
  271 |     }
  272 |   });
  273 | 
  274 |   test('44 - Add from Ask bar with + button', async ({ page }) => {
  275 |     await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
  276 |     
  277 |     const addButton = page.locator('button:has-text("+"), button[aria-label*="Add"]').first();
  278 |     if (await addButton.count() > 0) {
  279 |       await addButton.click();
  280 |       await page.waitForTimeout(1000);
  281 |       
  282 |       await page.screenshot({ 
  283 |         path: '/opt/cursor/artifacts/screenshots/44-before-add-button.png',
  284 |         fullPage: false 
  285 |       });
  286 |     } else {
  287 |       await page.screenshot({ 
  288 |         path: '/opt/cursor/artifacts/screenshots/44-before-no-button.png',
  289 |         fullPage: false 
  290 |       });
  291 |     }
  292 |   });
  293 | 
  294 |   test('45 - Model Applications Add button', async ({ page }) => {
  295 |     await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/model/applications`);
  296 |     
  297 |     await page.screenshot({ 
  298 |       path: '/opt/cursor/artifacts/screenshots/45-before-model.png',
  299 |       fullPage: false 
  300 |     });
  301 |     
  302 |     const addButton = page.locator('button:has-text("Add"), button:has-text("+")').first();
  303 |     if (await addButton.count() > 0) {
  304 |       await addButton.click();
  305 |       await page.waitForTimeout(1000);
  306 |       
  307 |       await page.screenshot({ 
  308 |         path: '/opt/cursor/artifacts/screenshots/45-before-add-opened.png',
  309 |         fullPage: true 
  310 |       });
  311 |     }
  312 |   });
  313 | });
  314 | 
```