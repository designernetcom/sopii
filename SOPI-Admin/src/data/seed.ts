/* Deterministic pseudo-random helpers so the mock dataset is stable across reloads. */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = mulberry32(20260819);

export function rand() {
  return rng();
}

export function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function pickMany<T>(arr: readonly T[], count: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
}

export function chance(probability: number) {
  return rand() < probability;
}

/** Reference "now" for the dataset — keeps relative dates sensible. */
export const NOW = new Date();

export function daysAgo(days: number, jitterHours = 0) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  if (jitterHours) d.setHours(d.getHours() - randInt(0, jitterHours));
  return d.toISOString();
}

export function daysAhead(days: number) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function uid(prefix: string, index: number) {
  return `${prefix}_${String(index).padStart(4, '0')}`;
}

export const FIRST_NAMES = [
  'Priya', 'Ananya', 'Meera', 'Kavya', 'Ishita', 'Neha', 'Sneha', 'Divya', 'Aarti', 'Ritu',
  'Shreya', 'Pooja', 'Nandini', 'Aditi', 'Sanjana', 'Lakshmi', 'Tanvi', 'Rhea', 'Gauri', 'Swati',
  'Rahul', 'Arjun', 'Vikram', 'Rohan', 'Karthik', 'Aditya', 'Siddharth', 'Nikhil', 'Varun', 'Manav',
];

export const LAST_NAMES = [
  'Sharma', 'Iyer', 'Nair', 'Reddy', 'Kapoor', 'Verma', 'Menon', 'Desai', 'Joshi', 'Rao',
  'Patel', 'Chatterjee', 'Bose', 'Gupta', 'Malhotra', 'Pillai', 'Shetty', 'Bhatt', 'Kulkarni', 'Sinha',
];

export const CITIES: { city: string; state: string; pin: string }[] = [
  { city: 'Mumbai', state: 'Maharashtra', pin: '400001' },
  { city: 'Pune', state: 'Maharashtra', pin: '411001' },
  { city: 'Bengaluru', state: 'Karnataka', pin: '560001' },
  { city: 'Chennai', state: 'Tamil Nadu', pin: '600001' },
  { city: 'Hyderabad', state: 'Telangana', pin: '500001' },
  { city: 'New Delhi', state: 'Delhi', pin: '110001' },
  { city: 'Kolkata', state: 'West Bengal', pin: '700001' },
  { city: 'Ahmedabad', state: 'Gujarat', pin: '380001' },
  { city: 'Jaipur', state: 'Rajasthan', pin: '302001' },
  { city: 'Kochi', state: 'Kerala', pin: '682001' },
  { city: 'Lucknow', state: 'Uttar Pradesh', pin: '226001' },
  { city: 'Indore', state: 'Madhya Pradesh', pin: '452001' },
];

export const STREETS = [
  'Lotus Residency', 'Silver Oak Apartments', 'Green Meadows', 'Palm Grove',
  'Sunrise Enclave', 'Rose Villa', 'Marigold Heights', 'Banyan Court',
];

export function fullName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

export function emailFor(name: string, index: number) {
  const slug = name.toLowerCase().replace(/[^a-z]/g, '.');
  const domain = pick(['gmail.com', 'outlook.com', 'yahoo.in', 'hotmail.com']);
  return `${slug}${index % 7 === 0 ? index : ''}@${domain}`;
}

export function phone() {
  return `+91 ${randInt(70, 99)}${randInt(10000000, 99999999)}`.slice(0, 17);
}
