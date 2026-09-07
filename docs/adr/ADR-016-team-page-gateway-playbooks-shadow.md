# ADR-016: The team head's page, the communication gateway, playbooks as data and shadow mode

Date: 2026-09-07 · Status: accepted · Design: `docs/rm-experience-design.html` §12–13

## Context

Iteration 9 gave the RM the six moments of the day. The person who runs the team had no page, every
send left the platform without a common check, and the path toward agents speaking to clients had no
measurable first step.

## Decision

1. **Team page** (`/team`, `TeamService`). Five panels aggregated by RM under the caller's scope,
   each leading to an action: risk (lanes, urgency, escalations, ten worst households), conduct
   (overrides with reasons and rate, client-directed breaches, exclusions, KYC, ageing messages, a
   random explainability sample), coverage (cadence adherence, silent 90 days, reviews, promises past
   due), needs my signature (approved actions with no checker decision, oldest first), capacity (calls
   today and later, deferrals) with the management-fee proxy, plus ideas landing and the machine.
   Row-level security makes the same endpoint show an RM only their own row.
2. **Communication gateway** (`CommunicationGateway`). Every send passes one object, whoever wrote
   the message: cross-border rules from the reference file (restricted residences may not receive
   product offers without documented reverse enquiry), language against the reporting language, no
   promise or guarantee words, a suitability basis when the text proposes action, model exposure of
   the draft, and required disclosures appended when missing. Blocks return 409 with the reasons; a
   preview endpoint shows the verdict before sending; every verdict is an audit event. An agent origin
   adds the "agents enabled" check.
3. **Playbooks as data** (`data/reference/playbooks.json` → `derived.reference_docs`). A playbook has a
   goal, allowed topics, required disclosures, escalation triggers and steps with templates. The
   companion runs them as a checklist; the same file is what an agent will run.
4. **Shadow mode** (`derived.shadow_grades`, migration 0014–0015). For each step the template is filled
   from the client's facts; placeholders the facts cannot fill are shown, not guessed. The RM grades
   the draft with one tap. Agreement per playbook, against the threshold and minimum count in the
   playbook file, is reported on the machine panel and decides readiness for L2. Nothing reaches the
   client.
5. **Machine panel and pause switch.** Model calls and errors today, tasks confirmed from language,
   gate blocks, autonomy level, shadow agreement. A head or admin can pause all agents; the gateway
   refuses agent-origin sends while paused; the switch is an audit event.

## Consequences

- Autonomy above L1 is a policy decision backed by a number, not a feature flag.
- Sends now fail when the gateway blocks; the RM sees why and can edit. Reverse enquiry is a flag on
  the draft context that the workflow does not yet set from the UI.
- The team page shows one RM row on this dataset; it is built by RM id and grows with assignments.
