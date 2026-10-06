import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'sample-data');
mkdirSync(root, { recursive: true });

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function csv(rows) {
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function writeBoth(name, rows) {
  const text = csv(rows);
  writeFileSync(join(root, `${name}.csv`), text);
  writeFileSync(join(root, `${name}.ts`), `export default ${JSON.stringify(text)};\n`);
}

// Seeded sales: 640 rows. Mix shift (APAC grows, North fades), Helios ERP declines,
// seasonality, a June promo spike, and one anomaly week in September.
const salesRand = rng(17);
const regions = ['North', 'South', 'EMEA', 'APAC', 'LATAM'];
const channels = ['Direct', 'Partner', 'Web'];
const products = ['Atlas CRM', 'Helios ERP', 'Nimbus Analytics', 'Orbit Support'];
const segments = ['Enterprise', 'Mid-market', 'SMB'];
const sales = [];
for (let i = 0; i < 640; i++) {
  const month = 1 + Math.floor(i / (640 / 12));
  const day = 1 + Math.floor(salesRand() * daysInMonth(2025, month));
  const regionBias = month > 6 ? [0, 1, 2, 3, 3, 4] : [0, 0, 1, 2, 3, 4];
  const region = regions[regionBias[i % regionBias.length]];
  const channel = channels[i % 3];
  const product = products[i % 4];
  const segment = segments[(Math.floor(i / 5) + (product === 'Helios ERP' ? 0 : product === 'Atlas CRM' ? 1 : 2) + (region === 'APAC' ? 1 : 0)) % 3];
  const season = 1 + 0.16 * Math.sin(((month - 1) / 12) * Math.PI * 2);
  const growth = 1 + (month / 12) * 0.48;
  const productFade = product === 'Helios ERP' ? 1 - month * 0.035 : 1 + (product === 'Nimbus Analytics' ? month * 0.02 : 0);
  const promo = month === 6 && day >= 8 && day <= 14 ? 1.85 : 1;
  const anomaly = month === 9 && day >= 15 && day <= 21 && region === 'LATAM' ? 0.35 : 1;
  const units = Math.round((6 + salesRand() * 40) * productFade);
  const price = product === 'Helios ERP' ? 6200 : product === 'Atlas CRM' ? 1800 : product === 'Nimbus Analytics' ? 1100 : 420;
  const revenue = Math.round(units * price * season * growth * promo * anomaly * (0.85 + salesRand() * 0.3));
  const discount = Number((0.04 + salesRand() * 0.18 + (channel === 'Partner' ? 0.04 : 0) + (month > 8 ? 0.02 : 0)).toFixed(3));
  const gross_margin = Number((0.22 + salesRand() * 0.28 - discount * 0.35 + (region === 'APAC' ? 0.06 : 0) - (product === 'Helios ERP' ? 0.08 : 0)).toFixed(3));
  sales.push({
    order_date: iso(2025, month, day),
    region, channel, product, segment, units, revenue, discount_rate: discount, gross_margin,
  });
}

// 504 web rows (84 days × 6 channels). Social bounce is high; Paid mix grows.
const webRand = rng(29);
const webChannels = ['Organic', 'Paid', 'Email', 'Referral', 'Social', 'Direct'];
const devices = ['Desktop', 'Mobile', 'Tablet'];
const web = [];
const start = new Date(2025, 8, 1);
for (let day = 0; day < 84; day++) {
  for (const channel of webChannels) {
    const d = new Date(start);
    d.setDate(start.getDate() + day);
    const deviceMix = channel === 'Paid' || channel === 'Social'
      ? ['Mobile', 'Mobile', 'Desktop', 'Tablet']
      : channel === 'Organic' || channel === 'Direct'
        ? ['Desktop', 'Desktop', 'Mobile', 'Tablet']
        : ['Desktop', 'Mobile', 'Tablet', 'Mobile'];
    const device = deviceMix[(day + webChannels.indexOf(channel)) % deviceMix.length];
    const weekday = d.getDay();
    const paidLift = channel === 'Paid' ? 1 + day / 160 : 1;
    const sessions = Math.round((channel === 'Paid' ? 2200 : channel === 'Organic' ? 1800 : channel === 'Social' ? 1400 : 900) * (weekday === 0 || weekday === 6 ? 0.7 : 1) * paidLift * (0.75 + webRand() * 0.5));
    const bounce_rate = Number((
      (channel === 'Social' ? 0.62 : channel === 'Paid' ? 0.41 : 0.28)
      + webRand() * 0.12
      + (device === 'Mobile' ? 0.06 : 0)
    ).toFixed(3));
    const conversions = Math.max(4, Math.round(sessions * (channel === 'Email' ? 0.045 : 0.018 + webRand() * 0.02)));
    const revenue = Math.round(conversions * (80 + webRand() * 220));
    const ad_spend = channel === 'Paid' || channel === 'Social' ? Math.round(sessions * (0.18 + webRand() * 0.22)) : Math.round(sessions * 0.02);
    const avg_session_seconds = Math.round(70 + webRand() * 160);
    web.push({
      date: iso(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      channel, device, sessions, bounce_rate, conversions, revenue, ad_spend, avg_session_seconds,
    });
  }
}

// 288 finance rows (24 months × 4 BUs × 3 centers). Hardware over budget; Cloud GM richer.
const finRand = rng(41);
const units = ['Cloud', 'Apps', 'Services', 'Hardware'];
const centers = ['R&D', 'GTM', 'G&A'];
const finance = [];
for (let m = 0; m < 24; m++) {
  const year = m < 12 ? 2024 : 2025;
  const month = (m % 12) + 1;
  for (const business_unit of units) {
    for (const cost_center of centers) {
      const growth = 1 + m * 0.012;
      const base = business_unit === 'Cloud' ? 520000 : business_unit === 'Hardware' ? 180000 : 260000;
      const revenue = Math.round(base * growth * (0.85 + finRand() * 0.3));
      const cogsRate = business_unit === 'Cloud' ? 0.28 : business_unit === 'Hardware' ? 0.52 : 0.38;
      const cogs = Math.round(revenue * (cogsRate + finRand() * 0.05));
      const centerLift = cost_center === 'GTM' ? 1.18 : cost_center === 'R&D' ? 1.08 : 0.86;
      const opex = Math.round(revenue * (business_unit === 'Hardware' ? 0.42 : 0.26) * centerLift * (0.9 + finRand() * 0.15));
      const budget_opex = Math.round(opex * (business_unit === 'Hardware' ? 0.72 : cost_center === 'GTM' ? 0.94 : 1.05) * (0.95 + finRand() * 0.08));
      const ebitda = revenue - cogs - opex;
      const headcount = Math.round(18 + m * 0.4 + finRand() * 8 + (business_unit === 'Cloud' ? 12 : 0));
      const dso_days = Math.round((business_unit === 'Hardware' ? 46 : 28) + finRand() * 12);
      finance.push({
        month: iso(year, month, 1),
        business_unit, cost_center, revenue, cogs, opex, budget_opex, ebitda, headcount, dso_days,
      });
    }
  }
}

const hrRand = rng(7);
const depts = ['Engineering', 'Sales', 'People', 'Design', 'Finance'];
const locs = ['Austin', 'New York', 'Remote', 'London'];
const hr = [];
for (let m = 0; m < 18; m++) {
  const year = m < 6 ? 2024 : 2025;
  const month = m < 6 ? m + 7 : m - 5;
  for (const department of depts) {
    for (const location of locs.slice(0, 2)) {
      const headcount = Math.round(20 + m * 1.2 + hrRand() * 40);
      const hires = Math.round(1 + hrRand() * 8);
      const attrition = Number((0.02 + hrRand() * 0.09 + (department === 'Sales' ? 0.04 : 0)).toFixed(3));
      const offers = hires + Math.round(hrRand() * 4);
      const acceptRate = Number((0.5 + hrRand() * 0.35).toFixed(3));
      hr.push({
        month: iso(year, month, 1),
        department, location, headcount, hires, attrition, offers, accept_rate: acceptRate,
      });
    }
  }
}

const supRand = rng(13);
const queues = ['Billing', 'Onboarding', 'Incidents', 'How-to'];
const priorities = ['Low', 'Medium', 'High', 'Critical'];
const agents = ['Imani', 'Noah', 'Sofia', 'Kai'];
const support = [];
for (let i = 0; i < 210; i++) {
  const day = 1 + (i % 28);
  const month = 3 + Math.floor(i / 70);
  support.push({
    opened: iso(2025, month, day),
    queue: queues[i % 4],
    priority: priorities[i % 4],
    agent: agents[i % 4],
    hours: Number((2 + supRand() * 14).toFixed(1)),
    csat: Number((3.6 + supRand() * 1.3).toFixed(2)),
    tickets: Math.round(6 + supRand() * 24),
  });
}

writeBoth('sales', sales);
writeBoth('web', web);
writeBoth('finance', finance);
writeBoth('hr', hr);
writeBoth('support', support);
console.log({ sales: sales.length, web: web.length, finance: finance.length, hr: hr.length, support: support.length });
