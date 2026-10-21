<!-- version: 1.0.0 -->
Convert this raw resume text into structured JSON. This is an extraction task.

## Absolute constraints
- Extract only what is present in the text.
- Never infer a metric, date, employer, degree, certification, or technology that is not written.
- If a section is missing, return an empty array for it.
- Preserve the original wording of achievements as much as possible.
- Keep company names, role titles, and dates exactly as written.
- Skills may be normalized to their common name, but do not add skills that are not present.

## Raw resume text
{{rawText}}

## Output JSON schema
{
  "summary": "",
  "headline": "",
  "experience": [
    {
      "company": "",
      "role": "",
      "startDate": "",
      "endDate": "",
      "location": "",
      "summary": "",
      "achievements": [
        { "title": "", "description": "", "technologies": [], "metrics": [], "dates": "" }
      ],
      "technologies": []
    }
  ],
  "skills": [{ "name": "", "category": "", "level": "" }],
  "projects": [
    { "name": "", "description": "", "technologies": [], "url": "", "achievements": [] }
  ],
  "education": [
    { "institution": "", "degree": "", "field": "", "startDate": "", "endDate": "", "location": "" }
  ],
  "certifications": [{ "name": "", "issuer": "", "date": "" }],
  "languages": [{ "name": "", "level": "" }],
  "achievements": []
}
Return only the JSON object.
