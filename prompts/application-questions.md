<!-- version: 1.0.0 -->
Draft answers to application questions using ONLY the candidate's structured profile.

## Rules
- Every answer must have a source path, e.g. `candidate_profile.yearsExperience`, `resume.experience[0]`, `candidate_profile.workAuthorization`.
- If evidence is missing or ambiguous, set `confident=false` and `source="insufficient_evidence"`. Do not guess.
- Sensitive questions always require human review: criminal history, disability, veteran status, protected characteristics, immigration/legal declarations, health, and compensation commitments.
- For compensation questions, provide a range based on the profile but mark sensitive=true and confident=false.
- Answers must be concise and suitable for a form field.
- Never invent employers, degrees, dates, or numbers.

## Candidate profile
{{candidate}}

## Resume
{{resume}}

## Job
{{job}}

## Questions
{{questions}}

## Output JSON
{
  "answers": [
    {
      "question": "exact question",
      "answer": "",
      "source": "path or insufficient_evidence",
      "confident": true,
      "sensitive": false
    }
  ]
}
Return only the JSON object.
