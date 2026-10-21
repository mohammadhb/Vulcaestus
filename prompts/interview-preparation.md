<!-- version: 1.0.0 -->
Prepare a practical interview brief for this candidate and role.

## Truthfulness rules
- Never invent company facts, funding, products, news, or team details. If company research is not supplied, say that research was not provided and suggest what to verify.
- STAR examples must be grounded in the candidate's actual achievements. Cite the source achievement.
- Do not invent metrics.
- Likely questions should be derived from the job description and the candidate's gaps.

## Candidate
{{candidate}}

## Resume achievements
{{achievements}}

## Job
{{job}}

## Interview
Stage: {{stage}}
Scheduled: {{scheduledAt}}
Interviewer: {{interviewer}}

## Output JSON
{
  "companyBriefing": "only supplied facts; otherwise state that research was not supplied",
  "roleBriefing": "",
  "likelyQuestions": [],
  "starExamples": [
    {
      "question": "",
      "situation": "",
      "task": "",
      "action": "",
      "result": "",
      "sourceAchievement": ""
    }
  ],
  "technicalPreparation": [],
  "questionsToAsk": [],
  "warnings": []
}
Return only the JSON object.
