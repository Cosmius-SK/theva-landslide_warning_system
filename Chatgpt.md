# Theva Live — Project Handoff for Codex

**Purpose:** Continue Theva Live development from the current UI/UX redesign without losing the product context, overstating what is implemented, or breaking existing working behavior.

**Evidence note:** This handoff combines details from the referenced “Landslide Exhibition Concept” conversation with the repository-access check performed when it was written. The Theva Live repository was not present in the available workspace, so implementation details, asset locations, branch state, and PR state below are identified as conversation-reported rather than independently verified. Treat the repository and GitHub as the source of truth when access is available.

## First actions for Codex

1. Locate and open the actual Theva Live repository. Confirm its root, current branch, clean/dirty working tree, remotes, recent commits, and project instructions (`AGENTS.md`, README, package scripts, and relevant docs).
2. Inspect the full app structure and trace the current operator and audience experiences, shared state, sensor/risk model, deployment configuration, and existing tests before editing. Do not assume the architecture described here is exact.
3. Inspect GitHub PR #1 and the `uiux-redesign-phase1` branch. Confirm whether the PR remains open, whether checks pass, what commits are present, and whether the branch has changed since this handoff. The conversation reported PR #1 open with 2/2 checks passing and no production merge.
4. Find the generated cinematic landscape asset in the repo, Git history, available project assets, or supplied files. Its path was not included in the conversation or available workspace. Do not recreate or claim integration of the asset until its source and license/provenance are clear.
5. Inspect Vercel project/deployment state if authorized access is configured. Conversation-reported latest deployment: commit `f935ee0`, marked Ready on Preview. Earlier reported commits: `dbd87a8` (hillside visualization), `a736b6d` (styling), `b4df869` (risk storytelling and sensor states), and `f935ee0` (cinematic risk transitions and educational cues). Verify these against GitHub/Vercel.
6. Report a short verified baseline before making changes. Preserve unrelated user changes and existing behavior. Work on the existing redesign branch if it exists and is the intended target; do not silently create or switch branches without checking the current repository state.

## Product vision

Theva Live is an interactive landslide-risk learning/exhibition experience. It should help a young audience—conversation context specifies Grade 2 students—understand how rain and slope conditions relate to landslide risk. The visual should make the cause and effect legible at a glance, while an operator can control or demonstrate the experience. Theva is intended as a contextual guide who explains what is happening, not a decorative floating mascot.

The target is a living miniature landscape: cinematic high-definition terrain with understandable sensors, weather, water movement, slope instability, and clear risk states. Visual richness must support the learning task and must not obscure controls, readings, or explanations.

## Architecture and known implementation

The original conversation did not provide a repository tree, framework, backend, database, device protocol, or deployment configuration. Do not invent these. Discover and document the actual architecture from source code and configuration before extending it.

The conversation reports the following implemented experience on the redesign branch, pending repository verification:

- Interactive hillside visualization, initially an SVG/illustrative placeholder.
- Sensor-responsive markers and readings.
- Risk-state transitions and educational explanation.
- A three-step cause-and-effect sequence.
- Reduced-motion support.
- Existing controls and shared-state functionality that must continue working.

The conversation says the cinematic landscape was generated as a candidate but was **not integrated** into the deployed application. It also says Theva's contextual interactions were not implemented. Confirm both claims against the current branch before acting.

## Current redesign branch and PR status

Conversation-reported target branch: `uiux-redesign-phase1`.

Conversation-reported review status: PR #1 open; 2/2 checks passed; no changes merged to production. The latest reported preview was Ready at `f935ee0`. These are historical statements, not a live status check. Verify branch, PR, checks, deployments, and production state before relying on them.

Keep the work on the existing branch/PR if it is still active and appropriate. Do not merge or deploy to production as part of routine implementation. The intended sequence is to implement, validate on Preview, review the experience, and merge only after the project owner approves.

## Cinematic visual direction and asset

Use a high-definition cinematic 3D landscape as the main hillside scene rather than merely decorating the current placeholder. The prior concept included storm clouds, rain, exposed soil layers, roots, water seepage, monitoring stations, and visible slope instability. The standalone hillside concept was preferred over a full dashboard concept for integration as the landscape itself.

Conversation-reported target qualities:

- Dynamic rain, mist, lighting, and cloud treatment.
- Visible soil layers, roots, water seepage, and cracks.
- Glowing monitoring stations with live indicators.
- Distinct, understandable transitions across Safe, Watch, High, and Evacuation.
- Theva's contextual explanations tied to what the learner sees.

**Generated asset path:** Not present in the retrieved conversation, attachment metadata, or this workspace. Codex must locate the actual generated image and record its repository-relative path, format, dimensions, and provenance once found. Do not label it integrated until it is used in the app and verified in a Preview deployment.

Layer live sensor indicators, water-flow effects, cracks, and slope movement over the landscape where practical. Ensure effects respond to real application state, remain readable, and degrade gracefully for reduced-motion preferences and smaller screens. Avoid conveying scientific precision that the underlying model does not support.

## Planned work, in priority order

### Phase 0 — Verify the project and protect working behavior

- Establish the actual architecture, data flow, state ownership, routes/screens, build commands, and deployment setup.
- Verify the current branch, PR, commits, checks, Vercel Preview, and production state.
- Inventory current controls and shared-state behavior; identify a reliable way to validate them.
- Locate the cinematic asset and determine the right integration format and loading strategy.

### Phase 1 — Complete the cinematic landscape integration

- Integrate the generated HD landscape into the hillside scene.
- Add sensor indicators and meaningful overlays for water flow, cracks, or movement, driven by application state.
- Keep controls, sensor readings, headings, and explanations unobstructed at desktop and mobile sizes.
- Preserve reduced-motion support and keep the experience performant.

### Phase 2 — Make risk states clear and educational

- Define and verify four distinct states: Safe, Watch, High, and Evacuation.
- Give each state an appropriate visual treatment and transition. Evacuation must be unmistakably urgent; Safe must read as calm.
- Explain why the slope is under stress in age-appropriate language.
- Retain/refine the three-step cause-and-effect sequence so a Grade 2 student can describe what is happening from the screen.
- Validate intermediate values and transitions, not only the reported all-sensors-at-100% case.

### Phase 3 — Make Theva a contextual guide

- Tie Theva's message to the current risk state, sensor readings, and visible landscape changes.
- Keep explanations short, supportive, and understandable to the target audience.
- Avoid presenting Theva as a floating decoration or as an authoritative real-world emergency warning system.

### Phase 4 — Finish UI/UX refinements

- Review operator and audience screens for hierarchy, legibility, responsive layout, and control overlap.
- Fix the lower-right floating-elements/readings overlap mentioned in screenshot feedback, if still present.
- Check transitions, states, text, and interactions at desktop and mobile sizes.
- Keep the existing dark-green design language unless repository evidence or an approved design decision says otherwise.

### Phase 5 — Hardware and exhibition roadmap

The prior handoff summary explicitly included a hardware integration roadmap, audience sessions and feedback management, and exhibition readiness/testing, but gave no concrete devices, protocols, dates, venue requirements, or acceptance criteria. First inspect repository documentation and project history for specifics. Then document proposed milestones and dependencies without inventing hardware commitments. Coordinate live-device integration with the existing sensor/state architecture and keep a demo/simulation path available if exhibition hardware is disconnected.

### Phase 6 — Audience feedback and readiness

- Establish a practical way to gather and prioritize audience/session feedback, respecting whatever privacy requirements the project defines.
- Prepare an exhibition readiness checklist from actual venue, hardware, network, accessibility, and staffing needs once known.
- Confirm the experience can recover gracefully from stale or missing sensor data and that risk messaging is not mistaken for an official public safety alert.

## Constraints and safeguards

- Inspect first; do not assume code, app structure, hosting configuration, branch state, or live data architecture.
- Keep the existing working controls and shared-state behavior intact unless a deliberate change is documented and validated.
- Do not merge PR #1 or promote to production without explicit owner approval.
- Do not claim a Vercel deployment, website change, asset integration, hardware connection, or passing check without verifying it in the relevant system.
- Treat any sensor thresholds and risk labels as project-defined values. Do not invent them or present them as authoritative landslide predictions.
- Keep educational content suitable for Grade 2, and distinguish an exhibition simulation from real emergency guidance.
- Support reduced motion and responsive use; make urgent states clear without relying on color alone.
- Preserve repository conventions, existing user changes, and any project-specific instructions.
- If GitHub, Vercel, or the repository is unavailable, state exactly what could not be verified and continue only with work supported by the local evidence.

## Validation requirements

Before calling a phase complete, inspect the project scripts and use the repository's existing build/test/lint workflow where available. Do not invent success claims. Validate at minimum:

- Safe, Watch, High, and Evacuation with representative intermediate sensor values and transitions.
- Existing operator controls and shared state across the relevant screens/clients.
- Landscape overlays and sensor markers against state changes.
- No overlap among floating controls, readings, and explanatory text.
- Desktop and mobile layouts.
- Reduced-motion behavior and a sensible fallback if the cinematic asset fails to load.
- Accessibility basics: readable contrast, non-color state cues, keyboard-operable controls, and appropriate text labels.
- Preview deployment URL and actual rendered result after deployment, if deployment access is configured.

For every report, distinguish code committed, Preview deployed, Preview visually checked, and production merged/deployed. They are separate milestones.

## Handoff status at creation

- **Repository access:** Not available in the workspace used to create this handoff; no Theva Live checkout was found.
- **Branch / PR:** Historical conversation reports `uiux-redesign-phase1` and open PR #1 with 2/2 checks passing; current live state unverified.
- **Cinematic asset:** Generated candidate reported, but the file path was not supplied or found; integration reported incomplete.
- **Next action:** Open the actual repository, verify the baseline and asset location, then continue on the existing redesign branch if still valid.
