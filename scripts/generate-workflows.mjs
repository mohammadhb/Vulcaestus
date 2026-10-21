import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';

const API = '={{ $env.VULCAESTUS_API_URL }}';
const KEY = '={{ $env.VULCAESTUS_SERVICE_KEY }}';
const PROFILE = '={{ $env.VULCAESTUS_DEFAULT_PROFILE_ID || undefined }}';

function schedule(id, name, hours, position) {
  return {
    parameters: {
      rule: { interval: [{ field: 'hours', hoursInterval: hours }] },
    },
    id,
    name,
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position,
  };
}

function http(id, name, path, body, position, method = 'POST') {
  const params = {
    method,
    url: `${API}${path}`,
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'x-api-key', value: KEY },
        { name: 'content-type', value: 'application/json' },
      ],
    },
    options: {
      timeout: 120000,
      response: { response: { neverError: true, responseFormat: 'json' } },
    },
  };
  if (method !== 'GET') {
    params.sendBody = true;
    params.specifyBody = 'json';
    params.jsonBody = body;
  }
  return {
    parameters: params,
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
  };
}

function connect(nodes) {
  const connections = {};
  for (let i = 0; i < nodes.length - 1; i += 1) {
    connections[nodes[i].name] = {
      main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]],
    };
  }
  return connections;
}

function stableId(name) {
  const hex = createHash('sha256').update(`vulcaestus:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function workflow(name, nodes, tags = []) {
  return {
    id: stableId(name),
    name,
    nodes,
    connections: connect(nodes),
    active: false,
    settings: { executionOrder: 'v1', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' },
    pinData: {},
    versionId: randomUUID(),
    meta: { templateCredsSetupCompleted: true },
    tags: [],
  };
}

const workflows = [];

{
  const nodes = [
    schedule(randomUUID(), 'Every 6 hours', 6, [0, 0]),
    http(
      randomUUID(),
      'Discover jobs',
      '/api/internal/jobs/discover',
      `={{ JSON.stringify({ profileId: ${PROFILE}, limit: 200 }) }}`,
      [220, 0],
    ),
  ];
  workflows.push(workflow('01-job-discovery', nodes, ['jobs', 'discovery']));
}

{
  const nodes = [
    schedule(randomUUID(), 'Every 2 hours', 2, [0, 0]),
    http(
      randomUUID(),
      'Score unscored jobs',
      '/api/internal/jobs/score-batch',
      `={{ JSON.stringify({ profileId: ${PROFILE}, limit: 10 }) }}`,
      [220, 0],
    ),
  ];
  workflows.push(workflow('02-job-scoring', nodes, ['jobs', 'ai']));
}

{
  const nodes = [
    schedule(randomUUID(), 'Every 4 hours', 4, [0, 0]),
    http(
      randomUUID(),
      'Generate tailored resumes',
      '/api/internal/jobs/tailor-batch',
      `={{ JSON.stringify({ profileId: ${PROFILE}, limit: 3 }) }}`,
      [220, 0],
    ),
  ];
  workflows.push(workflow('03-resume-tailoring', nodes, ['resume', 'ai']));
}

{
  const nodes = [
    schedule(randomUUID(), 'Daily at 07:00', 24, [0, 0]),
    http(
      randomUUID(),
      'Rank known contacts',
      '/api/internal/referrals/rank',
      `={{ JSON.stringify({ profileId: ${PROFILE}, limit: 10 }) }}`,
      [220, 0],
    ),
  ];
  workflows.push(workflow('04-referral-discovery', nodes, ['referrals']));
}

{
  const nodes = [
    schedule(randomUUID(), 'Every 4 hours', 4, [0, 0]),
    http(
      randomUUID(),
      'Prepare high-score applications',
      '/api/internal/applications/prepare-batch',
      `={{ JSON.stringify({ profileId: ${PROFILE}, limit: 2 }) }}`,
      [220, 0],
    ),
  ];
  workflows.push(workflow('05-application-preparation', nodes, ['applications', 'ai']));
}

{
  const nodes = [
    schedule(randomUUID(), 'Every 30 minutes', 1, [0, 0]),
    http(
      randomUUID(),
      'Retry failed browser actions',
      '/api/internal/browser-actions/retry',
      `={{ JSON.stringify({ profileId: ${PROFILE}, limit: 3 }) }}`,
      [220, 0],
    ),
  ];
  workflows.push(workflow('06-application-browser-agent', nodes, ['browser', 'applications']));
}

{
  const nodes = [
    schedule(randomUUID(), 'Daily at 09:00', 24, [0, 0]),
    http(
      randomUUID(),
      'Generate due follow-ups',
      '/api/internal/followups/run',
      `={{ JSON.stringify({ profileId: ${PROFILE}, limit: 10 }) }}`,
      [220, 0],
    ),
  ];
  workflows.push(workflow('07-followups', nodes, ['followups']));
}

{
  const nodes = [
    schedule(randomUUID(), 'Hourly', 1, [0, 0]),
    http(
      randomUUID(),
      'Prepare upcoming interviews',
      '/api/internal/interviews/prepare-upcoming',
      `={{ JSON.stringify({ profileId: ${PROFILE}, withinHours: 72 }) }}`,
      [220, 0],
    ),
  ];
  workflows.push(workflow('08-interview-preparation', nodes, ['interviews', 'ai']));
}

{
  const nodes = [
    schedule(randomUUID(), 'Daily at 08:00', 24, [0, 0]),
    http(
      randomUUID(),
      'Fetch analytics summary',
      `/api/internal/analytics/summary?profileId=${PROFILE}`,
      '',
      [220, 0],
      'GET',
    ),
    {
      parameters: {
        jsCode: `const data = $input.first().json;
const cards = data.cards || {};
const rates = data.rates || {};
const lines = [
  \`Jobs found today: \${cards.jobsFoundToday ?? 0}\`,
  \`Strong matches: \${cards.strongMatches ?? 0}\`,
  \`Applications submitted: \${cards.applicationsSubmitted ?? 0}\`,
  \`Interviews: \${cards.interviews ?? 0}\`,
  \`Offers: \${cards.offers ?? 0}\`,
  \`Response rate: \${rates.responseRate ?? 0}%\`,
  \`Interview rate: \${rates.interviewRate ?? 0}%\`,
  \`Pending approvals: \${(cards.applicationsPending ?? 0) + (cards.messagesPending ?? 0)}\`,
];
return [{ json: { subject: 'Daily job-search summary', body: lines.join('\\n') } }];`,
      },
      id: randomUUID(),
      name: 'Format summary',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [440, 0],
    },
    {
      parameters: {
        method: 'POST',
        url: `${API}/api/internal/notify`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'x-api-key', value: KEY },
            { name: 'content-type', value: 'application/json' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify($json) }}',
        options: { timeout: 30000 },
      },
      id: randomUUID(),
      name: 'Send daily notification',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [660, 0],
      retryOnFail: true,
      maxTries: 2,
    },
  ];
  workflows.push(workflow('09-analytics', nodes, ['analytics', 'notifications']));
}

await mkdir(new URL('../n8n/workflows/', import.meta.url), { recursive: true });
for (const item of workflows) {
  const filename = new URL(`../n8n/workflows/${item.name}.json`, import.meta.url);
  await writeFile(filename, `${JSON.stringify(item, null, 2)}\n`, 'utf8');
  console.log(`wrote ${item.name}.json (${item.nodes.length} nodes)`);
}
