# OmniPush Staging & Production Workflow Guide

This guide outlines your new **Staging-First** workflow. By following this, you ensure that no bugs reach your live digital signs and your production media library stays clean.

---

## 🏗️ 1. Environment Topology

We have two fully separated environments:

| Feature | Staging | Production |
| :--- | :--- | :--- |
| **URL** | [smartretail-plum.vercel.app](https://smartretail-plum.vercel.app) | [signage.omnipushdigital.com](https://signage.omnipushdigital.com) |
| **Git Branch** | `staging` (or `develop`) | `master` (or `main`) |
| **Database** | (Consider separate Supabase project) | Live Supabase Project |
| **R2 Bucket** | `omnipush-media-staging` | `omnipush-media` |
| **Visual Indicator** | Red "STAGING" Badge in Topbar | Clean (No Badge) |

---

## 🛠️ 2. The Development Lifecycle

### Step A: Creating a Feature
1. Create a new branch for your change:
   ```powershell
   git checkout -b feat/my-new-component
   ```
2. Make your edits and commit them:
   ```powershell
   git commit -m "feat: added new dashboard widget"
   ```

### Step B: Deploy to Staging
1. Push your branch to GitHub:
   ```powershell
   git push origin feat/my-new-component
   ```
2. Open a **Pull Request (PR)** from `feat/my-new-component` → `staging` (or merge directly to your dedicated staging branch).
3. **Vercel** will automatically build a **Preview URL**. You can check the performance and design here.

### Step C: Verification (UAT)
1. Navigate to your **[Staging URL](https://smartretail-plum.vercel.app)**.
2. Log in and verify the feature works as expected.
3. Check the **Browser Console (F12)** for any hidden errors.
4. If testing media, ensure it uploads to the staging R2 bucket.

### Step D: Promote to Production
1. Once testing is 100% successful, merge the changes into the `master` branch.
   *   *Via PR*: Merge the pull request into `master`.
   *   *Via CLI*:
       ```powershell
       git checkout master
       git merge some-feature
       git push origin master
       ```
2. **Vercel** will build the final version and propagate it to the your production domain.

---

## 🚨 3. Critical Safety Checks

*   **DB Migrations**: If your code changes require new database tables or columns, **ALWAYS** run the SQL in your staging database first before applying it to production.
*   **Edge Functions**: Deploy updated functions to Supabase BEFORE pushing the frontend to production if the frontend depends on new logic.
    ```powershell
    supabase functions deploy my-function
    ```
*   **Environment Variables**: If you add a new `VITE_...` variable, make sure to add it in both Vercel environments (Production & Preview) or the app will crash in production.

---

## 📈 4. Best Practices

1.  **Tag Releases**: When you do a major push to production, tag it in Git so you can roll back easily: `git tag v1.0.1; git push --tags`.
2.  **Monitor Logs**: Check Vercel's "Functions" tab or Supabase's "Edge Function Logs" after a production push to ensure there are no spikes in 500 errors.
3.  **Clean Staging**: Every month, you can clear the staging R2 bucket to save space. NEVER touch the production bucket except through the CMS.

---

> [!TIP]
> **Pro-active Tip**: I've already configured your `App.tsx` and `AdminLayout.tsx` to automatically show the **Staging Badge** whenever you are on the `smartretail-plum` domain. You don't need to change any code to distinguish the two!
