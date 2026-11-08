"""Fixed taxonomy for live AI calls.

The conversation itself is free-form, but scoring isn't: after each turn the
model labels the caller's tactics and the user's actions using only these ids
(enforced by the output schema), and the debrief rules work from those labels.
"""

from ..models import RedFlag

TACTICS: dict[str, tuple[str, str]] = {
    'unsolicited_contact': ('Unexpected call about your account',
        'You didn’t contact anyone. A call about your account that comes out of nowhere is unverified until you check.'),
    'authority_claim': ('Claimed to be T-Mobile',
        'Saying “I’m with T-Mobile,” a team name or a badge number is easy. A title alone proves nothing.'),
    'partial_info_as_proof': ('Used partial details as proof',
        'Last-four digits, your name or your address often leak in data breaches. Knowing them doesn’t make a caller legitimate.'),
    'too_good_offer': ('Too-good-to-be-true offer',
        'Big surprise discounts, refunds or rewards are a hook to get you talking and lower your guard.'),
    'fear_of_loss': ('Fear about your account or money',
        '“Unusual activity,” “someone is in your account,” or “you’ll lose service” is meant to alarm you so you act before you check.'),
    'artificial_urgency': ('Countdown pressure',
        '“Right now,” “in ten minutes,” or “only today” leaves no time to think or check. That rush is the point.'),
    'discouraging_verification': ('Talked you out of checking',
        'Saying a callback won’t work or the app can’t help keeps you away from the real T-Mobile.'),
    'personal_info_request': ('Asked you to confirm personal details',
        'They called you, so a real agent would already know who you are. Confirming details helps a scammer take over your account.'),
    'code_request': ('Asked for a one-time code or PIN',
        'One-time codes and PINs are for you to type in yourself, never to read to a caller.'),
    'remote_access_request': ('Asked for access to your device',
        'Installing a “support app” or sharing your screen gives a stranger access to your accounts.'),
    'payment_request': ('Asked for an unusual payment',
        'Gift cards, wire transfers, crypto or a “fee to unlock” are ways scammers take money that can’t be recovered.'),
    'emotional_pressure': ('Guilt, flattery or emotional pressure',
        '“I’m trying to help you” or “it only takes a second” makes saying no feel rude.'),
    'secrecy_demand': ('Asked you to keep it secret',
        '“Don’t tell anyone” keeps you away from people who might recognize the scam.'),
    'escalating_requests': ('Escalating requests',
        'After getting one thing, the caller asked for more. Each “last step” builds on trust you’ve already given.'),
}

# (label for the timeline, behavior kind, why it matters)
USER_ACTIONS: dict[str, tuple[str, str, str]] = {
    'challenged_caller': ('Questioned the caller', 'protective',
        'Asking who is calling or why, before agreeing to anything, keeps you in control.'),
    'requested_caller_verification': ('Asked the caller to prove who they are', 'protective',
        'Asking for proof you can check yourself, like a Pinky Promise code, flips the pressure around.'),
    'verified_independently': ('Chose to check with T-Mobile yourself', 'protective',
        'Contacting T-Mobile through the app or the number on your bill is the most reliable check.'),
    'refused_request': ('Refused the request', 'protective',
        'Saying no to a request for codes, details, access or money protected you.'),
    'ended_conversation': ('Ended the conversation', 'protective',
        'Ending a call that pressures you is always an option.'),
    'disclosed_code': ('Shared a code or PIN (simulated)', 'risky',
        'A code or PIN lets someone pass T-Mobile’s checks as you and take over your account or number.'),
    'disclosed_personal_info': ('Shared personal details (simulated)', 'risky',
        'Personal details help a scammer impersonate you to T-Mobile and others.'),
    'agreed_to_remote_access': ('Agreed to give device access (simulated)', 'risky',
        'Remote access lets a stranger see your screen, accounts and saved passwords.'),
    'agreed_to_payment': ('Agreed to pay (simulated)', 'risky',
        'Money sent by gift card, wire or crypto is very hard to get back.'),
    'went_along': ('Went along with the caller', 'neutral',
        'Going along feels polite, and scammers count on that to keep the call moving.'),
}

DISCLOSURE_ACTIONS = {'disclosed_code', 'disclosed_personal_info', 'agreed_to_remote_access', 'agreed_to_payment'}
DISCLOSURE_LABELS = {
    'disclosed_code': 'a code or PIN',
    'disclosed_personal_info': 'personal details',
    'agreed_to_remote_access': 'device access',
    'agreed_to_payment': 'a payment',
}
SENSITIVE_TACTICS = {'personal_info_request', 'code_request', 'remote_access_request', 'payment_request'}


def red_flag(tactic_id: str) -> RedFlag:
    title, explanation = TACTICS[tactic_id]
    return RedFlag(id=tactic_id, title=title, explanation=explanation)


# ---------------------------------------------------------------- keyword fallback
# Used only when the model's turn assessment is unavailable, so the debrief still works.
import re  # noqa: E402

_TACTIC_PATTERNS = {
    'authority_claim': r't-mobile|department|security team|support|badge|agent|specialist',
    'too_good_offer': r'discount|% off|percent off|free|refund|reward|qualif|credit',
    'fear_of_loss': r'suspend|lock|lose|blocked|frozen|hack|unauthori[sz]ed|someone (?:is|has)|fraud',
    'artificial_urgency': r'right now|immediately|minutes|today|hurry|quick|before it',
    'discouraging_verification': r"(?:don'?t|no need to|won'?t) (?:call|check|hang up|log in)|hold times|can'?t stop it|only one who",
    'personal_info_request': r'confirm (?:your|the) (?:name|address|zip|date|birth|email)|last four|social',
    'code_request': r'\bcode\b|\bpin\b|passcode|read (?:it|that) (?:back|to me)',
    'remote_access_request': r'install|app on your|screen|remote|download',
    'payment_request': r'gift card|fee|deposit|card number|pay(?:ment)?\b|wire|bitcoin|crypto',
    'emotional_pressure': r"trying to help|only takes|trust me|i promise|don'?t worry",
    'secrecy_demand': r"don'?t tell|confidential|keep (?:this|it) between",
}
_ACTION_PATTERNS = {
    'verified_independently': r"(?:i'?ll|i will|let me|going to) (?:call|contact|check with|log in|use the app)|number on my bill|official (?:number|app)|t-mobile app",
    'requested_caller_verification': r'pinky promise|verification code from you|prove|employee id|badge number',
    'challenged_caller': r'who (?:is|are) (?:this|you)|how do i know|why (?:do|would) you|is this real|scam',
    'refused_request': r"\bno\b|not (?:going to|sharing|giving)|i won'?t|i don'?t (?:want|feel)|never share",
    'ended_conversation': r'bye|hang(?:ing)? up|goodbye',
    'disclosed_code': r'\[number removed\]|the code is|my pin',
    'disclosed_personal_info': r'\[email removed\]|my (?:name|address|zip|birthday) is',
    'agreed_to_remote_access': r"(?:i'?ll|okay,? i'?m) install|installing",
    'agreed_to_payment': r"(?:i'?ll|okay,? i'?ll) (?:buy|pay|get the gift)",
}


def heuristic_tactics(text: str) -> list[str]:
    return [t for t, p in _TACTIC_PATTERNS.items() if re.search(p, text, re.I)]


def heuristic_actions(text: str) -> list[str]:
    found = [a for a, p in _ACTION_PATTERNS.items() if re.search(p, text, re.I)]
    return found or (['went_along'] if text.strip() else [])
