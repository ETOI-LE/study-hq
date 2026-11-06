// IB Diploma subject list. Topic lists only where the spec gives them —
// every other subject starts empty. Never invent topic lists.

const MATHS = ['Number and algebra', 'Functions', 'Geometry and trigonometry', 'Statistics and probability', 'Calculus'];

export const IB_TOPICS = {
  maths_aa: MATHS,
  maths_ai: MATHS,
  physics: [
    'A. Space, time and motion',
    'B. The particulate nature of matter',
    'C. Wave behaviour',
    'D. Fields',
    'E. Nuclear and quantum physics',
  ],
  chemistry: [
    'Structure 1. Models of the particulate nature of matter',
    'Structure 2. Models of bonding and structure',
    'Structure 3. Classification of matter',
    'Reactivity 1. What drives chemical reactions?',
    'Reactivity 2. How much, how fast and how far?',
    'Reactivity 3. What are the mechanisms of chemical change?',
  ],
  biology: [
    'A. Unity and diversity',
    'B. Form and function',
    'C. Interaction and interdependence',
    'D. Continuity and change',
  ],
  economics: ['Introduction to economics', 'Microeconomics', 'Macroeconomics', 'The global economy'],
};

const SLHL = ['SL', 'HL'];
const SL = ['SL'];

export const IB_SUBJECTS = [
  // Group 1
  { key: 'eng_lit', name: 'English A: Literature', group: 'Language and literature', levels: SLHL },
  { key: 'eng_langlit', name: 'English A: Language and Literature', group: 'Language and literature', levels: SLHL },
  { key: 'lit_perf', name: 'Literature and Performance', group: 'Language and literature', levels: SL },
  // Group 2
  { key: 'english_b', name: 'English B', group: 'Language acquisition', levels: SLHL },
  { key: 'french_b', name: 'French B', group: 'Language acquisition', levels: SLHL },
  { key: 'spanish_b', name: 'Spanish B', group: 'Language acquisition', levels: SLHL },
  { key: 'german_b', name: 'German B', group: 'Language acquisition', levels: SLHL },
  { key: 'mandarin_b', name: 'Mandarin B', group: 'Language acquisition', levels: SLHL },
  { key: 'french_ab', name: 'French ab initio', group: 'Language acquisition', levels: SL },
  { key: 'spanish_ab', name: 'Spanish ab initio', group: 'Language acquisition', levels: SL },
  { key: 'mandarin_ab', name: 'Mandarin ab initio', group: 'Language acquisition', levels: SL },
  { key: 'latin', name: 'Latin', group: 'Language acquisition', levels: SLHL },
  // Group 3
  { key: 'business', name: 'Business Management', group: 'Individuals and societies', levels: SLHL },
  { key: 'digital_society', name: 'Digital Society', group: 'Individuals and societies', levels: SLHL },
  { key: 'economics', name: 'Economics', group: 'Individuals and societies', levels: SLHL },
  { key: 'geography', name: 'Geography', group: 'Individuals and societies', levels: SLHL },
  { key: 'global_politics', name: 'Global Politics', group: 'Individuals and societies', levels: SLHL },
  { key: 'history', name: 'History', group: 'Individuals and societies', levels: SLHL },
  { key: 'philosophy', name: 'Philosophy', group: 'Individuals and societies', levels: SLHL },
  { key: 'psychology', name: 'Psychology', group: 'Individuals and societies', levels: SLHL },
  { key: 'anthropology', name: 'Social and Cultural Anthropology', group: 'Individuals and societies', levels: SLHL },
  { key: 'world_religions', name: 'World Religions', group: 'Individuals and societies', levels: SL },
  // Group 4
  { key: 'biology', name: 'Biology', group: 'Sciences', levels: SLHL },
  { key: 'chemistry', name: 'Chemistry', group: 'Sciences', levels: SLHL },
  { key: 'physics', name: 'Physics', group: 'Sciences', levels: SLHL },
  { key: 'computer_science', name: 'Computer Science', group: 'Sciences', levels: SLHL },
  { key: 'design_tech', name: 'Design Technology', group: 'Sciences', levels: SLHL },
  { key: 'sehs', name: 'Sports, Exercise and Health Science', group: 'Sciences', levels: SLHL },
  { key: 'ess', name: 'Environmental Systems and Societies', group: 'Sciences', levels: SLHL },
  // Group 5
  { key: 'maths_aa', name: 'Mathematics: Analysis and Approaches', short: 'Maths AA', group: 'Mathematics', levels: SLHL },
  { key: 'maths_ai', name: 'Mathematics: Applications and Interpretation', short: 'Maths AI', group: 'Mathematics', levels: SLHL },
  // Group 6
  { key: 'visual_arts', name: 'Visual Arts', group: 'The arts', levels: SLHL },
  { key: 'music', name: 'Music', group: 'The arts', levels: SLHL },
  { key: 'theatre', name: 'Theatre', group: 'The arts', levels: SLHL },
  { key: 'film', name: 'Film', group: 'The arts', levels: SLHL },
  { key: 'dance', name: 'Dance', group: 'The arts', levels: SLHL },
  // Core
  { key: 'tok', name: 'Theory of Knowledge', short: 'TOK', group: 'Core', levels: ['Core'], scale: 'core' },
  { key: 'ee', name: 'Extended Essay', short: 'EE', group: 'Core', levels: ['Core'], scale: 'core' },
];

export const IB_GRADES = ['1', '2', '3', '4', '5', '6', '7'];
export const CORE_GRADES = ['E', 'D', 'C', 'B', 'A'];

export function ibSubject(key) { return IB_SUBJECTS.find((s) => s.key === key); }

// One accent colour per subject, auto-assigned (editable in Settings).
export const SUBJECT_COLORS = [
  '#4F7BE8', // blue
  '#E07A3F', // orange
  '#2FA37A', // green
  '#B45FD0', // purple
  '#D6497A', // pink
  '#2A9CB8', // teal
  '#C9A227', // mustard
  '#7A8A2E', // olive
  '#8A6A55', // brown
  '#5E6AD2', // indigo
];
