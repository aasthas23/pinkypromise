import type { RedFlag } from '../types';

/** Red flags shared by the real-recording robocall scenarios. */
export const robocallRedFlags: Record<string, RedFlag> = {
  prerecorded_message: {
    id: 'prerecorded_message',
    title: 'A recorded message about your account',
    explanation:
      'Real companies and agencies rarely open with a robot voice about a problem with your account. This message was played to many people at once.',
  },
  press_one: {
    id: 'press_one',
    title: '“Press 1” to fix it',
    explanation:
      'Pressing a key connects you to a live scammer and tells them your number is active, which can bring more calls. Hanging up costs you nothing.',
  },
  unsolicited_contact: {
    id: 'unsolicited_contact',
    title: 'They contacted you first',
    explanation:
      'You didn’t start this conversation. When a call about your account or benefits comes out of nowhere, treat it as unverified until you check.',
  },
  authority_claim: {
    id: 'authority_claim',
    title: 'Claimed authority',
    explanation:
      'The caller used a trusted name, like a well-known company or a government agency. Anyone can say that, and a name or badge number alone doesn’t prove it.',
  },
  fear_of_loss: {
    id: 'fear_of_loss',
    title: 'Fear of losing money',
    explanation:
      'A big unexpected charge or a frozen account is meant to scare you. Fear narrows attention and makes people act before they check.',
  },
  threat_of_arrest: {
    id: 'threat_of_arrest',
    title: 'Threats of arrest or legal action',
    explanation:
      'Government agencies don’t threaten arrest over the phone or demand payment to stop a warrant. Threats like this are a sign of fraud.',
  },
  artificial_urgency: {
    id: 'artificial_urgency',
    title: 'Countdown pressure',
    explanation: '“Right now” and “within the hour” deadlines leave no time to think or check. That rush is the point.',
  },
  discouraging_verification: {
    id: 'discouraging_verification',
    title: 'Talking you out of checking',
    explanation:
      'The caller said checking for yourself would make things worse. Legitimate organizations don’t mind if you verify.',
  },
  personal_info_request: {
    id: 'personal_info_request',
    title: 'Asking you to confirm personal details',
    explanation:
      '“Confirm your email” or “the last four of your Social” sounds routine. But they called you, so they should already know who you are.',
  },
  remote_access_request: {
    id: 'remote_access_request',
    title: 'Asking to control your device',
    explanation:
      'A “support app” that lets them see your screen gives a stranger access to your accounts and banking. Real support teams don’t cold-call to install software.',
  },
  gift_card_payment: {
    id: 'gift_card_payment',
    title: 'Paying with gift cards',
    explanation:
      'Gift cards are for gifts. Any caller who asks you to pay or “secure” money with gift cards is running a scam, every time.',
  },
  secrecy_demand: {
    id: 'secrecy_demand',
    title: 'Asked to keep it secret',
    explanation:
      '“Don’t tell anyone” keeps you away from people who might recognize the scam, like a store clerk or family member.',
  },
  escalating_requests: {
    id: 'escalating_requests',
    title: 'Escalating requests',
    explanation:
      'After getting one thing, the caller asked for more. Each “last step” builds on the trust you’ve already given.',
  },
};
