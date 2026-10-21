import type { CandidateProfile, Job, Resume } from '@vulcaestus/db';
import { prisma } from '@vulcaestus/db';
import { z } from 'zod';
import { generatedAnswerSchema, type StructuredResume } from '@vulcaestus/types';
import { runAiJson } from './ai.js';
import { collectCandidateSkills, estimateYearsExperience, profileToScoringProfile } from './jobs/score.js';

export const SENSITIVE_PATTERNS: RegExp[] = [
  /criminal|conviction|felony|misdemeanou?r|background check/i,
  /disabilit|handicap|accommodation/i,
  /veteran|military status/i,
  /race|ethnic|national origin|color/i,
  /gender|sex(?:ual)? orientation|pronoun/i,
  /religio|belief/i,
  /age\b|date of birth|born/i,
  /health|medical|pregnan|smok/i,
  /immigration|citizenship status|legal declaration|right to work|work permit|authori[sz]ed to work|eligib(?:le|ility) to work/i,
  /salary|compensation|expected pay|desired pay|remuneration/i,
  /drug test|substance/i,
  /marital|family status|dependent/i,
];

export function isSensitiveQuestion(question: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(question));
}

export interface GeneratedApplicationAnswer {
  question: string;
  answer: string;
  source: string;
  confident: boolean;
  sensitive: boolean;
  status: 'ANSWERED' | 'HUMAN_REVIEW';
}

function salaryRange(profile: CandidateProfile): string {
  const min = profile.minimumSalary;
  const preferred = profile.preferredSalary;
  if (min && preferred) return `${min.toLocaleString()} – ${preferred.toLocaleString()} ${profile.currency} gross per year`;
  if (preferred) return `From ${preferred.toLocaleString()} ${profile.currency} gross per year`;
  if (min) return `From ${min.toLocaleString()} ${profile.currency} gross per year`;
  return '';
}

export function heuristicAnswer(
  question: string,
  profile: CandidateProfile,
  resume: Resume | null,
  job: Job,
): GeneratedApplicationAnswer {
  const lower = question.toLowerCase();
  const structured = (resume?.structured ?? null) as StructuredResume | null;
  const scoring = profileToScoringProfile(profile);
  const years = estimateYearsExperience(scoring, structured);
  const sensitive = isSensitiveQuestion(question);
  const review = (answer: string, source: string): GeneratedApplicationAnswer => ({
    question,
    answer,
    source,
    confident: false,
    sensitive,
    status: 'HUMAN_REVIEW',
  });

  if (/salary|compensation|expected pay|desired pay|remuneration/.test(lower)) {
    return review(salaryRange(profile), 'candidate_profile.minimumSalary / preferredSalary');
  }
  if (sensitive) {
    if (/authori[sz]ed|work permit|right to work|eligib/.test(lower)) {
      const authorized =
        job.country !== null &&
        profile.authorizedCountries.some((country) =>
          job.country?.toLowerCase().includes(country.toLowerCase()),
        );
      return review(
        profile.workAuthorization ?? (authorized ? 'Yes' : ''),
        profile.workAuthorization ? 'candidate_profile.workAuthorization' : 'insufficient_evidence',
      );
    }
    if (/disabilit|handicap|accommodation/.test(lower)) {
      return review('', 'sensitive_question_requires_human');
    }
    return review('', 'sensitive_question_requires_human');
  }

  if (/how many years|years of (professional )?experience|years experience/.test(lower)) {
    const skill = (question.match(/with ([A-Za-z0-9+#./ -]{2,30})\??$/)?.[1] ?? '')
      .replace(/[.?!]+$/, '')
      .trim()
      .toLowerCase();
    if (skill) {
      const has = collectCandidateSkills(scoring, structured).includes(skill);
      if (!has) return review('', 'insufficient_evidence');
    }
    if (years !== null) {
      return {
        question,
        answer: String(Math.round(years)),
        source: profile.yearsExperience !== null ? 'candidate_profile.yearsExperience' : 'resume.experience',
        confident: true,
        sensitive: false,
        status: 'ANSWERED',
      };
    }
    return review('', 'insufficient_evidence');
  }

  if (/sponsor/.test(lower)) {
    return {
      question,
      answer: profile.sponsorshipRequired ? 'Yes' : 'No',
      source: 'candidate_profile.sponsorshipRequired',
      confident: true,
      sensitive: false,
      status: 'ANSWERED',
    };
  }

  if (/authori[sz]ed to work|right to work|work permit|eligible to work/.test(lower)) {
    if (profile.workAuthorization) {
      return {
        question,
        answer: profile.workAuthorization,
        source: 'candidate_profile.workAuthorization',
        confident: true,
        sensitive: false,
        status: 'ANSWERED',
      };
    }
    const authorized =
      job.country !== null &&
      profile.authorizedCountries.some((country) =>
        job.country?.toLowerCase().includes(country.toLowerCase()),
      );
    if (authorized) {
      return {
        question,
        answer: 'Yes',
        source: 'candidate_profile.authorizedCountries',
        confident: true,
        sensitive: false,
        status: 'ANSWERED',
      };
    }
    return review('', 'insufficient_evidence');
  }

  if (/relocat|move to|willing to move/.test(lower)) {
    if (profile.relocationPreference) {
      return {
        question,
        answer: profile.relocationPreference,
        source: 'candidate_profile.relocationPreference',
        confident: true,
        sensitive: false,
        status: 'ANSWERED',
      };
    }
    return review('', 'insufficient_evidence');
  }

  if (/start|notice period|availability/.test(lower)) {
    return review('', 'insufficient_evidence');
  }

  if (/remote|hybrid|on-?site/.test(lower)) {
    return {
      question,
      answer: profile.remotePreference,
      source: 'candidate_profile.remotePreference',
      confident: true,
      sensitive: false,
      status: 'ANSWERED',
    };
  }

  if (/why (are you|do you)|interest(ed)? in (this|the) (role|company|position)/.test(lower)) {
    const summary = profile.summary || structured?.summary;
    if (summary) {
      return {
        question,
        answer: summary.slice(0, 900),
        source: profile.summary ? 'candidate_profile.summary' : 'resume.summary',
        confident: true,
        sensitive: false,
        status: 'ANSWERED',
      };
    }
    return review('', 'insufficient_evidence');
  }

  if (/LinkedIn|GitHub|portfolio|website/.test(question)) {
    const value =
      /linkedin/i.test(question)
        ? profile.linkedinUrl
        : /github/i.test(question)
          ? profile.githubUrl
          : profile.portfolioUrl;
    if (value) {
      return {
        question,
        answer: value,
        source: /linkedin/i.test(question)
          ? 'candidate_profile.linkedinUrl'
          : /github/i.test(question)
            ? 'candidate_profile.githubUrl'
            : 'candidate_profile.portfolioUrl',
        confident: true,
        sensitive: false,
        status: 'ANSWERED',
      };
    }
    return review('', 'insufficient_evidence');
  }

  if (/describe your experience|experience with/.test(lower)) {
    const skill = (question.match(/(?:with|in) ([A-Za-z0-9+#./ -]{2,40})\??$/)?.[1] ?? '')
      .replace(/[.?!]+$/, '')
      .trim()
      .toLowerCase();
    const skills = collectCandidateSkills(scoring, structured);
    if (skill && skills.includes(skill) && years !== null) {
      return {
        question,
        answer: `${Math.round(years)} years of professional experience, including work with ${skill}.`,
        source: 'resume.experience',
        confident: true,
        sensitive: false,
        status: 'ANSWERED',
      };
    }
    return review('', 'insufficient_evidence');
  }

  return review('', 'insufficient_evidence');
}

export function defaultQuestions(profile: CandidateProfile, job: Job): string[] {
  const questions = [
    'How many years of professional experience do you have?',
    `Do you require visa sponsorship to work in ${job.country ?? 'the role\u2019s location'}?`,
    `Are you authorized to work in ${job.country ?? 'the role\u2019s location'}?`,
    'What are your salary expectations?',
    'Are you willing to relocate?',
    'When would you be able to start?',
    `Why are you interested in the ${job.title} role at ${job.company}?`,
  ];
  for (const skill of job.requiredSkills.slice(0, 2)) {
    questions.push(`Describe your experience with ${skill}.`);
  }
  return questions;
}

const aiAnswersSchema = z.object({ answers: z.array(generatedAnswerSchema) });

function safeSource(source: string): boolean {
  return (
    source.startsWith('candidate_profile.') ||
    source.startsWith('resume.') ||
    source === 'insufficient_evidence' ||
    source === 'sensitive_question_requires_human'
  );
}

export async function generateApplicationAnswers(
  profile: CandidateProfile,
  resume: Resume | null,
  job: Job,
  questions?: string[],
): Promise<GeneratedApplicationAnswer[]> {
  const targetQuestions = (questions?.length ? questions : defaultQuestions(profile, job))
    .map((question) => question.trim())
    .filter(Boolean)
    .slice(0, 40);

  const deterministic = targetQuestions.map((question) => heuristicAnswer(question, profile, resume, job));
  if (!resume) return deterministic;

  const ai = await runAiJson({
    kind: 'APPLICATION_ANSWERS',
    promptName: 'application-questions',
    entityType: 'job',
    entityId: job.id,
    inputRefs: { profileId: profile.id, resumeId: resume.id, jobId: job.id, questions: targetQuestions },
    schema: aiAnswersSchema,
    variables: {
      candidate: {
        fullName: profile.fullName,
        summary: profile.summary,
        yearsExperience: profile.yearsExperience,
        workAuthorization: profile.workAuthorization,
        authorizedCountries: profile.authorizedCountries,
        sponsorshipRequired: profile.sponsorshipRequired,
        minimumSalary: profile.minimumSalary,
        preferredSalary: profile.preferredSalary,
        currency: profile.currency,
        relocationPreference: profile.relocationPreference,
        remotePreference: profile.remotePreference,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        technologies: profile.technologies,
      },
      resume: { structured: resume.structured, rawText: resume.rawText.slice(0, 8000) },
      job: { title: job.title, company: job.company, description: job.description.slice(0, 7000) },
      questions: targetQuestions,
    },
  });

  if (!ai) return deterministic;

  return targetQuestions.map((question, index) => {
    const fallback = deterministic[index]!;
    const generated = ai.data.answers.find(
      (answer) => answer.question.toLowerCase().trim() === question.toLowerCase().trim(),
    );
    if (!generated) return fallback;
    const sensitive = isSensitiveQuestion(question) || Boolean(generated.sensitive);
    const answerable = Boolean(generated.confident) && safeSource(generated.source) && !sensitive;
    return {
      question,
      answer: answerable ? generated.answer : generated.source === 'insufficient_evidence' ? '' : generated.answer,
      source: generated.source,
      confident: Boolean(generated.confident) && answerable,
      sensitive,
      status: answerable ? 'ANSWERED' : 'HUMAN_REVIEW',
    } satisfies GeneratedApplicationAnswer;
  });
}

export async function saveApplicationAnswers(
  applicationId: string,
  answers: GeneratedApplicationAnswer[],
): Promise<void> {
  await prisma.$transaction([
    prisma.applicationAnswer.deleteMany({ where: { applicationId } }),
    prisma.applicationAnswer.createMany({
      data: answers.map((answer) => ({
        applicationId,
        question: answer.question,
        answer: answer.answer,
        source: answer.source,
        status: answer.status,
        sensitive: answer.sensitive,
      })),
    }),
  ]);
}
