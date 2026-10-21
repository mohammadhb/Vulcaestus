<!-- version: 1.0.0 -->
You are tailoring an existing resume for a specific job. This is a rewriting and reordering task, NOT a creative writing task.

## Absolute constraints
- NEVER invent experience, employers, job titles, dates, education, certifications, metrics, or technologies.
- NEVER add a skill or technology that is not present in the candidate's source profile.
- You may reorder, shorten, rephrase, and emphasize existing content.
- Every bullet must be traceable to an achievement, project, or role in the source.
- If the source lacks evidence for a job requirement, omit it; do not fabricate coverage.
- Preserve dates and company names exactly.
- Keep the resume truthful and ATS-friendly: standard section headings, no tables, no graphics, no columns.

## Candidate profile
{{candidate}}

## Master resume (structured JSON)
{{resume}}

## Job
{{job}}

## Output JSON schema
{
  "summary": "2-3 sentence positioning using only evidenced facts",
  "experience": [
    {
      "company": "exact company from source",
      "role": "exact role from source",
      "startDate": "",
      "endDate": "",
      "location": "",
      "summary": "",
      "achievements": [
        { "title": "", "description": "rewritten from source", "technologies": [], "metrics": [] }
      ],
      "technologies": []
    }
  ],
  "skills": ["only skills present in source"],
  "education": [],
  "certifications": [],
  "languages": [],
  "coverLetter": "optional; may be empty",
  "applicationSummary": "short summary for application forms",
  "changeNotes": ["what was reordered or emphasized", "what was deliberately not added"]
}
Return only the JSON object.
