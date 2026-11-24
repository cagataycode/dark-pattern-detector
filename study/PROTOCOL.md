# Study protocol (draft)

Draft of 23 Nov 2026. Placeholders are in [brackets]. Discuss it with the assessor before anyone takes part, and ask whether the university needs any formal ethics approval for a study like this.

## 1. Questions

1. **Do the dark patterns change what people do?** Measured as add-ons kept, newsletter sign-ups and money spent in a shop with dark patterns.
2. **Does the detector's warning reduce that effect?** Measured as the same behaviour in the same shop with the extension showing warnings.
3. **Do people notice and remember the patterns,** with and without warnings? And how much do they trust the shop afterwards?

This is a small exploratory study. With 15–20 people it can show tendencies and give material for reflection, not prove effects.

## 2. Design

Between subjects: each person shops once, in one condition.

| Condition | Shop | Extension | Purpose |
|---|---|---|---|
| **B: Dark** | All six patterns on | Off | What the patterns do |
| **C: Dark + warnings** | All six patterns on | On | What the warnings change |
| A: Honest (optional) | All patterns off | Off | Baseline. Add only if there are 24+ participants |

**Why B vs. C first:** with so few people, two groups of 8–10 say more than three groups of 6. Without A you can't say how much the patterns themselves push behaviour. Call that a limitation, or add A if more people sign up.

**Assignment:** alternate in blocks so the groups stay equal and aren't sorted by who came first. Prepare the list before the first session: P01 B, P02 C, P03 C, P04 B, P05 B, P06 C, … (draw each block of two by coin toss).

**Language:** English shop, since CODE participants are mixed. Note the language in the log (`lang`).

## 3. Participants

- 15–20 adults (18+), recruited at CODE: Slack, flyers, asking in person.
- No one who has seen the test shop, the extension or this project, since that would give it away.
- No payment. Optional: a snack or coffee. Taking part, or stopping, has no effect on grades or anything else.

## 4. Deception, and why it's acceptable

Participants are told the study is about **"how people make decisions when shopping online"**. They are not told in advance that the shop contains manipulative design, because that would change how they shop.

- The deception is mild: no real money, no real products, no personal data asked for. The footer says it's a research prototype.
- Everyone gets a full **debrief** right after the session (see [DEBRIEF.md](DEBRIEF.md)): what each pattern was and what it is meant to do.
- After the debrief, each participant can withdraw their data.

## 5. Materials

- One laptop, Chrome, a fresh tab per session, the shop running locally (`python3 -m http.server 8011 --bind 127.0.0.1` in `dark-pattern-detector/`), and the extension installed.
- Use **127.0.0.1**, never `localhost`: the browser keeps their settings and event logs apart.
- Printed consent forms ([CONSENT.md](CONSENT.md)), questionnaire (appendix A), debrief sheet.
- A participant list on paper (session id → condition only, no names).

## 6. Procedure (about 15 minutes per person)

| Step | Time | What happens |
|---|---|---|
| 1. Setup (before they sit down) | – | Extension on or off for the condition (toolbar popup). On the admin page, tick all patterns (or none for A), enter the session id, and open the link in a new tab. Check that the popup in the shop hasn't opened yet |
| 2. Consent | 2 min | They read and sign the consent form. Answer questions without revealing the dark patterns |
| 3. Task | ~5 min | Read the task aloud (box below). Then step back and don't help. Note anything they say |
| 4. Questionnaire | 4 min | Appendix A, on paper or a form with no name field, tagged with the session id |
| 5. Debrief | 3 min | Go through DEBRIEF.md with them, show the patterns in the shop, answer questions, offer withdrawal |
| 6. After they leave | 1 min | Admin page → check the session's events are there. Close the tab |

> **Task (read aloud):** "Imagine a friend's birthday is coming up. In this online shop, pick one present you think they'd like, up to about €100, and complete the order as you normally would. It's not a real shop and nothing will be charged. Tell me when you're done."

At the end of the day: **Export JSON** on the admin page and save the file with the date. Then clear the log only after checking the export opens.

## 7. What's measured

From the shop's event log (automatic, per session id):

| Measure | Event | Pattern it tests |
|---|---|---|
| Kept the protection plan / express shipping | `order_placed.addons` | Pre-ticked add-ons |
| Signed up for the newsletter | `popup_answer` | Confirmshaming |
| Order total | `order_placed.total` | All, especially drip pricing |
| Time from start to order | `session_start` → `order_placed` | Urgency |
| Abandoned at checkout | `checkout_view` without `order_placed` | Drip pricing |
| Products viewed | `view_product` | – |

From the questionnaire (appendix A): trust, felt time pressure, noticed patterns, recall, and (condition C) how the warnings were used.

From observation: what they said and did, in short notes.

## 8. Analysis

- **Per condition:** share who kept each add-on, share who subscribed, median order total, median time.
- **B vs. C:** compare those shares. With 8–10 people per group, report the numbers and, at most, a Fisher's exact test for kept-vs-removed add-ons. Don't claim significance from small groups.
- **Questionnaire:** median trust and time pressure per group; recall hits per pattern.
- **Qualitative:** what people said about the warnings. Did they read them, ignore them, find them annoying?
- **Link to theory:** default effect (add-ons), loss aversion and time pressure (countdown), scarcity and social proof, anchoring (was-price, drip), self-image (confirmshaming). Also habituation: did warnings stop being read after the first few?

## 9. Data protection

- **No names in the data.** The log and the questionnaire only use the session id (P01, P02, …).
- **Consent forms** (with names and signatures) are kept on paper, separate from the data, and destroyed after grading.
- **The email field** in the shop's popup is never stored. Tell participants they can type anything.
- **Event log:** stays on the study laptop. The exported JSON goes into a private folder, not into the public repo.
- **Withdrawal:** possible until [date, e.g. end of the analysis]. The session id is on their copy of the consent form, so their data can be found and deleted.
- **Deletion:** raw data deleted [e.g. 6 months after grading]. Only aggregated numbers are kept and shown.

## 10. Risks

- **Feeling tricked or embarrassed** about falling for a pattern. Mitigation: the debrief stresses that these patterns work on almost everyone, which is why shops use them, and that the study measures the design, not them.
- **Telling others** before they take part would spoil the study. Ask participants not to talk about it until [end date].

## 11. Pilot

Run 2 people first, preferably not from the participant pool. Check:
- the timing
- that the task is clear
- that the popup appears during the task
- that the log captures each step
- that the questionnaire takes under 5 minutes

Fix anything, then start. Don't count the pilot data.

## Appendix A: Questionnaire (after the task, before the debrief)

Session id: ____

1. How much do you trust this shop? (1 = not at all … 7 = completely)
2. How fair did the prices feel? (1 = very unfair … 7 = very fair)
3. Would you buy from this shop again? (1 = definitely not … 7 = definitely)
4. How much time pressure did you feel while shopping? (1 = none … 7 = a lot)
5. Did anything in the shop make you feel rushed, guilty or pushed? If so, what? (open)
6. Which of these did you see in the shop? Tick all that apply.
   - [ ] A countdown timer
   - [ ] "Only N left" stock messages
   - [ ] A number of people viewing a product
   - [ ] Add-ons that were already selected
   - [ ] Fees that appeared at checkout
   - [ ] A struck-through "was" price
   - [ ] A free shipping offer *(not in the shop: a check for guessing)*
   - [ ] Customer reviews *(not in the shop: a check for guessing)*
7. Did you change anything in your cart before ordering? What, and why? (open)

**Only condition C (with warnings):**

8. Did you notice the orange warning tags? (yes / no)
9. How many did you read, roughly? (none / a few / most / all)
10. Did a warning change what you did? If so, which one and how? (open)
11. How useful were the warnings? (1 = not at all … 7 = very)
12. How annoying were the warnings? (1 = not at all … 7 = very)

**Everyone:**

13. How often do you shop online? (weekly or more / monthly / less)
14. Age group: 18–21 / 22–25 / 26–30 / 31+
