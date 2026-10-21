import { describe, expect, it } from 'vitest';
import { heuristicResumeStructure } from './resume-parse.js';

const resume = `Ada Lovelace
Berlin, Germany
ada@example.com

Summary
Backend engineer with 7 years of experience building reliable APIs.

Experience
Senior Backend Engineer — Example GmbH | 2019 - Present
- Built a TypeScript service handling 2M requests per day
- Introduced PostgreSQL read replicas

Skills
TypeScript, Node.js, PostgreSQL, AWS

Education
MSc Computer Science, TU Berlin

Languages
English (fluent), German (B2)`;

describe('deterministic resume extraction', () => {
  it('extracts sections without inventing content', () => {
    const structured = heuristicResumeStructure(resume);
    expect(structured.summary).toContain('Backend engineer');
    expect(structured.summary).not.toContain('@example.com');
    expect(structured.skills.map((skill) => (typeof skill === 'string' ? skill : skill.name))).toContain('TypeScript');
    expect(structured.education[0]?.institution).toContain('TU Berlin');
    expect(structured.languages.length).toBeGreaterThan(0);
    expect(structured.experience.length).toBeGreaterThan(0);
    expect(structured.experience[0]?.company).toContain('Example GmbH');
    expect(structured.experience[0]?.role).toContain('Senior Backend Engineer');
    expect(structured.experience[0]?.startDate).toBe('2019');
    expect(structured.experience[0]?.endDate?.toLowerCase()).toBe('present');
  });

  it('keeps metrics from the original text', () => {
    const structured = heuristicResumeStructure(resume);
    const descriptions = structured.experience.flatMap((item) => item.achievements.map((achievement) => achievement.description));
    expect(descriptions.join(' ')).toContain('2M requests');
  });

  it('returns empty arrays for missing sections instead of fabricating', () => {
    const structured = heuristicResumeStructure('Just a summary line.');
    expect(structured.experience).toEqual([]);
    expect(structured.certifications).toEqual([]);
    expect(structured.projects).toEqual([]);
  });
});
