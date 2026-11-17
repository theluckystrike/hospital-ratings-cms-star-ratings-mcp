// Fixtures in test/fixtures/ were downloaded from data.cms.gov on 2026-11-17 (through a Cloudflare Worker passthrough, since data.cms.gov
// refuses the build machine): Hospital General Information (xubh-q36u) for every MA and VT hospital (85 + 17 rows), HCAHPS (dgck-syfz)
// summary star rows for MA and VT plus the topic rows for 220071, 220110 and 470003, Timely and Effective Care (yv7e-xc69) for those three,
// and the state (apyc-v239) and national (isrn-hqyy, 99ue-w85f) rows. Expected values below were read off those files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  searchHospitals, hospitalRatings, compareHospitals, scoreName, likeToken, stateCode, titleCase, footnoteText, queryUrl, InputError, UTM,
} from '../dist/core.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
const DATA = Object.fromEntries(['xubh-q36u', 'dgck-syfz', 'yv7e-xc69', 'isrn-hqyy', 'apyc-v239', '99ue-w85f'].map((k) => [k, fx(k)]));
const META = fx('metastore');
const seen = [];
// A small DKAN datastore emulator: conditions with =, like (case-insensitive, % wildcard) and in; limit.
const f = async (url) => {
  seen.push(url);
  const u = new URL(url);
  let m = /^\/provider-data\/api\/1\/metastore\/schemas\/dataset\/items\/([a-z0-9-]+)$/.exec(u.pathname);
  if (m) { if (!META[m[1]]) throw new Error('HTTP 404'); return JSON.stringify(META[m[1]]); }
  m = /^\/provider-data\/api\/1\/datastore\/query\/([a-z0-9-]+)\/0$/.exec(u.pathname);
  assert.ok(m && DATA[m[1]], `no fixture for ${url}`);
  assert.equal(u.searchParams.get('schema'), 'false');
  const conds = [];
  for (const [k, v] of u.searchParams) {
    const c = /^conditions\[(\d+)\]\[(property|operator|value)\](?:\[(\d+)\])?$/.exec(k);
    if (!c) continue;
    const o = (conds[Number(c[1])] ??= {});
    if (c[2] === 'value' && c[3] !== undefined) (o.value ??= []).push(v); else o[c[2]] = v;
  }
  let rows = DATA[m[1]];
  for (const c of conds) {
    if (c.operator === '=') rows = rows.filter((r) => r[c.property] === c.value);
    else if (c.operator === 'like') { const re = new RegExp('^' + c.value.split('%').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i'); rows = rows.filter((r) => re.test(r[c.property])); }
    else if (c.operator === 'in') rows = rows.filter((r) => c.value.includes(r[c.property]));
    else throw new Error(`operator ${c.operator}`);
  }
  return JSON.stringify({ results: rows.slice(0, Number(u.searchParams.get('limit'))), count: rows.length });
};

test('query URL: DKAN conditions with = encoded, like and in arrays, schema off', () => {
  const u = queryUrl('xubh-q36u', [['state', '=', 'MA'], ['facility_name', 'like', '%GENE%'], ['facility_id', 'in', ['220071', '220110']]], 50);
  assert.equal(u, 'https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0?limit=50&schema=false&conditions[0][property]=state&conditions[0][operator]=%3D&conditions[0][value]=MA'
    + '&conditions[1][property]=facility_name&conditions[1][operator]=like&conditions[1][value]=%25GENE%25'
    + '&conditions[2][property]=facility_id&conditions[2][operator]=in&conditions[2][value][0]=220071&conditions[2][value][1]=220110');
});

test('name matching: abbreviations, apostrophes and stop words', () => {
  assert.equal(scoreName('Mass General', 'MASSACHUSETTS GENERAL HOSPITAL'), 1);
  assert.ok(scoreName("Brigham and Women's", "BRIGHAM AND WOMEN'S HOSPITAL") === 1);
  assert.ok(scoreName('University of Vermont Medical Center', 'UNIV. OF VERMONT - FLETCHER ALLEN HEALTH CARE') > 0.9);
  assert.ok(scoreName('University of Vermont Medical Center', 'CENTRAL VERMONT MEDICAL CENTER') < 0.5);
  assert.equal(likeToken('Mass General'), 'GENE');
  assert.equal(likeToken('Saint Albans hospital'), 'ALBA');
  assert.equal(stateCode('massachusetts'), 'MA'); assert.equal(stateCode('vt'), 'VT'); assert.throws(() => stateCode('Narnia'), InputError);
  assert.equal(titleCase("BRIGHAM AND WOMEN'S HOSPITAL"), "Brigham and Women's Hospital");
  assert.match(footnoteText('16, 23'), /too few measures.*discrepancies in their claims/);
});

test('search Vermont: 17 hospitals, star distribution, best rated first with patient stars', async () => {
  const r = await searchHospitals(f, { state: 'Vermont' });
  assert.equal(r.matched, 17);
  assert.deepEqual(r.star_distribution, { '5': 2, '4': 2, '3': 6, '2': 1, '1': 1, not_rated: 5 });
  assert.deepEqual(r.hospitals.slice(0, 4).map((h) => [h.facility_id, h.overall_stars, h.patient_survey_stars]), [['471301', 5, 5], ['47001F', 5, 5], ['470024', 4, 3], ['470003', 4, 3]]);
  assert.equal(r.as_of, '2026-10-26');
  const grace = r.hospitals.find((h) => h.facility_id === '471300');
  assert.equal(grace.overall_stars, null); assert.match(grace.overall_stars_note, /too few measures/);
  assert.match(r.summary, /^17 hospitals match VT: overall CMS star ratings 5 stars 2, 4 stars 2, 3 stars 6, 2 stars 1, 1 star 1, not rated 5\./);
  assert.ok(r.more.includes(UTM));
});

test('search filters: Boston by city, 4+ stars with an ER, ZIP prefix, county', async () => {
  const b = await searchHospitals(f, { city: 'Boston' });
  assert.equal(b.matched, 13);
  assert.deepEqual(b.hospitals.slice(0, 3).map((h) => h.facility_id), ['220071', '220088', '220110']);
  const carney = b.hospitals.find((h) => h.facility_id === '220017');
  assert.match(carney.overall_stars_note, /Inpatient Quality Reporting/);
  const er = await searchHospitals(f, { state: 'VT', min_stars: 4, emergency_services: true });
  assert.deepEqual(er.hospitals.map((h) => h.facility_id), ['471301', '47001F', '470024', '470003']);
  const z = await searchHospitals(f, { state: 'VT', zip: '054' });
  assert.deepEqual(z.hospitals.map((h) => h.zip).sort(), ['05401', '05478']);
  const c = await searchHospitals(f, { state: 'VT', county: 'Windsor County' });
  assert.equal(c.matched, 3);
  const cah = await searchHospitals(f, { state: 'VT', hospital_type: 'critical_access' });
  assert.equal(cah.matched, 8);
  await assert.rejects(searchHospitals(f, {}), InputError);
  await assert.rejects(searchHospitals(f, { county: 'Suffolk' }), InputError);
  await assert.rejects(searchHospitals(f, { zip: '2114' }), InputError);
});

test('ratings by name: Mass General overall 5 stars, groups, patient survey against national, ER against state and national', async () => {
  const r = await hospitalRatings(f, { name: 'Mass General', state: 'MA' });
  assert.equal(r.hospital.facility_id, '220071');
  assert.equal(r.overall_star_rating.stars, 5);
  assert.deepEqual(r.overall_star_rating.measure_groups.mortality, { measures: 8, better: 6, no_different: 2, worse: 0, note: null });
  assert.deepEqual(r.overall_star_rating.measure_groups.readmission, { measures: 11, better: 5, no_different: 2, worse: 4, note: null });
  const s = r.patient_survey;
  assert.equal(s.summary_stars, 4); assert.equal(s.rated_9_or_10_pct, 79); assert.equal(s.national_rated_9_or_10_pct, 72);
  assert.equal(s.definitely_recommend_pct, 86); assert.equal(s.national_definitely_recommend_pct, 71);
  assert.equal(s.surveys_completed, 626); assert.equal(s.response_rate_pct, 23); assert.equal(s.period, '2025-01-01 to 2025-12-31');
  assert.equal(s.topics.length, 9); assert.deepEqual(s.topics.find((t) => t.topic === 'Cleanliness'), { topic: 'Cleanliness', stars: 4 });
  const er = r.timely_and_emergency_care.find((m) => m.id === 'OP_18b');
  assert.deepEqual([er.value, er.state_average, er.national_average, er.sample], [298, 213, 162, 352]);
  assert.equal(r.timely_and_emergency_care.find((m) => m.id === 'EDV').value, 'very high');
  const ct = r.timely_and_emergency_care.find((m) => m.id === 'OP_23');
  assert.equal(ct.value, null); assert.match(ct.note, /too few to report/);
  assert.equal(r.data_updated.patient_survey, '2026-10-19');
  assert.match(r.summary, /Massachusetts General Hospital \(Boston, MA, CMS id 220071, Acute Care Hospitals\): 5 of 5 stars overall\./);
  assert.match(r.summary, /79% rated it 9 or 10 \(national 72%\).*ER: median 298 minutes .*MA average 213, national 162/);
});

test('ratings: UVM by long name, VA hospital by lowercase id, unknown name and bad id', async () => {
  const u = await hospitalRatings(f, { name: 'University of Vermont Medical Center', state: 'VT' });
  assert.equal(u.hospital.facility_id, '470003'); assert.deepEqual(u.other_matches, []);
  assert.equal(u.timely_and_emergency_care.find((m) => m.id === 'OP_18b').state_average, 175);
  const va = await hospitalRatings(f, { facility_id: '47001f' });
  assert.equal(va.hospital.type, 'Acute Care - Veterans Administration'); assert.equal(va.patient_survey.summary_stars, 5);
  await assert.rejects(hospitalRatings(f, { name: 'Hogwarts Infirmary', state: 'VT' }), InputError);
  await assert.rejects(hospitalRatings(f, { facility_id: '12' }), InputError);
  await assert.rejects(hospitalRatings(f, { facility_id: '999999' }), InputError);
});

test('compare: Mass General, Brigham and UVM leaders', async () => {
  const r = await compareHospitals(f, [{ name: 'Mass General', state: 'MA' }, { facility_id: '220110' }, { facility_id: '470003' }]);
  assert.deepEqual(r.hospitals.map((h) => [h.facility_id, h.overall_stars, h.patient_survey_stars, h.rated_9_or_10_pct, h.er_median_minutes, h.sepsis_care_pct]),
    [['220071', 5, 4, 79, 298, 55], ['220110', 5, 3, 76, 310, 41], ['470003', 4, 3, 73, 262, 54]]);
  assert.deepEqual(r.leaders.overall_stars.hospitals, ['Massachusetts General Hospital', "Brigham and Women's Hospital"]);
  assert.deepEqual(r.leaders.shortest_er_median_minutes, { value: 262, hospitals: ['Univ. of Vermont - Fletcher Allen Health Care'] });
  assert.equal(r.national.er_median_minutes, 162);
  assert.equal(r.hospitals[0].mortality_better_worse, '6 better / 0 worse of 8');
  await assert.rejects(compareHospitals(f, [{ facility_id: '220110' }]), InputError);
  await assert.rejects(compareHospitals(f, [{ facility_id: '220110' }, { facility_id: '220110' }]), InputError);
});

test('stdio: initialize, tools/list with annotations and a tools/call error over JSON-RPC (offline)', async () => {
  const child = spawn(process.execPath, [new URL('../dist/stdio.js', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = []; let buf = '';
  const got = (id) => new Promise((res) => { const iv = setInterval(() => { const m = lines.find((l) => l.id === id); if (m) { clearInterval(iv); res(m); } }, 10); });
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal((await got(1)).result.serverInfo.name, 'hospital-ratings-cms-star-ratings-mcp');
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  const tools = (await got(2)).result.tools;
  assert.deepEqual(tools.map((t) => t.name), ['hospital_search', 'hospital_ratings', 'hospital_compare']);
  for (const t of tools) { assert.ok(t.title); assert.equal(t.annotations.readOnlyHint, true); assert.equal(t.annotations.destructiveHint, false); assert.equal(t.annotations.openWorldHint, true); }
  send({ id: 3, method: 'tools/call', params: { name: 'hospital_ratings', arguments: { facility_id: 'bad' } } });
  const r3 = await got(3);
  child.kill();
  assert.equal(r3.result?.isError ?? Boolean(r3.error), true);
});
