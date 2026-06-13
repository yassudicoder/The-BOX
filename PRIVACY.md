Privacy Policy for Continue AI

Last updated: 2026-06-13

Continue AI is a browser extension that lets you move an AI chat
conversation from one assistant (ChatGPT, Claude, or Gemini) to another,
so you can continue it without copying and re-entering it by hand. This
policy explains exactly what data the extension handles, and what it
does not.

THE SHORT VERSION

Continue AI runs entirely on your device. It has no server, no account,
and no telemetry. It does not track you and sends nothing to us or to
any third party. Your conversation only goes to another AI when you
choose to transfer it there.

WHAT THE EXTENSION ACCESSES

To do its job, Continue AI reads:

- Personal communications and website content: the text of the AI
  conversation on the page you are viewing (your messages and the
  assistant's replies), so it can be captured and transferred.
- Your settings: your preferences for how transfers work, such as the
  destination AI and size limits.

It accesses this only on the AI sites it supports — ChatGPT
(chatgpt.com), Claude (claude.ai), and Gemini (gemini.google.com). It
does not read or access any other website, your browsing history, your
other tabs, your passwords or login credentials, your location, or any
financial or health information.

On those three supported sites, the extension automatically adds a small
"Continue AI" button to the page so you can start a capture without
opening the toolbar menu. Displaying this button does not read or send
your conversation; the conversation is only read when you actually start
a capture (by clicking that button or the toolbar icon).

OPTIONAL CONTEXT METER

Continue AI includes an optional "context meter" that estimates how full
the current chat is relative to the AI's context window. It is OFF by
default. While it is off, the extension does no continuous reading of the
page at all.

If you turn it on (in the panel's Advanced settings), the extension reads
the text of the messages visible on the supported chat page to estimate
their size. This estimation runs entirely on your computer: only a single
running number (the estimated token count) is kept locally and shown to
you in the toolbar badge and the side panel. The conversation text itself
is never stored for the meter and never leaves your device. Counting pauses
whenever the tab is not visible, and stops as soon as you turn the meter
off. All meter numbers are approximate and labelled as estimates.

On Claude specifically, with the meter on, the extension additionally reads
your own account usage directly from claude.ai's own usage API — the same
session and weekly usage figures Claude already shows you — using your
existing signed-in session. This is a request to claude.ai itself (the site
you are already using), not to us: it goes to no server of ours, and there
is no third party involved. The usage figures are processed on your computer
to show your session/weekly usage, a reset countdown, and an estimated
"messages left" number, and are never stored long-term or transmitted off
your device. This read happens only while the meter is on and only on Claude;
turning the meter off stops it entirely. The exact figures come from Claude's
API; the "messages left" number is an approximation and is labelled as such.

HOW DATA IS USED AND STORED

- Your conversation and settings are stored locally in your browser
  (chrome.storage.local), on your own computer. They are not uploaded
  anywhere.
- The data is used only for the extension's single purpose: capturing,
  compressing, and transferring your conversation to the AI you choose.
- When you transfer a conversation, the extension places the transfer
  prompt on your clipboard. You then paste it into the AI you want to
  continue with. That destination service then handles the conversation
  under its own privacy policy.

WHAT WE DO NOT DO

- We do not collect, receive, or transmit your data to ourselves or any
  third party. The extension has no backend server.
- We do not sell or transfer your data to data brokers or any third
  party, apart from the user-directed transfer described above.
- We do not use your data for advertising, profiling, creditworthiness,
  or lending.
- We do not use your data for any purpose unrelated to the extension's
  single purpose.
- There is no analytics, telemetry, or tracking of any kind.

PERMISSIONS

Continue AI requests the minimum permissions needed: storage (to save
your conversations and settings locally), sidePanel (to show the
interface), and scripting plus access to the supported AI sites (to
display the in-page capture button, and to read the source conversation
when you click Capture; the transfer prompt is then placed on your
clipboard for you to paste into the destination AI yourself). The
scripting permission is also what injects the optional context-meter
script — but only while you have that feature turned on. The extension is
also restricted by a content security policy that prevents it from making
outbound network connections or running any code not included in the
extension package.

REMOVING YOUR DATA

You can clear your saved conversations and settings at any time from
the extension's panel, or by removing the extension, which deletes its
local data.

CHILDREN

Continue AI is a general productivity tool and is not directed to
children under 13.

LIMITED USE

The use of information received through Continue AI adheres to the
Chrome Web Store User Data Policy, including the Limited Use
requirements.

CHANGES

We may update this policy; material changes will be reflected here with
a new "last updated" date.

CONTACT

Questions about this policy: siddhesh2106@gmail.com
