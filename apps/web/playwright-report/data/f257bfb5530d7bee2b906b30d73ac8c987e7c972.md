# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verify-current.spec.ts >> PHASE 2: Real App Verification >> 40 - Where it lives step
- Location: e2e/verify-current.spec.ts:244:7

# Error details

```
Test timeout of 30000ms exceeded.
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