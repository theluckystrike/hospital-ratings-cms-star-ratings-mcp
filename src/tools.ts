// Tool registry shared by the stdio and Worker entries.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InputError, REPO, SITE, compareHospitals, hospitalRatings, searchHospitals } from './core.js';
import type { FetchText } from './types.js';

export const VERSION = '1.0.0';

export const META = {
  alias: 'hospital-ratings',
  metaDescription: 'MCP server for hospital ratings: CMS overall hospital star ratings, patient survey (HCAHPS) stars, ER wait times and quality measure groups for every US hospital, read live from Medicare Care Compare data on data.cms.gov.',
  intro: 'Hospital ratings for AI assistants: the CMS overall star rating, patient survey stars, ER wait times and quality measures for any US hospital, read live from the Medicare Care Compare data that CMS publishes on data.cms.gov.',
};

export const TOOL_INFO = [
  { name: 'hospital_search', blurb: 'Hospitals in a state, city, county or ZIP code (or by name) with their CMS overall star rating and patient survey stars, best rated first, plus the star distribution.' },
  { name: 'hospital_ratings', blurb: 'One hospital in full: overall star rating, mortality, safety and readmission measures better or worse than national, patient survey stars by topic, ER wait time against the state and national average, sepsis care.' },
  { name: 'hospital_compare', blurb: '2 to 5 hospitals side by side: overall stars, patient stars, share rating it 9 or 10, ER median time, sepsis care and measure groups.' },
];

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(data: Record<string, unknown> & { summary: string }) {
  return { content: [{ type: 'text' as const, text: `${data.summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text' as const, text: `${e instanceof InputError ? 'Error' : 'Upstream data.cms.gov error'}: ${msg}` }] };
}
const wrap = <A>(fn: (a: A) => unknown) => async (a: A) => { try { return ok((await fn(a)) as any); } catch (e) { return fail(e); } };

const ref = {
  facility_id: z.string().optional().describe('CMS facility id (CCN), 6 characters such as 220071. Best when known (hospital_search returns it).'),
  name: z.string().optional().describe('Hospital name or part of it, such as "Mass General" or "Brigham and Women\'s".'),
  state: z.string().optional().describe('State code or name. Narrows a name lookup.'),
  city: z.string().optional().describe('City. Narrows a name lookup.'),
};

export function createServer(fetchText: FetchText): McpServer {
  const server = new McpServer({ name: REPO, version: VERSION, websiteUrl: SITE } as any, {
    instructions:
      'Hospital ratings from CMS Care Compare (Medicare.gov), read at call time from data.cms.gov. A model cannot know the current star ratings, patient survey results or ER times. ' +
      'Use hospital_search for "best hospitals in Boston" or "hospital ratings near 05401", hospital_ratings for "how good is Mass General" or "ER wait time at UVM Medical Center", ' +
      'and hospital_compare to choose between hospitals. Star ratings are one input: suggest the user also checks the hospital on medicare.gov/care-compare and with their doctor.',
  });

  server.registerTool('hospital_search', {
    title: 'Find and rank hospitals',
    description:
      'Find US hospitals by state, city, county, ZIP code (5 digits, or a 3-digit prefix for the area) or name, with each hospital\'s CMS overall star rating (1 to 5), ' +
      'HCAHPS patient survey summary stars, type, ownership and ER availability. Best rated first, with the count at each star level. Filter by type, minimum stars or emergency services.',
    inputSchema: {
      state: z.string().optional().describe('State code or name, such as MA or Massachusetts.'),
      city: z.string().optional().describe('City, such as Boston.'),
      zip: z.string().optional().describe('ZIP code (02114) or a 3-digit ZIP prefix for the surrounding area (021).'),
      county: z.string().optional().describe('County (needs state), such as Suffolk.'),
      name: z.string().optional().describe('Part of the hospital name.'),
      hospital_type: z.enum(['all', 'acute', 'critical_access', 'childrens', 'psychiatric', 'va', 'dod', 'cancer']).optional().describe('Hospital type. Default all.'),
      min_stars: z.number().int().min(1).max(5).optional().describe('Only hospitals with at least this overall star rating.'),
      emergency_services: z.boolean().optional().describe('Only hospitals with an emergency department.'),
      limit: z.number().int().min(1).max(50).optional().describe('How many hospitals to list, 1 to 50. Default 20.'),
    },
    annotations: { title: 'Find and rank hospitals', ...RO },
  }, wrap((a: any) => searchHospitals(fetchText, a)));

  server.registerTool('hospital_ratings', {
    title: 'Hospital star rating and quality detail',
    description:
      'Full CMS Care Compare ratings for one hospital (by facility id, or name with state or city): overall star rating with the reason when unrated; how many mortality, safety and ' +
      'readmission measures are better, no different or worse than the national rate; HCAHPS patient survey stars overall and by topic (nurses, doctors, cleanliness, quiet, discharge), ' +
      'share rating it 9 or 10 and who would recommend it against national; ER median time from arrival to leaving, left without being seen, sepsis care and staff flu vaccination, each against the state and national average.',
    inputSchema: ref,
    annotations: { title: 'Hospital ratings', ...RO },
  }, wrap((a: any) => hospitalRatings(fetchText, a)));

  server.registerTool('hospital_compare', {
    title: 'Compare hospitals',
    description:
      'Compare 2 to 5 hospitals side by side on CMS overall stars, patient survey stars, the share of patients rating it 9 or 10 and who would recommend it, ER median time, ' +
      'left before being seen, sepsis care and mortality, safety and readmission measures better or worse than national. Names which hospital leads each.',
    inputSchema: {
      hospitals: z.array(z.object(ref)).min(2).max(5).describe('2 to 5 hospitals, each { facility_id } or { name, state } (city optional).'),
    },
    annotations: { title: 'Compare hospitals', ...RO },
  }, wrap((a: any) => compareHospitals(fetchText, a.hospitals)));

  return server;
}
