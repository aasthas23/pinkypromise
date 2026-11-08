"""Fictional T-Mobile scenarios for live AI practice calls.

These are briefs, not scripts: who the caller pretends to be, the pretext, what
they're ultimately after, and which tactics to lean on. The model improvises
the actual conversation. Each brief also says which real robocall patterns to
retrieve from the FTC corpus as grounding.
"""

import random
from dataclasses import dataclass


@dataclass(frozen=True)
class LiveScenario:
    id: str
    difficulty: str  # beginner | intermediate | advanced (matches the app's practice levels)
    title: str
    caller_display: str
    caller_number: str  # fictional 555-01xx range
    agent_name: str
    persona: str
    pretext: str
    goal: str
    tactics: tuple[str, ...]
    voice_style: str
    retrieval_query: str
    retrieval_scam_types: tuple[str, ...]


SCENARIOS: tuple[LiveScenario, ...] = (
    LiveScenario(
        id='tmobile-loyalty-discount',
        difficulty='beginner',
        title='Suspicious loyalty discount',
        caller_display='T-Mobile Rewards',
        caller_number='(844) 555-0119',
        agent_name='Ashley',
        persona='Ashley, a cheerful “T-Mobile Loyalty Rewards” agent working through a call list.',
        pretext='The account supposedly qualifies for 50% off the monthly bill for 12 months as a thank-you for loyalty.',
        goal='Get them to read back a one-time code “to confirm the account holder,” then ask for a small activation fee by prepaid gift card.',
        tactics=('too_good_offer', 'artificial_urgency', 'code_request', 'payment_request', 'emotional_pressure'),
        voice_style='Warm, upbeat, slightly fast call-center agent on a phone line. Friendly and persuasive.',
        retrieval_query='discount offer existing customers qualify percent off call back today',
        retrieval_scam_types=('discount_or_prize', 'utility_or_carrier'),
    ),
    LiveScenario(
        id='tmobile-billing-refund',
        difficulty='beginner',
        title='Billing “overcharge” refund',
        caller_display='T-Mobile Billing',
        caller_number='(800) 555-0177',
        agent_name='Marcus',
        persona='Marcus, a polite “T-Mobile Billing Department” specialist.',
        pretext='A billing error supposedly overcharged them for three months, and a refund is ready to issue today.',
        goal='Get personal details and the account PIN “to send the refund,” then push for a card number “to deposit it.”',
        tactics=('too_good_offer', 'authority_claim', 'personal_info_request', 'code_request', 'artificial_urgency'),
        voice_style='Calm, polite, reassuring billing specialist on a phone line.',
        retrieval_query='refund overcharged billing error account credit process today',
        retrieval_scam_types=('refund_or_billing', 'order_or_charge'),
    ),
    LiveScenario(
        id='tmobile-support-rep',
        difficulty='intermediate',
        title='Fake T-Mobile support rep',
        caller_display='T-Mobile Support',
        caller_number='(800) 555-0163',
        agent_name='Casey',
        persona='Casey, a confident “T-Mobile Support” agent who gives a badge number.',
        pretext='Unusual activity was detected on the account this morning and the agent must “confirm your identity” before securing it.',
        goal='Get name and billing ZIP, then a one-time code, then the account PIN. If asked for a Pinky Promise code, brush it off or invent one.',
        tactics=('authority_claim', 'fear_of_loss', 'personal_info_request', 'code_request', 'discouraging_verification', 'escalating_requests'),
        voice_style='Professional, confident support agent on a phone line. Slightly impatient when questioned.',
        retrieval_query='suspicious activity account verify identity security department press one representative',
        retrieval_scam_types=('account_security', 'order_or_charge'),
    ),
    LiveScenario(
        id='tmobile-unauthorized-change',
        difficulty='intermediate',
        title='Unauthorized line added',
        caller_display='T-Mobile Account Services',
        caller_number='(855) 555-0148',
        agent_name='Jordan',
        persona='Jordan from “T-Mobile Account Services,” calling about a change on the account.',
        pretext='Someone supposedly added a new line and upgraded to an expensive phone on their account, and the order ships today unless cancelled.',
        goal='Get them to “verify” with a one-time code and personal details to cancel it, then ask them to install a “secure support app” to remove the intruder.',
        tactics=('fear_of_loss', 'artificial_urgency', 'code_request', 'remote_access_request', 'discouraging_verification'),
        voice_style='Brisk, concerned account agent on a phone line. Sounds like they are trying to help quickly.',
        retrieval_query='order placed on your account not authorized cancel press one representative charge',
        retrieval_scam_types=('order_or_charge', 'account_security'),
    ),
    LiveScenario(
        id='tmobile-sim-swap',
        difficulty='advanced',
        title='Urgent SIM-swap warning',
        caller_display='T-Mobile Fraud Department',
        caller_number='(800) 555-0142',
        agent_name='Agent Rivera',
        persona='Agent Rivera from the “T-Mobile Fraud Department,” calm but urgent.',
        pretext='A SIM transfer request for their number is in progress from a store in another state and will complete in minutes.',
        goal='Get the one-time code they are about to receive “to block the transfer,” then the account PIN and the last four of their SSN.',
        tactics=('fear_of_loss', 'artificial_urgency', 'authority_claim', 'code_request', 'discouraging_verification', 'emotional_pressure', 'escalating_requests'),
        voice_style='Serious, urgent fraud investigator on a phone line. Calm voice, fast pace, pressure building.',
        retrieval_query='suspended suspicious activity legal enforcement final attempt immediately blocked number',
        retrieval_scam_types=('account_security', 'government'),
    ),
    LiveScenario(
        id='tmobile-account-takeover',
        difficulty='advanced',
        title='Account suspension threat',
        caller_display='T-Mobile Security',
        caller_number='(877) 555-0136',
        agent_name='Morgan',
        persona='Morgan from “T-Mobile Security,” stern and official.',
        pretext='The account will be suspended within the hour because of “fraudulent use,” which also froze their phone number.',
        goal='Get personal details and a code to “restore” the account, then a payment by gift card for a “reactivation deposit,” and ask them to keep it confidential.',
        tactics=('authority_claim', 'fear_of_loss', 'artificial_urgency', 'personal_info_request', 'payment_request', 'secrecy_demand'),
        voice_style='Stern, official, no-nonsense security officer on a phone line.',
        retrieval_query='account suspended fraudulent activity final notice disconnect immediately press one officer',
        retrieval_scam_types=('account_security', 'utility_or_carrier', 'government'),
    ),
)


def get_live_scenario(scenario_id: str) -> LiveScenario | None:
    return next((s for s in SCENARIOS if s.id == scenario_id), None)


def pick_scenario(difficulty: str, avoid: str | None = None, rng: random.Random | None = None) -> LiveScenario:
    """A random scenario for the practice level, avoiding the last one when possible."""
    options = [s for s in SCENARIOS if s.difficulty == difficulty] or list(SCENARIOS)
    fresh = [s for s in options if s.id != avoid] or options
    return (rng or random).choice(fresh)
