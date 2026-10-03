import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8000';
const FIREBASE_AUTH_EMULATOR = 'http://localhost:9099';

// Test credentials
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

async function signIn(page: Page, email: string, password: string) {
  // For now, just navigate directly to workspace URLs
  // The full auth flow has verification issues in the emulator
}

test.describe('BuboMap App', () => {
  test.beforeAll(async () => {
    try {
      await createEmulatorUser(TEST_EMAIL, TEST_PASSWORD);
      console.log('Test user created in Firebase emulator');
    } catch (error) {
      console.log('User might already exist:', error);
    }
  });

  test('can navigate to empty workspace', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/empty-workspace/ask`);
    
    await page.screenshot({ 
      path: '/tmp/screenshots/38-empty-workspace-ask.png',
      fullPage: false 
    });
  });

  test('can navigate to Meridian workspace', async ({ page }) => {
    await bypassAuthAndNavigate(page, `${BASE_URL}/orgs/test-org/workspaces/meridian-fasteners/ask`);
    
    await page.screenshot({ 
      path: '/tmp/screenshots/meridian-ask.png',
      fullPage: false 
    });
  });
});
