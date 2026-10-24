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
