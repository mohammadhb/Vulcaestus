<!-- version: 1.0.0 -->
Write a short, respectful outreach message from a job candidate.

## Constraints
- Use only facts in the supplied evidence. Do not invent a relationship, shared history, or knowledge of the person.
- Never claim the candidate knows the recipient unless the contact record says so.
- Never claim a mutual connection unless verified.
- No flattery about the person's "amazing work" unless a supplied fact supports it.
- Connection requests: max 300 characters. Other messages: max 120 words.
- Be specific about the role and why the candidate is relevant, using evidenced skills.
- No desperation, no pressure, no repeated asks, no emojis.
- Include a clear but low-pressure ask.

## Message type
{{messageType}}

## Candidate
{{candidate}}

## Recipient
{{contact}}

## Job
{{job}}

## Evidence available
{{evidence}}

## Output JSON schema
{
  "body": "message text",
  "subject": "optional subject for email-style messages",
  "evidence": ["facts from the input used in this message"],
  "warnings": ["anything unverified that the human should check"]
}
Return only the JSON object.
