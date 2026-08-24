// Stratos Ops — domain constants. Edit here to change airports, services, steps, checklists.
export const VERSION = '1.0.0';
export const APP_URL = 'https://stratosjetdetail.com/ops/';

export const AIRPORTS = [
  { code: 'VNY', icao: 'KVNY', name: 'Van Nuys', fbos: ['Signature Aviation', 'Clay Lacy Aviation', 'Castle & Cooke Aviation'] },
  { code: 'BUR', icao: 'KBUR', name: 'Hollywood Burbank', fbos: ['Atlantic Aviation'] },
  { code: 'SMO', icao: 'KSMO', name: 'Santa Monica', fbos: ['Atlantic Aviation'] },
  { code: 'LGB', icao: 'KLGB', name: 'Long Beach', fbos: ['Ross Aviation'] },
  { code: 'LAX', icao: 'KLAX', name: 'Los Angeles Intl', fbos: ['Signature Flight Support'] },
  { code: 'OTHER', icao: '', name: 'Other location', fbos: [] }
];
export const airportByCode = code => AIRPORTS.find(a => a.code === code) || AIRPORTS[AIRPORTS.length - 1];

// Safety items every job carries, regardless of service.
const SAFETY = [
  'Aircraft chocked, static/pitot covers & gear pins noted before work',
  'Sensors, antennas, static ports & probes masked before wash',
  'All masking removed — sensors, static ports, probes clear',
  'Pitot/static covers & gear pins returned to as-found state, accounted for',
  'FOD sweep of ramp / hangar position',
  'After photos captured on every panel'
];

export const SERVICES = [
  { id: 'full_detail', name: 'Full Detail', short: 'Full Detail', checklist: [
    'Exterior dry-wash complete — all panels',
    'Ceramic / polymer coating applied & cured',
    'Brightwork polished — leading edges, inlets, thrust reversers',
    'Cockpit & cabin transparencies polished',
    'Landing gear, wheel wells & belly degreased',
    'Interior HEPA vacuumed — seats, carpet, galley, lav',
    'Leather cleaned & conditioned',
    'Galley & lavatory sanitized',
    ...SAFETY
  ] },
  { id: 'exterior_wash', name: 'Exterior Wash & Ceramic Coating', short: 'Exterior + Ceramic', checklist: [
    'Exterior dry-wash complete — all panels',
    'Oxidation corrected before coating',
    'Ceramic / polymer coating applied & cured',
    'Windows cleaned — no haze, no streaks',
    ...SAFETY
  ] },
  { id: 'interior', name: 'Interior Sanitation & Leather Care', short: 'Interior', checklist: [
    'HEPA vacuum — seats, carpet, side ledges, galley, lav',
    'Leather cleaned with pH-balanced cleaner',
    'Leather conditioned',
    'Hard surfaces disinfected with aviation-approved product',
    'Galley & lavatory sanitized',
    'Cabin windows & shades cleaned',
    'Carpet spot-treated',
    'After photos captured on every panel'
  ] },
  { id: 'brightwork', name: 'Brightwork Polishing', short: 'Brightwork', checklist: [
    'Leading edges polished to mirror finish',
    'Engine inlets polished',
    'Thrust reversers polished',
    'Oxidation removed, no swirl marks',
    'Compound residue removed from seams & fasteners',
    ...SAFETY
  ] },
  { id: 'transparency', name: 'Transparency Restoration', short: 'Windows', checklist: [
    'Cockpit windows polished — crazing / scratches / pitting addressed',
    'Cabin windows polished',
    'No optical distortion on pilot windows',
    'Compound residue cleared from window seals',
    ...SAFETY
  ] },
  { id: 'deice_boots', name: 'De-Ice Boot Strip & Reseal', short: 'De-Ice Boots', checklist: [
    'Old sealant stripped from boots',
    'Boots cleaned & inspected for damage',
    'Conductive coating applied per product spec',
    'Cure time observed before release',
    ...SAFETY
  ] },
  { id: 'belly_gear', name: 'Belly & Landing Gear Cleaning', short: 'Belly + Gear', checklist: [
    'Belly degreased — exhaust & hydraulic residue removed',
    'Landing gear & wheel wells degreased',
    'Brake dust removed from wheels',
    'Gear doors cleaned',
    ...SAFETY
  ] },
  { id: 'inspection', name: 'Pre-Service Inspection', short: 'Inspection', checklist: [
    'All 8 panels photographed',
    'Existing damage / condition noted per panel',
    'Findings reviewed with operator contact'
  ] }
];
export const serviceById = id => SERVICES.find(s => s.id === id) || { id, name: id, short: id, checklist: [] };

// The 8-step walk-around. Same steps for before and after.
export const STEPS = [
  { id: 'nose', name: 'Nose & Radome', hint: 'Radome, nose gear doors, forward fuselage, windshield area' },
  { id: 'left_fuselage', name: 'Left Fuselage', hint: 'Capture the complete panel and existing condition' },
  { id: 'right_fuselage', name: 'Right Fuselage', hint: 'Capture the complete panel and existing condition' },
  { id: 'left_wing', name: 'Left Wing & Leading Edge', hint: 'Leading edge, winglet, flaps, de-ice boots, wing root' },
  { id: 'right_wing', name: 'Right Wing & Leading Edge', hint: 'Leading edge, winglet, flaps, de-ice boots, wing root' },
  { id: 'empennage', name: 'Empennage', hint: 'Vertical & horizontal stabilizers, APU exhaust, tail cone' },
  { id: 'gear_belly', name: 'Landing Gear & Belly', hint: 'Gear, wheel wells, belly skin, engine inlets & thrust reversers' },
  { id: 'interior', name: 'Cockpit & Cabin', hint: 'Seats, leather, carpet, galley, lavatory, windows & shades' }
];
export const stepById = id => STEPS.find(s => s.id === id) || { id, name: id, hint: '' };

export const CONDITIONS = ['Good', 'Oxidation', 'Scratches', 'Corrosion', 'Stains', 'Damage'];

export const STATUS = {
  scheduled:   { label: 'Scheduled',   cls: 'badge-muted' },
  in_progress: { label: 'In Progress', cls: 'badge-green' },
  awaiting_qa: { label: 'Awaiting QA', cls: 'badge-gold' },
  approved:    { label: 'Approved',    cls: 'badge-solid' },
  cancelled:   { label: 'Cancelled',   cls: 'badge-red' }
};
export const statusOf = s => STATUS[s] || { label: s || '—', cls: 'badge-muted' };

export const ROLES = { owner: 'Owner', manager: 'Manager', crew: 'Crew' };

export const AIRCRAFT_TYPES = [
  'Gulfstream G650', 'Gulfstream G600', 'Gulfstream G550', 'Gulfstream G500', 'Gulfstream G450', 'Gulfstream G280',
  'Bombardier Global 7500', 'Bombardier Global 6000', 'Bombardier Global 5000', 'Bombardier Challenger 650', 'Bombardier Challenger 350', 'Bombardier Challenger 300',
  'Dassault Falcon 8X', 'Dassault Falcon 7X', 'Dassault Falcon 2000', 'Dassault Falcon 900',
  'Cessna Citation Longitude', 'Cessna Citation Latitude', 'Cessna Citation X', 'Cessna Citation Sovereign', 'Cessna Citation CJ4', 'Cessna Citation CJ3', 'Cessna Citation M2',
  'Embraer Praetor 600', 'Embraer Praetor 500', 'Embraer Legacy 500', 'Embraer Phenom 300', 'Embraer Phenom 100',
  'Hawker 800XP', 'Hawker 900XP', 'Learjet 75', 'Learjet 60',
  'Pilatus PC-24', 'Pilatus PC-12', 'Beechcraft King Air 350', 'Beechcraft King Air 250',
  'Boeing BBJ', 'Airbus ACJ319', 'Airbus ACJ320',
  'Sikorsky S-76', 'Airbus H145', 'Airbus H135', 'Bell 429', 'Bell 407', 'Leonardo AW139', 'Leonardo AW109',
  'Other'
];
