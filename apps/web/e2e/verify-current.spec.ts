import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const FIREBASE_AUTH_EMULATOR = 'http://localhost:9099';

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'password123';

async function createEmulatorUser(email: string, password: string): Promise<{ idToken: string; localId: string }> {
  const response = await fetch(
    `${FIREBASE_AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );
  const data = await response.json();
  if (!response.ok && data.error?.message !== 'EMAIL_EXISTS') {
    throw new Error(`Failed to create user: ${JSON.stringify(data)}`);
  }
  
  if (data.localId) {
    const updateResponse = await fetch(
      `${FIREBASE_AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localId: data.localId,
          emailVerified: true,
        }),
      }
    );
    await updateResponse.json();
  }
  
  return data;
}

async function bypassAuthAndNavigate(page: Page, workspaceUrl: string) {
  const userToken = await createAuthenticatedSession(TEST_EMAIL, TEST_PASSWORD);
  
  await page.goto(BASE_URL);
  
  if (userToken?.idToken) {
    await page.evaluate((token) => {
      localStorage.setItem('firebase:authUser:demo-api-key:[DEFAULT]', JSON.stringify({
        uid: 'test-user-001',
        email: 'test@example.com',
        emailVerified: true,
        stsTokenManager: {
          refreshToken: token,
          accessToken: token,
          expirationTime: Date.now() + 3600000
        }
      }));
    }, userToken.idToken);
  }
  
  await page.goto(workspaceUrl);
  await page.waitForTimeout(2000);
}

async function createAuthenticatedSession(email: string, password: string) {
  const response = await fetch(
    `${FIREBASE_AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );
  return response.json();
}

async function findAskInput(page: Page) {
  const selectors = [
    'textarea[placeholder*="Ask"]',
    'input[placeholder*="Ask"]',
    'textarea',
    '[data-testid="ask-input"]',
    '[role="textbox"]',
  ];
  
  for (const selector of selectors) {
    const element = page.locator(selector).first();
    if (await element.count() > 0) {
      console.log(`Found Ask input with selector: ${selector}`);
      return element;
    }
  }
  
  throw new Error('Could not find Ask input field');
}

test.describe('PHASE 2: Real App Verification', () => {
  test.beforeAll(async () => {
    try {
      await createEmulatorUser(TEST_EMAIL, TEST_PASSWORD);
      console.log('Test user created');
    } catch (error) {
      console.log('User setup:', error);
    }
  });

  test('47 - add ms 365 (existing record) - CURRENT BEHAVIOR', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
    
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/screenshots/47-before-ask-home.png',
      fullPage: false 
    });
    
    try {
      const askInput = await findAskInput(page);
      await askInput.click();
      await askInput.fill('add ms 365');
      
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/47-before-typed.png',
        fullPage: false 
      });
      
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(3000);
      
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/47-before-result.png',
        fullPage: true 
      });
    } catch (error) {
      console.log('Ask input error:', error);
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/47-before-error.png',
        fullPage: true 
      });
    }
  });

  test('48/49 - add Zoom, HubSpot and NetSuite (mixed) - CURRENT BEHAVIOR', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
    
    try {
      const askInput = await findAskInput(page);
      await askInput.click();
      await askInput.fill('add Zoom, HubSpot and NetSuite');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(3000);
      
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/48-before-mixed-result.png',
        fullPage: true 
      });
    } catch (error) {
      console.log('Mixed add error:', error);
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/48-before-error.png',
        fullPage: true 
      });
    }
  });

  test('48 - add Zoom, NetSuite, Plant scheduling (new) - CURRENT BEHAVIOR', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
    
    try {
      const askInput = await findAskInput(page);
      await askInput.click();
      await askInput.fill('add Zoom, NetSuite and Plant scheduling');
      await page.keyboard.press('Enter');
      
      await page.waitForTimeout(3000);
      
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/48-before-new-cards.png',
        fullPage: true 
      });
    } catch (error) {
      console.log('New cards error:', error);
    }
  });

  test('38 - Empty workspace first-run Ask home', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/empty-workspace/ask`);
    
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/screenshots/38-before-firstrun.png',
      fullPage: false 
    });
  });

  test('39 - Paste list and see matches', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/empty-workspace/ask`);
    
    const testList = `Salesforce
QuickBooks
M365
AS400
Order Entry
EDI
Shopify
label printing`;
    
    try {
      const setupInput = page.locator('textarea, input[type="text"]').first();
      await setupInput.click();
      await setupInput.fill(testList);
      
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/39-before-pasted.png',
        fullPage: false 
      });
      
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
      if (await continueButton.count() > 0) {
        await continueButton.click();
        await page.waitForTimeout(2000);
        
        await page.screenshot({ 
          path: '/opt/cursor/artifacts/screenshots/39-before-matched.png',
          fullPage: true 
        });
      }
    } catch (error) {
      console.log('First-run paste error:', error);
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/39-before-error.png',
        fullPage: true 
      });
    }
  });

  test('40 - Where it lives step', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/empty-workspace/ask`);
    
    const testList = 'Salesforce, QuickBooks, M365';
    
    try {
      const setupInput = page.locator('textarea, input[type="text"]').first();
      await setupInput.fill(testList);
      
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
      if (await continueButton.count() > 0) {
        await continueButton.click();
        await page.waitForTimeout(2000);
        
        const nextButton = page.locator('button:has-text("Next")').first();
        if (await nextButton.count() > 0) {
          await nextButton.click();
          await page.waitForTimeout(2000);
          
          await page.screenshot({ 
            path: '/opt/cursor/artifacts/screenshots/40-before-where-lives.png',
            fullPage: true 
          });
        }
      }
    } catch (error) {
      console.log('Where-lives error:', error);
    }
  });

  test('44 - Add from Ask bar with + button', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
    
    const addButton = page.locator('button:has-text("+"), button[aria-label*="Add"]').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/44-before-add-button.png',
        fullPage: false 
      });
    } else {
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/44-before-no-button.png',
        fullPage: false 
      });
    }
  });

  test('45 - Model Applications Add button', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/model/applications`);
    
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/screenshots/45-before-model.png',
      fullPage: false 
    });
    
    const addButton = page.locator('button:has-text("Add"), button:has-text("+")').first();
    if (await addButton.count() > 0) {
      await addButton.click();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: '/opt/cursor/artifacts/screenshots/45-before-add-opened.png',
        fullPage: true 
      });
    }
  });
});
