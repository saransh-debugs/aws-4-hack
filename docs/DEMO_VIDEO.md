# GridRisk – 90-second demo video

App: https://d7y6z2w7emgme.cloudfront.net (sign in as `demo@example.com`, password in `.env` as `DEMO_PASSWORD`).

## Setup

- Sign in, press **Shift+R** (calm), collapse **Event feed**, browser zoom 100%.
- Record with **Cmd+Shift+5 → Record Selected Portion** (browser window), microphone on.
- Practise once: the waits are real, so talk over them.

## Script (~210 words of voiceover)

| Time      | On screen                                                                         | Voiceover                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:08 | Calm map; slow cursor over Houston and the live traffic                           | "In a storm, a power outage, a flooded road and a patient on oxygen show up in separate systems. GridRisk connects them."                                                     |
| 0:08–0:18 | **1. Outage only** → Simulate. Events drop in; Zone A turns amber                 | "Zone A loses power, but the bridge is still open. No alert. GridRisk doesn't cry wolf."                                                                                      |
| 0:18–0:38 | **2. Zone A cut off** → Simulate. Zone A turns red; "AI agent investigating" card | "Now the only bridge floods. Zone A is cut off. Claude, on Amazon Bedrock, investigates with our tools: events, roads, patients, shelters."                                   |
| 0:38–0:50 | Alert slides in; open **How the agent got here**, scroll briefly                  | "56 people who depend on powered medical equipment, real HHS data, and 45 minutes to act. Every number is cited and checked against our engine, so Claude can't make one up." |
| 0:50–1:05 | **Approve**. Shelter B turns green (OPEN), evacuation route draws, drone flies    | "The AI only proposes. A human approves. Step Functions dispatches, Amazon Location routes evacuees around the flood, and the alert goes out by SNS."                         |
| 1:05–1:08 | Cut to the dispatch email on a phone (recorded separately)                        | "Real dispatch, delivered."                                                                                                                                                   |
| 1:08–1:20 | **6. Storm** → Simulate. Twelve events pour in, one alert                         | "In a noisy storm, with twelve events across the city, GridRisk raises one alert: the zone that's actually cut off."                                                          |
| 1:20–1:30 | **Overview**; end on the red zone                                                 | "Built on Bedrock, Step Functions, SNS, Amazon Location and Cognito. AI connects the dots in seconds. Humans make the call. This is GridRisk."                                |

## Fitting it into 90 seconds

- Running long? Cut the storm section (1:08–1:20) first.
- Trim dead air in QuickTime (Edit → Trim) or iMovie, especially while the agent card ticks.
- Crop the email so its unsubscribe link isn't visible.
- Export at 1080p.

## If something breaks while recording

Press **Shift+R** and redo Scenario 2. Without network, `npm run dev` runs the same loop offline.

## Honest framing

The scenarios are simulated (the header says SYNTHETIC DATA). The patient counts (HHS emPOWER),
basemap, live traffic, routing, Claude on Bedrock, Step Functions and SNS are real.

---

# GridRisk – 5-minute demo video (full submission)

Covers: architecture and how it's put together, the application, the persona, and how Amazon
Bedrock and the other AWS services are used. Target ~5:00 (hard cap 5:00).

## What to prepare

- **Browser tab:** the app, signed in, **Shift+R** to calm, Event feed collapsed, zoom 100%.
- **Architecture slide:** one image. Use `PLAN.md` → Architecture (the mermaid diagram) exported to
  PNG, or the simple boxes in section 1 below. Full screen when you talk over it.
- **Phone:** Gmail open for the dispatch email (record separately, splice in; crop the unsubscribe link).
- Record with **Cmd+Shift+5 → Record Selected Portion**, microphone on. Do one dry run.

## Runsheet

### 0:00–0:40 — Problem + persona (talking head or title card)

> "This is GridRisk, an AI copilot for an emergency operations center.
> Meet our user: an **EOC duty officer** during a Houston storm. On her desk, power outages,
> flooded roads and patient data all live in **separate systems**. She has minutes to work out
> which neighborhood is actually cut off and who's at risk. GridRisk connects those feeds into one
> picture, proposes an action, and lets her approve it — she stays in control."

### 0:40–1:40 — Architecture (architecture slide full screen)

The architecture is explained by **three presenters**, each owning one layer of the system. Point
at each box as the owner speaks. All of it is defined in **AWS CDK** and deploys as one stack.

**End-to-end data flow (one sentence):** real feeds → DynamoDB → stream → Step Functions → Claude
on Bedrock → human approval → SNS dispatch → React map on CloudFront.

```text
                         ┌──────────────── Presenter 1: Tanisha — Data & Ingest ───────────────┐
  NWS weather ─┐         │  EventBridge Scheduler (every 5 min)                                 │
  HHS emPOWER ─┼──────▶  │    └─ Ingest Lambda → NWS normalizer + deterministic engine          │
  911 / outage ┘         │        └─ writes DemoEvents to  ►  DynamoDB (events, NEW_IMAGE stream)│
                         └──────────────────────────────────────────┬──────────────────────────┘
                                                                     │ stream
            ┌──────────────── Presenter 2: Darsh — Cloud & Orchestration ──────────────────────┐
            │  HTTP API + Cognito JWT authorizer  ──► read / simulate / approve Lambdas          │
            │  DynamoDB stream ─► Step Functions:  RunAgent → SaveAlert (waitForTaskToken)        │
            │                                      → [human approves] → Dispatch (parallel)       │
            │                                      → MarkDispatched                               │
            │  Dispatch fans out to: SNS email/SMS · activate shelter · launch drone              │
            │  Amazon Location (map + routes) · SSM params · S3 + CloudFront hosting              │
            └──────────────────────────────────────────┬───────────────────────────────────────┘
                                                        │ RunAgent step calls the agent
         ┌──────────── Presenter 3: Saransh & Bushra — Intelligence & Experience ───────────────┐
         │  runAgent() → Claude on Amazon Bedrock (Converse API, tool-use loop)                  │
         │    └─ tools call the deterministic engine; assembleAlert + grounding check            │
         │  React dashboard on CloudFront: Amazon Location map, event feed, alert card, approve   │
         └──────────────────────────────────────────────────────────────────────────────────────┘
```

#### Presenter 1 — Tanisha: Data & Ingest layer (`packages/engine`, ingest)

> "Everything starts with **real data**. An **EventBridge Scheduler** fires every five minutes and
> invokes an **ingest Lambda**. It pulls **NWS** weather alerts and **HHS emPOWER** patient-dependency
> data, normalizes them into one shared event shape, and writes them to **DynamoDB**.
>
> The heart of this layer is a **deterministic risk engine** — pure, tested TypeScript, no AI. It
> correlates events to a zone, checks whether the only access road is closed (is the zone _isolated_?),
> counts electricity-dependent patients from emPOWER, and computes the isolation window — how long
> until backup power runs out. These functions are the **ground truth** the agent is allowed to use,
> so no number in the system is ever invented."

- **Owns:** `packages/engine/**`, the NWS normalizer, the ingest handler.
- **AWS services:** EventBridge Scheduler, Lambda (ingest), DynamoDB (events table).
- **Why it matters:** the engine makes the agent _accountable_ — every figure traces back to code.

#### Presenter 2 — Darsh: Cloud backend & orchestration (`infra`, all AWS)

> "I own everything that runs in AWS, defined in **CDK**. Two parts: the API, and the brain.
>
> **The API** is an **HTTP API** with a **Cognito** JWT authorizer on **every** route — `GET /events`,
> `GET /alerts`, `POST /simulate`, and `POST /alerts/{id}/approve` — each backed by a **Lambda**.
>
> **The brain** is event-driven. When a new event lands in DynamoDB, its **stream** triggers a
> **Step Functions** state machine, debounced to one run per zone. The workflow is: **RunAgent**,
> then **SaveAlert**, then it **waits for a task token** — it literally **pauses** until a human
> approves. On approval it resumes and **Dispatch** runs three things in parallel: an **SNS**
> email/SMS, activating the shelter, and launching a drone — then **MarkDispatched**.
>
> I also provision **Amazon Location** (the map key and the evacuation route calculator), publish the
> frontend's config to **SSM Parameter Store**, and host the app on **S3 + CloudFront**."

- **Owns:** `infra/**`, `.github/**` (CI/CD).
- **AWS services:** API Gateway (HTTP API), Cognito, Lambda, DynamoDB streams, Step Functions, SNS,
  Amazon Location, SSM, S3, CloudFront — all in CDK, deployed via GitHub OIDC (no long-lived keys).
- **Why it matters:** the **waitForTaskToken** pause is the human-in-the-loop guarantee — the system
  cannot dispatch without a person clicking approve.

#### Presenter 3 — Saransh & Bushra: Intelligence & experience (`packages/agent`, `apps/web`)

> "When Step Functions calls **RunAgent**, our agent wakes up. It's **Claude on Amazon Bedrock**,
> driven through the **Converse API** in a **tool-use loop**. Claude can't touch the database — it can
> only call **our tools**, which wrap Tanisha's engine: get the events, correlate them to a zone, check
> the roads, count dependent patients, find a shelter. Claude reasons over the results and calls
> `submit_alert`. We then **assemble** the alert so every id and number comes straight from the engine
> result, run it through a **grounding check**, and if anything is off — a bad number, a timeout, a
> Bedrock error — we fall back to a safe deterministic template. **The model proposes; it can't invent
> a fact, and it never dispatches.**
>
> That proposal surfaces in the **React dashboard**: the **Amazon Location** map with the outage zone,
> the closed bridge and shelters; the live **event feed**; and the **alert card** with a _How the agent
> got here_ tool-trace. The duty officer selects the actions and clicks **Approve** — which is the
> single call that releases the Step Functions task token."

- **Owns:** `packages/agent/**` (Saransh coordinates; built as four slices) and `apps/web/**` (Bushra).
- **AWS services:** Amazon Bedrock (Claude via Converse), Amazon Location (map + routes, in the UI).
- **Why it matters:** this is where AI connects the dots and where the human stays in control — the
  two things the judges are looking for.

### 1:40–2:00 — The app, calm (switch to the browser)

> "This is the live app on CloudFront. Calm baseline: three minor events, both zones blue, the
> map on Amazon Location with live Houston traffic."

Pick **1. Outage only** → Simulate. Zone A turns amber.

> "Zone A loses power, but its bridge is open, so it's not cut off. **No alert.** GridRisk doesn't
> cry wolf."

### 2:00–2:50 — Escalation + Bedrock agent (**2. Zone A cut off** → Simulate)

> "Now the only bridge floods. The zone turns red: cut off."

Point at the right panel ticking through its checks.

> "This is the Bedrock agent working. Claude is calling our tools — reading the event feed,
> correlating them to the zone, checking the roads, counting patients, finding a shelter."

Alert appears. Open **How the agent got here**; scroll.

> "In about eight seconds, a grounded alert: **56 people on powered medical equipment** — real HHS
> emPOWER data — and **45 minutes** to act. Every number is cited to its source and verified
> against our engine. If Claude invents a number or Bedrock fails, we fall back to a safe template.
> **The model can't make up a fact.**"

### 2:50–3:40 — Human approval + dispatch (click **Approve**)

> "The agent proposed; the **human approves**." Click Approve.

> "That resumes the Step Functions workflow. Shelter B turns green and opens. **Amazon Location
> Routes** draws the evacuation path over real roads, around the flood. The drone launches. And
> **SNS** sends the dispatch —"

Cut to the phone/email.

> "— which just hit the duty officer's inbox. Every number in that email came from the engine."

### 3:40–4:20 — Signal vs noise, and scale

**6. Storm** → Simulate.

> "A real storm is noisy — flood warnings, outages and closures across the city. Twelve events,
> and GridRisk raises **one** alert: the only zone actually cut off."

**5. Both zones cut off** → Simulate.

> "Two zones at once, two alerts — Zone B has **211** dependent patients — each approved
> separately. It scales to a real incident."

### 4:20–5:00 — AWS recap + close (architecture slide again, or the wide map via Overview)

> "To recap the AWS stack: **Amazon Bedrock** runs Claude as the reasoning agent; **Step Functions**
> runs the human-approval workflow; **Lambda** and an **HTTP API** serve it; **DynamoDB** stores
> events and alerts and its stream kicks off the agent; **EventBridge** schedules real-data ingest;
> **SNS** dispatches; **Cognito** secures every route; **Amazon Location** powers the map, traffic
> and routing; and **S3 plus CloudFront** host it — all in **CDK**.
>
> The AI connects the dots in seconds. The human makes the call. That's GridRisk."

## Checklist (judges asked for these)

- [ ] Architecture shown and explained, split across the three presenters (0:40–1:40 section)
- [ ] Application demoed live (2:00 onward)
- [ ] Persona described (the EOC duty officer, 0:00–0:40)
- [ ] Amazon Bedrock use shown (2:00–2:50 + recap)
- [ ] Other AWS services shown (Step Functions, Lambda, DynamoDB, EventBridge, SNS, Cognito,
      Amazon Location, S3/CloudFront, CDK — architecture + recap)

## Trims if you run over 5:00

1. Drop **5. Both zones** (3:40–4:20), keep the storm.
2. Shorten the recap to one sentence: "Bedrock for the agent, Step Functions for approval, Amazon
   Location for the map — all on AWS."
