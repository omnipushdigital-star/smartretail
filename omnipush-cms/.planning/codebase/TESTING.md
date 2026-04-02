# Testing

## Frameworks & Structure

- **Testing Posture:** Currently positioned defensively around production UAT (User Acceptance Testing) cycles with the Client directly involved. No explicit suite (e.g. Jest / Vitest) is actively configured inside the `omnipush-cms` module block at this time.
- **Verification Paradigm:** Testing is executing via isolated hot functional check sequences directly involving Android VM instances, physical Android box hardware testing, and direct database sanity inspections. 
- **Type Checking:** Robust structural checking is enforced pre-deployment via `tsc -b`.

## Edge Function Testing

Edge functions mock payloads visually using direct Postman / internal CLI Curl requests, capturing JSON payload deviations.

## Coverage

- **Coverage Goal:** Rapid MVP iteration supersedes 100% mathematical code-coverage.
- **Crucial Areas:** `PlayerPage.tsx` and underlying DOM swapping functionality. These run for hours in prolonged physical hardware tests checking for memory leaks and OOM (Out Of Memory) WebView crashes.
