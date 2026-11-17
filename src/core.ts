// Pure core for hospital-ratings-cms-star-ratings-mcp. The only I/O is keyless reads of the CMS Provider Data Catalog
// (Medicare Care Compare data) on data.cms.gov, done through an injected fetchText.
//
// Sources (public, no key), DKAN datastore query API https://data.cms.gov/provider-data/api/1/datastore/query/<id>/0
//   xubh-q36u  Hospital General Information: overall star rating (1-5), type, ownership, emergency services,
//              measure group counts (mortality, safety, readmission better / no different / worse than national)
//   dgck-syfz  Patient survey (HCAHPS) - Hospital: summary star rating and topic star ratings, 9-10 rating, would recommend
//   99ue-w85f  Patient survey (HCAHPS) - National
//   yv7e-xc69  Timely and Effective Care - Hospital: ER median time (OP_18b, OP_18c), left before being seen (OP_22),
//              ER volume (EDV), sepsis care (SEP_1), staff flu vaccination (IMM_3), stroke head CT (OP_23)
//   apyc-v239  Timely and Effective Care - State;  isrn-hqyy  Timely and Effective Care - National
//   metastore  https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/<id>  (modified date = as_of)
// Values are strings; "Not Available" and "Not Applicable" mean no value, with a CMS footnote code explaining why.
import type { FetchText } from './types.js';

export const REPO = 'hospital-ratings-cms-star-ratings-mcp';
export const SITE = 'https://www.mcpstamp.com';
export const UTM = `utm_source=mcp&utm_medium=${REPO}`;
export const more = () => `${SITE}/servers/?${UTM}`;
export const API = 'https://data.cms.gov/provider-data/api/1';
export const SOURCE = 'CMS Care Compare (Medicare.gov) hospital data from the CMS Provider Data Catalog on data.cms.gov: Hospital General Information, Patient survey (HCAHPS) and Timely and Effective Care datasets.';
export const DS = {
  general: 'xubh-q36u', hcahps: 'dgck-syfz', hcahpsNational: '99ue-w85f',
  timely: 'yv7e-xc69', timelyState: 'apyc-v239', timelyNational: 'isrn-hqyy',
} as const;

export class InputError extends Error {}
export class UpstreamError extends Error {}

// CMS Footnote Crosswalk (data.cms.gov dataset y9us-9xdf, modified 2025-09-18), codes used by the hospital datasets.
export const FOOTNOTES: Record<string, string> = {
  '1': 'The number of cases/patients is too few to report.',
  '2': 'Data submitted were based on a sample of cases/patients.',
  '3': 'Results are based on a shorter time period than required.',
  '4': 'Data suppressed by CMS for one or more quarters.',
  '5': 'Results are not available for this reporting period.',
  '6': 'Fewer than 100 patients completed the CAHPS survey. Use these scores with caution, as the number of surveys may be too low to reliably assess facility performance.',
  '7': 'No cases met the criteria for this measure.',
  '9': 'No data are available from the state/territory for this reporting period.',
  '10': 'Very few patients were eligible for the CAHPS survey. The scores shown reflect fewer than 50 completed surveys. Use these scores with caution.',
  '11': 'There were discrepancies in the data collection process.',
  '12': 'This measure does not apply to this hospital for this reporting period.',
  '13': 'Results cannot be calculated for this reporting period.',
  '14': 'The results for this state are combined with nearby states to protect confidentiality.',
  '15': 'The number of cases/patients is too few to report a star rating.',
  '16': 'There are too few measures or measure groups reported to calculate a star rating or measure group score.',
  '17': "This hospital's star rating only includes data reported on inpatient services.",
  '19': 'Data are shown only for hospitals that participate in the Inpatient Quality Reporting (IQR) and Outpatient Quality Reporting (OQR) programs.',
  '20': 'State and national averages do not include Veterans Health Administration (VHA) hospital data.',
  '21': 'Patient survey results for Veterans Health Administration (VHA) hospitals do not represent official HCAHPS results and are not included in state and national averages.',
  '22': 'Overall star ratings are not calculated for Department of Defense (DoD) hospitals.',
  '23': 'The data are based on claims that the hospital or facility submitted to CMS. The hospital or facility has reported discrepancies in their claims data.',
  '24': 'Results for this Veterans Health Administration (VHA) hospital are combined with those from the VHA administrative parent hospital that manages all points of service.',
  '25': 'State and national averages include Veterans Health Administration (VHA) hospital data.',
  '26': 'State and national averages include Department of Defense (DoD) hospital data.',
  '28': "The results are based on the hospital or facility's data submissions. CMS approved an Extraordinary Circumstances Exception request, so results may be impacted.",
  '29': 'This measure was calculated using partial performance period data due to a CMS-approved exception.',
};
export function footnoteText(codes: string | undefined): string | null {
  const c = String(codes ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!c.length) return null;
  return c.map((x) => FOOTNOTES[x] ?? `CMS footnote ${x}.`).join(' ');
}

export const STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
  GU: 'Guam', VI: 'Virgin Islands', AS: 'American Samoa', MP: 'Northern Mariana Islands',
};
export function stateCode(s: unknown): string {
  const v = String(s ?? '').trim();
  const up = v.toUpperCase().replace(/\./g, '');
  if (STATES[up]) return up;
  const hit = Object.entries(STATES).find(([, n]) => n.toUpperCase() === up);
  if (hit) return hit[0];
  throw new InputError(`"${v}" is not a US state. Use a two-letter code such as MA or a name such as Massachusetts.`);
}

export const TYPES: Record<string, string> = {
  acute: 'Acute Care Hospitals', critical_access: 'Critical Access Hospitals', childrens: 'Childrens', psychiatric: 'Psychiatric',
  va: 'Acute Care - Veterans Administration', dod: 'Acute Care - Department of Defense', cancer: 'Dedicated Cancer Care',
};

// ---------- DKAN query ----------

export type Cond = [property: string, operator: '=' | 'like' | 'in', value: string | string[]];

export function queryUrl(dataset: string, conds: Cond[], limit = 1500): string {
  const parts = [`limit=${limit}`, 'schema=false'];
  conds.forEach(([p, op, v], i) => {
    parts.push(`conditions[${i}][property]=${p}`, `conditions[${i}][operator]=${op === '=' ? '%3D' : op}`);
    if (Array.isArray(v)) v.forEach((x, j) => parts.push(`conditions[${i}][value][${j}]=${encodeURIComponent(x)}`));
    else parts.push(`conditions[${i}][value]=${encodeURIComponent(v)}`);
  });
  return `${API}/datastore/query/${dataset}/0?${parts.join('&')}`;
}

type Row = Record<string, string>;

export async function query(f: FetchText, dataset: string, conds: Cond[], limit = 1500): Promise<Row[]> {
  let body: string;
  try {
    body = await f(queryUrl(dataset, conds, limit), { cacheTtl: 21600, timeoutMs: 20000 });
  } catch (e) {
    throw new UpstreamError(`data.cms.gov did not answer (${(e as Error).message}). Try again in a minute.`);
  }
  let d: { results?: Row[] };
  try { d = JSON.parse(body); } catch { throw new UpstreamError('data.cms.gov returned something that is not JSON.'); }
  if (!Array.isArray(d.results)) throw new UpstreamError('data.cms.gov returned no results array.');
  return d.results;
}

export async function modified(f: FetchText, dataset: string): Promise<string | null> {
  try {
    const m = JSON.parse(await f(`${API}/metastore/schemas/dataset/items/${dataset}`, { cacheTtl: 21600, timeoutMs: 15000 }));
    return typeof m.modified === 'string' ? m.modified : null;
  } catch {
    return null;
  }
}

// ---------- values ----------

export function num(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s || /^not (available|applicable)$/i.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
export function isoDate(v: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? '').trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}
const SMALL = new Set(['OF', 'AND', 'THE', 'AT', 'FOR', 'IN']);
export function titleCase(s: string): string {
  return s.toLowerCase().split(/(\s+|-|\/)/).map((w, i) => {
    if (!w.trim() || w === '-' || w === '/') return w;
    if (i > 0 && SMALL.has(w.toUpperCase())) return w;
    if (/^(ii|iii|iv|llc|inc|va|uvm|ucsf|ucla|nyu|usc|ohsu|osf|ssm|hca|cmc)$/i.test(w.replace(/[.,]/g, ''))) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('').replace(/'S\b/g, "'s");
}
const phone = (p: string) => p || null;

// ---------- hospital records ----------

export interface Group { measures: number | null; better: number | null; no_different: number | null; worse: number | null; note: string | null }
export interface Hospital {
  facility_id: string; name: string; display_name: string; address: string; city: string; state: string; zip: string; county: string;
  phone: string | null; type: string; ownership: string; emergency_services: boolean; birthing_friendly: boolean;
  overall_stars: number | null; overall_stars_note: string | null;
}

export function toHospital(r: Row): Hospital {
  const stars = num(r.hospital_overall_rating);
  return {
    facility_id: r.facility_id, name: r.facility_name, display_name: titleCase(r.facility_name ?? ''),
    address: titleCase(r.address ?? ''), city: titleCase(r.citytown ?? ''), state: r.state, zip: r.zip_code, county: titleCase(r.countyparish ?? ''),
    phone: phone(r.telephone_number), type: r.hospital_type, ownership: r.hospital_ownership,
    emergency_services: r.emergency_services === 'Yes', birthing_friendly: r.meets_criteria_for_birthing_friendly_designation === 'Y',
    overall_stars: stars, overall_stars_note: stars === null ? (footnoteText(r.hospital_overall_rating_footnote) ?? 'No overall star rating.') : null,
  };
}

export function groups(r: Row): Record<string, Group | { measures: number | null; note: string | null }> {
  const g = (k: string): Group => ({
    measures: num(r[`count_of_facility_${k}_measures`]), better: num(r[`count_of_${k}_measures_better`]),
    no_different: num(r[`count_of_${k}_measures_no_different`]), worse: num(r[`count_of_${k}_measures_worse`]),
    note: footnoteText(r[`${k}_group_footnote`]),
  });
  return {
    mortality: g('mort'), safety: g('safety'), readmission: g('readm'),
    patient_experience: { measures: num(r.count_of_facility_pt_exp_measures), note: footnoteText(r.pt_exp_group_footnote) },
    timely_and_effective_care: { measures: num(r.count_of_facility_te_measures), note: footnoteText(r.te_group_footnote) },
  };
}

// ---------- name matching ----------

const STOP = new Set(['THE', 'OF', 'AND', 'HOSPITAL', 'HOSPITALS', 'MEDICAL', 'CENTER', 'CTR', 'HEALTH', 'HEALTHCARE', 'CARE', 'REGIONAL', 'SYSTEM', 'INC', 'LLC', 'AT', 'FOR']);
const ABBR: Record<string, string> = { SAINT: 'ST', MOUNT: 'MT', FORT: 'FT', UNIVERSITY: 'UNIV', MEMORIAL: 'MEM', CHILDRENS: 'CHILDRENS', CHILDREN: 'CHILDRENS' };
export function nameTokens(s: string): string[] {
  return s.toUpperCase().replace(/['’.]/g, '').split(/[^A-Z0-9]+/).filter(Boolean).map((t) => ABBR[t] ?? t);
}
const tokMatch = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

export function scoreName(input: string, candidate: string): number {
  const all = nameTokens(input);
  const want = all.filter((t) => !STOP.has(t));
  const ts = want.length ? want : all;
  if (!ts.length) return 0;
  const have = nameTokens(candidate);
  const hit = ts.filter((t) => have.some((h) => tokMatch(t, h))).length;
  const extra = have.filter((h) => !STOP.has(h) && !ts.some((t) => tokMatch(t, h))).length;
  return hit / ts.length - extra * 0.01;
}

export function likeToken(input: string): string {
  const all = nameTokens(input);
  const ts = all.filter((t) => !STOP.has(t) && !['ST', 'MT', 'FT'].includes(t));
  const pick = (ts.length ? ts : all).slice().sort((a, b) => b.length - a.length)[0];
  if (!pick) throw new InputError('Give a hospital name with at least one word, or a CMS facility id (6 characters, such as 220071).');
  return pick.slice(0, 4);
}

export interface HospitalRef { facility_id?: string; name?: string; state?: string; city?: string }

export function normalizeId(id: unknown): string {
  const s = String(id ?? '').trim().toUpperCase();
  if (!/^[0-9A-Z]{6}$/.test(s)) throw new InputError(`"${id}" is not a CMS facility id (CCN). It has 6 characters, for example 220071.`);
  return s;
}

/** Resolve a hospital by facility id or by name (optionally state and city). */
export async function resolveHospital(f: FetchText, ref: HospitalRef): Promise<{ row: Row; other_matches: { facility_id: string; name: string; city: string; state: string }[] }> {
  if (ref.facility_id) {
    const id = normalizeId(ref.facility_id);
    const rows = await query(f, DS.general, [['facility_id', '=', id]], 5);
    if (!rows.length) throw new InputError(`No CMS hospital has facility id ${id}. Use hospital_search to find the id.`);
    return { row: rows[0], other_matches: [] };
  }
  const name = String(ref.name ?? '').trim();
  if (!name) throw new InputError('Give a facility_id or a hospital name.');
  const conds: Cond[] = [['facility_name', 'like', `%${likeToken(name)}%`]];
  if (ref.state) conds.unshift(['state', '=', stateCode(ref.state)]);
  if (ref.city) conds.push(['citytown', '=', String(ref.city).trim().toUpperCase()]);
  const rows = await query(f, DS.general, conds);
  const scored = rows.map((r) => ({ r, s: scoreName(name, r.facility_name) })).filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s || (num(b.r.hospital_overall_rating) ?? 0) - (num(a.r.hospital_overall_rating) ?? 0) || a.r.facility_name.localeCompare(b.r.facility_name));
  if (!scored.length) {
    const where = [ref.city, ref.state].filter(Boolean).join(', ');
    throw new InputError(`No CMS hospital name matches "${name}"${where ? ` in ${where}` : ''}. Try hospital_search with a city or state, or a shorter part of the name.`);
  }
  const best = scored[0];
  const other = scored.slice(1, 6).filter((x) => x.s >= best.s - 0.34)
    .map((x) => ({ facility_id: x.r.facility_id, name: titleCase(x.r.facility_name), city: titleCase(x.r.citytown), state: x.r.state }));
  return { row: best.r, other_matches: other };
}

// ---------- patient survey and timely care ----------

export const HCAHPS_TOPICS: [string, string][] = [
  ['H_COMP_1_STAR_RATING', 'Nurse communication'], ['H_COMP_2_STAR_RATING', 'Doctor communication'],
  ['H_COMP_3_STAR_RATING', 'Staff responsiveness'], ['H_COMP_5_STAR_RATING', 'Communication about medicines'],
  ['H_COMP_6_STAR_RATING', 'Discharge information'], ['H_COMP_8_STAR_RATING', 'Restfulness of the environment (quiet at night, rest)'],
  ['H_COMP_9_STAR_RATING', 'Care coordination'], ['H_CLEAN_STAR_RATING', 'Cleanliness'], ['H_SYMP_STAR_RATING', 'Information about symptoms after the stay'],
];
export const HCAHPS_IDS = ['H_STAR_RATING', ...HCAHPS_TOPICS.map((t) => t[0]), 'H_HSP_RATING_9_10', 'H_RECMND_DY'];
export const TIMELY_IDS = ['OP_18b', 'OP_18c', 'OP_22', 'EDV', 'SEP_1', 'IMM_3', 'OP_23'];

export interface Survey {
  summary_stars: number | null; summary_stars_note: string | null; rated_9_or_10_pct: number | null; definitely_recommend_pct: number | null;
  surveys_completed: number | null; response_rate_pct: number | null; period: string | null;
  topics: { topic: string; stars: number | null }[];
}
export function toSurvey(rows: Row[]): Survey | null {
  const by = new Map(rows.map((r) => [r.hcahps_measure_id, r]));
  const s = by.get('H_STAR_RATING');
  if (!s && !rows.length) return null;
  const base = s ?? rows[0];
  const start = isoDate(base.start_date), end = isoDate(base.end_date);
  const stars = num(s?.patient_survey_star_rating);
  return {
    summary_stars: stars,
    summary_stars_note: stars === null ? (footnoteText(s?.patient_survey_star_rating_footnote) ?? 'No patient survey star rating.') : footnoteText(base.number_of_completed_surveys_footnote),
    rated_9_or_10_pct: num(by.get('H_HSP_RATING_9_10')?.hcahps_answer_percent),
    definitely_recommend_pct: num(by.get('H_RECMND_DY')?.hcahps_answer_percent),
    surveys_completed: num(base.number_of_completed_surveys), response_rate_pct: num(base.survey_response_rate_percent),
    period: start && end ? `${start} to ${end}` : null,
    topics: HCAHPS_TOPICS.filter(([id]) => by.has(id)).map(([id, topic]) => ({ topic, stars: num(by.get(id)?.patient_survey_star_rating) })),
  };
}

export interface Measure { id: string; name: string; value: number | string | null; unit: string; better: string; state_average: number | null; national_average: number | null; sample: number | null; period: string | null; note: string | null }
const TIMELY_META: Record<string, [string, string, string]> = {
  OP_18b: ['ER time: median minutes from arrival to leaving, discharged patients', 'minutes', 'lower'],
  OP_18c: ['ER time: median minutes for psychiatric and mental health patients', 'minutes', 'lower'],
  OP_22: ['Left the ER before being seen', 'percent', 'lower'],
  EDV: ['ER volume (annual visits category)', 'category', 'n/a'],
  SEP_1: ['Appropriate care for severe sepsis and septic shock', 'percent', 'higher'],
  IMM_3: ['Healthcare workers given influenza vaccination', 'percent', 'higher'],
  OP_23: ['Stroke patients given a head CT or MRI within 45 minutes of ER arrival', 'percent', 'higher'],
};
export function toMeasures(rows: Row[], state: Row[], national: Row[]): Measure[] {
  const st = new Map(state.map((r) => [r.measure_id, r])); const nat = new Map(national.map((r) => [r.measure_id, r]));
  return TIMELY_IDS.map((id) => {
    const r = rows.find((x) => x.measure_id === id);
    if (!r) return null;
    const [name, unit, better] = TIMELY_META[id];
    const start = isoDate(r.start_date), end = isoDate(r.end_date);
    const v = id === 'EDV' ? (r.score || null) : num(r.score);
    return {
      id, name, value: v, unit, better, state_average: num(st.get(id)?.score), national_average: num(nat.get(id)?.score),
      sample: num(r.sample), period: start && end ? `${start} to ${end}` : null, note: v === null ? (footnoteText(r.footnote) ?? 'Not available.') : footnoteText(r.footnote),
    } as Measure;
  }).filter((m): m is Measure => m !== null);
}

// ---------- tools ----------

export interface SearchArgs { state?: string; city?: string; zip?: string; county?: string; name?: string; hospital_type?: string; min_stars?: number; emergency_services?: boolean; limit?: number }

export async function searchHospitals(f: FetchText, a: SearchArgs) {
  const conds: Cond[] = [];
  const st = a.state ? stateCode(a.state) : null;
  if (st) conds.push(['state', '=', st]);
  if (a.zip) {
    const z = String(a.zip).trim();
    if (/^\d{5}(-\d{4})?$/.test(z)) conds.push(['zip_code', '=', z.slice(0, 5)]);
    else if (/^\d{3}$/.test(z)) conds.push(['zip_code', 'like', `${z}%`]);
    else throw new InputError(`"${z}" is not a ZIP code. Use 5 digits (02114) or a 3-digit prefix (021) for the area.`);
  }
  if (a.city) conds.push(['citytown', '=', String(a.city).trim().toUpperCase().replace(/^ST\.? /, 'SAINT ')]);
  if (a.county) {
    if (!st) throw new InputError('A county search needs a state too.');
    conds.push(['countyparish', '=', String(a.county).trim().toUpperCase().replace(/\s+(COUNTY|PARISH|BOROUGH)$/, '')]);
  }
  if (a.name) conds.push(['facility_name', 'like', `%${likeToken(a.name)}%`]);
  if (!conds.length) throw new InputError('Give at least a state, city, ZIP code or hospital name.');
  let type: string | null = null;
  if (a.hospital_type && a.hospital_type !== 'all') {
    type = TYPES[a.hospital_type];
    if (!type) throw new InputError(`hospital_type must be one of all, ${Object.keys(TYPES).join(', ')}.`);
  }
  const [rows, asOf] = await Promise.all([query(f, DS.general, conds), modified(f, DS.general)]);
  let list = rows;
  if (a.name) list = list.filter((r) => scoreName(a.name as string, r.facility_name) >= 0.5);
  if (type) list = list.filter((r) => r.hospital_type === type);
  if (a.emergency_services) list = list.filter((r) => r.emergency_services === 'Yes');
  const dist: Record<string, number> = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0, not_rated: 0 };
  for (const r of list) { const s = num(r.hospital_overall_rating); dist[s === null ? 'not_rated' : String(s)]++; }
  const matched = list.length;
  if (a.min_stars) list = list.filter((r) => (num(r.hospital_overall_rating) ?? 0) >= (a.min_stars as number));
  const limit = Math.min(Math.max(a.limit ?? 20, 1), 50);
  list = list.slice().sort((x, y) => (num(y.hospital_overall_rating) ?? 0) - (num(x.hospital_overall_rating) ?? 0)
    || (a.name ? scoreName(a.name, y.facility_name) - scoreName(a.name, x.facility_name) : 0) || x.facility_name.localeCompare(y.facility_name));
  const shown = list.slice(0, limit);
  const survey = new Map<string, number | null>();
  if (shown.length) {
    const hc = await query(f, DS.hcahps, [['facility_id', 'in', shown.map((r) => r.facility_id)], ['hcahps_measure_id', '=', 'H_STAR_RATING']]);
    for (const r of hc) survey.set(r.facility_id, num(r.patient_survey_star_rating));
  }
  const hospitals = shown.map((r) => ({ ...toHospital(r), patient_survey_stars: survey.get(r.facility_id) ?? null }))
    .sort((x, y) => (y.overall_stars ?? 0) - (x.overall_stars ?? 0) || (a.name ? 0 : (y.patient_survey_stars ?? 0) - (x.patient_survey_stars ?? 0)));
  const where = [a.name && `"${a.name}"`, a.city && titleCase(String(a.city)), a.county && `${titleCase(String(a.county))} County`, st, a.zip && `ZIP ${a.zip}`].filter(Boolean).join(', ');
  const top = hospitals.slice(0, 5).map((h) => `${h.display_name} (${h.city}) ${h.overall_stars === null ? 'not rated' : `${h.overall_stars} stars`}${h.patient_survey_stars !== null ? `, patients ${h.patient_survey_stars}` : ''}`);
  const summary = matched === 0
    ? `No CMS-listed hospitals match ${where}.`
    : `${matched} hospitals match ${where}${type ? ` (${type})` : ''}: overall CMS star ratings 5 stars ${dist['5']}, 4 stars ${dist['4']}, 3 stars ${dist['3']}, 2 stars ${dist['2']}, 1 star ${dist['1']}, not rated ${dist.not_rated}.` +
      (hospitals.length ? ` ${a.min_stars ? `${list.length} with ${a.min_stars}+ stars. ` : ''}Top: ${top.join('; ')}.` : ` None has ${a.min_stars} or more stars.`);
  return {
    summary, as_of: asOf, source: SOURCE, more: more(),
    query: { state: st, city: a.city ?? null, zip: a.zip ?? null, county: a.county ?? null, name: a.name ?? null, hospital_type: type, min_stars: a.min_stars ?? null, emergency_services: a.emergency_services ?? null },
    matched, star_distribution: dist, shown: hospitals.length, hospitals,
    notes: [
      'Overall star ratings (1 to 5) summarize up to 5 measure groups: mortality, safety of care, readmission, patient experience and timely and effective care. Hospitals with too few measures, critical access, psychiatric, children\'s and DoD hospitals are often not rated.',
      'patient_survey_stars is the HCAHPS summary star rating from inpatients surveyed after discharge.',
      'Use hospital_ratings with a facility_id for the measure groups, patient survey topics and ER wait times.',
    ],
  };
}

export async function hospitalRatings(f: FetchText, ref: HospitalRef) {
  const { row, other_matches } = await resolveHospital(f, ref);
  const id = row.facility_id, st = row.state;
  const [hc, te, teState, teNat, hcNat, asOfGeneral, asOfSurvey, asOfTimely] = await Promise.all([
    query(f, DS.hcahps, [['facility_id', '=', id], ['hcahps_measure_id', 'in', HCAHPS_IDS]]),
    query(f, DS.timely, [['facility_id', '=', id], ['measure_id', 'in', TIMELY_IDS]]),
    query(f, DS.timelyState, [['state', '=', st], ['measure_id', 'in', TIMELY_IDS]]).catch(() => [] as Row[]),
    query(f, DS.timelyNational, [['measure_id', 'in', TIMELY_IDS]]).catch(() => [] as Row[]),
    query(f, DS.hcahpsNational, [['hcahps_measure_id', 'in', ['H_HSP_RATING_9_10', 'H_RECMND_DY']]]).catch(() => [] as Row[]),
    modified(f, DS.general), modified(f, DS.hcahps), modified(f, DS.timely),
  ]);
  const h = toHospital(row);
  const survey = toSurvey(hc);
  const nat9 = num(hcNat.find((r) => r.hcahps_measure_id === 'H_HSP_RATING_9_10')?.hcahps_answer_percent);
  const natRec = num(hcNat.find((r) => r.hcahps_measure_id === 'H_RECMND_DY')?.hcahps_answer_percent);
  const measures = toMeasures(te, teState, teNat);
  const g = groups(row) as Record<string, Group>;
  const er = measures.find((m) => m.id === 'OP_18b');
  const parts: string[] = [];
  parts.push(`${h.display_name} (${h.city}, ${h.state}, CMS id ${id}, ${h.type}): ${h.overall_stars === null ? `no overall CMS star rating (${h.overall_stars_note})` : `${h.overall_stars} of 5 stars overall`}.`);
  const gl = (['mortality', 'safety', 'readmission'] as const).filter((k) => g[k].measures).map((k) => `${k} ${g[k].better} better, ${g[k].worse} worse than national of ${g[k].measures}`);
  if (gl.length) parts.push(`Measure groups: ${gl.join('; ')}.`);
  if (survey) {
    parts.push(`Patient survey: ${survey.summary_stars === null ? 'no star rating' : `${survey.summary_stars} of 5 stars`}` +
      (survey.rated_9_or_10_pct !== null ? `; ${survey.rated_9_or_10_pct}% rated it 9 or 10${nat9 !== null ? ` (national ${nat9}%)` : ''}` : '') +
      (survey.definitely_recommend_pct !== null ? `; ${survey.definitely_recommend_pct}% would definitely recommend it${natRec !== null ? ` (national ${natRec}%)` : ''}` : '') + '.');
  } else parts.push('No patient survey results.');
  if (er && typeof er.value === 'number') parts.push(`ER: median ${er.value} minutes from arrival to leaving for discharged patients (${st} average ${er.state_average ?? 'n/a'}, national ${er.national_average ?? 'n/a'}; ${er.period}).`);
  else if (!h.emergency_services) parts.push('No emergency department.');
  return {
    summary: parts.join(' '),
    as_of: asOfGeneral, data_updated: { general_information: asOfGeneral, patient_survey: asOfSurvey, timely_and_effective_care: asOfTimely },
    source: SOURCE, more: more(),
    hospital: h,
    overall_star_rating: { stars: h.overall_stars, note: h.overall_stars_note, measure_groups: groups(row) },
    patient_survey: survey ? { ...survey, national_rated_9_or_10_pct: nat9, national_definitely_recommend_pct: natRec } : null,
    timely_and_emergency_care: measures,
    other_matches,
    care_compare_url: `https://www.medicare.gov/care-compare/details/hospital/${id}`,
    notes: [
      'Measure group counts compare this hospital with the national rate on each measure: better, no different or worse.',
      'Patient survey (HCAHPS) results cover adult inpatients and the period shown. ER times are medians in minutes; lower is better.',
      'CMS refreshes Care Compare hospital data quarterly; check the hospital on medicare.gov/care-compare before deciding.',
    ],
  };
}

export async function compareHospitals(f: FetchText, refs: HospitalRef[]) {
  if (!Array.isArray(refs) || refs.length < 2 || refs.length > 5) throw new InputError('Give 2 to 5 hospitals, each as a facility_id or a name with a state.');
  const resolved = await Promise.all(refs.map((r) => resolveHospital(f, r)));
  const ids = [...new Set(resolved.map((r) => r.row.facility_id))];
  if (ids.length < 2) throw new InputError('These all resolve to the same hospital. Add a state or city, or use facility ids.');
  const [hc, te, teNat, asOf] = await Promise.all([
    query(f, DS.hcahps, [['facility_id', 'in', ids], ['hcahps_measure_id', 'in', ['H_STAR_RATING', 'H_HSP_RATING_9_10', 'H_RECMND_DY']]]),
    query(f, DS.timely, [['facility_id', 'in', ids], ['measure_id', 'in', ['OP_18b', 'OP_22', 'SEP_1']]]),
    query(f, DS.timelyNational, [['measure_id', 'in', ['OP_18b', 'OP_22', 'SEP_1']]]).catch(() => [] as Row[]),
    modified(f, DS.general),
  ]);
  const seen = new Set<string>();
  const rows = resolved.map((r) => r.row).filter((r) => (seen.has(r.facility_id) ? false : (seen.add(r.facility_id), true)));
  const hospitals = rows.map((r) => {
    const h = toHospital(r);
    const s = toSurvey(hc.filter((x) => x.facility_id === r.facility_id));
    const m = (id: string) => num(te.find((x) => x.facility_id === r.facility_id && x.measure_id === id)?.score);
    const g = groups(r) as Record<string, Group>;
    return {
      facility_id: h.facility_id, name: h.display_name, city: h.city, state: h.state, type: h.type, emergency_services: h.emergency_services,
      overall_stars: h.overall_stars, overall_stars_note: h.overall_stars_note,
      patient_survey_stars: s?.summary_stars ?? null, rated_9_or_10_pct: s?.rated_9_or_10_pct ?? null, definitely_recommend_pct: s?.definitely_recommend_pct ?? null,
      er_median_minutes: m('OP_18b'), left_before_seen_pct: m('OP_22'), sepsis_care_pct: m('SEP_1'),
      mortality_better_worse: g.mortality.measures ? `${g.mortality.better} better / ${g.mortality.worse} worse of ${g.mortality.measures}` : null,
      safety_better_worse: g.safety.measures ? `${g.safety.better} better / ${g.safety.worse} worse of ${g.safety.measures}` : null,
      readmission_better_worse: g.readmission.measures ? `${g.readmission.better} better / ${g.readmission.worse} worse of ${g.readmission.measures}` : null,
    };
  });
  const best = (key: 'overall_stars' | 'patient_survey_stars' | 'rated_9_or_10_pct' | 'er_median_minutes', lower = false) => {
    const c = hospitals.filter((h) => h[key] !== null);
    if (!c.length) return null;
    const v = lower ? Math.min(...c.map((h) => h[key] as number)) : Math.max(...c.map((h) => h[key] as number));
    return { value: v, hospitals: c.filter((h) => h[key] === v).map((h) => h.name) };
  };
  const leaders = { overall_stars: best('overall_stars'), patient_survey_stars: best('patient_survey_stars'), rated_9_or_10_pct: best('rated_9_or_10_pct'), shortest_er_median_minutes: best('er_median_minutes', true) };
  const nat = (id: string) => num(teNat.find((x) => x.measure_id === id)?.score);
  const line = (h: (typeof hospitals)[number]) => `${h.name} (${h.city}, ${h.state}): ${h.overall_stars === null ? 'not rated' : `${h.overall_stars} stars`}, patients ${h.patient_survey_stars ?? 'n/a'} stars` +
    `${h.rated_9_or_10_pct !== null ? ` (${h.rated_9_or_10_pct}% rate it 9-10)` : ''}${h.er_median_minutes !== null ? `, ER median ${h.er_median_minutes} min` : ''}`;
  const ldr = leaders.overall_stars ? `Highest overall: ${leaders.overall_stars.hospitals.join(' and ')} (${leaders.overall_stars.value} stars).` : 'None of these has an overall star rating.';
  return {
    summary: `${ldr} ${hospitals.map(line).join('; ')}. National ER median ${nat('OP_18b') ?? 'n/a'} min.`,
    as_of: asOf, source: SOURCE, more: more(),
    hospitals, leaders,
    national: { er_median_minutes: nat('OP_18b'), left_before_seen_pct: nat('OP_22'), sepsis_care_pct: nat('SEP_1') },
    resolved_from: refs.map((r, i) => ({ input: r, facility_id: resolved[i].row.facility_id, other_matches: resolved[i].other_matches })),
  };
}
