// Sample data: 2 subjects, 10 mistakes, 5 sessions. Everything is tagged sample: true.
import { S, save, saveMany, removeMany, uid } from './store.js';
import { IB_TOPICS } from './data-ib.js';
import { today, addDays, parseDay } from './logic.js';

export const hasSample = () => S.subjects.some((s) => s.sample) || S.mistakes.some((m) => m.sample) || S.sessions.some((s) => s.sample);

function at(day, hour, min = 0) { const d = parseDay(day); d.setHours(hour, min, 0, 0); return d; }

export function addSampleData() {
  if (hasSample()) return;
  const t = today();
  const used = new Set(S.subjects.map((s) => s.color));
  const pick = (c) => (used.has(c) ? ['#2A9CB8', '#C9A227', '#D6497A'].find((x) => !used.has(x)) || c : c);
  const order = S.subjects.length;
  const maths = save('subjects', { name: 'Mathematics: Analysis and Approaches', short: 'Sample Maths AA', level: 'HL', ibKey: 'maths_aa', scale: 'ib', color: pick('#4F7BE8'), current: '5', target: '7', order, sample: true });
  const physics = save('subjects', { name: 'Physics', short: 'Sample Physics', level: 'SL', ibKey: 'physics', scale: 'ib', color: pick('#E07A3F'), current: '5', target: '6', order: order + 1, sample: true });

  const mk = (subj, list, confs) => list.map((name, i) => save('topics', { subjectId: subj.id, parentId: null, name, confidence: confs[i] ?? null, notes: '', order: i, sample: true }));
  const mt = mk(maths, IB_TOPICS.maths_aa, [4, 3, 3, 4, 2]);
  const pt = mk(physics, IB_TOPICS.physics, [3, 4, null, 2, 3]);
  const calc = mt[4], funcs = mt[1], stats = mt[3], geo = mt[2];
  const fields = pt[3], motion = pt[0], waves = pt[2], nuclear = pt[4];
  const chain = save('topics', { subjectId: maths.id, parentId: calc.id, name: 'Chain rule', confidence: 2, notes: '', order: 0, sample: true });
  save('topics', { subjectId: maths.id, parentId: calc.id, name: 'Integration by parts', confidence: 3, notes: '', order: 1, sample: true });
  save('topics', { ...fields, notes: 'reMarkable › Physics › Fields, p. 3–8' });

  // Sessions over the last week.
  const sess = [
    { d: -6, subj: maths, topics: [calc.id], type: 'practice', mins: 40, goal: 'All 4 hard chain-rule questions attempted', done: 'partly', att: 8, cor: 5, focus: 3 },
    { d: -5, subj: physics, topics: [motion.id], type: 'practice', mins: 20, goal: 'Finish SUVAT set B', done: 'yes', att: 6, cor: 6, focus: 4 },
    { d: -3, subj: physics, topics: [fields.id], type: 'blurting', mins: 10, goal: '', done: null, att: null, cor: null, focus: 4 },
    { d: -2, subj: maths, topics: [funcs.id], type: 'paper', mins: 45, goal: 'May 2023 P1 under timed conditions', done: 'yes', att: 10, cor: 7, focus: 4 },
    { d: -1, subj: maths, topics: [calc.id], type: 'redo', mins: 20, goal: 'Redo my due mistakes', done: 'yes', att: 3, cor: 2, focus: 5 },
  ].map((x) => {
    const end = at(addDays(t, x.d), 17, 30);
    const start = new Date(end.getTime() - x.mins * 60000 - 5 * 60000);
    return {
      id: uid(), subjectId: x.subj.id, topicIds: x.topics, type: x.type, goal: x.goal,
      sprintLen: x.mins >= 40 ? 20 : x.mins, breakLen: 5, sprintsPlanned: x.mins >= 40 ? 2 : 1, sprintsDone: x.mins >= 40 ? 2 : 1,
      focusMs: x.mins * 60000, startedAt: start.toISOString(), endedAt: end.toISOString(), day: addDays(t, x.d),
      goalDone: x.done, attempted: x.att, correct: x.cor, focus: x.focus, gaps: [], mistakeIds: [], quick5: false, sample: true,
    };
  });
  saveMany('sessions', sess);

  // Mistakes in different states of the redo schedule.
  const M = (o) => ({
    id: uid(), photoQ: null, photoSol: null, link: '', notes: '', marksLost: null, difficulty: '', redoHistory: [], gotIt: 0, lastGotItDay: null, status: 'open', sample: true,
    createdAt: at(o.date, 18).toISOString(), ...o,
  });
  const ms = [
    M({ subjectId: maths.id, topicId: chain.id, source: 'Revision Village Calculus Q14', wrong: 'Forgot to multiply by the derivative of the inside', fix: 'Chain rule: multiply by the derivative of the inside', type: 'Content', difficulty: 'medium', marksLost: 2, date: addDays(t, -6), dueAt: addDays(t, -3) }),
    M({ subjectId: maths.id, topicId: calc.id, source: 'May 2023 P2 Q5', wrong: 'Rounded too early and lost accuracy', fix: 'Keep full calculator values; round only the final answer to 3 s.f.', type: 'Careless', difficulty: 'hard', marksLost: 1, date: addDays(t, -3), dueAt: t }),
    M({ subjectId: maths.id, topicId: funcs.id, source: 'May 2023 P1 Q8', wrong: 'Didn’t know how to start the composite function question', fix: 'Write f(g(x)) by substituting g(x) for every x in f first', type: 'Didn’t know how to start', difficulty: 'hard', marksLost: 4, date: addDays(t, -2), dueAt: addDays(t, 1) }),
    M({ subjectId: maths.id, topicId: stats.id, source: 'Textbook Ex 7C Q3', wrong: 'Used P(A)P(B) when events weren’t independent', fix: 'Only multiply probabilities if the events are independent — otherwise use P(A|B)', type: 'Content', difficulty: 'medium', date: addDays(t, -12), dueAt: addDays(t, 2), gotIt: 1, lastGotItDay: addDays(t, -5), redoHistory: [{ day: addDays(t, -5), result: 'got' }] }),
    M({ subjectId: maths.id, topicId: geo.id, source: 'Revision Village Trig Q22', wrong: 'Calculator in degrees for a radians question', fix: 'Check the mode: radians whenever the question has π', type: 'Careless', difficulty: 'easy', marksLost: 2, date: addDays(t, -20), status: 'fixed', gotIt: 2, dueAt: null, fixedAt: at(addDays(t, -4), 18).toISOString(), redoHistory: [{ day: addDays(t, -17), result: 'got' }, { day: addDays(t, -4), result: 'got' }] }),
    M({ subjectId: physics.id, topicId: fields.id, source: 'Nov 2022 P2 Q3(b)', wrong: 'Forgot the units of magnetic flux density', fix: 'Magnetic flux density B is in tesla (T) = N A⁻¹ m⁻¹', type: 'Presentation', difficulty: 'medium', marksLost: 1, date: addDays(t, -4), dueAt: addDays(t, -1) }),
    M({ subjectId: physics.id, topicId: fields.id, source: 'Save My Exams Fields Q9', wrong: 'Mixed up field strength and potential', fix: 'Field strength is the gradient of potential: g = −ΔV/Δr', type: 'Content', difficulty: 'hard', marksLost: 3, date: addDays(t, -1), dueAt: addDays(t, 2) }),
    M({ subjectId: physics.id, topicId: motion.id, source: 'Pestle SUVAT Q12', wrong: 'Took g as positive when up was positive', fix: 'Pick a positive direction first; g = −9.81 m s⁻² if up is positive', type: 'Careless', difficulty: 'easy', marksLost: 1, date: addDays(t, -5), dueAt: addDays(t, -2), redoHistory: [], gotIt: 0 }),
    M({ subjectId: physics.id, topicId: waves.id, source: 'May 2022 P1 Q15', wrong: 'Ran out of time on the last questions', fix: 'Paper 1: about 1 minute per question — skip and come back', type: 'Time', difficulty: 'medium', date: addDays(t, -9), dueAt: addDays(t, 5), gotIt: 1, lastGotItDay: addDays(t, -2), redoHistory: [{ day: addDays(t, -6), result: 'notyet' }, { day: addDays(t, -2), result: 'got' }] }),
    M({ subjectId: physics.id, topicId: nuclear.id, source: 'Textbook E.3 Q4', wrong: 'Explained binding energy without “per nucleon”', fix: 'Use markscheme wording: “binding energy per nucleon”', type: 'Presentation', difficulty: 'medium', marksLost: 1, date: addDays(t, -15), status: 'fixed', gotIt: 2, dueAt: null, fixedAt: at(addDays(t, -3), 18).toISOString(), redoHistory: [{ day: addDays(t, -12), result: 'got' }, { day: addDays(t, -3), result: 'got' }] }),
  ];
  saveMany('mistakes', ms);
}

export function clearSampleData() {
  const subjIds = new Set(S.subjects.filter((s) => s.sample).map((s) => s.id));
  removeMany('mistakes', S.mistakes.filter((m) => m.sample || subjIds.has(m.subjectId)).map((m) => m.id));
  removeMany('sessions', S.sessions.filter((s) => s.sample || subjIds.has(s.subjectId)).map((s) => s.id));
  removeMany('topics', S.topics.filter((t) => t.sample || subjIds.has(t.subjectId)).map((t) => t.id));
  removeMany('subjects', [...subjIds]);
}
