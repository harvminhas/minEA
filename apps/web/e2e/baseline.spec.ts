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

test.describe('BuboMap Baseline Screenshots', () => {
  test.beforeAll(async () => {
    try {
      await createEmulatorUser(TEST_EMAIL, TEST_PASSWORD);
      console.log('Test user created in Firebase emulator');
    } catch (error) {
      console.log('User creation status:', error);
    }
  });

  test('38 - Empty workspace Ask home', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/empty-workspace/ask`);
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/screenshots/38-before-empty-ask.png',
      fullPage: false 
    });
  });

  test('Meridian Ask home (baseline)', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/screenshots/meridian-ask-baseline.png',
      fullPage: false 
    });
  });

  test('Test add ms 365 - already exists issue', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
    await page.waitForTimeout(1000);
    
    const askInput = page.locator('input[placeholder*="Ask"], textarea[placeholder*="Ask"]').first();
    await askInput.fill('add ms 365');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(3000);
    
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/screenshots/add-ms365-current-issue.png',
      fullPage: false 
    });
  });

  test('Meridian Model Applications view', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/model/applications`);
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/screenshots/45-before-model-applications.png',
      fullPage: false 
    });
  });

  test('Meridian Views Impact', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/views/impact`);
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/screenshots/42-before-views-impact.png',
      fullPage: false 
    });
  });

  test('Meridian Reports', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/reports`);
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: '/opt/cursor/artifacts/screenshots/43-before-reports.png',
      fullPage: false 
    });
  });
});
