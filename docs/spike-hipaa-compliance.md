# Spike: HIPAA Compliance Analysis Across Configurations

**Date:** 2026-05-08
**Author:** spike research (browser-agent-team-7qh)
**Status:** findings only — no code changes

> **Disclaimer:** This document is AI-assisted analysis for internal planning purposes. It is not legal advice. Before making product decisions based on HIPAA compliance, consult a healthcare attorney familiar with HIPAA and applicable state law.

---

## Summary

FetchWell's HIPAA exposure depends heavily on two variables: who controls the API key and where the browser runs. In the safest configuration (user's own API key + local Chromium), PHI leaves the device only through LLM navigation calls to Anthropic, and FetchWell is likely not a Business Associate under HIPAA's traditional application to healthcare operations. Once FetchWell controls the API key or runs the browser on its own infrastructure, Business Associate obligations almost certainly attach and BAAs with downstream vendors become required.

---

## 1. HIPAA Foundations

### Covered Entity vs. Business Associate

**Covered Entity (CE):** A healthcare provider, health plan, or healthcare clearinghouse that transmits health information in electronic form. FetchWell is **not** a covered entity — it is a software tool, not a healthcare provider or plan.

**Business Associate (BA):** A person or entity that, on behalf of a covered entity, creates, receives, maintains, or transmits protected health information (PHI) in performing a function or service for the CE. The key requirement is that the BA acts "on behalf of" the CE.

**The pivotal question for FetchWell:** Does FetchWell act on behalf of a covered entity, or on behalf of the individual patient (who is not themselves a CE)?

### The Individual/Personal Use Exception

HIPAA's Privacy Rule and Security Rule were designed to regulate covered entities and their business associates — not to regulate how individual patients handle their own health records. A patient who downloads their own records from MyChart and stores them on their Mac is not subject to HIPAA, regardless of what software they use.

**45 CFR § 164.502(a)(1)(i)** permits covered entities to disclose PHI to the individual who is the subject of that information. Once the patient has received their own records, HIPAA no longer governs what the patient does with them.

This means a tool used by a patient to access, download, and store their own records may not trigger BA obligations at all — the patient is the end user, not a covered entity, and there is no "on behalf of a CE" relationship.

### Why This Is Not Black-and-White

The boundary blurs when:
- FetchWell is marketed to businesses or employers (not just individuals)
- FetchWell operates infrastructure that touches PHI on behalf of multiple users (server-side)
- FetchWell retains or processes PHI independently (telemetry, analytics, error logs)
- FetchWell acts as an intermediary in a healthcare workflow (not just personal record retrieval)

For a pure personal-use desktop app with no server component, the strongest argument is that FetchWell is a patient empowerment tool, not a business associate.

---

## 2. What Data FetchWell Accesses and Where It Goes

### Data accessed during a run

**Discovery phase (`src/discover/index.ts`):**
- Navigates the logged-in patient portal (post-login dashboard)
- Sends DOM content (page text and accessibility tree) to the LLM via `observe()` and `act()` calls
- DOM content on health portal pages includes: patient name in navigation bars, portal branding, section headings, and potentially recent-activity summaries
- The discovery goal is structural (find navigation links) — but the LLM receives the full rendered DOM regardless of whether it contains PHI

**Extraction phase (`src/extract/`):**
- Navigates to Labs, Visits, Medications, Messages sections
- Sends DOM content (full page accessibility tree) to LLM via `observe()` calls to enumerate record entries and click targets
- DOM content here includes: lab test names, dates, visit titles, medication names — all PHI
- Does NOT send PDF bytes to Anthropic — PDFs are generated locally via `page.pdf()` from Playwright's built-in Chromium renderer and written directly to the local filesystem

### LLM call mechanics (from `stagehand-local.ts`)

Stagehand's `observe()` and `act()` methods internally:
1. Capture a screenshot of the current page (base64 PNG)
2. Extract the accessibility tree (ARIA roles, text content, element descriptions)
3. Send both to Anthropic's Messages API with the caller's instruction

**Data transmitted to Anthropic per LLM call:**
- Screenshot of the currently visible portal page (may show patient name, record titles, dates)
- Accessibility tree text (structured DOM content — may include lab results, medication names, visit summaries, message previews)
- The natural-language instruction (e.g., "Find all clickable lab result entries on this page")

**Data NOT transmitted to Anthropic:**
- Full PDF bytes of extracted records
- Portal login credentials
- Auth cookies / session tokens
- The final merged PDF files

---

## 3. Configuration Analysis

### Configuration 1: User's Own API Key + Local Chromium (Current State)

**Architecture:**
- User provides their Anthropic API key in the app settings
- Browser automation runs in Playwright's bundled Chromium on the user's Mac
- PDF files are written to the user's local filesystem
- LLM calls go directly from the user's machine to Anthropic's API using the user's credentials

**PHI flow:**
```
Patient Portal (HTTPS) → Playwright Chromium (local) → DOM + screenshots → Anthropic API (user's key)
                                                      ↘ PDF bytes → local filesystem only
```

**HIPAA analysis:**

| Question | Answer |
|---|---|
| Is FetchWell a Covered Entity? | No |
| Is FetchWell a Business Associate? | Likely no — patient is using FetchWell to access their own records, not on behalf of a CE |
| Does PHI leave the device? | Yes — DOM snapshots and screenshots containing PHI are sent to Anthropic via the user's API key |
| Who receives the PHI? | Anthropic (via the user's own API account) |
| Does FetchWell retain PHI? | No — FetchWell has no server; extracted PDFs stay on user's machine |
| BAA required with Anthropic? | Depends on user — if the user is themselves a CE or BA, they need a BAA with Anthropic. FetchWell the product has no obligation because the key belongs to the user. |
| BAA required with FetchWell? | No — FetchWell does not receive, store, or process PHI on behalf of anyone |

**Risk assessment:** Low. This is conceptually similar to a patient using a screen recording tool on their own portal session. The legal risk to FetchWell (as a product/company) is minimal because FetchWell does not touch the data at all — the data goes from the user's machine to the user's Anthropic account. FetchWell never has access to the PHI. However, the **user** should be made aware that DOM content (which may include PHI) is sent to Anthropic via their key.

**Practical risk to users:** Users who are healthcare professionals using FetchWell for their own personal records (not to process patient data) may still be subject to their employer's HIPAA policies. They should use FetchWell only for their own records.

---

### Configuration 2: FetchWell's API Key (Not User's)

**Architecture:**
- FetchWell ships with or manages an Anthropic API key (user does not provide one)
- Browser automation still runs locally in Playwright Chromium on user's Mac
- PDF files still go to user's local filesystem
- LLM calls go from user's machine to Anthropic's API using FetchWell's key/account

**PHI flow:**
```
Patient Portal (HTTPS) → Playwright Chromium (local) → DOM + screenshots → Anthropic API (FetchWell's key)
                                                      ↘ PDF bytes → local filesystem only
```

**HIPAA analysis:**

| Question | Answer |
|---|---|
| Is FetchWell a Covered Entity? | No |
| Is FetchWell a Business Associate? | Yes, almost certainly. FetchWell is now receiving/transmitting PHI (DOM snapshots containing patient data) on behalf of users who may be CEs or whose CEs have authorized MyChart access. |
| Does PHI leave the device? | Yes — same as Config 1, but now going to FetchWell's Anthropic account |
| Who receives the PHI? | Anthropic (under FetchWell's account) — FetchWell is the customer of record |
| Does FetchWell retain PHI? | Not directly in storage, but FetchWell's Anthropic account processes it. Anthropic's data handling policies govern retention. |
| BAA required with Anthropic? | Yes — FetchWell would need a HIPAA BAA with Anthropic |
| Does Anthropic offer a BAA? | Yes — Anthropic offers a Business Associate Agreement for enterprise API customers (see Section 5) |
| BAA required from users? | FetchWell would need users to sign a BAA with FetchWell (as a BA) if those users are CEs |

**Key shift from Config 1:** In Config 1, the Anthropic account belongs to the user — FetchWell has no relationship with the PHI flowing through that account. In Config 2, FetchWell controls the Anthropic account, making FetchWell a de facto intermediary for PHI. This creates BA obligations.

**Risk assessment:** High if not properly documented. This configuration requires:
1. A BAA with Anthropic
2. A BAA offered to users who are themselves covered entities or their employees
3. A Privacy Policy and Terms of Service that clearly disclose PHI handling
4. A security program meeting HIPAA Security Rule requirements (§ 164.300–164.318)
5. A Breach Notification policy (§ 164.400–164.414)

**Business model note:** Managing an API key also means FetchWell takes on per-call costs and must charge users or find another monetization path. This is a significant operational change beyond HIPAA.

---

### Configuration 3: Browserbase Instead of Local Chromium

**Architecture:**
- Browser automation runs on Browserbase's cloud infrastructure (remote browsers)
- Browserbase's browser sees the patient portal, handles login, loads pages, captures DOM
- LLM calls may still go to Anthropic (user's key or FetchWell's key — either way)
- PDF bytes may be transferred from Browserbase's infrastructure to the user's machine
- Portal login credentials may be transmitted to Browserbase

**PHI flow:**
```
Patient Portal (HTTPS) → Browserbase Cloud Browser → DOM + screenshots → Anthropic API
                                 ↓
                    Browserbase infrastructure (PHI in transit + potentially in logs)
                                 ↓
                         PDF bytes → user's machine
```

**HIPAA analysis:**

| Question | Answer |
|---|---|
| Is FetchWell a Covered Entity? | No |
| Is FetchWell a Business Associate? | Yes — FetchWell is now using a third-party service that processes PHI on FetchWell's behalf |
| Does PHI leave the device? | Yes, substantially. Entire portal sessions (not just LLM calls) run in Browserbase's cloud. All page loads, DOM content, screenshots, and rendered PDFs pass through Browserbase's infrastructure. |
| Who receives the PHI? | Browserbase (session data, DOM, page renders, potentially screenshots). Anthropic (DOM snapshots for LLM calls). |
| Does FetchWell retain PHI? | Depends on Browserbase's infrastructure logging and session retention policies |
| BAA required with Browserbase? | Yes — Browserbase would need to sign a BAA with FetchWell |
| Does Browserbase offer a BAA? | See Section 5 |
| BAA required with Anthropic? | Yes if FetchWell controls the key (Config 2 + 3 combined) |

**Additional PHI exposure in Config 3:**
- Portal login credentials (username, password) are transmitted to Browserbase's cloud to authenticate with the patient portal
- Session cookies for authenticated portal sessions live in Browserbase's infrastructure during the run
- Every page rendered in the portal generates network traffic through Browserbase (lab results, visit details, medication lists, message content)
- Browserbase's infrastructure logs may capture request/response content, error states, screenshots for debugging

**Risk assessment:** Very high without proper BAAs and vendor controls. This configuration moves PHI from the patient's local machine into cloud infrastructure that FetchWell does not control. The full scope of PHI exposure includes not just LLM calls but everything a browser session touches.

---

## 4. Configuration Comparison Table

| Factor | Config 1: User Key + Local Chromium | Config 2: FetchWell Key + Local Chromium | Config 3: Browserbase + Either Key |
|---|---|---|---|
| Browser runs on | User's Mac (local) | User's Mac (local) | Browserbase cloud |
| LLM API key owner | User | FetchWell | Either |
| PHI sent off-device | DOM/screenshots → Anthropic (user's account) | DOM/screenshots → Anthropic (FetchWell's account) | Full session → Browserbase; DOM → Anthropic |
| Portal credentials off-device | No | No | Yes (to Browserbase) |
| PDFs off-device | Never | Never | Yes (from Browserbase to user) |
| FetchWell is a BA? | Likely no | Yes | Yes |
| BAA with Anthropic needed? | User's responsibility (if user is CE/BA) | Yes — FetchWell + Anthropic | Yes — FetchWell + Anthropic |
| BAA with Browserbase needed? | N/A | N/A | Yes — FetchWell + Browserbase |
| BAA from users needed? | Not for FetchWell; user's own HIPAA obligations apply | Yes, from CE/BA users | Yes, from CE/BA users |
| HIPAA Security Rule applies to FetchWell? | No | Yes | Yes |
| Breach notification required? | No | Yes | Yes |
| Estimated compliance overhead | Low | Medium-High | High |
| Recommended for HIPAA-sensitive users? | With disclosure | Only with full BAA program | Only with vendor BAAs + full program |

---

## 5. Vendor HIPAA Status

### Anthropic

**BAA availability:** Anthropic offers a Business Associate Agreement for API customers. As of mid-2026, BAAs are available to enterprise customers on Anthropic's API. Individual API accounts on the standard plan may not have BAA coverage without explicit arrangement.

**Anthropic's data handling (API):**
- Anthropic states that API inputs and outputs are not used to train models by default
- Anthropic retains API inputs/outputs for a limited period (currently up to 30 days for trust and safety review; 0-day retention is available for certain enterprise tiers)
- Under a BAA, Anthropic commits to the HIPAA-required safeguards for handling PHI

**What this means for FetchWell:**
- Config 1 (user's key): if the user is a CE or BA, they need to arrange a BAA with Anthropic directly. FetchWell does not need to be in that arrangement.
- Config 2/3 (FetchWell's key): FetchWell must obtain a BAA from Anthropic before any PHI flows through a FetchWell-controlled Anthropic account.

**Reference:** https://www.anthropic.com/legal/hipaa (Anthropic's HIPAA page; consult directly for current enterprise terms)

---

### Browserbase

**BAA availability:** Browserbase is a relatively new cloud browser automation platform. As of the knowledge cutoff, Browserbase does not prominently advertise HIPAA compliance or BAA availability on their public-facing marketing site. Their primary positioning is as a developer infrastructure tool, not a healthcare-specific platform.

**Key due diligence questions to ask Browserbase:**
1. Does Browserbase offer a HIPAA Business Associate Agreement?
2. Are Browserbase's infrastructure components (browser nodes, session storage, logging) SOC 2 Type II certified?
3. What is Browserbase's data retention policy for browser session content (DOM, screenshots, request logs)?
4. Does Browserbase encrypt session data at rest and in transit?
5. Can Browserbase provide evidence of technical controls (access logging, encryption, incident response)?

**Risk:** If Browserbase cannot provide a BAA or demonstrate adequate HIPAA safeguards, using Browserbase for health portal automation constitutes a HIPAA violation in any configuration where FetchWell is a BA (Configs 2 and 3).

**Recommendation:** Do not proceed with Browserbase integration in any configuration where FetchWell will be a BA until Browserbase BAA availability is confirmed.

---

## 6. Technical Controls Required

### Config 1 (no formal BA obligation — still good practice)

| Control | Recommendation |
|---|---|
| User disclosure | Add a clear privacy disclosure in the Welcome screen: "Page content (including health data visible in your portal) is sent to Anthropic via your API key for navigation assistance. This uses your Anthropic account and is not stored by FetchWell." |
| Output file permissions | PDFs should be written with user-only permissions (0600), not world-readable |
| Credential storage | Already implemented: `safeStorage` → macOS Keychain |
| Session file security | `output/<id>/session.json` (cookies) should not be world-readable |
| No telemetry | Maintain the no-telemetry commitment stated in the PRD |

### Configs 2 and 3 (BA obligations apply)

In addition to the above:

| Control | Requirement |
|---|---|
| Risk analysis | Formal HIPAA Security Rule risk analysis (§ 164.308(a)(1)) documenting threats, vulnerabilities, and mitigations |
| Access controls | Minimum necessary access for any FetchWell employees who might handle infrastructure touching PHI |
| Audit logging | Log access to systems that process PHI (Anthropic API calls, Browserbase sessions) |
| Encryption in transit | Already enforced by HTTPS to Anthropic and Browserbase. Ensure TLS 1.2+ minimum. |
| Encryption at rest | Any FetchWell-controlled storage of session data or API logs must be encrypted at rest |
| Incident response | Documented breach notification procedures per § 164.400–414 (60-day notification to affected individuals) |
| Training | HIPAA training for all workforce members with access to PHI-handling systems |
| BAA program | Template BAA for CE/BA users; executed BAAs with Anthropic (and Browserbase for Config 3) |
| Data retention limits | Define and enforce limits on how long Anthropic retains API inputs under the BAA |
| Subcontractor agreements | Written agreements with all subcontractors (Anthropic, Browserbase) per § 164.308(b)(1) |

---

## 7. State Law Considerations

### California Confidentiality of Medical Information Act (CMIA)

The CMIA (California Civil Code § 56 et seq.) is broader than HIPAA in some ways:
- Applies to any "provider of health care" and any business that "maintains medical information"
- Prohibits disclosure of medical information without patient authorization
- **Key difference from HIPAA:** CMIA can apply even when the recipient is not a covered entity under HIPAA. A software company that receives medical information (even incidentally) may have obligations under CMIA.
- CMIA covers "medical information" including records of medical history, mental or physical condition, or treatment.

**FetchWell's exposure:**
- Config 1: FetchWell does not receive or maintain medical information — the data flows through user-controlled accounts. Low CMIA risk.
- Configs 2/3: FetchWell becomes a "business that maintains medical information" under CMIA when it controls the API key that processes patient portal DOM content. CMIA compliance (including a notice of privacy practices and opt-in authorization) may be required in addition to HIPAA.

### Other State Laws to Note

- **Washington My Health MY Data Act (2023):** Broader than HIPAA, covers consumer health data for any entity that collects it (not limited to healthcare entities). If FetchWell has users in Washington state and controls the API key, this may apply. Requires consent for collection of health data and grants consumers deletion rights.
- **Illinois BIOMETRIC Information Privacy Act (BIPA):** Not directly applicable — FetchWell does not collect biometrics.
- **Texas Medical Records Privacy Act (TMRPA):** Broader than HIPAA, applies to any person who assembles, collects, analyzes, uses, evaluates, stores, or transmits PHI. Potential applicability in Configs 2/3.

**Recommendation:** For Configs 2/3, have legal counsel review applicability of state health privacy laws, particularly California CMIA and Washington My Health MY Data Act.

---

## 8. Practical Risk Exposure Summary

### Config 1 (User Key + Local Chromium)

**Legal risk to FetchWell:** Low. FetchWell does not receive or store PHI. The PHI path (DOM → Anthropic) is controlled entirely by the user through their own Anthropic account.

**Practical exposure:**
- Disclosure risk: users may not understand that page content is sent to Anthropic. Clear disclosure in the UI mitigates this.
- Reputational risk: if FetchWell gains traction among healthcare professionals, any PHI mishandling (even user-driven) could attract regulatory scrutiny or press coverage.

**Recommended actions:**
- Clear privacy disclosure in the Welcome screen and Settings (already described in PRD)
- FAQ or help article explaining what goes to Anthropic and what stays local
- No changes to code required for HIPAA

### Config 2 (FetchWell Key + Local Chromium)

**Legal risk to FetchWell:** High without proper controls. FetchWell becomes a BA and must implement the HIPAA Security Rule and offer BAAs.

**Practical exposure:**
- OCR (HHS Office for Civil Rights) enforcement if a breach occurs and FetchWell lacks a BAA program
- Per-violation civil penalties: $100–$50,000 per violation, up to $1.9M per violation category per year
- Criminal liability for knowing disclosure of individually identifiable health information

**Recommended actions:**
- Obtain BAA from Anthropic before launching
- Publish BAA template for CE/BA users
- Implement formal HIPAA Security Rule program
- Budget for legal and compliance overhead (typically $20K–$100K+ for initial program setup)
- Consider whether the user experience benefit of removing the API key requirement justifies this overhead

### Config 3 (Browserbase + Either Key)

**Legal risk to FetchWell:** Very high without vendor BAAs. Browserbase processing portal session content is a significant expansion of the PHI surface.

**Practical exposure:**
- All of Config 2's risks, plus
- Browserbase session data (portal credentials, full DOM, rendered pages) creates a large PHI footprint in a vendor's infrastructure
- If Browserbase has a breach, FetchWell is likely liable for breach notification as the BA that contracted with Browserbase as a subcontractor BA

**Recommended actions:**
- Do not implement Browserbase in Config 3 until Browserbase can provide a HIPAA BAA
- If Browserbase cannot provide a BAA, evaluate HIPAA-compliant alternatives:
  - **Apify** (SOC 2, HIPAA BAA possible — verify current status)
  - Self-hosted remote browser (e.g., Playwright in a HIPAA-compliant cloud region, e.g., AWS GovCloud or Azure Government)
  - Stay with local Chromium

---

## 9. Recommended Path Forward

### Near-term (Config 1 — current default)

1. Audit the Welcome screen and Settings UI for privacy disclosure language. Ensure users understand that page content goes to Anthropic via their key. PRD section 2.1 already captures this requirement.
2. Review PDF and session file permissions to ensure outputs are not world-readable.
3. Maintain the no-telemetry, no-server commitment. This is the primary reason FetchWell's legal risk is low today.

### Before implementing Config 2 (FetchWell-managed key)

1. Consult a healthcare attorney to confirm BA analysis in your specific business context.
2. If proceeding, obtain a BAA from Anthropic (enterprise tier).
3. Develop a BAA template for users and a HIPAA compliance program.
4. Build an audit log of Anthropic API calls (what data was sent, when, for which user session) — even if no PHI is retained, logging API call metadata is required for the Security Rule.

### Before implementing Config 3 (Browserbase)

1. Contact Browserbase directly to request a HIPAA BAA. If unavailable, do not proceed.
2. Evaluate alternative cloud browser providers with documented HIPAA compliance.
3. Note that portal login credentials traveling off-device (to Browserbase) is a materially higher risk category than DOM content in LLM calls. Credential management in this configuration requires careful architectural design.

---

## 10. Open Questions

1. **FetchWell's target user base:** If FetchWell is positioned purely as a personal-use consumer tool (patients accessing their own records), the BA analysis is clearer and more favorable. If it's marketed to healthcare organizations (e.g., care coordinators pulling records on behalf of patients), CE relationships exist and HIPAA applies more directly.

2. **Anthropic BAA tier requirements:** Anthropic's HIPAA BAA availability may require enterprise API tier contracts with minimum commitment levels. Verify current pricing and terms at `console.anthropic.com` or via Anthropic sales.

3. **Browserbase HIPAA BAA:** As of mid-2026, Browserbase's HIPAA BAA availability is unconfirmed. Direct outreach to Browserbase is required before any architectural decisions in Config 3.

4. **Washington My Health MY Data Act applicability:** The Act's definition of "consumer health data" is broad and does not require a healthcare context. A user in Washington state whose portal DOM (containing health data) passes through FetchWell's API key may trigger obligations. Legal review recommended for Configs 2/3.

5. **Error logging and crash reporting:** If FetchWell ever adds error logging or crash reporting (e.g., Sentry), PHI embedded in error messages (DOM content, error strings from portal pages) could inadvertently be transmitted. Keep the no-telemetry commitment firm in all configs, or implement strict PHI filtering in any diagnostic logging.

---

## References

- HIPAA Privacy Rule (45 CFR Part 160 and 164 Subparts A and E)
- HIPAA Security Rule (45 CFR 164 Subparts A and C)
- HIPAA Breach Notification Rule (45 CFR 164 Subparts A and D)
- HHS Guidance: Business Associate Contracts — https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/
- Anthropic HIPAA information — https://www.anthropic.com/legal/hipaa
- California CMIA — California Civil Code § 56–56.37
- Washington My Health MY Data Act — SB 1155 (2023)
- FetchWell PRD section 2.1 (privacy disclosure requirements)
- Spike: Alternative LLM Providers — `docs/spike-alternative-llm-providers.md` (Browserbase Stagehand architecture context)
